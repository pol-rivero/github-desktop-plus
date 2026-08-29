import { GitError as DugiteError } from 'dugite'
import { git, GitError } from './core'
import { Repository } from '../../models/repository'
import {
  IStashEntry,
  StashedChangesLoadStates,
  StashedFileChanges,
} from '../../models/stash-entry'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'
import { parseRawLogWithNumstat } from './log'
import { stageFiles } from './update-index'
import { Branch } from '../../models/branch'
import { createLogParser } from './git-delimiter-parser'
import { coerceToString } from './coerce-to-string'

export const DesktopStashEntryMarker = '!!GitHub_Desktop'

/**
 * RegEx for determining if a stash entry is created by Desktop
 *
 * This is done by looking for a magic string with the following
 * format: `!!GitHub_Desktop<branch>`, optionally preceded by a
 * URL-encoded user-provided name: `!!Name<name>!!GitHub_Desktop<branch>`
 */
const desktopStashEntryMessageRe =
  /(?:!!Name<([^<>]+)>)?!!GitHub_Desktop<(.+)>$/

type StashResult = {
  /** The stash entries created by Desktop */
  readonly desktopEntries: ReadonlyArray<IStashEntry>

  /**
   * The total amount of stash entries,
   * i.e. stash entries created both by Desktop and outside of Desktop
   */
  readonly stashEntryCount: number
}

/**
 * Get the list of stash entries created by Desktop in the current repository
 * using the default ordering of refs (which is LIFO ordering),
 * as well as the total amount of stash entries.
 */
export async function getStashes(repository: Repository): Promise<StashResult> {
  const { formatArgs, parse } = createLogParser({
    name: '%gD',
    stashSha: '%H',
    message: '%gs',
    tree: '%T',
    parents: '%P',
    date: '%aI',
  })

  const result = await git(
    ['log', '-g', ...formatArgs, 'refs/stash', '--'],
    repository.path,
    'getStashEntries',
    { successExitCodes: new Set([0, 128]) }
  )

  // There's no refs/stashes reflog in the repository or it's not
  // even a repository. In either case we don't care
  if (result.exitCode === 128) {
    return { desktopEntries: [], stashEntryCount: 0 }
  }

  const desktopEntries: Array<IStashEntry> = []
  const files: StashedFileChanges = { kind: StashedChangesLoadStates.NotLoaded }

  const entries = parse(result.stdout)

  for (const { name, message, stashSha, tree, parents, date } of entries) {
    const details = extractStashDetails(message)

    if (details !== null) {
      desktopEntries.push({
        name,
        stashSha,
        branchName: details.branchName,
        customName: details.customName,
        tree,
        parents: parents.length > 0 ? parents.split(' ') : [],
        createdAt: new Date(date),
        files,
      })
    }
  }

  desktopEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return { desktopEntries, stashEntryCount: entries.length - 1 }
}

/**
 * Moves a stash entry to a different branch by means of creating
 * a new stash entry associated with the new branch and dropping the old
 * stash entry.
 */
export async function moveStashEntry(
  repository: Repository,
  { stashSha, parents, tree, customName, createdAt }: IStashEntry,
  branchName: string
) {
  const message = `On ${branchName}: ${createDesktopStashMessage(
    branchName,
    customName
  )}`
  await replaceStashEntry(
    repository,
    { stashSha, parents, tree, createdAt },
    message
  )
}

/**
 * Sets or clears the user-provided name of a stash entry by means of
 * creating a new stash entry with the updated message and dropping the
 * old one.
 */
export async function renameStashEntry(
  repository: Repository,
  entry: IStashEntry,
  newName: string | null
): Promise<IStashEntry> {
  const customName = newName?.trim() || null
  if (customName === entry.customName) {
    return entry
  }

  const { branchName, stashSha, parents, tree, createdAt } = entry
  const message = `On ${branchName}: ${createDesktopStashMessage(
    branchName,
    customName
  )}`
  const newSha = await replaceStashEntry(
    repository,
    { stashSha, parents, tree, createdAt },
    message
  )
  return { ...entry, stashSha: newSha, customName }
}

/**
 * Stores a new stash entry with the given message pointing to the same
 * contents as the given entry, then drops the old entry.
 */
