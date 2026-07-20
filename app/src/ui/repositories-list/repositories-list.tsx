import * as React from 'react'

import { commitGrammar, RepositoryListItem } from './repository-list-item'
import {
  groupRepositories,
  buildPinnedGroup,
  filterPinnedFromGroups,
  IRepositoryListItem,
  Repositoryish,
  RepositoryListGroup,
  getGroupKey,
} from './group-repositories'
import {
  getPinnedRepositories,
  addPinnedRepository,
  removePinnedRepository,
} from '../../lib/stores/repository-pinning'
import { IFilterListGroup } from '../lib/filter-list'
import { IMatch, IMatches } from '../../lib/fuzzy-find'
import { ILocalRepositoryState, Repository } from '../../models/repository'
import { normalizePath } from '../../lib/helpers/path'
import { FoldoutType } from '../../lib/app-state'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Octicon, syncClockwise } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showContextualMenu } from '../../lib/menu-item'
import { IMenuItem } from '../../lib/menu-item'
import { PopupType } from '../../models/popup'
import { encodePathAsUrl } from '../../lib/path'
import { TooltippedContent } from '../lib/tooltipped-content'
import memoizeOne from 'memoize-one'
import { KeyboardShortcut } from '../keyboard-shortcut/keyboard-shortcut'
import {
  buildAssignToGroupMenuItems,
  generateRepositoryListContextMenu,
  generateWorktreeListItemContextMenu,
} from '../repositories-list/repository-list-item-context-menu'
import { openRepositoryInNewWindow } from '../main-process-proxy'
import { enableWorktreeSupport } from '../../lib/feature-flag'
import { SectionFilterList } from '../lib/section-filter-list'
import { assertNever } from '../../lib/fatal-error'
import { IAheadBehind } from '../../models/branch'
import { ShowBranchNameInRepoListSetting } from '../../models/show-branch-name-in-repo-list'
import { getEditorOverrideLabel } from '../../models/editor-override'
import { Account } from '../../models/account'
import { getAccountForRepository } from '../../lib/get-account-for-repository'

const BlankSlateImage = encodePathAsUrl(__dirname, 'static/empty-no-repo.svg')

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly repositories: ReadonlyArray<Repositoryish>
  readonly showRecentRepositories: boolean
  readonly recentRepositories: ReadonlyArray<number>

  /** A cache of the latest repository state values, keyed by the repository id */
  readonly localRepositoryStateLookup: ReadonlyMap<
    number,
    ILocalRepositoryState
  >

  /** Called when a repository has been selected. */
  readonly onSelectionChanged: (repository: Repositoryish) => void

  /** Whether the user has enabled the setting to confirm removing a repository from the app */
  readonly askForConfirmationOnRemoveRepository: boolean

  /** Called when the repository should be removed. */
  readonly onRemoveRepository: (repository: Repositoryish) => void

  /** Called when the repository should be shown in Finder/Explorer/File Manager. */
  readonly onShowRepository: (repository: Repositoryish, path?: string) => void

  /** Called when the repository should be opened in the default web browser. */
  readonly onViewOnGitHub: (repository: Repositoryish) => void

  /** Called when the repository should be shown in the shell. */
  readonly onOpenInShell: (repository: Repositoryish, path?: string) => void

  /** Called when the repository should be opened in a new window. */
  readonly onOpenInNewWindow: (repository: Repositoryish, path?: string) => void

  /** Called when the repository should be opened in an external editor */
  readonly onOpenInExternalEditor: (
    repository: Repositoryish,
    path?: string
  ) => void

  /** The current external editor selected by the user */
  readonly externalEditorLabel?: string

  /** The label for the user's preferred shell. */
  readonly shellLabel?: string

  /** The callback to fire when the filter text has changed */
  readonly onFilterTextChanged: (text: string) => void

  /** The text entered by the user to filter their repository list */
  readonly filterText: string

  readonly dispatcher: Dispatcher

  /** Controls when to show the branch name next to each repository */
  readonly showBranchNameInRepoList: ShowBranchNameInRepoListSetting

  /** Whether or not the worktrees dropdown should be shown in the toolbar */
  readonly showWorktrees: boolean

  /** Whether or not linked worktrees should be shown in the repository list */
  readonly showWorktreesInRepoList: boolean

  /** The currently signed-in accounts, used to filter the repository list */
  readonly accounts: ReadonlyArray<Account>

  /**
   * The id of the account the repository list is currently filtered to, or
   * null if repositories from all accounts should be shown. Local
   * (non-GitHub) repositories are always shown regardless of this filter.
   */
  readonly selectedFilterAccountId: number | null
}

