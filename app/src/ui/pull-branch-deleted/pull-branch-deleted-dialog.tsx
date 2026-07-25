import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Ref } from '../lib/ref'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'

interface IPullBranchDeletedDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  /** The name of the branch whose remote branch no longer exists. */
  readonly branchName: string
  readonly onDismissed: () => void
}

interface IPullBranchDeletedDialogState {
  /** Whether to also delete the stale local branch we're switching away from. */
  readonly deleteStaleBranch: boolean
}

/**
 * Shown when pulling a repository fails because the current branch's remote
 * branch no longer exists (e.g. it was deleted or renamed on the remote).
 *
 * Offers to switch the repository to its default branch and retry the pull,
 * which is especially useful for the "Pull all" action where handling each
 * affected repository manually is tedious.
 */
export class PullBranchDeletedDialog extends React.Component<
  IPullBranchDeletedDialogProps,
  IPullBranchDeletedDialogState
> {
  public constructor(props: IPullBranchDeletedDialogProps) {
    super(props)
    this.state = { deleteStaleBranch: false }
  }

  public render() {
    return (
      <Dialog
        id="pull-branch-deleted"
        title={__DARWIN__ ? 'Unable to Pull' : 'Unable to pull'}
        type="error"
        role="alertdialog"
        ariaDescribedBy="pull-branch-deleted-message"
        onSubmit={this.onSwitchToDefaultBranch}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <div id="pull-branch-deleted-message">
            <p>
              Unable to pull <Ref>{this.props.repository.name}</Ref> because the
              remote branch for <Ref>{this.props.branchName}</Ref> does not
              exist.
            </p>
            <p>
              You can switch this repository to its default branch and pull
              again.
            </p>
          </div>

          <div className="pull-branch-deleted-dialog__delete-stale-branch">
            <Checkbox
              label={
                <>
                  Also delete branch <Ref>{this.props.branchName}</Ref>
                </>
              }
              value={
                this.state.deleteStaleBranch
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onDeleteStaleBranchChange}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              __DARWIN__
                ? 'Switch to Default Branch'
                : 'Switch to default branch'
            }
            okButtonTitle="This will check out the repository's default branch and pull it."
            cancelButtonText="Close"
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onDeleteStaleBranchChange = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ deleteStaleBranch: event.currentTarget.checked })
  }

  private onSwitchToDefaultBranch = () => {
    // Dismiss the dialog immediately and let the switch-and-pull run in the
    // background. Its progress is reported through the normal pull progress
    // indicator, and any failure surfaces through the standard error handler.
    this.props.onDismissed()
    this.props.dispatcher.switchToDefaultBranchAndPull(
      this.props.repository,
      this.state.deleteStaleBranch
    )
  }
}
