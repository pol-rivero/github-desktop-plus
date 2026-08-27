import * as React from 'react'
import { IStashEntry } from '../../models/stash-entry'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { ErrorWithMetadata } from '../../lib/error-with-metadata'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RetryActionType } from '../../models/retry-actions'
import {
  DropdownSelectButton,
  IDropdownSelectButtonOption,
} from '../dropdown-select-button'
import {
  getStashRestoreMode,
  setStashRestoreMode,
  StashRestoreMode,
} from './stash-restore-mode'
import { parseEnumValue } from '../../lib/enum'

/** The options offered by the "Restore Changes" split button */
const restoreModeOptions: ReadonlyArray<
  IDropdownSelectButtonOption & {
    readonly id: StashRestoreMode
    readonly description: string
  }
> = [
  {
    id: StashRestoreMode.Pop,
    label: 'Restore Changes',
    description:
      'Move the changes to the working directory and delete the stash.',
    icon: octicons.fileDiff,
  },
  {
    id: StashRestoreMode.Apply,
    label: 'Apply Changes',
    description:
      'Copy the changes to the working directory, keeping the stash.',
    icon: octicons.fileDiff,
  },
]

interface IStashDiffHeaderProps {
  readonly stashEntry: IStashEntry
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly askForConfirmationOnDiscardStash: boolean
}

interface IStashDiffHeaderState {
  readonly isRestoring: boolean
  readonly isDiscarding: boolean
  readonly restoreMode: StashRestoreMode
}

/**
 * Component to provide the actions that can be performed
 * on a stash while viewing a stash diff
 */
export class StashDiffHeader extends React.Component<
  IStashDiffHeaderProps,
  IStashDiffHeaderState
> {
  public constructor(props: IStashDiffHeaderProps) {
    super(props)

    this.state = {
      isRestoring: false,
      isDiscarding: false,
      restoreMode: getStashRestoreMode(),
    }
  }

  public render() {
    const { isRestoring, isDiscarding, restoreMode } = this.state
    const { stashEntry } = this.props

    return (
      <div className="header">
        <div className="title-row">
          <h3>{stashEntry.customName ?? 'Stashed changes'}</h3>
          <Button
            className="rename-stash-button"
            onClick={this.onRenameClick}
            tooltip="Rename stash"
            ariaLabel="Rename stash"
            disabled={isRestoring || isDiscarding}
          >
            <Octicon symbol={octicons.pencil} />
          </Button>
        </div>
        <div className="row button-group">
          <Button
            onClick={this.onCloseClick}
            tooltip={'Close the stash view'}
            className="button-with-icon"
          >
            <Octicon symbol={octicons.x} className="mr" />
            Close
          </Button>
          <DropdownSelectButton
            options={restoreModeOptions}
            checkedOption={restoreMode}
            disabled={isRestoring || isDiscarding}
            tooltip={this.getRestoreTooltip()}
            dropdownAriaLabel="Restore options"
            onCheckedOptionChange={this.onRestoreModeChange}
            onSubmit={this.onRestoreSubmit}
          />
          <Button
            onClick={this.onDiscardClick}
            tooltip={'Discard the stashed changes'}
            className="destructive button-with-icon"
            disabled={isRestoring || isDiscarding}
          >
            <Octicon symbol={octicons.trash} className="mr" />
            Discard
          </Button>
        </div>
      </div>
    )
  }

  private getRestoreTooltip() {
    const option = restoreModeOptions.find(o => o.id === this.state.restoreMode)
    return option?.description
  }

  private onRenameClick = () => {
    const { dispatcher, repository, stashEntry } = this.props

    dispatcher.showPopup({
      type: PopupType.RenameStash,
      stash: stashEntry,
      repository,
    })
  }

  private onDiscardClick = async () => {
    const {
      dispatcher,
      repository,
      stashEntry,
      askForConfirmationOnDiscardStash,
    } = this.props

    if (!askForConfirmationOnDiscardStash) {
      this.setState({
        isDiscarding: true,
      })

      try {
        await dispatcher.dropStash(repository, stashEntry)
      } finally {
        this.setState({
          isDiscarding: false,
        })
      }
    } else {
      dispatcher.showPopup({
        type: PopupType.ConfirmDiscardStash,
        stash: stashEntry,
        repository,
      })
    }
  }

  private onRestoreModeChange = (option: IDropdownSelectButtonOption) => {
    const mode = parseEnumValue(StashRestoreMode, option.id)

    if (mode === undefined) {
      return
    }

    setStashRestoreMode(mode)
    this.setState({ restoreMode: mode })
  }

  private onRestoreSubmit = async (
    event: React.MouseEvent<HTMLButtonElement>,
    selectedOption: IDropdownSelectButtonOption
  ) => {
    const mode = parseEnumValue(StashRestoreMode, selectedOption.id)

    if (mode === undefined) {
      return
    }

    event.preventDefault()
    await this.restoreStash(mode)
  }

  private async restoreStash(mode: StashRestoreMode) {
    const { dispatcher, repository, stashEntry } = this.props
    const keepStash = mode === StashRestoreMode.Apply

    try {
      this.setState({ isRestoring: true })

      if (keepStash) {
        await dispatcher.applyStash(repository, stashEntry)
      } else {
        await dispatcher.popStash(repository, stashEntry)
      }
    } catch (err) {
      const errorWithMetadata = new ErrorWithMetadata(err, {
        repository: repository,
        retryAction: {
          type: RetryActionType.PopStash,
          stashEntry,
          repository,
          keepStash,
        },
      })
      dispatcher.postError(errorWithMetadata)
    } finally {
      this.setState({ isRestoring: false })
    }
  }

  private onCloseClick = () => {
    const { dispatcher, repository } = this.props
    dispatcher.selectWorkingDirectoryFiles(repository)
  }
}