interface IRepositoriesListState {
  readonly newRepositoryMenuExpanded: boolean
  readonly pullingRepositories: boolean
  readonly selectedItem: IRepositoryListItem | null
  readonly pinnedRepositoriesIds: ReadonlyArray<number>
}

const RowHeight = 29

/**
 * Iterate over all groups until a list item is found that matches
 * the id of the provided repository.
 */
function findMatchingListItem(
  groups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >,
  selectedRepository: Repositoryish | null
) {
  if (selectedRepository !== null) {
    let fallback: IRepositoryListItem | null = null

    for (const group of groups) {
      for (const item of group.items) {
        if (item.repository.id !== selectedRepository.id) {
          continue
        }

        if (
          item.worktree !== null &&
          normalizePath(item.worktree.path) ===
            normalizePath(selectedRepository.path)
        ) {
          return item
        }

        fallback ??= item
      }
    }

    return fallback
  }
  return null
}

interface IRepositoryGroupHeaderProps {
  readonly groupName: string
  readonly onPullAll: (groupName: string) => void
  readonly onDelete: (groupName: string) => void
  readonly onContextMenu: (
    groupName: string,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
}

/**
 * Wraps a custom repository group header adding buttons to pull all
 * repositories in the group and to delete the group, with the same actions
 * available on right-click.
 */
class RepositoryGroupHeader extends React.Component<IRepositoryGroupHeaderProps> {
  private onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    this.props.onContextMenu(this.props.groupName, event)
  }

  private onPullAllClick = () => {
    this.props.onPullAll(this.props.groupName)
  }

  private onDeleteClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    this.props.onDelete(this.props.groupName)
  }

  public render() {
    const pullLabel = `Pull all repositories in "${this.props.groupName}"`
    const deleteLabel = `Delete group "${this.props.groupName}"`

    return (
      <div
        className="repository-group-header"
        onContextMenu={this.onContextMenu}
      >
        {this.props.children}
        <Button
          className="pull-group-button"
          onClick={this.onPullAllClick}
          tooltip={pullLabel}
          ariaLabel={pullLabel}
        >
          <Octicon symbol={octicons.arrowDown} />
        </Button>
        <Button
          className="delete-group-button"
          onClick={this.onDeleteClick}
          tooltip={deleteLabel}
          ariaLabel={deleteLabel}
        >
          <Octicon symbol={octicons.trash} />
        </Button>
      </div>
    )
  }
}

/** The list of user-added repositories. */
export class RepositoriesList extends React.Component<
  IRepositoriesListProps,
  IRepositoriesListState