async function replaceStashEntry(
  repository: Repository,
  {
    stashSha,
    parents,
    tree,
    createdAt,
  }: Pick<IStashEntry, 'stashSha' | 'parents' | 'tree' | 'createdAt'>,
  message: string
): Promise<string> {
  const parentArgs = parents.flatMap(p => ['-p', p])
  const date = createdAt.toISOString()

  const { stdout: commitId } = await git(
    ['commit-tree', ...parentArgs, '-m', message, '--no-gpg-sign', tree],
    repository.path,
    'moveStashEntryToBranch',
    { env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } }
  )
  const newSha = commitId.trim()

  await git(
    ['stash', 'store', '-m', message, newSha],
    repository.path,
    'moveStashEntryToBranch'
  )

  await dropDesktopStashEntry(repository, stashSha)

  return newSha
}

/**
 * Returns the last Desktop created stash entry for the given branch
 */
export async function getLastDesktopStashEntryForBranch(
  repository: Repository,
  branch: Branch | string
) {
  const stash = await getStashes(repository)
  const branchName = typeof branch === 'string' ? branch : branch.name

  // Since stash objects are returned in a LIFO manner, the first
  // entry found is guaranteed to be the last entry created
  return (
    stash.desktopEntries.find(stash => stash.branchName === branchName) || null
  )
}

/** Creates a stash entry message that indicates the entry was created by Desktop */
export function createDesktopStashMessage(
  branchName: string,
  customName: string | null = null
) {
  const namePrefix = customName
    ? `!!Name<${encodeURIComponent(customName)}>`
    : ''
  return `${namePrefix}${DesktopStashEntryMarker}<${branchName}>`
}

function decodeStashName(encodedName: string): string {
  try {
    return decodeURIComponent(encodedName)
  } catch {
    return encodedName
  }
}

/**
 * Stash the working directory changes for the current branch
 */
export async function createDesktopStashEntry(
  repository: Repository,
  branch: Branch | string,
  untrackedFilesToStage: ReadonlyArray<WorkingDirectoryFileChange>,
  selectedFiles: ReadonlyArray<string> | null
): Promise<boolean> {
  // We must ensure that no untracked files are present before stashing
  // See https://github.com/desktop/desktop/pull/8085
  // First ensure that all changes in file are selected
  // (in case the user has not explicitly checked the checkboxes for the untracked files)
  const fullySelectedUntrackedFiles = untrackedFilesToStage
    .filter(f => (selectedFiles ? selectedFiles.includes(f.path) : true))
    .map(x => x.withIncludeAll(true))
  await stageFiles(repository, fullySelectedUntrackedFiles)

  const branchName = typeof branch === 'string' ? branch : branch.name
  const message = createDesktopStashMessage(branchName)
  const args = ['stash', 'push', '-m', message]
  if (selectedFiles) {
    args.push(...selectedFiles)
  }

  const result = await git(args, repository.path, 'createStashEntry').catch(
    e => {
      // Note: 2024: Here be dragons. As I converted this code to get rid of the
      // successExitCode use I got curious about the assumptions made in the
      // following logic. It assumes that as long as the exit code for `git
      // stash push` is 1 and there are no lines beginning with "error: " then
      // a stash was created. That didn't hold up to a quick read of the stash
      // code. For example, running git stash push in an unborn repository will
      // get you an exit code of 1 but no stash was created:
      //
      // % git stash push -m foo ; echo $?
      // You do not have the initial commit yet
      // 1
      //
      // I'm not going to mess with this now but I felt the need to document
      // my findings should I or any other brave soul choose to tackle this in
      // the future.
      if (e instanceof GitError && e.result.exitCode === 1) {
        // search for any line starting with `error:` -  /m here to ensure this is
        // applied to each line, without needing to split the text
        const errorPrefixRe = /^error: /m

        const matches = errorPrefixRe.exec(coerceToString(e.result.stderr))
        if (matches !== null && matches.length > 0) {
          // rethrow, because these messages should prevent the stash from being created
          return Promise.reject(e)
        }

        // if no error messages were emitted by Git, we should log but continue because
        // a valid stash was created and this should not interfere with the checkout

        log.info(
          `[createDesktopStashEntry] a stash was created successfully but exit code ${result.exitCode} reported. stderr: ${result.stderr}`
        )
        return e.result
      }
      return Promise.reject(e)
    }
  )

  // Stash doesn't consider it an error that there aren't any local changes to save.
  if (result.stdout === 'No local changes to save\n') {
    return false
  }

  return true
}

