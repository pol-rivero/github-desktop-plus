import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { appendFile, writeFile } from 'fs/promises'
import * as path from 'path'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { exec } from 'dugite'
import {
  createDesktopStashMessage,
  createDesktopStashEntry,
  getLastDesktopStashEntryForBranch,
  dropDesktopStashEntry,
  popStashEntry,
  applyStashEntry,
  getStashes,
  renameStashEntry,
  moveStashEntry,
} from '../../../src/lib/git/stash'
import { getStatusOrThrow } from '../../helpers/status'
import { AppFileStatusKind } from '../../../src/models/status'
import {
  IStashEntry,
  StashedChangesLoadStates,
} from '../../../src/models/stash-entry'
import { generateString } from '../../helpers/random-data'
import { join } from 'node:path'

describe('git/stash', () => {
  describe('getStash', () => {
    it('handles unborn repo by returning empty list', async t => {
      const repo = await setupEmptyRepository(t)
      const stash = await getStashes(repo)

      assert.equal(stash.desktopEntries.length, 0)
    })

    it('returns an empty list when no stash entries have been created', async t => {
      const stash = await getStashes(await setupEmptyRepository(t))

      assert.equal(stash.desktopEntries.length, 0)
    })

    it('returns all stash entries created by Desktop', async t => {
      const repository = await setupEmptyRepository(t)
      const readme = path.join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      await generateTestStashEntry(repository, 'master', false)
      await generateTestStashEntry(repository, 'master', false)
      await generateTestStashEntry(repository, 'master', true)

      const stash = await getStashes(repository)
      const entries = stash.desktopEntries
      assert.equal(entries.length, 1)
      assert.equal(entries[0].branchName, 'master')
      assert.equal(entries[0].name, 'refs/stash@{0}')
    })

    it('returns multiple stash entries for the same branch', async t => {
      const repository = await setupEmptyRepository(t)
      const readme = path.join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      // Create three Desktop stash entries on the same branch
      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)

      const stash = await getStashes(repository)
      const entries = stash.desktopEntries
      assert.equal(entries.length, 3)

      // Verify all entries are for the same branch
      assert.equal(entries[0].branchName, 'master')
      assert.equal(entries[1].branchName, 'master')
      assert.equal(entries[2].branchName, 'master')

      // Verify they are in LIFO order (most recent first)
      assert.equal(entries[0].name, 'refs/stash@{0}')
      assert.equal(entries[1].name, 'refs/stash@{1}')
      assert.equal(entries[2].name, 'refs/stash@{2}')
    })

    it('parses entries without a custom name as unnamed', async t => {
      const repository = await setupEmptyRepository(t)
      const readme = path.join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      await generateTestStashEntry(repository, 'master', true)

      const stash = await getStashes(repository)
      assert.equal(stash.desktopEntries.length, 1)
      assert.equal(stash.desktopEntries[0].customName, null)
    })

    it('parses the custom name of named entries', async t => {
      const repository = await setupEmptyRepository(t)
      const readme = path.join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      const customName = 'my custom <name> with 100% special chars!'
      await appendFile(readme, generateString())
      await stash(
        repository,
        'master',
        createDesktopStashMessage('master', customName)
      )

      const stashes = await getStashes(repository)
      assert.equal(stashes.desktopEntries.length, 1)
      assert.equal(stashes.desktopEntries[0].branchName, 'master')
      assert.equal(stashes.desktopEntries[0].customName, customName)
    })
  })

  describe('createDesktopStashEntry', () => {
    const setup = async (t: TestContext) => {
      const repository = await setupEmptyRepository(t)
      const readme = join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      return repository
    }

    it('creates a stash entry when repo is not unborn or in any kind of conflict or rebase state', async t => {
      const repository = await setup(t)
      await appendFile(join(repository.path, 'README.md'), 'just testing stuff')

      await createDesktopStashEntry(repository, 'master', [], null)

      const stash = await getStashes(repository)
      const entries = stash.desktopEntries

      assert.equal(entries.length, 1)
      assert.equal(entries[0].branchName, 'master')
    })

    it('stashes untracked files and removes them from the working directory', async t => {
      const repository = await setup(t)
      const untrackedFile = path.join(repository.path, 'not-tracked.txt')
      writeFile(untrackedFile, 'some untracked file')

      let status = await getStatusOrThrow(repository)
      let files = status.workingDirectory.files

      assert.equal(files.length, 1)
      assert.equal(files[0].status.kind, AppFileStatusKind.Untracked)

      const untrackedFiles = status.workingDirectory.files.filter(
        f => f.status.kind === AppFileStatusKind.Untracked
      )

      await createDesktopStashEntry(repository, 'master', untrackedFiles, null)

      status = await getStatusOrThrow(repository)
      files = status.workingDirectory.files

      assert.equal(files.length, 0)
    })
  })

  describe('getLastDesktopStashEntryForBranch', () => {
    const setup = async (t: TestContext) => {
      const repository = await setupEmptyRepository(t)
      await writeFile(join(repository.path, 'README.md'), '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      return repository
    }

    it('returns null when no stash entries exist for branch', async t => {
      const repository = await setup(t)
      await generateTestStashEntry(repository, 'some-other-branch', true)

      const entry = await getLastDesktopStashEntryForBranch(
        repository,
        'master'
      )

      assert(entry === null)
    })

    it('returns last entry made for branch', async t => {
      const repository = await setup(t)
      const branchName = 'master'
      await generateTestStashEntry(repository, branchName, true)
      await generateTestStashEntry(repository, branchName, true)

      const stash = await getStashes(repository)
      // entries are returned in LIFO order
      const lastEntry = stash.desktopEntries[0]

      const actual = await getLastDesktopStashEntryForBranch(
        repository,
        branchName
      )

      assert(actual !== null)
      assert.equal(actual.stashSha, lastEntry.stashSha)
    })
  })

  describe('createDesktopStashMessage', () => {
    it('creates message that matches Desktop stash entry format', () => {
      const branchName = 'master'

      const message = createDesktopStashMessage(branchName)

      assert.equal(message, '!!GitHub_Desktop<master>')
    })

    it('prepends the URL-encoded custom name when one is given', () => {
      const message = createDesktopStashMessage('master', 'my stash')

      assert.equal(message, '!!Name<my%20stash>!!GitHub_Desktop<master>')
    })

    it('keeps named messages parseable by the old, unnamed format regex', () => {
      const message = `On master: ${createDesktopStashMessage(
        'master',
        'my stash'
      )}`

      // Regex used by older versions of Desktop, which must still be able
      // to extract the branch name from named stashes
      const oldFormatRe = /!!GitHub_Desktop<(.+)>$/
      const match = oldFormatRe.exec(message)

      assert(match !== null)
      assert.equal(match[1], 'master')
    })

    it('encodes characters that would break parsing', () => {
      const message = createDesktopStashMessage('master', '<a>\r\nb')

      assert.equal(message, '!!Name<%3Ca%3E%0D%0Ab>!!GitHub_Desktop<master>')
    })

    it('uses the unnamed format when the name is empty', () => {
      const message = createDesktopStashMessage('master', '')

      assert.equal(message, '!!GitHub_Desktop<master>')
    })
  })

  describe('renameStashEntry', () => {
    const setup = async (t: TestContext) => {
      const repository = await setupEmptyRepository(t)
      const readme = join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      return repository
    }

    it('sets the custom name while preserving branch and contents', async t => {
      const repository = await setup(t)

      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)

      let entries = (await getStashes(repository)).desktopEntries
      assert.equal(entries.length, 2)

      const entryToRename = entries[1]
      const returnedEntry = await renameStashEntry(
        repository,
        entryToRename,
        'my stash'
      )

      entries = (await getStashes(repository)).desktopEntries
      assert.equal(entries.length, 2)

      const renamed = entries.find(e => e.customName === 'my stash')
      assert(renamed !== undefined)
      assert.equal(renamed.branchName, 'master')
      assert.equal(renamed.tree, entryToRename.tree)
      assert.deepEqual(renamed.parents, entryToRename.parents)

      // the entry is recreated, so the old SHA no longer exists
      assert(!entries.some(e => e.stashSha === entryToRename.stashSha))

      // the returned entry points to the recreated stash
      assert.equal(returnedEntry.stashSha, renamed.stashSha)
      assert.equal(returnedEntry.customName, 'my stash')
    })

    it('clears the custom name when given null', async t => {
      const repository = await setup(t)

      await generateTestStashEntry(repository, 'master', true)

      let entries = (await getStashes(repository)).desktopEntries
      await renameStashEntry(repository, entries[0], 'my stash')

      entries = (await getStashes(repository)).desktopEntries
      assert.equal(entries[0].customName, 'my stash')

      await renameStashEntry(repository, entries[0], null)

      entries = (await getStashes(repository)).desktopEntries
      assert.equal(entries.length, 1)
      assert.equal(entries[0].customName, null)
    })

    it('is a no-op when the name is unchanged', async t => {
      const repository = await setup(t)

      await generateTestStashEntry(repository, 'master', true)

      let entries = (await getStashes(repository)).desktopEntries
      await renameStashEntry(repository, entries[0], 'my stash')

      entries = (await getStashes(repository)).desktopEntries
      const entry = entries[0]

      const returnedEntry = await renameStashEntry(
        repository,
        entry,
        'my stash'
      )

      entries = (await getStashes(repository)).desktopEntries
      assert.equal(entries.length, 1)
      assert.equal(entries[0].stashSha, entry.stashSha)
      assert.equal(entries[0].customName, 'my stash')
      assert.equal(returnedEntry, entry)
    })
  })

  describe('moveStashEntry', () => {
    it('preserves the custom name when moving to another branch', async t => {
      const repository = await setupEmptyRepository(t)
      const readme = join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      await generateTestStashEntry(repository, 'master', true)

      let entries = (await getStashes(repository)).desktopEntries
      await renameStashEntry(repository, entries[0], 'my stash')

      entries = (await getStashes(repository)).desktopEntries
      await moveStashEntry(repository, entries[0], 'new-branch')

      entries = (await getStashes(repository)).desktopEntries
      assert.equal(entries.length, 1)
      assert.equal(entries[0].branchName, 'new-branch')
      assert.equal(entries[0].customName, 'my stash')
    })
  })

  describe('dropDesktopStashEntry', () => {
    const setup = async (t: TestContext) => {
      const repository = await setupEmptyRepository(t)
      const readme = join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      return repository
    }

    it('removes the entry identified by `stashSha`', async t => {
      const repository = await setup(t)

      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)

      let stash = await getStashes(repository)
      let entries = stash.desktopEntries
      assert.equal(entries.length, 2)

      const stashToDelete = entries[1]
      await dropDesktopStashEntry(repository, stashToDelete.stashSha)

      // using this function to get stashSha since it parses
      // the output from git into easy to use objects
      stash = await getStashes(repository)
      entries = stash.desktopEntries
      assert.equal(entries.length, 1)
      assert.notEqual(entries[0].stashSha, stashToDelete)
    })

    it('does not fail when attempting to delete when stash is empty', async t => {
      const repository = await setup(t)

      const doesNotExist: IStashEntry = {
        name: 'refs/stash@{0}',
        branchName: 'master',
        customName: null,
        stashSha: 'xyz',
        tree: 'xyz',
        parents: ['abc'],
        createdAt: new Date(),
        files: { kind: StashedChangesLoadStates.NotLoaded },
      }

      await assert.doesNotReject(
        dropDesktopStashEntry(repository, doesNotExist.stashSha)
      )
    })

    it("does not fail when attempting to delete stash entry that doesn't exist", async t => {
      const repository = await setup(t)
      const doesNotExist: IStashEntry = {
        name: 'refs/stash@{4}',
        branchName: 'master',
        customName: null,
        stashSha: 'xyz',
        tree: 'xyz',
        parents: ['abc'],
        createdAt: new Date(),
        files: { kind: StashedChangesLoadStates.NotLoaded },
      }
      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)

      await assert.doesNotReject(
        dropDesktopStashEntry(repository, doesNotExist.stashSha)
      )
    })
  })

  describe('popStashEntry', () => {
    const setup = async (t: TestContext) => {
      const repository = await setupEmptyRepository(t)
      const readme = path.join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      return repository
    }

    describe('without any conflicts', () => {
      it('restores changes back to the working directory', async t => {
        const repository = await setup(t)

        await generateTestStashEntry(repository, 'master', true)
        const stash = await getStashes(repository)
        const { desktopEntries } = stash
        assert.equal(desktopEntries.length, 1)

        let status = await getStatusOrThrow(repository)
        let files = status.workingDirectory.files
        assert.equal(files.length, 0)

        const entryToApply = desktopEntries[0]
        await popStashEntry(repository, entryToApply.stashSha)

        status = await getStatusOrThrow(repository)
        files = status.workingDirectory.files
        assert.equal(files.length, 1)
      })
    })

    describe('when there are (resolvable) conflicts', () => {
      it('restores changes and drops stash', async t => {
        const repository = await setup(t)

        await generateTestStashEntry(repository, 'master', true)
        const stash = await getStashes(repository)
        const { desktopEntries } = stash
        assert.equal(desktopEntries.length, 1)

        const readme = path.join(repository.path, 'README.md')
        await appendFile(readme, generateString())
        await exec(['commit', '-am', 'later commit'], repository.path)

        let status = await getStatusOrThrow(repository)
        let files = status.workingDirectory.files
        assert.equal(files.length, 0)

        const entryToApply = desktopEntries[0]
        await popStashEntry(repository, entryToApply.stashSha)

        status = await getStatusOrThrow(repository)
        files = status.workingDirectory.files
        assert.equal(files.length, 1)

        const stashAfter = await getStashes(repository)
        assert(!stashAfter.desktopEntries.includes(entryToApply))
      })
    })

    describe('when there are unresolvable conflicts', () => {
      it('throws an error', async t => {
        const repository = await setup(t)

        await generateTestStashEntry(repository, 'master', true)
        const stash = await getStashes(repository)
        const { desktopEntries } = stash
        assert.equal(desktopEntries.length, 1)

        const readme = path.join(repository.path, 'README.md')
        await writeFile(readme, generateString())

        const entryToApply = desktopEntries[0]
        await assert.rejects(() =>
          popStashEntry(repository, entryToApply.stashSha)
        )
      })
    })
  })

  describe('applyStashEntry', () => {
    const setup = async (t: TestContext) => {
      const repository = await setupEmptyRepository(t)
      const readme = path.join(repository.path, 'README.md')
      await writeFile(readme, '')
      await exec(['add', 'README.md'], repository.path)
      await exec(['commit', '-m', 'initial commit'], repository.path)

      return repository
    }

    it('restores changes back to the working directory', async t => {
      const repository = await setup(t)

      await generateTestStashEntry(repository, 'master', true)
      const { desktopEntries } = await getStashes(repository)
      assert.equal(desktopEntries.length, 1)

      let status = await getStatusOrThrow(repository)
      let files = status.workingDirectory.files
      assert.equal(files.length, 0)

      const entryToApply = desktopEntries[0]
      await applyStashEntry(repository, entryToApply.stashSha)

      status = await getStatusOrThrow(repository)
      files = status.workingDirectory.files
      assert.equal(files.length, 1)
    })

    it('keeps the stash entry after applying it', async t => {
      const repository = await setup(t)

      await generateTestStashEntry(repository, 'master', true)
      await generateTestStashEntry(repository, 'master', true)

      const { desktopEntries } = await getStashes(repository)
      assert.equal(desktopEntries.length, 2)

      const entryToApply = desktopEntries[0]
      await applyStashEntry(repository, entryToApply.stashSha)

      const entriesAfter = (await getStashes(repository)).desktopEntries
      assert.equal(entriesAfter.length, 2)
      assert(entriesAfter.some(e => e.stashSha === entryToApply.stashSha))
    })

    it('can apply the same stash entry more than once', async t => {
      const repository = await setup(t)

      await generateTestStashEntry(repository, 'master', true)
      const { desktopEntries } = await getStashes(repository)
      const entryToApply = desktopEntries[0]

      await applyStashEntry(repository, entryToApply.stashSha)

      // discard the restored changes so that the stash can be applied again
      await exec(['checkout', '--', '.'], repository.path)

      await applyStashEntry(repository, entryToApply.stashSha)

      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 1)

      const entriesAfter = (await getStashes(repository)).desktopEntries
      assert.equal(entriesAfter.length, 1)
      assert.equal(entriesAfter[0].stashSha, entryToApply.stashSha)
    })

    describe('when there are (resolvable) conflicts', () => {
      it('restores changes and keeps the stash', async t => {
        const repository = await setup(t)

        await generateTestStashEntry(repository, 'master', true)
        const { desktopEntries } = await getStashes(repository)
        assert.equal(desktopEntries.length, 1)

        const readme = path.join(repository.path, 'README.md')
        await appendFile(readme, generateString())
        await exec(['commit', '-am', 'later commit'], repository.path)

        let status = await getStatusOrThrow(repository)
        assert.equal(status.workingDirectory.files.length, 0)

        const entryToApply = desktopEntries[0]
        await applyStashEntry(repository, entryToApply.stashSha)

        status = await getStatusOrThrow(repository)
        assert.equal(status.workingDirectory.files.length, 1)

        // Popping drops the entry in this case, applying must not
        const entriesAfter = (await getStashes(repository)).desktopEntries
        assert.equal(entriesAfter.length, 1)
        assert.equal(entriesAfter[0].stashSha, entryToApply.stashSha)
      })
    })

    describe('when there are unresolvable conflicts', () => {
      it('throws an error', async t => {
        const repository = await setup(t)

        await generateTestStashEntry(repository, 'master', true)
        const { desktopEntries } = await getStashes(repository)
        assert.equal(desktopEntries.length, 1)

        const readme = path.join(repository.path, 'README.md')
        await writeFile(readme, generateString())

        const entryToApply = desktopEntries[0]
        await assert.rejects(() =>
          applyStashEntry(repository, entryToApply.stashSha)
        )
      })
    })
  })
})

/**
 * Creates a stash entry using `git stash push` to allow for simulating
 * entries created via the CLI and Desktop
 *
 * @param repository the repository to create the stash entry for
 * @param message passing null will similate a Desktop created stash entry
 */
async function stash(
  repository: Repository,
  branchName: string,
  message: string | null
): Promise<void> {
  const result = await exec(
    ['stash', 'push', '-m', message || createDesktopStashMessage(branchName)],
    repository.path
  )

  if (result.exitCode !== 0) {
    throw new Error(result.stderr)
  }
}

async function generateTestStashEntry(
  repository: Repository,
  branchName: string,
  simulateDesktopEntry: boolean
): Promise<void> {
  const message = simulateDesktopEntry ? null : 'Should get filtered'
  const readme = path.join(repository.path, 'README.md')
  await appendFile(readme, generateString())
  await stash(repository, branchName, message)
}
