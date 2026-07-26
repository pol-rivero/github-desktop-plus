import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { HighlightText } from '../lib/highlight-text'
import { match } from '../../lib/fuzzy-find'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import * as octicons from '../octicons/octicons.generated'

/**
 * Prefers the repo alias, otherwise falls back to the owner-qualified name
 */
const displayNameOf = (repository: Repository) =>
  repository.alias ?? nameOf(repository)

interface ICreateRepositoryGroupProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly repositories: ReadonlyArray<Repository>

  /** The id of a repository to preselect, if the dialog was opened from it */
  readonly preselectedRepositoryId?: number
}

interface ICreateRepositoryGroupState {
  readonly groupName: string
  readonly selectedRepositoryIds: ReadonlySet<number>
  readonly filterText: string
}

interface IFilteredRepository {
  readonly repository: Repository

  /** Indices of the characters of the name that matched the filter */
  readonly matches: ReadonlyArray<number>
}

export class CreateRepositoryGroup extends React.Component<
  ICreateRepositoryGroupProps,
  ICreateRepositoryGroupState
> {
  public constructor(props: ICreateRepositoryGroupProps) {
    super(props)

    this.state = {
      groupName: '',
      selectedRepositoryIds: new Set(
        props.preselectedRepositoryId !== undefined
          ? [props.preselectedRepositoryId]
          : []
      ),
      filterText: '',
    }
  }

  public render() {
    return (
      <Dialog
        id="create-repository-group"
        title={__DARWIN__ ? 'New Group' : 'New group'}
        ariaDescribedBy="create-repository-group-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.createGroup}
      >
        <DialogContent>
          <p id="create-repository-group-description">
            Choose a name for the new group and select which repositories to add
            to it. You can change this later from each repository's context
            menu.
          </p>
          <p>
            <TextBox
              ariaLabel="Group name"
              placeholder="Group name"
              value={this.state.groupName}
              onValueChanged={this.onGroupNameChanged}
              autoFocus={true}
            />
          </p>
          <p>
            <TextBox
              type="search"
              placeholder="Filter"
              ariaLabel="Filter repositories"
              prefixedIcon={octicons.search}
              value={this.state.filterText}
              onValueChanged={this.onFilterTextChanged}
              onKeyDown={this.onFilterKeyDown}
            />
          </p>
          {this.renderRepositoryList()}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Create Group' : 'Create group'}
            okButtonDisabled={
              this.state.groupName.length === 0 ||
              this.state.selectedRepositoryIds.size === 0
            }
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderRepositoryList() {
    const repositories = this.sortRepositories(this.getFilteredRepositories())
    const resultCount = `${repositories.length} ${
      repositories.length === 1 ? 'result' : 'results'
    }`

    return (
      <>
        <AriaLiveContainer
          message={resultCount}
          trackedUserInput={this.state.filterText}
        />
        {repositories.length === 0 ? (
          <div className="no-repositories">
            No repositories match your filter.
          </div>
        ) : (
          <div
            className="repository-list-selector"
            role="group"
            aria-label="Repositories to add to the group"
          >
            {repositories.map(this.renderRepositoryCheckbox)}
          </div>
        )}
      </>
    )
  }

  private getFilteredRepositories(): ReadonlyArray<IFilteredRepository> {
    const filterText = this.state.filterText.trim()

    if (filterText.length === 0) {
      return this.props.repositories.map(repository => ({
        repository,
        matches: [],
      }))
    }

    return match(filterText, this.props.repositories, r => [
      displayNameOf(r),
    ]).map(({ item, matches }) => ({
      repository: item,
      matches: matches.title,
    }))
  }

  private sortRepositories(repositories: ReadonlyArray<IFilteredRepository>) {
    return repositories.toSorted((a, b) =>
      displayNameOf(a.repository).localeCompare(displayNameOf(b.repository))
    )
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter in the filter field would otherwise submit the dialog and create
    // the group while the user is still narrowing down the list.
    if (event.key === 'Enter') {
      event.preventDefault()
    }
  }

  private renderRepositoryCheckbox = ({
    repository,
    matches,
  }: IFilteredRepository) => {
    const isSelected = this.state.selectedRepositoryIds.has(repository.id)

    return (
      <Checkbox
        key={repository.id}
        label={
          <HighlightText text={displayNameOf(repository)} highlight={matches} />
        }
        value={isSelected ? CheckboxValue.On : CheckboxValue.Off}
        onChange={this.onRepositoryCheckboxChange(repository.id)}
      />
    )
  }

  private onRepositoryCheckboxChange =
    (repositoryId: number) => (event: React.FormEvent<HTMLInputElement>) => {
      const selectedRepositoryIds = new Set(this.state.selectedRepositoryIds)

      if (event.currentTarget.checked) {
        selectedRepositoryIds.add(repositoryId)
      } else {
        selectedRepositoryIds.delete(repositoryId)
      }

      this.setState({ selectedRepositoryIds })
    }

  private onGroupNameChanged = (groupName: string) => {
    this.setState({ groupName })
  }

  private createGroup = async () => {
    const { groupName, selectedRepositoryIds } = this.state
    const selectedRepositories = this.props.repositories.filter(r =>
      selectedRepositoryIds.has(r.id)
    )

    await this.props.dispatcher.changeRepositoriesGroupName(
      selectedRepositories,
      groupName
    )

    this.props.onDismissed()
  }
}
