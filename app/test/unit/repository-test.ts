import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getUpdateBranchStrategy,
  Repository,
} from '../../src/models/repository'
import { UpdateBranchStrategy } from '../../src/lib/update-branch-strategy'

describe('Repository', () => {
  describe('name', () => {
    it('uses the last path component as the name', async () => {
      const repoPath = '/some/cool/path'
      const repository = new Repository(repoPath, -1, null, false)
      assert.equal(repository.name, 'path')
    })

    it('handles repository at root of the drive', async () => {
      const repoPath = 'T:\\'
      const repository = new Repository(repoPath, -1, null, false)
      assert.equal(repository.name, 'T:\\')
    })
  })

  describe('getUpdateBranchStrategy', () => {
    it('defaults to merging when the preference is unset', () => {
      const repository = new Repository('/some/path', -1, null, false)
      assert.equal(
        getUpdateBranchStrategy(repository),
        UpdateBranchStrategy.Merge
      )
    })

    it('returns rebase when the repository is configured to rebase', () => {
      const repository = new Repository(
        '/some/path',
        -1,
        null,
        false,
        null,
        null,
        null,
        { updateBranchStrategy: UpdateBranchStrategy.Rebase }
      )
      assert.equal(
        getUpdateBranchStrategy(repository),
        UpdateBranchStrategy.Rebase
      )
    })

    it('returns merge when the repository is configured to merge', () => {
      const repository = new Repository(
        '/some/path',
        -1,
        null,
        false,
        null,
        null,
        null,
        { updateBranchStrategy: UpdateBranchStrategy.Merge }
      )
      assert.equal(
        getUpdateBranchStrategy(repository),
        UpdateBranchStrategy.Merge
      )
    })
  })
})