async function getStashEntryMatchingSha(repository: Repository, sha: string) {
  const stash = await getStashes(repository)
  return stash.desktopEntries.find(e => e.stashSha === sha) || null
}

/**
 * Removes the given stash entry if it exists
 *
 * @param stashSha the SHA that identifies the stash entry
 */
export async function dropDesktopStashEntry(
  repository: Repository,
  stashSha: string
) {
  const entryToDelete = await getStashEntryMatchingSha(repository, stashSha)

  if (entryToDelete !== null) {
    const args = ['stash', 'drop', entryToDelete.name]
    await git(args, repository.path, 'dropStashEntry')
  }
}

/**
 * Pops the stash entry identified by matching `stashSha` to its commit hash.
 *
 * To see the commit hash of stash entry, run
 * `git log -g refs/stash --pretty="%nentry: %gd%nsubject: %gs%nhash: %H%n"`
 * in a repo with some stash entries.
 */
export async function popStashEntry(
  repository: Repository,
  stashSha: string
): Promise<void> {
  // ignoring these git errors for now, this will change when we start
  // implementing the stash conflict flow
  const expectedErrors = new Set<DugiteError>([DugiteError.MergeConflicts])
  const stashToPop = await getStashEntryMatchingSha(repository, stashSha)

  if (stashToPop !== null) {
    const args = ['stash', 'pop', '--quiet', `${stashToPop.name}`]
    await git(args, repository.path, 'popStashEntry', {
      expectedErrors,
    }).catch(e => {
      // popping a stashes that create conflicts in the working directory
      // report an exit code of `1` and are not dropped after being applied.
      // so, we check for this case and drop them manually unless there's
      // anything in stderr as that could have prevented the stash from being
      // popped. Not the greatest approach but stash isn't very communicative
      if (
        e instanceof GitError &&
        e.result.exitCode === 1 &&
        e.result.stderr.length === 0
      ) {
        log.info(
          `[popStashEntry] a stash was popped successfully but exit code ${e.result.exitCode} reported.`
        )
        // bye bye
        return dropDesktopStashEntry(repository, stashSha)
      }
      return Promise.reject(e)
    })
  }
}

/**
 * Applies the stash entry identified by matching `stashSha` to its commit hash,
 * keeping the entry in the stash list.
 *
 * Unlike `popStashEntry`, the stash entry is preserved so that the same changes
 * can be restored again later.
 */
export async function applyStashEntry(
  repository: Repository,
  stashSha: string
): Promise<void> {
  const expectedErrors = new Set<DugiteError>([DugiteError.MergeConflicts])
  const stashToApply = await getStashEntryMatchingSha(repository, stashSha)

  if (stashToApply !== null) {
    const args = ['stash', 'apply', '--quiet', `${stashToApply.name}`]
    await git(args, repository.path, 'applyStashEntry', {
      expectedErrors,
    }).catch(e => {
      // Applying a stash that creates conflicts in the working directory
      // reports an exit code of `1`. Nothing needs to be cleaned up afterwards
      // (unlike `git stash pop`) because `apply` never drops the entry.
      if (
        e instanceof GitError &&
        e.result.exitCode === 1 &&
        e.result.stderr.length === 0
      ) {
        log.info(
          `[applyStashEntry] a stash was applied successfully but exit code ${e.result.exitCode} reported.`
        )
        return
      }
      return Promise.reject(e)
    })
  }
}

type StashDetails = {
  readonly branchName: string
  readonly customName: string | null
}

function extractStashDetails(message: string): StashDetails | null {
  const match = desktopStashEntryMessageRe.exec(message)
  if (match === null || match[2].length === 0) {
    return null
  }

  const customName = match[1] !== undefined ? decodeStashName(match[1]) : null
  return { branchName: match[2], customName }
}

/** Get the files that were changed in the given stash commit */
export async function getStashedFiles(
  repository: Repository,
  stashSha: string
): Promise<ReadonlyArray<CommittedFileChange>> {
  const args = [
    'stash',
    'show',
    stashSha,
    '--raw',
    '--numstat',
    '-z',
    '--format=format:',
    '--no-show-signature',
    '--',
  ]

  const { stdout } = await git(args, repository.path, 'getStashedFiles')

  return parseRawLogWithNumstat(stdout, stashSha, `${stashSha}^`).files
}
