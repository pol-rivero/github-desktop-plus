import * as Path from 'path'

import {
  isRepositoryWithGitHubRepository,
  hasDefaultRemoteUrl,
  Repository,
} from '../../models/repository'
import { RepoType } from '../../models/github-repository'
import { IMenuItem } from '../../lib/menu-item'
import { Repositoryish } from './group-repositories'
import { WorktreeEntry } from '../../models/worktree'
import { clipboard } from 'electron'
import {
  RevealInFileManagerLabel,
  DefaultEditorLabel,
  DefaultShellLabel,
} from '../lib/context-menu'

interface IRepositoryListItemContextMenuConfig {
  repository: Repositoryish
  shellLabel: string | undefined
  externalEditorLabel: string | undefined
  askForConfirmationOnRemoveRepository: boolean
  onViewOnGitHub: (repository: Repositoryish) => void
  onOpenInNewWindow?: (repository: Repositoryish, path?: string) => void
  onOpenInShell: (repository: Repositoryish, path?: string) => void
  onShowRepository: (repository: Repositoryish, path?: string) => void
  onOpenInExternalEditor: (repository: Repositoryish, path?: string) => void
  onRemoveRepository: (repository: Repositoryish) => void
  onChangeRepositoryAlias: (repository: Repository) => void
  onRemoveRepositoryAlias: (repository: Repository) => void
  /** Opens the dialog to create a new group, preselecting this repository */
  onNewGroupForRepository: (repository: Repository) => void
  onRemoveRepositoryGroupName: (repository: Repository) => void
  /** The custom group names currently in use, sorted */
  groupNames: ReadonlyArray<string>
  onAssignRepositoryGroupName: (
    repository: Repository,
    groupName: string
  ) => void
  onCopyRepoPath: (path: string) => void
  isPinned?: boolean
  onTogglePinnedRepository?: (repository: Repository) => void
  onCreateWorktree?: (repository: Repository) => void
  onShowWorktrees?: (repository: Repository) => void
  worktreePath?: string
}

export const generateRepositoryListContextMenu = (
  config: IRepositoryListItemContextMenuConfig
) => {
  const { repository } = config
  const missing = repository instanceof Repository && repository.missing
  const isGitHub =
    repository instanceof Repository &&
    isRepositoryWithGitHubRepository(repository)
  const hasOriginUrl =
    repository instanceof Repository && hasDefaultRemoteUrl(repository)
  const canOpenInNewWindow =
    repository instanceof Repository && !repository.missing
  const openInExternalEditor = config.externalEditorLabel
    ? `Open in ${config.externalEditorLabel}`
    : DefaultEditorLabel
  const openInShell = config.shellLabel
    ? `Open in ${config.shellLabel}`
    : DefaultShellLabel

  const items: ReadonlyArray<IMenuItem> = [
    ...buildAliasMenuItems(config),
    ...buildGroupNameMenuItems(config),
    ...buildWorktreeMenuItems(config),
    { type: 'separator' },
    {
      label: __DARWIN__ ? 'Copy Repo Name' : 'Copy repo name',
      action: () => clipboard.writeText(repository.name),
    },
    {
      label: __DARWIN__ ? 'Copy Repo Path' : 'Copy repo path',
      action: () => config.onCopyRepoPath(repository.path),
    },
    { type: 'separator' },
    {
      label: getViewOnBrowserLabel(
        isGitHub ? repository.gitHubRepository.type : null
      ),
      action: () => config.onViewOnGitHub(repository),
      enabled: isGitHub || hasOriginUrl,
    },
    ...(config.onOpenInNewWindow && canOpenInNewWindow
      ? [
          {
            label: __DARWIN__
              ? 'Open Repository in New Window'
              : 'Open repository in new window',
            action: () =>
              config.onOpenInNewWindow?.(repository, config.worktreePath),
          },
        ]
      : []),
    {
      label: openInShell,
      action: () => config.onOpenInShell(repository, config.worktreePath),
      enabled: !missing,
    },
    {
      label: RevealInFileManagerLabel,
      action: () => config.onShowRepository(repository, config.worktreePath),
      enabled: !missing,
    },
    {
      label: openInExternalEditor,
      action: () =>
        config.onOpenInExternalEditor(repository, config.worktreePath),
      enabled: !missing,
    },
    { type: 'separator' },
    {
      label: config.askForConfirmationOnRemoveRepository ? 'Remove…' : 'Remove',
      action: () => config.onRemoveRepository(repository),
    },
  ]

  return items
}

