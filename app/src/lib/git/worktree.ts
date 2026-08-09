import * as Path from 'path'
import type { Repository } from '../../models/repository'
import type { WorktreeEntry, WorktreeType } from '../../models/worktree'
import { git } from './core'
import { directoryExists } from '../directory-exists'
import { readFile } from 'fs/promises'

export function parseWorktreePorcelainOutput(
  stdout: string
): ReadonlyArray<WorktreeEntry> {
  if (stdout.trim().length === 0) {
    return []
  }

  // Detect separator: if it has NUL characters, it's NUL-separated (-z used)
  const isNulSeparated = stdout.includes('\0')
  const blockSeparator = isNulSeparated ? '\0\0' : '\n\n'
  const fieldSeparator = isNulSeparated ? '\0' : '\n'

  const normalizedStdout = isNulSeparated
    ? stdout.replace(/\0$/, '')
    : stdout.replace(/\r/g, '').trim()

  const blocks = normalizedStdout.split(blockSeparator)
  const entries: WorktreeEntry[] = []

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split(fieldSeparator)
    let path = ''
    let head = ''
    let branch: string | null = null
    let isDetached = false
    let isLocked = false
    let isPrunable = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        // Git for Windows will output paths using forward slashes, i.e.
        // c:/Users/niik/... but repositories added in Desktop always pass
        // through getRepositoryType which uses path.resolve to deduce the
        // absolute top level directory and that will normalize paths as well
        // so by normalizing here we can be more confident about comparing paths
        path = Path.normalize(line.substring('worktree '.length))
      } else if (line.startsWith('HEAD ')) {
        head = line.substring('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        branch = line.substring('branch '.length)
      } else if (line === 'detached') {
        isDetached = true
      } else if (line === 'locked' || line.startsWith('locked ')) {
        isLocked = true
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        isPrunable = true
      }
    }

    if (path) {
      const type: WorktreeType = i === 0 ? 'main' : 'linked'
      entries.push({
        path,
        head,
        branch,
        isDetached,
        type,
        isLocked,
        isPrunable,
      })
    }
  }

  return entries
}

export async function listWorktrees(
  repositoryOrPath: Repository | string
): Promise<ReadonlyArray<WorktreeEntry>> {
  const path =
    typeof repositoryOrPath === 'string'
      ? repositoryOrPath
      : repositoryOrPath.path

  try {
    const result = await git(
      ['worktree', 'list', '--porcelain', '-z'],
      path,
      'listWorktrees'
    )
    return parseWorktreePorcelainOutput(result.stdout)
  } catch (err) {
    const errStr = String(err)
    if (
      errStr.includes('unknown switch') ||
      errStr.includes('-z') ||
      errStr.includes("switch `z'")
    ) {
      const result = await git(
        ['worktree', 'list', '--porcelain'],
        path,
        'listWorktrees'
      )
      return parseWorktreePorcelainOutput(result.stdout)
    }
    throw err
  }
}

export async function listWorktreesFromGitDir(
  gitDir: string
): Promise<ReadonlyArray<WorktreeEntry>> {
  try {
    const result = await git(
      ['--git-dir', gitDir, 'worktree', 'list', '--porcelain', '-z'],
      gitDir,
      'listWorktreesFromGitDir'
    )
    return parseWorktreePorcelainOutput(result.stdout)
  } catch (err) {
    const errStr = String(err)
    if (
      errStr.includes('unknown switch') ||
      errStr.includes('-z') ||
      errStr.includes("switch `z'")
    ) {
      const result = await git(
        ['--git-dir', gitDir, 'worktree', 'list', '--porcelain'],
        gitDir,
        'listWorktreesFromGitDir'
      )
      return parseWorktreePorcelainOutput(result.stdout)
    }
    throw err
  }
}

export async function listWorktreesFromGitDirFallback(
  gitDir: string
): Promise<ReadonlyArray<WorktreeEntry>> {
  const commonDir = await resolveCommonGitDir(gitDir)
  const mainWorktreePath = Path.dirname(commonDir)

  if (!(await directoryExists(mainWorktreePath))) {
    return []
  }
  try {
    return listWorktrees(mainWorktreePath)
  } catch {
    return []
  }
}

async function resolveCommonGitDir(gitDir: string): Promise<string> {
  if (Path.basename(Path.dirname(gitDir)) !== 'worktrees') {
    return gitDir
  }

  // Prefer the `commondir` file, but fall back to the conventional layout (two
  // levels up) when it's unreadable, e.g. `git worktree remove` deleted the
  // worktree's admin files too.
  const conventionalCommonDir = Path.dirname(Path.dirname(gitDir))
  try {
    const fileContent = await readFile(Path.join(gitDir, 'commondir'), 'utf8')
    const path = fileContent.replace(/\r?\n$/, '')
    return path ? Path.resolve(gitDir, path) : conventionalCommonDir
  } catch {
    return conventionalCommonDir
  }
}

export async function addWorktree(
  repository: Repository,
  path: string,
  options: {
    /** Branch name used with -b (create new branch) */
    readonly createBranch?: string
    /** Commit-ish to check out (branch name, ref, or SHA) */
    readonly commitish?: string
  } = {}
): Promise<void> {
  const args = ['worktree', 'add']

  if (options.createBranch) {
    args.push('-b', options.createBranch)
  }

  args.push(path)

  if (options.commitish) {
    args.push(options.commitish)
  }

  await git(args, repository.path, 'addWorktree')
}

export async function removeWorktree(
  repositoryPath: string,
  worktreePath: string,
  force: boolean = false
): Promise<void> {
  const args = ['worktree', 'remove']
  if (force) {
    args.push('--force')
  }
  args.push(worktreePath)

  await git(args, repositoryPath, 'removeWorktree')
}

export async function moveWorktree(
  repository: Repository,
  oldPath: string,
  newPath: string
): Promise<void> {
  await git(
    ['worktree', 'move', oldPath, newPath],
    repository.path,
    'moveWorktree'
  )
}
