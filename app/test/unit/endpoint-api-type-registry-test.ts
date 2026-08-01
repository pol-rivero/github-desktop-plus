import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  findRegisteredEndpointForHostname,
  getRegisteredApiType,
  registerEndpointApiType,
  resetEndpointApiTypeRegistryForTesting,
  unregisterHostname,
} from '../../src/lib/endpoint-api-type-registry'
import {
  getAPIEndpoint,
  getEndpointForRepository,
  getHTMLURL,
} from '../../src/lib/api'
import { deduceRepositoryType } from '../../src/models/github-repository'

const clearRegistry = () => {
  localStorage.removeItem('api-endpoint-types')
  resetEndpointApiTypeRegistryForTesting()
}

describe('endpoint-api-type-registry', () => {
  beforeEach(clearRegistry)

  it('returns undefined for unknown endpoints', () => {
    assert.equal(
      getRegisteredApiType('https://unknown.example.com/api/v4'),
      undefined
    )
    assert.equal(
      findRegisteredEndpointForHostname('unknown.example.com'),
      undefined
    )
  })

  it('round-trips through localStorage', () => {
    registerEndpointApiType('https://gitlab.example.com/api/v4', 'gitlab')
    assert.equal(
      getRegisteredApiType('https://gitlab.example.com/api/v4'),
      'gitlab'
    )

    // Simulate fresh window: drop the in-memory cache but not localStorage
    resetEndpointApiTypeRegistryForTesting()
    assert.equal(
      getRegisteredApiType('https://gitlab.example.com/api/v4'),
      'gitlab'
    )
  })

  it('finds registered endpoints by hostname', () => {
    registerEndpointApiType('https://forgejo.example.com/api/v1', 'forgejo')
    assert.deepStrictEqual(
      findRegisteredEndpointForHostname('forgejo.example.com'),
      { endpoint: 'https://forgejo.example.com/api/v1', type: 'forgejo' }
    )
  })

  it('finds endpoints on non-standard ports by hostname', () => {
    registerEndpointApiType('https://myhost.com:8443/api/v4', 'gitlab')
    assert.deepStrictEqual(findRegisteredEndpointForHostname('myhost.com'), {
      endpoint: 'https://myhost.com:8443/api/v4',
      type: 'gitlab',
    })
  })

  it('replaces entries when a hostname is re-registered', () => {
    registerEndpointApiType('https://git.example.com/api/v4', 'gitlab')
    registerEndpointApiType('https://git.example.com/api/v1', 'forgejo')

    assert.equal(
      getRegisteredApiType('https://git.example.com/api/v4'),
      undefined
    )
    assert.deepStrictEqual(
      findRegisteredEndpointForHostname('git.example.com'),
      { endpoint: 'https://git.example.com/api/v1', type: 'forgejo' }
    )
  })

  it('unregisters all entries for a hostname', () => {
    registerEndpointApiType('https://git.example.com/api/v4', 'gitlab')
    unregisterHostname('git.example.com')
    assert.equal(
      findRegisteredEndpointForHostname('git.example.com'),
      undefined
    )
  })

  describe('URL mappers', () => {
    it('getHTMLURL resolves the instance root for registered endpoints', () => {
      registerEndpointApiType('https://gitlab.example.com/api/v4', 'gitlab')
      assert.equal(
        getHTMLURL('https://gitlab.example.com/api/v4'),
        'https://gitlab.example.com'
      )
    })

    it('getHTMLURL preserves non-standard ports', () => {
      registerEndpointApiType('https://myhost.com:8443/api/v4', 'gitlab')
      assert.equal(
        getHTMLURL('https://myhost.com:8443/api/v4'),
        'https://myhost.com:8443'
      )
    })

    it('getAPIEndpoint returns the registered endpoint for its host', () => {
      registerEndpointApiType('https://forgejo.example.com/api/v1', 'forgejo')
      assert.equal(
        getAPIEndpoint('https://forgejo.example.com'),
        'https://forgejo.example.com/api/v1'
      )
      // ...and stays idempotent for the endpoint itself, rather than
      // resolving to the SaaS endpoint via the isCodeberg predicate
      assert.equal(
        getAPIEndpoint('https://forgejo.example.com/api/v1'),
        'https://forgejo.example.com/api/v1'
      )
    })

    it('getEndpointForRepository maps remote URLs to registered endpoints', () => {
      registerEndpointApiType('https://gitlab.example.com/api/v4', 'gitlab')
      assert.equal(
        getEndpointForRepository('https://gitlab.example.com/owner/repo.git'),
        'https://gitlab.example.com/api/v4'
      )
      // Unregistered hosts keep the (upstream) GHES-shaped fallback,
      // deliberately not asserted here
      assert.notEqual(
        getEndpointForRepository('https://github.example.com/owner/repo.git'),
        'https://gitlab.example.com/api/v4'
      )
    })
  })

  describe('deduceRepositoryType', () => {
    it('deduces registered self-hosted providers', () => {
      const url = 'https://gitlab.example.com/owner/repo'
      assert.equal(deduceRepositoryType(url), 'github')

      registerEndpointApiType('https://gitlab.example.com/api/v4', 'gitlab')
      assert.equal(deduceRepositoryType(url), 'gitlab')
    })

    it('keeps the SaaS hosts working without registry entries', () => {
      assert.equal(deduceRepositoryType('https://gitlab.com/o/r'), 'gitlab')
      assert.equal(
        deduceRepositoryType('https://bitbucket.org/o/r'),
        'bitbucket'
      )
      assert.equal(deduceRepositoryType('https://codeberg.org/o/r'), 'forgejo')
      assert.equal(deduceRepositoryType('https://github.com/o/r'), 'github')
    })
  })
})
