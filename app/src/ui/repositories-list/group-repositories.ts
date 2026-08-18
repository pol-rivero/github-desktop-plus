import * as Path from 'path'
import {
  Repository,
  ILocalRepositoryState,
  nameOf,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { getHTMLURL } from '../../lib/api'
import { caseInsensitiveCompare, compare } from '../../lib/compare'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import { WorktreeEntry } from '../../models/worktree'
import { assertNever } from '../../lib/fatal-error'
import { isGHE, isGHES } from '../../lib/endpoint-capabilities'
import { Owner } from '../../models/owner'

export type RepositoryListGroup = (
  | {
      kind: 'recent' | 'other' | 'pins'
    }
  | {
      kind: 'dotcom'
      owner: Owner
      login: string | null
    }
  | {
      kind: 'enterprise'
      host: string
    }
) & { displayName: string | null }

/**
 * Returns a unique grouping key (string) for a repository group. Doubles as a
 * case sensitive sorting key (i.e the case sensitive sort order of the keys is
 * the order in which the groups will be displayed in the repository list).
 */
export const getGroupKey = (group: RepositoryListGroup) => {
  const { kind, displayName } = group
  switch (kind) {
    case 'pins':
      return `-1:pins`
    case 'recent':
      return `0:recent`
    case 'dotcom':
      return displayName
        ? `1:${displayName}`
        : `1:${group.owner.login}:${group.login ?? group.owner.login}`
    case 'enterprise':
      // Allow mixing together dotcom and enterprise repos when setting a group name manually
      return displayName ? `1:${displayName}` : `2:${group.host}`
    case 'other':
      return displayName ? `1:${displayName}` : `3:other`
    default:
      assertNever(group, `Unknown repository group kind ${kind}`)
  }
}
export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly repository: Repositoryish
  readonly needsDisambiguation: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  readonly branchName: string | null
  readonly defaultBranchName: string | null
  /**
   * The worktree this row represents, when worktrees are shown in the list.
   *
   * The repository row carries the main worktree (so clicking it switches to
   * the main worktree); linked worktrees each get their own row nested below
   * it. `null` when worktree info isn't available (feature disabled or not yet
   * loaded), in which case the row is a plain repository row.
   */
  readonly worktree: WorktreeEntry | null
}

const recentRepositoriesThreshold = 7

const getHostForRepository = (repo: RepositoryWithGitHubRepository) =>
  new URL(getHTMLURL(repo.gitHubRepository.endpoint)).host

export const getGroupForRepository = (
  repo: Repositoryish
): RepositoryListGroup => {
  if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
    return isGHE(repo.gitHubRepository.endpoint) ||
      isGHES(repo.gitHubRepository.endpoint)
      ? {
          kind: 'enterprise',
          host: getHostForRepository(repo),
          displayName: repo.groupName,
        }
      : {
          kind: 'dotcom',
          owner: repo.gitHubRepository.owner,
          displayName: repo.groupName,
          login: repo.gitHubRepository.login,
        }
  }
  if (repo instanceof Repository) {
    return { kind: 'other', displayName: repo.groupName }
  }
  return { kind: 'other', displayName: null }
}

type RepoGroupItem = { group: RepositoryListGroup; repos: Repositoryish[] }

export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  recentRepositories: ReadonlyArray<number>
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  const includeRecentGroup = repositories.length > recentRepositoriesThreshold
  const recentSet = includeRecentGroup ? new Set(recentRepositories) : undefined
  const groups = new Map<string, RepoGroupItem>()

  const addToGroup = (group: RepositoryListGroup, repo: Repositoryish) => {
    const key = getGroupKey(group)
    let rg = groups.get(key)
    if (!rg) {
      rg = { group, repos: [] }
      groups.set(key, rg)
    }

    rg.repos.push(repo)
  }

  for (const repo of repositories) {
    if (recentSet?.has(repo.id) && repo instanceof Repository) {
      addToGroup({ kind: 'recent', displayName: repo.groupName }, repo)
    }

    addToGroup(getGroupForRepository(repo), repo)
  }

  return Array.from(groups)
    .sort(([xKey], [yKey]) => compare(xKey.toLowerCase(), yKey.toLowerCase()))
    .map(([, { group, repos }]) => ({
      identifier: group,
      items: toSortedListItems(
        group,
        repos,
        localRepositoryStateLookup,
        groups
      ),
    }))
}

// Returns the display title for a repository, which is either the alias
// (if available) or the name.
const getDisplayTitle = (r: Repositoryish) =>
  r instanceof Repository && r.alias != null ? r.alias : r.name

