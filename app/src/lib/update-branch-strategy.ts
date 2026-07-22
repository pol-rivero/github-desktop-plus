import { getConfigValue } from './git/config'
import { Repository } from '../models/repository'

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

export const updateBranchStrategyConfigKey = 'desktop.updateBranchStrategy'

/**
 * Read the repository-only update strategy. Missing or unrecognized values
 * retain the historic merge behavior, keeping manually edited config safe.
 */
export async function getUpdateBranchStrategy(
  repository: Repository
): Promise<UpdateBranchStrategy> {
  const value = await getConfigValue(
    repository,
    updateBranchStrategyConfigKey,
    true
  )

  return value === UpdateBranchStrategy.Rebase
    ? UpdateBranchStrategy.Rebase
    : UpdateBranchStrategy.Merge
}
