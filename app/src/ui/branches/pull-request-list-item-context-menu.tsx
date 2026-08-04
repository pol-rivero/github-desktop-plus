import { assertNever } from '../../lib/fatal-error'
import { IMenuItem } from '../../lib/menu-item'
import { GitHubRepository } from '../../models/github-repository'
import { getForgejoName } from '../../lib/forgejo-name'

interface IPullRequestContextMenuConfig {
  onViewPullRequestOnGitHub?: () => void
  onCheckoutInNewWorktree?: () => void
  gitHubRepository: GitHubRepository
}

export function generatePullRequestContextMenuItems(
  config: IPullRequestContextMenuConfig
): IMenuItem[] {
  const { onViewPullRequestOnGitHub, onCheckoutInNewWorktree } = config
  const items = new Array<IMenuItem>()

  if (onViewPullRequestOnGitHub !== undefined) {
    items.push({
      label: getViewPullRequestLabel(config.gitHubRepository),
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

function getViewPullRequestLabel(gitHubRepository: GitHubRepository): string {
  switch (gitHubRepository.type) {
    case 'github':
      return 'View Pull Request on GitHub'
    case 'bitbucket':
      return 'View Pull Request on Bitbucket'
    case 'gitlab':
      return 'View Merge Request on GitLab'
    case 'forgejo':
      return `View Pull Request on ${getForgejoName(gitHubRepository.endpoint)}`
    case 'gitea':
      return 'View Pull Request on Gitea'
    default:
      assertNever(
        gitHubRepository.type,
        `Unknown repo type: ${gitHubRepository.type}`
      )
  }
}
