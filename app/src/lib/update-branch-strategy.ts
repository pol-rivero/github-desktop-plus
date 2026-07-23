/**
 * The strategy used by Desktop Plus' "Update from …" action.
 *
 * This is intentionally separate from Git's `pull.rebase`: updating from a
 * contribution target is not a `git pull`, and changing this setting should
 * not alter the user's normal pull behavior.
 */
export enum UpdateBranchStrategy {
  Merge = 'merge',
  Rebase = 'rebase',
}
