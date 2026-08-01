import { assertNever } from '../../lib/fatal-error'
import { IMenuItem } from '../../lib/menu-item'
import { RepoType } from '../../models/github-repository'

interface IPullRequestContextMenuConfig {
  onViewPullRequestOnGitHub?: () => void
  onCheckoutInNewWorktree?: () => void
  repoType: RepoType
}

export function generatePullRequestContextMenuItems(
  config: IPullRequestContextMenuConfig
): IMenuItem[] {
  const { onViewPullRequestOnGitHub, onCheckoutInNewWorktree } = config
  const items = new Array<IMenuItem>()

  if (onViewPullRequestOnGitHub !== undefined) {
    items.push({
      label: getViewPullRequestLabel(config.repoType),
      action: () => onViewPullRequestOnGitHub(),
    })
  }

  if (onCheckoutInNewWorktree !== undefined) {
    items.push({
      label: __DARWIN__
        ? 'Checkout in New Worktree…'
        : 'Checkout in new worktree…',
      action: () => onCheckoutInNewWorktree(),
    })
  }

  return items
}

function getViewPullRequestLabel(repoType: RepoType): string {
  switch (repoType) {
    case 'github':
      return 'View Pull Request on GitHub'
    case 'bitbucket':
      return 'View Pull Request on Bitbucket'
    case 'gitlab':
      return 'View Merge Request on GitLab'
    case 'forgejo':
      return 'View Pull Request on Codeberg'
    default:
      assertNever(repoType, `Unknown repo type: ${repoType}`)
  }
}
