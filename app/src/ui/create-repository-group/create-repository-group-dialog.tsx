import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface ICreateRepositoryGroupProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly repositories: ReadonlyArray<Repository>
}

interface ICreateRepositoryGroupState {
  readonly groupName: string
  readonly selectedRepositoryIds: ReadonlySet<number>
}

export class CreateRepositoryGroup extends React.Component<
  ICreateRepositoryGroupProps,
  ICreateRepositoryGroupState
> {
  public constructor(props: ICreateRepositoryGroupProps) {
    super(props)

    this.state = { groupName: '', selectedRepositoryIds: new Set() }
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
            Choose a name for the new group and select which repositories to
            add to it. You can change this later from each repository's
            context menu.
          </p>
          <p>
            <TextBox
              ariaLabel="Group name"
              value={this.state.groupName}
              onValueChanged={this.onGroupNameChanged}
              autoFocus={true}
            />
          </p>
          <div className="repository-list-selector">
            {this.props.repositories.map(this.renderRepositoryCheckbox)}
          </div>
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

  private renderRepositoryCheckbox = (repository: Repository) => {
    const isSelected = this.state.selectedRepositoryIds.has(repository.id)

    return (
      <Checkbox
        key={repository.id}
        label={nameOf(repository)}
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

    await Promise.all(
      selectedRepositories.map(repository =>
        this.props.dispatcher.changeRepositoryGroupName(
          repository,
          groupName
        )
      )
    )

    this.props.onDismissed()
  }
}
