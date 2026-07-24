import { UpdateBranchStrategy } from '../lib/update-branch-strategy'

export enum ForkContributionTarget {
  Parent = 'parent',
  Self = 'self',
}

/**
 * Collection of configurable settings regarding how the user may work with a repository.
 */
export type WorkflowPreferences = {
  /**
   * What repo does the user want to contribute to with this fork?
   */
  readonly forkContributionTarget?: ForkContributionTarget

  /**
   * How the "Update from <default branch>" action updates the current branch:
   * by merging the default branch in, or by rebasing onto it.
   */
  readonly updateBranchStrategy?: UpdateBranchStrategy
}
