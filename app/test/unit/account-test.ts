import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import {
  registerEndpointApiType,
  resetEndpointApiTypeRegistryForTesting,
} from '../../src/lib/endpoint-api-type-registry'

const createAccount = (endpoint: string, apiType: 'gitlab' | 'enterprise') =>
  new Account('joan', endpoint, apiType, 't', '', 0, [], '', 1, 'Joan')

describe('Account', () => {
  beforeEach(() => {
    localStorage.removeItem('api-endpoint-types')
    resetEndpointApiTypeRegistryForTesting()
  })

  afterEach(() => {
    localStorage.removeItem('api-endpoint-types')
    resetEndpointApiTypeRegistryForTesting()
  })

  describe('friendlyEndpoint', () => {
    it('names GitHub.com', () => {
      const account = new Account(
        'joan',
        getDotComAPIEndpoint(),
        'dotcom',
        't',
        '',
        0,
        [],
        '',
        1,
        'Joan'
      )

      assert.equal(account.friendlyEndpoint, 'GitHub.com')
    })

    it('uses the host of an enterprise instance', () => {
      const account = createAccount(
        'https://ghes.example.com/api/v3',
        'enterprise'
      )

      assert.equal(account.friendlyEndpoint, 'ghes.example.com')
    })

    it('keeps the port of a self-hosted instance', () => {
      registerEndpointApiType('https://git.example.com:3000/api/v4', 'gitlab')

      const account = createAccount(
        'https://git.example.com:3000/api/v4',
        'gitlab'
      )

      assert.equal(account.friendlyEndpoint, 'git.example.com:3000')
    })
  })
})
