import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  deriveWebBaseUrl,
  findRegisteredEndpointForHost,
  getRegisteredApiType,
  getRegisteredEndpoint,
  registerEndpointApiType,
  resetEndpointApiTypeRegistryForTesting,
  unregisterHost,
} from '../../src/lib/endpoint-api-type-registry'
import {
  getAPIEndpoint,
  getEndpointForRepository,
  getHTMLURL,
} from '../../src/lib/api'
import { deduceRepositoryType } from '../../src/models/github-repository'

const StorageKey = 'api-endpoint-types'

const clearRegistry = () => {
  localStorage.removeItem(StorageKey)
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
      findRegisteredEndpointForHost('unknown.example.com'),
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

  it('finds registered endpoints by host', () => {
    registerEndpointApiType('https://forgejo.example.com/api/v1', 'forgejo')
    assert.deepStrictEqual(
      findRegisteredEndpointForHost('forgejo.example.com'),
      {
        endpoint: 'https://forgejo.example.com/api/v1',
        apiType: 'forgejo',
        webBaseUrl: 'https://forgejo.example.com',
      }
    )
  })

  it('finds endpoints on non-standard ports by hostname', () => {
    registerEndpointApiType('https://myhost.com:8443/api/v4', 'gitlab')
    assert.deepStrictEqual(findRegisteredEndpointForHost('myhost.com'), {
      endpoint: 'https://myhost.com:8443/api/v4',
      apiType: 'gitlab',
      webBaseUrl: 'https://myhost.com:8443',
    })
  })

  it('does not match a host whose port differs', () => {
    registerEndpointApiType('https://myhost.com:8443/api/v4', 'gitlab')
    assert.equal(findRegisteredEndpointForHost('myhost.com:3000'), undefined)
  })

  it('replaces entries when a host is re-registered', () => {
    registerEndpointApiType('https://git.example.com/api/v4', 'gitlab')
    registerEndpointApiType('https://git.example.com/api/v1', 'forgejo')

    assert.equal(
      getRegisteredApiType('https://git.example.com/api/v4'),
      undefined
    )
    assert.equal(
      findRegisteredEndpointForHost('git.example.com')?.endpoint,
      'https://git.example.com/api/v1'
    )
  })

  it('keeps separate instances on the same hostname but different ports', () => {
    registerEndpointApiType('https://git.example.com:8443/api/v4', 'gitlab')
    registerEndpointApiType('https://git.example.com:3000/api/v1', 'forgejo')

    // An exact host match wins over the port-insensitive fallback
    assert.equal(
      findRegisteredEndpointForHost('git.example.com:3000')?.apiType,
      'forgejo'
    )
    assert.equal(
      findRegisteredEndpointForHost('git.example.com:8443')?.apiType,
      'gitlab'
    )
  })

  it('unregisters only the entries for the given host', () => {
    registerEndpointApiType('https://git.example.com/api/v4', 'gitlab')
    registerEndpointApiType('https://git.example.com:3000/api/v1', 'forgejo')

    unregisterHost('git.example.com')

    assert.equal(
      getRegisteredApiType('https://git.example.com/api/v4'),
      undefined
    )
    assert.equal(
      getRegisteredApiType('https://git.example.com:3000/api/v1'),
      'forgejo'
    )
  })

  describe('deriveWebBaseUrl', () => {
    it('strips the provider API path', () => {
      assert.equal(
        deriveWebBaseUrl('https://gitlab.example.com/api/v4', 'gitlab'),
        'https://gitlab.example.com'
      )
      assert.equal(
        deriveWebBaseUrl('https://forgejo.example.com/api/v1', 'forgejo'),
        'https://forgejo.example.com'
      )
      assert.equal(
        deriveWebBaseUrl('https://gitlab.com/api/v4', 'gitlab'),
        'https://gitlab.com'
      )
      assert.equal(
        deriveWebBaseUrl('https://codeberg.org/api/v1', 'forgejo'),
        'https://codeberg.org'
      )
    })

    it('preserves a subpath install', () => {
      assert.equal(
        deriveWebBaseUrl('https://example.com/forgejo/api/v1/', 'forgejo'),
        'https://example.com/forgejo'
      )
    })

    it('preserves a non-standard port', () => {
      assert.equal(
        deriveWebBaseUrl('https://git.example.com:3000/api/v1', 'forgejo'),
        'https://git.example.com:3000'
      )
    })

    it('leaves an endpoint without the API path alone', () => {
      assert.equal(
        deriveWebBaseUrl('https://git.example.com', 'forgejo'),
        'https://git.example.com'
      )
    })
  })

  describe('stored entries', () => {
    it('records the derived web root', () => {
      registerEndpointApiType('https://example.com/forgejo/api/v1', 'forgejo')
      assert.deepStrictEqual(
        getRegisteredEndpoint('https://example.com/forgejo/api/v1'),
        { apiType: 'forgejo', webBaseUrl: 'https://example.com/forgejo' }
      )
    })

    it('accepts an explicit web root', () => {
      registerEndpointApiType(
        'https://git.example.com/custom/api/v1',
        'forgejo',
        'https://git.example.com/custom/'
      )
      assert.equal(
        getRegisteredEndpoint('https://git.example.com/custom/api/v1')
          ?.webBaseUrl,
        'https://git.example.com/custom'
      )
    })

    it('ignores malformed entries', () => {
      const endpoint = 'https://example.com/api/v1'
      const rejected = [
        { apiType: 'perforce', webBaseUrl: 'https://example.com' },
        { apiType: 'forgejo' },
        { apiType: 'forgejo', webBaseUrl: '' },
        'forgejo',
        null,
      ]

      for (const entry of rejected) {
        localStorage.setItem(StorageKey, JSON.stringify({ [endpoint]: entry }))
        resetEndpointApiTypeRegistryForTesting()

        assert.equal(
          getRegisteredEndpoint(endpoint),
          undefined,
          `expected ${JSON.stringify(entry)} to be rejected`
        )
      }
    })
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

    it('getHTMLURL preserves a subpath install', () => {
      registerEndpointApiType('https://example.com/forgejo/api/v1', 'forgejo')
      assert.equal(
        getHTMLURL('https://example.com/forgejo/api/v1'),
        'https://example.com/forgejo'
      )
    })

    it('getAPIEndpoint returns the registered endpoint for its host', () => {
      registerEndpointApiType('https://forgejo.example.com/api/v1', 'forgejo')
      assert.equal(
        getAPIEndpoint('https://forgejo.example.com'),
        'https://forgejo.example.com/api/v1'
      )
      // ...and stays idempotent for the endpoint itself, rather than
      // resolving to the Cloud endpoint via the isCodebergCloud predicate
      assert.equal(
        getAPIEndpoint('https://forgejo.example.com/api/v1'),
        'https://forgejo.example.com/api/v1'
      )
    })

    it('getAPIEndpoint distinguishes instances by port', () => {
      registerEndpointApiType('https://git.example.com:8443/api/v4', 'gitlab')
      registerEndpointApiType('https://git.example.com:3000/api/v1', 'forgejo')

      assert.equal(
        getAPIEndpoint('https://git.example.com:3000'),
        'https://git.example.com:3000/api/v1'
      )
      assert.equal(
        getAPIEndpoint('https://git.example.com:8443'),
        'https://git.example.com:8443/api/v4'
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

    it('getEndpointForRepository tells two instances on one hostname apart', () => {
      const gitlab = 'https://git.example.com:8443/api/v4'
      const forgejo = 'https://git.example.com:3000/api/v1'
      registerEndpointApiType(gitlab, 'gitlab')
      registerEndpointApiType(forgejo, 'forgejo')

      assert.equal(
        getEndpointForRepository('https://git.example.com:3000/o/r.git'),
        forgejo
      )
      assert.equal(
        getEndpointForRepository('https://git.example.com:8443/o/r.git'),
        gitlab
      )
    })

    it('getEndpointForRepository keeps the port in its fallback guess', () => {
      assert.equal(
        getEndpointForRepository('https://unknown.example.com:3000/o/r.git'),
        'https://unknown.example.com:3000/api'
      )
    })

    it('getEndpointForRepository resolves remotes of an instance on a port', () => {
      const endpoint = 'https://git.example.com:3000/api/v1'
      registerEndpointApiType(endpoint, 'forgejo')

      assert.equal(
        getEndpointForRepository('https://git.example.com:3000/owner/repo.git'),
        endpoint
      )
      // An ssh remote carries the SSH port, not the web port, so the lookup has
      // to succeed on the hostname alone
      assert.equal(
        getEndpointForRepository(
          'ssh://git@git.example.com:2222/owner/repo.git'
        ),
        endpoint
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

    it('deduces a registered instance served on a port', () => {
      registerEndpointApiType('https://git.example.com:3000/api/v1', 'forgejo')
      assert.equal(
        deduceRepositoryType('https://git.example.com:3000/owner/repo'),
        'forgejo'
      )
    })

    it('deduces an ssh remote whose port differs from the instance web port', () => {
      registerEndpointApiType('https://git.example.com:1234/api/v1', 'forgejo')
      assert.equal(
        deduceRepositoryType('ssh://git@git.example.com:2222/owner/repo.git'),
        'forgejo'
      )
    })

    it('keeps http(s) instances on one hostname distinct by port', () => {
      registerEndpointApiType('https://git.example.com:1234/api/v4', 'gitlab')
      registerEndpointApiType('https://git.example.com:3000/api/v1', 'forgejo')

      assert.equal(
        deduceRepositoryType('https://git.example.com:3000/owner/repo'),
        'forgejo'
      )
      assert.equal(
        deduceRepositoryType('https://git.example.com:1234/owner/repo'),
        'gitlab'
      )
    })

    it('keeps the Cloud hosts working without registry entries', () => {
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
