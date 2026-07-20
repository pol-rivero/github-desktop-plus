import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'

interface IDeleteRepositoryGroupProps {
  readonly dispatcher: Dispatcher
  readonly groupName: string
  readonly repositories: ReadonlyArray<Repository>
  readonly onDismissed: () => void
}

interface IDeleteRepositoryGroupState {
  readonly removeRepositories: boolean
  readonly isDeletingGroup: boolean
}

export class DeleteRepositoryGroup extends React.Component<
  IDeleteRepositoryGroupProps,
  IDeleteRepositoryGroupState
> {
  public constructor(props: IDeleteRepositoryGroupProps) {
    super(props)

    this.state = { removeRepositories: false, isDeletingGroup: false }
  }

  public render() {
    const { groupName, repositories } = this.props
    const count = repositories.length

    return (
      <Dialog
        id="delete-repository-group"
        key="delete-repository-group-confirmation"
        type="warning"
        title={__DARWIN__ ? 'Delete Group' : 'Delete group'}
        dismissDisabled={this.state.isDeletingGroup}
        loading={this.state.isDeletingGroup}
        disabled={this.state.isDeletingGroup}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p>
            Are you sure you want to delete the group "{groupName}"? This will
            unassign it from {count} {count === 1 ? 'repository' : 'repositories'}
            .
          </p>

          <div>
            <Checkbox
              label={
                __DARWIN__
                  ? `Also Remove These Repositories From Desktop Plus`
                  : `Also remove these repositories from Desktop Plus`
              }
              value={
                this.state.removeRepositories
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onRemoveRepositoriesChanged}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Delete" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onRemoveRepositoriesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ removeRepositories: event.currentTarget.checked })
  }

  private onSubmit = async () => {
    this.setState({ isDeletingGroup: true })

    const { dispatcher, repositories } = this.props

    if (this.state.removeRepositories) {
      await Promise.all(
        repositories.map(repository =>
          dispatcher.removeRepository(repository, false)
        )
      )
    } else {
      await Promise.all(
        repositories.map(repository =>
          dispatcher.changeRepositoryGroupName(repository, null)
        )
      )
    }

    this.props.onDismissed()
  }
}