const toSortedListItems = (
  group: RepositoryListGroup,
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groups: Map<string, RepoGroupItem>
): IRepositoryListItem[] => {
  const groupNames = new Map<string, number>()
  const allNames = new Map<string, number>()

  for (const groupItem of groups.values()) {
    // All items in the recent group are by definition present in another
    // group and therefore we don't want to count them.
    if (groupItem.group.kind === 'recent') {
      continue
    }

    for (const title of groupItem.repos.map(getDisplayTitle)) {
      allNames.set(title, (allNames.get(title) ?? 0) + 1)
      if (groupItem.group === group) {
        groupNames.set(title, (groupNames.get(title) ?? 0) + 1)
      }
    }
  }

  return repositories
    .map(r => {
      const repoState = localRepositoryStateLookup.get(r.id)
      const title = getDisplayTitle(r)

      const aheadBehind = repoState?.aheadBehind ?? null
      const changedFilesCount = repoState?.changedFilesCount ?? 0
      const mainWorktree =
        getWorktrees(r, repoState).find(wt => wt.type === 'main') ?? null
      const isMainWorktreeActive =
        mainWorktree === null || mainWorktree.path === r.path

      return {
        text: r instanceof Repository ? [title, nameOf(r)] : [title],
        id: r.id.toString(),
        repository: r,
        needsDisambiguation:
          // If the repository is in the enterprise group and has a duplicate
          // name in the group, we need to disambiguate it. We don't have to
          // disambiguate repositories in the 'dotcom' group because they are
          // already grouped by owner. If the repository is in the 'recent'
          // group and has a duplicate name in any group, we need to
          // disambiguate it.
          ((groupNames.get(title) ?? 0) > 1 && group.kind === 'enterprise') ||
          ((allNames.get(title) ?? 0) > 1 && group.kind === 'recent'),
        aheadBehind: isMainWorktreeActive ? aheadBehind : null,
        changedFilesCount: isMainWorktreeActive ? changedFilesCount : 0,
        branchName: mainWorktree
          ? shortBranchName(mainWorktree.branch)
          : repoState?.branchName ?? null,
        defaultBranchName: repoState?.defaultBranchName ?? null,
        worktree: mainWorktree,
      }
    })
    .sort(({ repository: x }, { repository: y }) =>
      caseInsensitiveCompare(getDisplayTitle(x), getDisplayTitle(y))
    )
    .flatMap(item => [
      item,
      ...buildLinkedWorktreeRows(item, localRepositoryStateLookup),
    ])
}

const shortBranchName = (branch: string | null): string | null =>
  branch ? branch.replace(/^refs\/heads\//, '') : null

function getWorktrees(
  r: Repositoryish,
  repoState: ILocalRepositoryState | undefined
): ReadonlyArray<WorktreeEntry> {
  return r instanceof Repository ? repoState?.worktrees ?? [] : []
}

/**
 * Builds the rows for a repository's linked worktrees, which are nested below
 * the repository's own row (that one represents the main worktree).
 */
function buildLinkedWorktreeRows(
  item: IRepositoryListItem,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
): IRepositoryListItem[] {
  const r = item.repository
  const repoState = localRepositoryStateLookup.get(r.id)
  const aheadBehind = repoState?.aheadBehind ?? null
  const changedFilesCount = repoState?.changedFilesCount ?? 0

  // Linked worktree rows match the same filter text as their repository so they travel with it
  return getWorktrees(r, repoState)
    .filter(wt => wt.type === 'linked')
    .map((wt): IRepositoryListItem => {
      const isActiveWorktree = wt.path === r.path
      return {
        text: [Path.basename(wt.path)],
        id: `${r.id}:${wt.path}`,
        repository: r,
        needsDisambiguation: false,
        aheadBehind: isActiveWorktree ? aheadBehind : null,
        changedFilesCount: isActiveWorktree ? changedFilesCount : 0,
        branchName: shortBranchName(wt.branch),
        defaultBranchName: repoState?.defaultBranchName ?? null,
        worktree: wt,
      }
    })
}

/**
 * Extracts pinned items from existing groups and returns a Pins group, or null
 * if none of the pinned IDs are found in the groups.
 */
export function buildPinnedGroup(
  pinnedIds: ReadonlyArray<number>,
  allGroups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >
): IFilterListGroup<IRepositoryListItem, RepositoryListGroup> | null {
  if (pinnedIds.length === 0) {
    return null
  }

  const idToItems = new Map<number, IRepositoryListItem[]>()
  const completedIds = new Set<number>()
  for (const group of allGroups) {
    for (const item of group.items) {
      const id = item.repository.id
      if (id <= 0 || completedIds.has(id)) {
        continue
      }
      const rows = idToItems.get(id)
      if (rows === undefined) {
        idToItems.set(id, [item])
      } else {
        rows.push(item)
      }
    }
    for (const id of idToItems.keys()) {
      completedIds.add(id)
    }
  }

  const items = pinnedIds.flatMap(id => idToItems.get(id) ?? [])

  if (items.length === 0) {
    return null
  }

  return { identifier: { kind: 'pins', displayName: null }, items }
}

/**
 * Returns groups with pinned items removed so they only appear in the Pins group.
 */
export function filterPinnedFromGroups(
  pinnedIds: ReadonlyArray<number>,
  groups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  if (pinnedIds.length === 0) {
    return groups
  }

  const pinnedIdSet = new Set(pinnedIds)
  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(item => !pinnedIdSet.has(item.repository.id)),
    }))
    .filter(group => group.items.length > 0)
}