> {
  /**
   * A memoized function for filtering repositories down to those belonging
   * to the currently selected account filter. Local (non-GitHub)
   * repositories are always kept, regardless of the filter.
   */
  private getVisibleRepositories = memoizeOne(
    (
      repositories: ReadonlyArray<Repositoryish>,
      accounts: ReadonlyArray<Account>,
      selectedFilterAccountId: number | null
    ) => {
      if (selectedFilterAccountId === null) {
        return repositories
      }

      return repositories.filter(repository => {
        if (!(repository instanceof Repository)) {
          return true
        }

        const account = getAccountForRepository(accounts, repository)
        return account === null || account.id === selectedFilterAccountId
      })
    }
  )

  /**
   * A memoized function for grouping repositories for display
   * in the FilterList. The group will not be recomputed as long
   * as the provided list of repositories is equal to the last
   * time the method was called (reference equality).
   */
  private getRepositoryGroups = memoizeOne(
    (
      repositories: ReadonlyArray<Repositoryish> | null,
      localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
      recentRepositories: ReadonlyArray<number>
    ) =>
      repositories === null
        ? []
        : groupRepositories(
            repositories,
            localRepositoryStateLookup,
            recentRepositories
          )
  )

  /**
   * A memoized function for finding the selected list item based
   * on an IAPIRepository instance. The selected item will not be
   * recomputed as long as the provided list of repositories and
   * the selected data object is equal to the last time the method
   * was called (reference equality).
   *
   * See findMatchingListItem for more details.
   */
  private getSelectedListItem = memoizeOne(findMatchingListItem)

  public constructor(props: IRepositoriesListProps) {
    super(props)

    this.state = {
      newRepositoryMenuExpanded: false,
      pullingRepositories: false,
      selectedItem: null,
      pinnedRepositoriesIds: getPinnedRepositories(),
    }
  }

  private shouldShowBranchName(item: IRepositoryListItem): boolean {
    const { showBranchNameInRepoList } = this.props
    switch (showBranchNameInRepoList) {
      case ShowBranchNameInRepoListSetting.Never:
        return false
      case ShowBranchNameInRepoListSetting.Always:
        return true
      case ShowBranchNameInRepoListSetting.WhenNotDefault:
        return item.branchName !== item.defaultBranchName
      default:
        assertNever(
          showBranchNameInRepoList,
          `Unknown show branch name setting: ${showBranchNameInRepoList}`
        )
    }
  }

  private renderItem = (item: IRepositoryListItem, matches: IMatches) => {
    const repository = item.repository
    return (
      <RepositoryListItem
        key={item.id}
        repository={repository}
        needsDisambiguation={item.needsDisambiguation}
        matches={matches}
        aheadBehind={item.aheadBehind}
        changedFilesCount={item.changedFilesCount}
        branchName={this.shouldShowBranchName(item) ? item.branchName : null}
        worktree={item.worktree}
        onAssignToGroupClick={this.onAssignToGroupClick}
      />
    )
  }

  private onAssignToGroupClick = (
    repository: Repository,
    event: React.MouseEvent
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const items = buildAssignToGroupMenuItems(
      repository,
      getKnownGroupNames(this.getVisibleRepos()),
      this.onAssignRepositoryGroupName,
      this.onChangeRepositoryGroupName
    )

    showContextualMenu(items)
  }

  private getAheadBehindTooltip = (aheadBehind: IAheadBehind | null) => {
    if (aheadBehind === null) {
      return null
    }

    const { ahead, behind } = aheadBehind

    if (behind === 0 && ahead === 0) {
      return null
    }

    return (
      'The currently checked out branch is' +
      (behind ? ` ${commitGrammar(behind)} behind ` : '') +
      (behind && ahead ? 'and' : '') +
      (ahead ? ` ${commitGrammar(ahead)} ahead of ` : '') +
      'its tracked branch.'
    )
  }

  private renderRowFocusTooltip = (
    item: IRepositoryListItem
  ): JSX.Element | string | null => {
    const { repository, aheadBehind, changedFilesCount } = item
    const branchName = this.shouldShowBranchName(item) ? item.branchName : null
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const alias = repository instanceof Repository ? repository.alias : null
    const realName = gitHubRepo ? gitHubRepo.fullName : repository.name
    const aheadBehindTooltip = this.getAheadBehindTooltip(aheadBehind)
    const hasChanges = changedFilesCount > 0
    const uncommittedChangesTooltip = hasChanges
      ? `There are uncommitted changes in this repository.`
      : null

    const ahead = aheadBehind?.ahead ?? 0
    const behind = aheadBehind?.behind ?? 0

    return (
      <div className="repository-list-item-tooltip list-item-tooltip">
        <div>
          <div className="label">Full Name: </div>
          {realName}
          {alias && <> ({alias})</>}
        </div>
        <div>
          <div className="label">Path: </div>
          {repository.path}
        </div>
        {branchName && (
          <div>
            <div className="label">Branch: </div>
            {branchName}
          </div>
        )}
        {aheadBehindTooltip && (
          <div>
            <div className="label">
              <div className="ahead-behind">
                {ahead > 0 && <Octicon symbol={octicons.arrowUp} />}
                {behind > 0 && <Octicon symbol={octicons.arrowDown} />}
              </div>
            </div>
            {aheadBehindTooltip}
          </div>
        )}
        {uncommittedChangesTooltip && (
          <div>
            <div className="label">
              <span className="change-indicator-wrapper">
                <Octicon symbol={octicons.dotFill} />
              </span>
            </div>
            {uncommittedChangesTooltip}
          </div>
        )}
      </div>
    )
  }

  private getGroupLabel(group: RepositoryListGroup) {
    const { kind, displayName } = group
    if (kind === 'pins') {
      return 'Pinned'
    } else if (kind === 'enterprise') {
      return displayName ?? group.host
    } else if (kind === 'other') {
      return displayName ?? 'Other'
    } else if (kind === 'dotcom') {
      const accountLoginSuffix =
        group.login && group.login !== group.owner.login
          ? ` (${group.login})`
          : ''
      const defaultLabel = group.owner.login + accountLoginSuffix
      return displayName ?? defaultLabel
    } else if (kind === 'recent') {
      return 'Recent'
    } else {
      assertNever(kind, `Unknown repository group kind ${kind}`)
    }
  }

  private renderGroupHeader = (group: RepositoryListGroup) => {
    const label = this.getGroupLabel(group)

    const header = (
      <TooltippedContent
        key={getGroupKey(group)}
        className="filter-list-group-header"
        tooltip={label}
        onlyWhenOverflowed={true}
        tagName="div"
      >
        {label}
      </TooltippedContent>
    )

    // Custom (user-named) groups get a button to pull all of their
    // repositories. Pins and recents can contain repositories of other
    // groups so they don't get one.
    const isCustomGroup =
      group.kind !== 'pins' &&
      group.kind !== 'recent' &&
      group.displayName !== null

    return !isCustomGroup ? (
      header
    ) : (
      <RepositoryGroupHeader
        key={getGroupKey(group)}
        groupName={label}
        onPullAll={this.onPullAllInGroup}
        onDelete={this.onDeleteGroup}
        onContextMenu={this.onGroupHeaderContextMenu}
      >
        {header}
      </RepositoryGroupHeader>
    )
  }

  private onGroupHeaderContextMenu = (
    groupName: string,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    showContextualMenu([
      {
        label: __DARWIN__
          ? `Pull All Repositories in "${groupName}"`
          : `Pull all repositories in "${groupName}"`,
        action: () => this.onPullAllInGroup(groupName),
      },
      { type: 'separator' },
      {
        label: __DARWIN__
          ? `Delete Group "${groupName}"`
          : `Delete group "${groupName}"`,
        action: () => this.onDeleteGroup(groupName),
      },
    ])
  }

  private onDeleteGroup = (groupName: string) => {
    const repositories = this.getVisibleRepos().filter(
      (r): r is Repository =>
        r instanceof Repository && r.groupName === groupName
    )

    this.props.dispatcher.showPopup({
      type: PopupType.DeleteRepositoryGroup,
      groupName,
      repositories,
    })
  }

  /** The repositories visible in the list, honoring the active account filter. */
  private getVisibleRepos(): ReadonlyArray<Repositoryish> {
    return this.getVisibleRepositories(
      this.props.repositories,
      this.props.accounts,
      this.props.selectedFilterAccountId
    )
  }

  private onPullAllInGroup = (groupName: string) => {
    const repositories = this.getVisibleRepos().filter(
      (r): r is Repository =>
        r instanceof Repository && r.groupName === groupName
    )

    this.props.dispatcher.pullRepositories(repositories)
  }

  private onAssignRepositoryGroupName = (
    repository: Repository,
    groupName: string
  ) => {
    this.props.dispatcher.changeRepositoryGroupName(repository, groupName)
  }

  private onItemClick = (item: IRepositoryListItem) => {
    const hasIndicator =
      item.changedFilesCount > 0 ||
      (item.aheadBehind !== null
        ? item.aheadBehind.ahead > 0 || item.aheadBehind.behind > 0
        : false)
    this.props.dispatcher.recordRepoClicked(hasIndicator)

    // Each row maps to a specific worktree. Clicking a row switches to
    // its worktree, unless the row is already the checked-out one.
    // Switching worktrees already selects the corresponding repository
    if (
      item.worktree !== null &&
      item.repository instanceof Repository &&
      normalizePath(item.worktree.path) !== normalizePath(item.repository.path)
    ) {
      this.props.dispatcher.closeFoldout(FoldoutType.Repository)
      this.props.dispatcher.switchWorktree(item.repository, item.worktree)
      return
    }

    this.props.onSelectionChanged(item.repository)
  }

  private onItemContextMenu = (
    item: IRepositoryListItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    if (
      item.worktree !== null &&
      item.worktree.type === 'linked' &&
      item.repository instanceof Repository
    ) {
      showContextualMenu(
        generateWorktreeListItemContextMenu({
          repository: item.repository,
          worktree: item.worktree,
          shellLabel: this.props.shellLabel,
          externalEditorLabel: this.getExternalEditorLabel(item.repository),
          onCreateWorktree: this.onCreateWorktree,
          onRenameWorktree: this.onRenameWorktree,
          onDeleteWorktree: this.onDeleteWorktree,
          onViewOnGitHub: this.props.onViewOnGitHub,
          onOpenWorktreeInNewWindow: this.onOpenWorktreeInNewWindow,
          onOpenInShell: this.props.onOpenInShell,
          onShowRepository: this.props.onShowRepository,
          onOpenInExternalEditor: this.props.onOpenInExternalEditor,
          onCopyWorktreePath: path =>
            this.props.dispatcher.copyPathToClipboard(path),
        })
      )
      return
    }

    const isPinned =
      item.repository instanceof Repository &&
      this.state.pinnedRepositoriesIds.includes(item.repository.id)

    const items = generateRepositoryListContextMenu({
      worktreePath: item.worktree?.path,
      onRemoveRepository: this.props.onRemoveRepository,
      onShowRepository: this.props.onShowRepository,
      onOpenInNewWindow: this.props.onOpenInNewWindow,
      onOpenInShell: this.props.onOpenInShell,
      onOpenInExternalEditor: this.props.onOpenInExternalEditor,
      askForConfirmationOnRemoveRepository:
        this.props.askForConfirmationOnRemoveRepository,
      externalEditorLabel: this.getExternalEditorLabel(item.repository),
      onChangeRepositoryAlias: this.onChangeRepositoryAlias,
      onRemoveRepositoryAlias: this.onRemoveRepositoryAlias,
      onChangeRepositoryGroupName: this.onChangeRepositoryGroupName,
      onRemoveRepositoryGroupName: this.onRemoveRepositoryGroupName,
      groupNames: getKnownGroupNames(this.getVisibleRepos()),
      onAssignRepositoryGroupName: this.onAssignRepositoryGroupName,
      onPullAllInGroup: this.onPullAllInGroup,
      onDeleteGroup: this.onDeleteGroup,
      onViewOnGitHub: this.props.onViewOnGitHub,
      onCreateWorktree: enableWorktreeSupport()
        ? this.onCreateWorktree
        : undefined,
      onShowWorktrees:
        enableWorktreeSupport() && this.props.showWorktrees
          ? this.onShowWorktrees
          : undefined,
      repository: item.repository,
      shellLabel: this.props.shellLabel,
      onCopyRepoPath: path => this.props.dispatcher.copyPathToClipboard(path),
      isPinned,
      onPinRepository:
        item.repository instanceof Repository
          ? this.onPinRepository
          : undefined,
      onUnpinRepository:
        item.repository instanceof Repository
          ? this.onUnpinRepository
          : undefined,
    })

    showContextualMenu(items)
  }

  private getItemAriaLabel = (item: IRepositoryListItem) => item.repository.name
  private getGroupAriaLabelGetter =
    (
      groups: ReadonlyArray<
        IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
      >
    ) =>
    (group: number) =>
      this.getGroupLabel(groups[group].identifier)

  public render() {
    const visibleRepositories = this.getVisibleRepos()

    let groups = this.getRepositoryGroups(
      visibleRepositories,
      this.props.localRepositoryStateLookup,
      this.props.recentRepositories
    )

    if (!this.props.showRecentRepositories) {
      groups = groups.filter(group => group.identifier.kind !== 'recent')
    }

    const { pinnedRepositoriesIds } = this.state
    if (pinnedRepositoriesIds.length > 0) {
      const pinsGroup = buildPinnedGroup(pinnedRepositoriesIds, groups)
      if (pinsGroup !== null) {
        groups = [
          pinsGroup,
          ...filterPinnedFromGroups(pinnedRepositoriesIds, groups),
        ]
      }
    }

    // So there's two types of selection at play here. There's the repository
    // selection for the whole app and then there's the keyboard selection in
    // the list itself. If the user has selected a repository using keyboard
    // navigation we want to honor that selection. If the user hasn't selected a
    // repository yet we'll select the repository currently selected in the app.
    const selectedItem =
      this.state.selectedItem ??
      this.getSelectedListItem(groups, this.props.selectedRepository)

    return (
      <div className="repository-list">
        <SectionFilterList<IRepositoryListItem, RepositoryListGroup>
          rowHeight={RowHeight}
          selectedItem={selectedItem}
          filterText={this.props.filterText}
          onFilterTextChanged={this.props.onFilterTextChanged}
          renderItem={this.renderItem}
          renderRowFocusTooltip={this.renderRowFocusTooltip}
          renderGroupHeader={this.renderGroupHeader}
          onItemClick={this.onItemClick}
          renderPostFilter={this.renderPostFilter}
          renderNoItems={this.renderNoItems}
          groups={groups}
          invalidationProps={{
            repositories: visibleRepositories,
            filterText: this.props.filterText,
            localRepositoryStateLookup: this.props.localRepositoryStateLookup,
            showWorktreesInRepoList: this.props.showWorktreesInRepoList,
          }}
          onItemContextMenu={this.onItemContextMenu}
          getGroupAriaLabel={this.getGroupAriaLabelGetter(groups)}
          getItemAriaLabel={this.getItemAriaLabel}
          onSelectionChanged={this.onSelectionChanged}
          postProcessMatches={this.postProcessMatches(
            groups,
            this.props.filterText
          )}
        />
      </div>
    )
  }

  private getExternalEditorLabel(
    repository: Repositoryish
  ): string | undefined {
    if (repository instanceof Repository && repository.customEditorOverride) {
      return getEditorOverrideLabel(repository.customEditorOverride)
    }
    return this.props.externalEditorLabel
  }

  private onSelectionChanged = (selectedItem: IRepositoryListItem | null) => {
    this.setState({ selectedItem })
  }

  private postProcessMatches(
    groups: ReadonlyArray<
      IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
    >,
    filterText: string
  ) {
    if (!this.props.showWorktreesInRepoList || !filterText) {
      return (items: ReadonlyArray<IMatch<IRepositoryListItem>>) => items
    }

    return (
      items: ReadonlyArray<IMatch<IRepositoryListItem>>
    ): ReadonlyArray<IMatch<IRepositoryListItem>> => {
      const isLinkedWorktree = (item: IRepositoryListItem) =>
        item.worktree !== null && item.worktree.type === 'linked'

      // A query that matches a linked worktree should always show the main worktree row first, even
      // if the main worktree row doesn't match the query. Construct a lookup so we can inject synthetic matches
      const mainWorktreeRowsLookup = new Map<number, IRepositoryListItem>()
      for (const group of groups) {
        for (const listItem of group.items) {
          if (!isLinkedWorktree(listItem)) {
            mainWorktreeRowsLookup.set(listItem.repository.id, listItem)
          }
        }
      }

      const output: IMatch<IRepositoryListItem>[] = []
      const remaining = [...items]

      while (remaining.length > 0) {
        const match = remaining.shift()!
        const repoId = match.item.repository.id

        // Collect this match plus every remaining match for the same
        // repository, preserving relative order.
        const repoMatches = [match]
        for (let i = 0; i < remaining.length; ) {
          if (remaining[i].item.repository.id === repoId) {
            repoMatches.push(...remaining.splice(i, 1))
          } else {
            i++
          }
        }

        // Main worktree row first, creating a synthetic match if necessary
        const mainMatch = repoMatches.find(m => !isLinkedWorktree(m.item))
        if (mainMatch) {
          output.push(mainMatch)
        } else {
          const mainRow = mainWorktreeRowsLookup.get(repoId)
          if (mainRow) {
            output.push({
              item: mainRow,
              score: match.score,
              matches: { title: [], subtitle: [] },
            })
          }
        }

        // Then the linked worktree rows, in their original order
        for (const m of repoMatches) {
          if (isLinkedWorktree(m.item)) {
            output.push(m)
          }
        }
      }

      return output
    }
  }

  private renderPostFilter = () => {
    return (
      <>
        {this.props.accounts.length > 0 && (
          <Button
            className="repo-list-button account-filter button-with-icon"
            onClick={this.onAccountFilterButtonClick}
            tooltip="Filter repositories by account"
            ariaLabel="Filter repositories by account"
          >
            <Octicon symbol={octicons.person} />
            {this.getAccountFilterLabel()}
            <Octicon symbol={octicons.triangleDown} />
          </Button>
        )}

        <Button
          className="repo-list-button new-repository button-with-icon"
          onClick={this.onNewRepositoryButtonClick}
          ariaExpanded={this.state.newRepositoryMenuExpanded}
          onKeyDown={this.onNewRepositoryButtonKeyDown}
        >
          Add
          <Octicon symbol={octicons.triangleDown} />
        </Button>

        {this.state.pullingRepositories ? (
          <Button
            className="repo-list-button pull-repositories-spin button-with-icon"
            disabled={true}
          >
            <Octicon symbol={syncClockwise} className="spin" />
            Pulling…
          </Button>
        ) : (
          <Button
            className="repo-list-button pull-repositories button-with-icon"
            onClick={this.onPullRepositoriesButtonClick}
          >
            <Octicon symbol={octicons.arrowDown} />
            {__DARWIN__ ? 'Pull All' : 'Pull all'}
          </Button>
        )}
      </>
    )
  }

  /**
   * A label that unambiguously identifies an account, even when two
   * accounts share the same display name: the login is always unique per
   * endpoint, and the endpoint disambiguates same-login accounts signed in
   * on different GitHub Enterprise instances.
   */
  private getAccountLabel(account: Account): string {
    return `${account.friendlyName} (@${account.login} · ${account.friendlyEndpoint})`
  }

  private getAccountFilterLabel(): string {
    const { selectedFilterAccountId, accounts } = this.props
    if (selectedFilterAccountId === null) {
      return 'All accounts'
    }

    // Keep the toolbar button compact; the full name/endpoint disambiguation
    // is shown in the dropdown menu items instead.
    const account = accounts.find(a => a.id === selectedFilterAccountId)
    return account ? `@${account.login}` : 'All accounts'
  }

  private onAccountFilterButtonClick = () => {
    const { accounts, selectedFilterAccountId } = this.props

    const items: IMenuItem[] = [
      {
        label: 'All accounts',
        type: 'checkbox',
        checked: selectedFilterAccountId === null,
        action: () => this.onAccountFilterSelected(null),
      },
      { type: 'separator' },
      ...accounts.map(account => ({
        label: this.getAccountLabel(account),
        type: 'checkbox' as const,
        checked: selectedFilterAccountId === account.id,
        action: () => this.onAccountFilterSelected(account.id),
      })),
    ]

    showContextualMenu(items)
  }

  private onAccountFilterSelected = (accountId: number | null) => {
    this.props.dispatcher.setSelectedFilterAccountId(accountId)
  }

  private onNewRepositoryButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (event.key === 'ArrowDown') {
      this.onNewRepositoryButtonClick()
    }
  }

  private renderNoItems = () => {
    return (
      <div className="no-items no-results-found">
        <img src={BlankSlateImage} className="blankslate-image" alt="" />
        <div className="title">Sorry, I can't find that repository</div>

        <div className="protip">
          ProTip! Press{' '}
          <div className="kbd-shortcut">
            <KeyboardShortcut darwinKeys={['⌘', 'O']} keys={['Ctrl', 'O']} />
          </div>{' '}
          to quickly add a local repository, and{' '}
          <div className="kbd-shortcut">
            <KeyboardShortcut
              darwinKeys={['⇧', '⌘', 'O']}
              keys={['Ctrl', 'Shift', 'O']}
            />
          </div>{' '}
          to clone from anywhere within the app
        </div>
      </div>
    )
  }

  private onNewRepositoryButtonClick = () => {
    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Clone Repository…' : 'Clone repository…',
        action: this.onCloneRepository,
      },
      {
        label: __DARWIN__ ? 'Create New Repository…' : 'Create new repository…',
        action: this.onCreateNewRepository,
      },
      {
        label: __DARWIN__
          ? 'Add Existing Repository…'
          : 'Add existing repository…',
        action: this.onAddExistingRepository,
      },
      { type: 'separator' },
      {
        label: __DARWIN__ ? 'New Group…' : 'New group…',
        action: this.onNewGroup,
      },
    ]

    this.setState({ newRepositoryMenuExpanded: true })
    showContextualMenu(items).then(() => {
      this.setState({ newRepositoryMenuExpanded: false })
    })
  }

  private onPullRepositoriesButtonClick = async () => {
    this.setState({ pullingRepositories: true })
    await this.props.dispatcher.pullAllRepositories()
    this.setState({ pullingRepositories: false })
  }

  private onCloneRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CloneRepository,
      initialURL: null,
    })
  }

  private onAddExistingRepository = () => {
    this.props.dispatcher.showPopup({ type: PopupType.AddRepository })
  }

  private onNewGroup = () => {
    const repositories = this.getVisibleRepos().filter(
      (r): r is Repository => r instanceof Repository
    )

    this.props.dispatcher.showPopup({
      type: PopupType.CreateRepositoryGroup,
      repositories,
    })
  }

  private onCreateNewRepository = () => {
    this.props.dispatcher.showPopup({ type: PopupType.CreateRepository })
  }

  private onChangeRepositoryAlias = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ChangeRepositoryAlias,
      repository,
    })
  }

  private onRemoveRepositoryAlias = (repository: Repository) => {
    this.props.dispatcher.changeRepositoryAlias(repository, null)
  }

  private onCreateWorktree = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.AddWorktree,
      repository,
    })
  }

  private onShowWorktrees = (repository: Repository) => {
    this.props.dispatcher.selectRepository(repository)
    this.props.dispatcher.showWorktreesFoldout()
  }

  private onRenameWorktree = (repository: Repository, worktreePath: string) => {
    this.props.dispatcher.showPopup({
      type: PopupType.RenameWorktree,
      repository,
      worktreePath,
    })
  }

  private onDeleteWorktree = (repository: Repository, worktreePath: string) => {
    this.props.dispatcher.requestDeleteWorktree(repository, worktreePath)
  }

  private onOpenWorktreeInNewWindow = (worktreePath: string) => {
    openRepositoryInNewWindow(worktreePath)
  }

  private onChangeRepositoryGroupName = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ChangeRepositoryGroupName,
      repository,
    })
  }

  private onRemoveRepositoryGroupName = (repository: Repository) => {
    this.props.dispatcher.changeRepositoryGroupName(repository, null)
  }

  private onPinRepository = (repository: Repository) => {
    addPinnedRepository(repository)
    this.setState({ pinnedRepositoriesIds: getPinnedRepositories() })
  }

  private onUnpinRepository = (repository: Repository) => {
    removePinnedRepository(repository)
    this.setState({ pinnedRepositoriesIds: getPinnedRepositories() })
  }
}

/** Collects the sorted, de-duplicated custom group names currently in use */
export function getKnownGroupNames(
  repositories: ReadonlyArray<Repositoryish>
): ReadonlyArray<string> {
  const groupNames = new Set<string>()

  for (const repository of repositories) {
    if (repository instanceof Repository && repository.groupName !== null) {
      groupNames.add(repository.groupName)
    }
  }

  return [...groupNames.values()].sort((x, y) =>
    x.toLowerCase().localeCompare(y.toLowerCase())
  )
}
