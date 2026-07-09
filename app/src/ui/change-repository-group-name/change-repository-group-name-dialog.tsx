import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { assertNever } from '../../lib/fatal-error'

interface IChangeRepositoryGroupNameProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly repository: Repository
}

interface IChangeRepositoryGroupNameState {
  readonly newGroupName: string
}

export class ChangeRepositoryGroupName extends React.Component<
  IChangeRepositoryGroupNameProps,
  IChangeRepositoryGroupNameState
> {
  public constructor(props: IChangeRepositoryGroupNameProps) {
    super(props)

    this.state = {
      newGroupName:
        props.repository.groupName ??
        props.repository.gitHubRepository?.owner.login ??
        '',
    }
  }

  public render() {
    const repository = this.props.repository

    return (
      <Dialog
        id="change-repository-group-name"
        title={
          __DARWIN__
            ? `Change Repository Group Name`
            : `Change repository group name`
        }
        ariaDescribedBy="change-repository-group-name-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.changeGroupName}
      >
        <DialogContent>
          <p id="change-repository-group-name-description">
            Choose a new group name for the repository "{nameOf(repository)}".{' '}
          </p>
          <p>
            <TextBox
              ariaLabel="Group name"
              value={this.state.newGroupName}
              onValueChanged={this.onNameChanged}
            />
          </p>
          {repository.gitHubRepository !== null && (
            <p className="description">
              This will not change the actual repository owner
              {this.remoteLabel(repository)}.
            </p>
          )}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              __DARWIN__ ? `Change Group Name` : `Change group name`
            }
            okButtonDisabled={this.state.newGroupName.length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private remoteLabel(repository: Repository) {
    const type = repository.gitHubRepository?.type
    if (!type) {
      return ''
    }

    switch (type) {
      case 'github':
        return ' on GitHub'
      case 'bitbucket':
        return ' on Bitbucket'
      case 'gitlab':
        return ' on GitLab'
      case 'codeberg':
        return ' on Codeberg'
      case 'gitea':
        return ' on Gitea'
      default:
        assertNever(type, `Unknown repository type: ${type}`)
    }
  }

  private onNameChanged = (newGroupName: string) => {
    this.setState({ newGroupName })
  }

  private changeGroupName = () => {
    this.props.dispatcher.changeRepositoryGroupName(
      this.props.repository,
      this.state.newGroupName
    )
    this.props.onDismissed()
  }
}
