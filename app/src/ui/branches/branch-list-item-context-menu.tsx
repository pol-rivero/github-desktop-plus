import { IMenuItem } from '../../lib/menu-item'
import { clipboard } from 'electron'
import { Branch, BranchType } from '../../models/branch'
import { RepoType } from '../../models/github-repository'
import { assertNever } from '../../lib/fatal-error'

interface IBranchContextMenuConfig {
  branch: Branch
  repoType: RepoType | undefined
  onRenameBranch?: (branchName: string) => void
  onViewBranchOnGitHub?: () => void
  onViewPullRequestOnGitHub?: () => void
  onSetAsDefaultBranch?: (branchName: string) => void
  onDeleteBranch?: (branchName: string) => void
  onDeleteUnusedLocalBranches?: () => void
  onPullSingleBranch?: (branchName: string) => void
  onCheckoutInNewWorktree?: (branch: Branch) => void
}

export function generateBranchContextMenuItems(
  config: IBranchContextMenuConfig
): IMenuItem[] {
  const {
    branch,
    repoType,
    onRenameBranch,
    onViewBranchOnGitHub,
    onViewPullRequestOnGitHub,
    onSetAsDefaultBranch,
    onDeleteBranch,
    onDeleteUnusedLocalBranches,
    onPullSingleBranch,
    onCheckoutInNewWorktree,
  } = config
  const items = new Array<IMenuItem>()

  if (onRenameBranch !== undefined) {
    items.push({
      label: 'Rename…',
      action: () => onRenameBranch(branch.name),
      enabled: branch.type === BranchType.Local,
    })
  }

  items.push({
    label: __DARWIN__ ? 'Copy Branch Name' : 'Copy branch name',
    action: () => clipboard.writeText(branch.name),
  })

  if (onViewBranchOnGitHub !== undefined && repoType !== undefined) {
    items.push({
      label: getViewBranchLabel(repoType),
      action: () => onViewBranchOnGitHub(),
    })
  }

  if (onViewPullRequestOnGitHub !== undefined && repoType !== undefined) {
    items.push({
      label: getViewPullRequestLabel(repoType),
      action: () => onViewPullRequestOnGitHub(),
    })
  }

  if (onCheckoutInNewWorktree !== undefined) {
    items.push({
      label: __DARWIN__
        ? 'Checkout in New Worktree…'
        : 'Checkout in new worktree…',
      action: () => onCheckoutInNewWorktree(branch),
    })
  }

  if (onSetAsDefaultBranch !== undefined) {
    items.push({
      label: __DARWIN__ ? 'Set as Default Branch' : 'Set as default branch',
      action: () => onSetAsDefaultBranch(branch.nameWithoutRemote),
    })
  }

  if (onPullSingleBranch) {
    items.push({ type: 'separator' })
    items.push({
      label: __DARWIN__ ? 'Pull Branch' : 'Pull branch',
      action: () => onPullSingleBranch(branch.name),
      enabled: true,
    })
  }

  if (onDeleteBranch !== undefined) {
    items.push({ type: 'separator' })
    items.push({
      label: 'Delete…',
      action: () => onDeleteBranch(branch.name),
    })
  }

  if (onDeleteUnusedLocalBranches !== undefined) {
    items.push({
      label: __DARWIN__
        ? 'Delete Unused Local Branches…'
        : 'Delete unused local branches…',
      action: () => onDeleteUnusedLocalBranches(),
    })
  }

  return items
}

function getViewBranchLabel(repoType: RepoType): string {
  const branch = __DARWIN__ ? 'Branch' : 'branch'
  switch (repoType) {
    case 'github':
      return `View ${branch} on GitHub`
    case 'bitbucket':
      return `View ${branch} on Bitbucket`
    case 'gitlab':
      return `View ${branch} on GitLab`
    case 'codeberg':
      return `View ${branch} on Codeberg`
    case 'gitea':
      return `View ${branch} on Gitea`
    default:
      return assertNever(repoType, `Unknown repo type: ${repoType}`)
  }
}

function getViewPullRequestLabel(repoType: RepoType): string {
  switch (repoType) {
    case 'github':
      return 'View Pull Request on GitHub'
    case 'bitbucket':
      return 'View Pull Request on Bitbucket'
    case 'gitlab':
      return 'View Merge Request on GitLab'
    case 'codeberg':
      return 'View Pull Request on Codeberg'
    case 'gitea':
      return 'View Pull Request on Gitea'
    default:
      return assertNever(repoType, `Unknown repo type: ${repoType}`)
  }
}
