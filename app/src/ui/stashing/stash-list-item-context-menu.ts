import { Repository } from '../../models/repository'
import { IMenuItem } from '../../lib/menu-item'
import { IStashEntry } from '../../models/stash-entry'
import { Dispatcher } from '../dispatcher'
import { ErrorWithMetadata } from '../../lib/error-with-metadata'
import { PopupType } from '../../models/popup'
import { StashRestoreMode } from './stash-restore-mode'

interface IStashListItemContextMenuConfig {
  readonly stashEntry: IStashEntry
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly askForConfirmationOnDiscardStash: boolean
}

export const generateStashListContextMenu = (
  config: IStashListItemContextMenuConfig
) => {
  const items: ReadonlyArray<IMenuItem> = [
    {
      label: 'Rename…',
      action: () => onRename(config),
    },
    {
      label: 'Restore Changes',
      action: () => onRestore(config, StashRestoreMode.Pop),
    },
    {
      label: 'Apply Changes',
      action: () => onRestore(config, StashRestoreMode.Apply),
    },
    {
      label: 'Discard',
      action: () => onDiscard(config),
    },
  ]

  return items
}

async function onRestore(
  config: IStashListItemContextMenuConfig,
  mode: StashRestoreMode
) {
  const { stashEntry, repository, dispatcher } = config
  try {
    if (mode === StashRestoreMode.Apply) {
      await dispatcher.applyStash(repository, stashEntry)
    } else {
      await dispatcher.popStash(repository, stashEntry)
    }
  } catch (err) {
    const errorWithMetadata = new ErrorWithMetadata(err, {
      repository: repository,
    })
    dispatcher.postError(errorWithMetadata)
  }
}

function onRename(config: IStashListItemContextMenuConfig) {
  const { stashEntry, repository, dispatcher } = config
  dispatcher.showPopup({
    type: PopupType.RenameStash,
    stash: stashEntry,
    repository,
  })
}

async function onDiscard(config: IStashListItemContextMenuConfig) {
  const { stashEntry, repository, dispatcher } = config
  if (!config.askForConfirmationOnDiscardStash) {
    await dispatcher.dropStash(repository, stashEntry)
  } else {
    dispatcher.showPopup({
      type: PopupType.ConfirmDiscardStash,
      stash: stashEntry,
      repository,
    })
  }
}