interface IWorktreeListItemContextMenuConfig {
  repository: Repository
  worktree: WorktreeEntry
  shellLabel: string | undefined
  externalEditorLabel: string | undefined
  onCreateWorktree: (repository: Repository) => void
  onRenameWorktree: (repository: Repository, worktreePath: string) => void
  onDeleteWorktree: (repository: Repository, worktreePath: string) => void
  onViewOnGitHub: (repository: Repositoryish) => void
  onOpenWorktreeInNewWindow: (worktreePath: string) => void
  onOpenInShell: (repository: Repositoryish, path?: string) => void
  onShowRepository: (repository: Repositoryish, path?: string) => void
  onOpenInExternalEditor: (repository: Repositoryish, path?: string) => void
  onCopyWorktreePath: (path: string) => void
}

export const generateWorktreeListItemContextMenu = (
  config: IWorktreeListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository, worktree } = config
  const path = worktree.path
  const name = Path.basename(path)
  const isGitHub = isRepositoryWithGitHubRepository(repository)
  const hasOriginUrl = hasDefaultRemoteUrl(repository)
  const canModify = !worktree.isLocked
  const openInExternalEditor = config.externalEditorLabel
    ? `Open in ${config.externalEditorLabel}`
    : DefaultEditorLabel
  const openInShell = config.shellLabel
    ? `Open in ${config.shellLabel}`
    : DefaultShellLabel

  return [
    {
      label: __DARWIN__ ? 'New Worktree…' : 'New worktree…',
      action: () => config.onCreateWorktree(repository),
    },
    {
      label: __DARWIN__ ? 'Rename Worktree…' : 'Rename worktree…',
      action: () => config.onRenameWorktree(repository, path),
      enabled: canModify,
    },
    { type: 'separator' },
    {
      label: __DARWIN__ ? 'Copy Worktree Name' : 'Copy worktree name',
      action: () => clipboard.writeText(name),
    },
    {
      label: __DARWIN__ ? 'Copy Worktree Path' : 'Copy worktree path',
      action: () => config.onCopyWorktreePath(path),
    },
    { type: 'separator' },
    {
      label: getViewOnBrowserLabel(
        isGitHub ? repository.gitHubRepository.type : null
      ),
      action: () => config.onViewOnGitHub(repository),
      enabled: isGitHub || hasOriginUrl,
    },
    {
      label: __DARWIN__
        ? 'Open Worktree in New Window'
        : 'Open worktree in new window',
      action: () => config.onOpenWorktreeInNewWindow(path),
    },
    {
      label: openInShell,
      action: () => config.onOpenInShell(repository, path),
    },
    {
      label: RevealInFileManagerLabel,
      action: () => config.onShowRepository(repository, path),
    },
    {
      label: openInExternalEditor,
      action: () => config.onOpenInExternalEditor(repository, path),
    },
    { type: 'separator' },
    {
      label: __DARWIN__ ? 'Delete Worktree…' : 'Delete worktree…',
      action: () => config.onDeleteWorktree(repository, path),
      enabled: canModify,
    },
  ]
}

function getViewOnBrowserLabel(repoType: RepoType | null) {
  switch (repoType) {
    case 'github':
      return 'View on GitHub'
    case 'bitbucket':
      return 'View on Bitbucket'
    case 'gitlab':
      return 'View on GitLab'
    case 'forgejo':
      return 'View on Codeberg'
    default:
      return 'View in your browser'
  }
}

const buildAliasMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository } = config

  if (!(repository instanceof Repository)) {
    return []
  }

  const verb = repository.alias == null ? 'Create' : 'Change'
  const items: Array<IMenuItem> = [
    {
      label: __DARWIN__ ? `${verb} Alias` : `${verb} alias`,
      action: () => config.onChangeRepositoryAlias(repository),
    },
  ]

  if (repository.alias !== null) {
    items.push({
      label: __DARWIN__ ? 'Remove Alias' : 'Remove alias',
      action: () => config.onRemoveRepositoryAlias(repository),
    })
  }

  return items
}

/**
 * Builds the list of menu items offered when assigning a repository to a
 * group: a fake "Pinned" entry that just pins/unpins the repository, one
 * toggleable entry per existing custom group, an entry to create a new group,
 * and an entry to leave the current group.
 */
const buildAssignToGroupMenuItems = (
  repository: Repository,
  groupNames: ReadonlyArray<string>,
  onAssignRepositoryGroupName: (
    repository: Repository,
    groupName: string
  ) => void,
  onRemoveRepositoryGroupName: (repository: Repository) => void,
  onNewGroupForRepository: (repository: Repository) => void,
  pin?: {
    isPinned: boolean
    onTogglePinnedRepository: (repository: Repository) => void
  }
): ReadonlyArray<IMenuItem> => {
  const items: Array<IMenuItem> = []

  if (pin) {
    items.push(
      {
        label: 'Pinned',
        type: 'checkbox',
        checked: pin.isPinned,
        action: () => pin.onTogglePinnedRepository(repository),
      },
      { type: 'separator' }
    )
  }

  items.push(
    ...groupNames.map(groupName => {
      const isCurrentGroup = repository.groupName === groupName

      return {
        label: groupName,
        type: 'checkbox' as const,
        checked: isCurrentGroup,
        action: () =>
          isCurrentGroup
            ? onRemoveRepositoryGroupName(repository)
            : onAssignRepositoryGroupName(repository, groupName),
      }
    })
  )

  if (groupNames.length > 0) {
    items.push({ type: 'separator' })
  }

  items.push({
    label: __DARWIN__ ? 'New Group…' : 'New group…',
    action: () => onNewGroupForRepository(repository),
  })

  if (repository.groupName !== null) {
    items.push({
      label: __DARWIN__ ? 'Remove From Group' : 'Remove from group',
      action: () => onRemoveRepositoryGroupName(repository),
    })
  }

  return items
}

const buildGroupNameMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository, groupNames } = config

  if (!(repository instanceof Repository)) {
    return []
  }

  const submenu = buildAssignToGroupMenuItems(
    repository,
    groupNames,
    config.onAssignRepositoryGroupName,
    config.onRemoveRepositoryGroupName,
    config.onNewGroupForRepository,
    config.onTogglePinnedRepository
      ? {
          isPinned: config.isPinned ?? false,
          onTogglePinnedRepository: config.onTogglePinnedRepository,
        }
      : undefined
  )

  return [
    {
      label: __DARWIN__ ? 'Assign to Group' : 'Assign to group',
      submenu,
    },
  ]
}

const buildWorktreeMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository, onCreateWorktree, onShowWorktrees } = config

  if (!(repository instanceof Repository)) {
    return []
  }

  if (onCreateWorktree === undefined && onShowWorktrees === undefined) {
    return []
  }

  const items: Array<IMenuItem> = []

  if (onShowWorktrees !== undefined) {
    items.push({
      label: __DARWIN__ ? 'Show Worktrees' : 'Show worktrees',
      action: () => onShowWorktrees(repository),
    })
  }

  if (onCreateWorktree !== undefined) {
    items.push({
      label: __DARWIN__ ? 'New Worktree…' : 'New worktree…',
      action: () => onCreateWorktree(repository),
    })
  }

  return items
}
