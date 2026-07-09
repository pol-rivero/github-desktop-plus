import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  addGiteaEndpoint,
  getGiteaAPIEndpoint,
  getGiteaEndpointForHost,
  getGiteaEndpoints,
  getGiteaHTMLURL,
  isGitea,
  isGiteaHost,
  removeGiteaEndpoint,
} from '../../src/lib/gitea-endpoints'
import { getEndpointForRepository, getHTMLURL } from '../../src/lib/api'
import { deduceRepositoryType } from '../../src/models/github-repository'

describe('gitea-endpoints', () => {
  afterEach(() => localStorage.clear())

  describe('getGiteaAPIEndpoint', () => {
    it('appends /api/v1 to the instance URL', () => {
      assert.equal(
        getGiteaAPIEndpoint('https://git.example.com'),
        'https://git.example.com/api/v1'
      )
    })

    it('trims trailing slashes', () => {
      assert.equal(
        getGiteaAPIEndpoint('https://git.example.com/'),
        'https://git.example.com/api/v1'
      )
    })

    it('preserves a subpath install', () => {
      assert.equal(
        getGiteaAPIEndpoint('https://example.com/gitea'),
        'https://example.com/gitea/api/v1'
      )
    })
  })

  describe('getGiteaHTMLURL', () => {
    it('is the inverse of getGiteaAPIEndpoint', () => {
      const url = 'https://git.example.com'
      assert.equal(getGiteaHTMLURL(getGiteaAPIEndpoint(url)), url)
    })

    it('is the inverse for a subpath install', () => {
      const url = 'https://example.com/gitea'
      assert.equal(getGiteaHTMLURL(getGiteaAPIEndpoint(url)), url)
    })
  })

  describe('the registry', () => {
    it('records and recognises an endpoint', () => {
      const endpoint = getGiteaAPIEndpoint('https://git.example.com')
      assert.equal(isGitea(endpoint), false)

      addGiteaEndpoint(endpoint)

      assert.equal(isGitea(endpoint), true)
      assert.equal(isGiteaHost('git.example.com'), true)
      assert.equal(getGiteaEndpointForHost('git.example.com'), endpoint)
      assert.deepEqual([...getGiteaEndpoints()], [endpoint])
    })

    it('does not recognise unrelated hosts', () => {
      addGiteaEndpoint(getGiteaAPIEndpoint('https://git.example.com'))
      assert.equal(isGiteaHost('github.com'), false)
      assert.equal(getGiteaEndpointForHost('github.com'), null)
    })

    it('removes an endpoint', () => {
      const endpoint = getGiteaAPIEndpoint('https://git.example.com')
      addGiteaEndpoint(endpoint)
      removeGiteaEndpoint(endpoint)
      assert.equal(isGitea(endpoint), false)
      assert.equal(isGiteaHost('git.example.com'), false)
    })

    it('does not duplicate a repeated endpoint', () => {
      const endpoint = getGiteaAPIEndpoint('https://git.example.com')
      addGiteaEndpoint(endpoint)
      addGiteaEndpoint(endpoint)
      assert.equal([...getGiteaEndpoints()].length, 1)
    })
  })

  describe('integration with the provider plumbing', () => {
    it('makes a Gitea host resolve to the gitea repo type and endpoints', () => {
      const instance = 'https://git.example.com'
      const apiEndpoint = getGiteaAPIEndpoint(instance)
      addGiteaEndpoint(apiEndpoint)

      assert.equal(
        deduceRepositoryType('https://git.example.com/owner/repo.git'),
        'gitea'
      )
      assert.equal(getHTMLURL(apiEndpoint), instance)
      assert.equal(
        getEndpointForRepository('https://git.example.com/owner/repo.git'),
        apiEndpoint
      )
    })

    it('leaves non-Gitea hosts untouched', () => {
      assert.equal(
        deduceRepositoryType('https://github.com/owner/repo.git'),
        'github'
      )
    })
  })
})
