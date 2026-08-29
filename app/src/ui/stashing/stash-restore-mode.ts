import { getEnum } from '../../lib/local-storage'

/** How the stashed changes should be restored into the working directory */
export enum StashRestoreMode {
  /** Restore the changes and delete the stash entry (`git stash pop`) */
  Pop = 'pop',
  /** Restore the changes and keep the stash entry (`git stash apply`) */
  Apply = 'apply',
}

const stashRestoreModeKey = 'stash-restore-mode'
const defaultStashRestoreMode = StashRestoreMode.Pop

/** Gets the last used mode for restoring stashed changes. */
export function getStashRestoreMode(): StashRestoreMode {
  return (
    getEnum(stashRestoreModeKey, StashRestoreMode) ?? defaultStashRestoreMode
  )
}

/** Persists the mode to use for restoring stashed changes. */
export function setStashRestoreMode(mode: StashRestoreMode) {
  localStorage.setItem(stashRestoreModeKey, mode)
}
