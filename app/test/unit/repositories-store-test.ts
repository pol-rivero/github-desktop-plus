import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { join } from 'path'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { IAPIFullRepository, getDotComAPIEndpoint } from '../../src/lib/api'
import { assertIsRepositoryWithGitHubRepository } from '../../src/models/repository'
import {
  registerEndpointApiType,
  resetEndpointApiTypeRegistryForTesting,
} from '../../src/lib/endpoint-api-type-registry'

describe('RepositoriesStore', () => {
  let repoDb = new TestRepositoriesDatabase()
  let repositoriesStore = new RepositoriesStore(repoDb)

  beforeEach(async () => {
    repoDb = new TestRepositoriesDatabase()
    await repoDb.reset()
    repositoriesStore = new RepositoriesStore(repoDb)
  })

  afterEach(() => {
    repoDb.close()
  })

  describe('adding a new repository', () => {
    it('contains the added repository', async () => {
      const repoPath = '/some/cool/path'
      await repositoriesStore.addRepository(
        repoPath,
        join(repoPath, '.git'),
        null
      )

      const repositories = await repositoriesStore.getAll()
      assert.equal(repositories[0].path, repoPath)
    })
  })

  describe('getting all repositories', () => {
    it('returns multiple repositories', async () => {
      await repositoriesStore.addRepository(
        '/some/cool/path',
        '/some/cool/path/.git',
        null
      )
      await repositoriesStore.addRepository(
        '/some/other/path',
        '/some/other/path/.git',
        null
      )

      const repositories = await repositoriesStore.getAll()
      assert.equal(repositories.length, 2)
    })
  })

  describe('updating a GitHub repository', () => {
    const apiRepo: IAPIFullRepository = {
      clone_url: 'https://github.com/my-user/my-repo',
      ssh_url: 'git@github.com:my-user/my-repo.git',
      html_url: 'https://github.com/my-user/my-repo',
      name: 'my-repo',
      owner: {
        id: 42,
        html_url: 'https://github.com/my-user',
        login: 'my-user',
        avatar_url: 'https://github.com/my-user.png',
        type: 'User',
      },
      private: true,
      fork: false,
      default_branch: 'master',
      pushed_at: '1995-12-17T03:24:00',
      has_issues: true,
      archived: false,
      permissions: {
        pull: true,
        push: true,
        admin: false,
      },
      parent: undefined,
    }
    const endpoint = getDotComAPIEndpoint()

    it('adds a new GitHub repository', async () => {
      await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository(
          '/some/cool/path',
          '/some/cool/path/.git',
          null
        ),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo, null)
      )

      const repositories = await repositoriesStore.getAll()
      const repo = repositories[0]
      assertIsRepositoryWithGitHubRepository(repo)
      assert(repo.gitHubRepository.isPrivate)
      assert(!repo.gitHubRepository.fork)
      assert.equal(
        repo.gitHubRepository.htmlURL,
        'https://github.com/my-user/my-repo'
      )
    })

    it('reuses an existing GitHub repository', async () => {
      const firstRepo = await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository(
          '/some/cool/path',
          '/some/cool/path/.git',
          null
        ),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo, null)
      )

      const secondRepo = await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository(
          '/some/other/path',
          '/some/other/path/.git',
          null
        ),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo, null)
      )

      assert.equal(
        firstRepo.gitHubRepository.dbID,
        secondRepo.gitHubRepository.dbID
      )
    })
  })

  describe('self-hosted provider repositories', () => {
    const endpoint = 'https://gitlab.example.com/api/v4'
    const apiRepo: IAPIFullRepository = {
      clone_url: 'https://gitlab.example.com/my-user/my-repo',
      ssh_url: 'git@gitlab.example.com:my-user/my-repo.git',
      html_url: 'https://gitlab.example.com/my-user/my-repo',
      name: 'my-repo',
      owner: {
        id: 42,
        html_url: 'https://gitlab.example.com/my-user',
        login: 'my-user',
        avatar_url: 'https://gitlab.example.com/my-user.png',
        type: 'User',
      },
      private: true,
      fork: false,
      default_branch: 'main',
      pushed_at: '1995-12-17T03:24:00',
      has_issues: true,
      archived: false,
      permissions: {
        pull: true,
        push: true,
        admin: false,
      },
      parent: undefined,
    }

    beforeEach(() => {
      localStorage.removeItem('api-endpoint-types')
      resetEndpointApiTypeRegistryForTesting()
    })

    it('persists the apiType on the owner row', async () => {
      registerEndpointApiType(endpoint, 'gitlab')

      const ghRepo = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        null
      )
      assert.equal(ghRepo.type, 'gitlab')

      const owners = await repoDb.owners.toArray()
      assert.equal(owners.length, 1)
      assert.equal(owners[0].apiType, 'gitlab')
    })

    it('hydrates from the owner row when the registry entry is gone', async () => {
      registerEndpointApiType(endpoint, 'gitlab')

      const ghRepo = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        null
      )

      // Simulate the account being removed and localStorage cleared while
      // IndexedDB survived
      localStorage.removeItem('api-endpoint-types')
      resetEndpointApiTypeRegistryForTesting()

      const reloadedStore = new RepositoriesStore(repoDb)
      const reloaded = await reloadedStore.findGitHubRepositoryByID(ghRepo.dbID)
      assert.equal(reloaded?.type, 'gitlab')
    })

    it('keeps the persisted apiType when upserting without a registry entry', async () => {
      registerEndpointApiType(endpoint, 'gitlab')
      await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo, null)

      // Registry entry lost while IndexedDB survived
      localStorage.removeItem('api-endpoint-types')
      resetEndpointApiTypeRegistryForTesting()

      const reUpserted = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        null
      )
      assert.equal(reUpserted.type, 'gitlab')

      const owners = await repoDb.owners.toArray()
      assert.equal(owners.length, 1)
      assert.equal(owners[0].apiType, 'gitlab')
    })

    it('falls back to hostname deduction for owner rows without apiType', async () => {
      const dotComRepo = await repositoriesStore.upsertGitHubRepository(
        getDotComAPIEndpoint(),
        {
          ...apiRepo,
          clone_url: 'https://github.com/my-user/my-repo',
          html_url: 'https://github.com/my-user/my-repo',
        },
        null
      )
      assert.equal(dotComRepo.type, 'github')

      // Simulate a pre-existing row that predates apiType persistence
      await repoDb.owners.toCollection().modify({ apiType: undefined })

      const reloadedStore = new RepositoriesStore(repoDb)
      const reloaded = await reloadedStore.findGitHubRepositoryByID(
        dotComRepo.dbID
      )
      assert.equal(reloaded?.type, 'github')
    })
  })
})
