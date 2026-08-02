import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import {
  getRegisteredApiType,
  resetEndpointApiTypeRegistryForTesting,
} from '../../src/lib/endpoint-api-type-registry'
import { getGitLabCloudAPIEndpoint } from '../../src/lib/api'

describe('AccountsStore', () => {
  let accountsStore: AccountsStore

  beforeEach(() => {
    localStorage.removeItem('api-endpoint-types')
    resetEndpointApiTypeRegistryForTesting()
    accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
  })

  describe('adding a new user', () => {
    it('contains the added user', async () => {
      const newAccountLogin = 'joan'
      await accountsStore.addAccount(
        new Account(
          newAccountLogin,
          '',
          'dotcom',
          'deadbeef',
          '',
          0,
          [],
          '',
          1,
          '',
          'free'
        )
      )

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, newAccountLogin)
    })
  })

  describe('loading persisted users', () => {
    it('migrates .ghe.com users still using /api/v3 to api. subdomain', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([
          {
            login: 'joan',
            endpoint: 'https://whatever.ghe.com/api/v3',
            token: 'deadbeef',
            emails: [],
            avatarURL: '',
            id: 1,
            name: '',
            plan: 'free',
          },
        ])
      )
      accountsStore = new AccountsStore(dataStore, new AsyncInMemoryStore())

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, 'joan')
      assert.equal(users[0].endpoint, 'https://api.whatever.ghe.com/')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(persistedUsers[0].endpoint, 'https://api.whatever.ghe.com/')
    })

    it('does NOT migrate GHE users already using the api. subdomain', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([
          {
            login: 'joan',
            endpoint: 'https://api.whatever.ghe.com/',
            token: 'deadbeef',
            emails: [],
            avatarURL: '',
            id: 1,
            name: '',
            plan: 'free',
          },
        ])
      )
      accountsStore = new AccountsStore(dataStore, new AsyncInMemoryStore())

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, 'joan')
      assert.equal(users[0].endpoint, 'https://api.whatever.ghe.com/')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(persistedUsers[0].endpoint, 'https://api.whatever.ghe.com/')
    })

    it('does NOT migrate GHES users still using /api/v3 to api. subdomain', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([
          {
            login: 'joan',
            endpoint: 'https://my-company-repos.com/api/v3',
            token: 'deadbeef',
            emails: [],
            avatarURL: '',
            id: 1,
            name: '',
            plan: 'free',
          },
        ])
      )
      accountsStore = new AccountsStore(dataStore, new AsyncInMemoryStore())

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, 'joan')
      assert.equal(users[0].endpoint, 'https://my-company-repos.com/api/v3')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(
        persistedUsers[0].endpoint,
        'https://my-company-repos.com/api/v3'
      )
    })
  })

  describe('persisting apiType', () => {
    const persistedAccount = (endpoint: string, apiType?: string) => ({
      login: 'joan',
      endpoint,
      token: 'deadbeef',
      emails: [],
      avatarURL: '',
      id: 1,
      name: '',
      plan: 'free',
      ...(apiType !== undefined && { apiType }),
    })

    it('backfills records without apiType and re-saves them', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([
          persistedAccount(getGitLabCloudAPIEndpoint()),
          { ...persistedAccount('https://my-company-repos.com/api/v3'), id: 2 },
        ])
      )
      accountsStore = new AccountsStore(dataStore, new AsyncInMemoryStore())

      const users = await accountsStore.getAll()
      assert.equal(users[0].apiType, 'gitlab')
      assert.equal(users[1].apiType, 'enterprise')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].apiType, 'gitlab')
      assert.equal(persistedUsers[1].apiType, 'enterprise')
    })

    it('loads self-hosted records and rebuilds the endpoint registry', async () => {
      const endpoint = 'https://gitlab.example.com/api/v4'
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([persistedAccount(endpoint, 'gitlab')])
      )
      accountsStore = new AccountsStore(dataStore, new AsyncInMemoryStore())

      const users = await accountsStore.getAll()
      assert.equal(users[0].apiType, 'gitlab')
      assert.equal(getRegisteredApiType(endpoint), 'gitlab')
    })

    it('registers self-hosted endpoints when adding an account', async () => {
      const endpoint = 'https://gitlab.example.com/api/v4'
      const added = await accountsStore.addAccount(
        new Account(
          'joan',
          endpoint,
          'gitlab',
          't',
          '',
          0,
          [],
          '',
          1,
          '',
          'free'
        )
      )

      assert.notEqual(added, null)
      assert.equal(getRegisteredApiType(endpoint), 'gitlab')
    })

    it('never registers the Cloud endpoints', async () => {
      await accountsStore.addAccount(
        new Account(
          'joan',
          getGitLabCloudAPIEndpoint(),
          'dotcom',
          't',
          '',
          0,
          [],
          '',
          1,
          ''
        )
      )

      assert.equal(getRegisteredApiType(getGitLabCloudAPIEndpoint()), undefined)
    })

    it('rejects an account whose hostname is used by another provider', async () => {
      const ghesAccount = new Account(
        'joan',
        'https://git.example.com/api/v3',
        'enterprise',
        't',
        '',
        0,
        [],
        '',
        1,
        ''
      )
      assert.notEqual(await accountsStore.addAccount(ghesAccount), null)

      const gitlabAccount = new Account(
        'other',
        'https://git.example.com/api/v4',
        'gitlab',
        't',
        '',
        0,
        [],
        '',
        2,
        ''
      )
      assert.equal(await accountsStore.addAccount(gitlabAccount), null)

      const users = await accountsStore.getAll()
      assert.equal(users.length, 1)
      assert.equal(users[0].apiType, 'enterprise')
    })

    it('keeps accounts for two providers on the same hostname but different ports', async () => {
      const gitlabAccount = new Account(
        'joan',
        'https://git.example.com:8443/api/v4',
        'gitlab',
        't',
        '',
        0,
        [],
        '',
        1,
        ''
      )
      const forgejoAccount = new Account(
        'joan',
        'https://git.example.com:3000/api/v1',
        'forgejo',
        't',
        '',
        0,
        [],
        '',
        2,
        ''
      )

      assert.notEqual(await accountsStore.addAccount(gitlabAccount), null)
      assert.notEqual(await accountsStore.addAccount(forgejoAccount), null)

      const users = await accountsStore.getAll()
      assert.equal(users.length, 2)
      assert.equal(
        getRegisteredApiType('https://git.example.com:8443/api/v4'),
        'gitlab'
      )
      assert.equal(
        getRegisteredApiType('https://git.example.com:3000/api/v1'),
        'forgejo'
      )
    })
  })

  describe('findApiTypeConflict', () => {
    beforeEach(async () => {
      await accountsStore.addAccount(
        new Account(
          'joan',
          'https://git.example.com/api/v3',
          'enterprise',
          't',
          '',
          0,
          [],
          '',
          1,
          ''
        )
      )
    })

    it('describes the conflict when the host runs another provider', async () => {
      const conflict = await accountsStore.findApiTypeConflict(
        'https://git.example.com/api/v4',
        'gitlab'
      )

      assert.notEqual(conflict, null)
      assert.match(conflict?.message ?? '', /git.example.com/)
      assert.match(conflict?.message ?? '', /GitHub Enterprise/)
    })

    it('returns null for the same provider on the same host', async () => {
      assert.equal(
        await accountsStore.findApiTypeConflict(
          'https://git.example.com/api/v3',
          'enterprise'
        ),
        null
      )
    })

    it('returns null for the same hostname on a different port', async () => {
      assert.equal(
        await accountsStore.findApiTypeConflict(
          'https://git.example.com:8443/api/v4',
          'gitlab'
        ),
        null
      )
    })

    it('returns null for an unparseable endpoint', async () => {
      assert.equal(
        await accountsStore.findApiTypeConflict('not a url', 'gitlab'),
        null
      )
    })
  })
})
