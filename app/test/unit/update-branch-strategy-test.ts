import { describe, it } from 'node:test'
import assert from 'node:assert'

import { getConfigValue, setConfigValue } from '../../src/lib/git/config'
import {
  getUpdateBranchStrategy,
  updateBranchStrategyConfigKey,
  UpdateBranchStrategy,
} from '../../src/lib/update-branch-strategy'
import { Repository } from '../../src/models/repository'
import { setupFixtureRepository } from '../helpers/repositories'

describe('update branch strategy', () => {
  it('defaults to merging when the repository has no setting', async t => {
    const repository = new Repository(
      await setupFixtureRepository(t, 'test-repo'),
      -1,
      null,
      false
    )

    assert.equal(
      await getUpdateBranchStrategy(repository),
      UpdateBranchStrategy.Merge
    )
  })

  it('uses rebase when configured locally for the repository', async t => {
    const repository = new Repository(
      await setupFixtureRepository(t, 'test-repo'),
      -1,
      null,
      false
    )

    await setConfigValue(
      repository,
      updateBranchStrategyConfigKey,
      UpdateBranchStrategy.Rebase
    )

    assert.equal(
      await getConfigValue(repository, updateBranchStrategyConfigKey, true),
      UpdateBranchStrategy.Rebase
    )
    assert.equal(
      await getUpdateBranchStrategy(repository),
      UpdateBranchStrategy.Rebase
    )
  })
})
