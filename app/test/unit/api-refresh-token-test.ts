import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  BitbucketAPI,
  ForgejoAPI,
  GiteaAPI,
  GitLabAPI,
  BitbucketCloudAPIEndpoint,
} from '../../src/lib/api'
import { UnknownLogin } from '../../src/models/account'

/** Count the requests made while running `fn`. */
async function countFetches(fn: () => Promise<void>) {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof globalThis.fetch

  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }

  return calls
}

// The refresh overrides are protected; sign-in flows reach them through the
// request path, tests call them directly.
const refreshToken = (api: unknown) =>
  (api as { refreshToken(): Promise<void> }).refreshToken()

describe('token refresh', () => {
  it('does not try to refresh a Bitbucket account without a refresh token', async () => {
    const api = new BitbucketAPI(
      BitbucketCloudAPIEndpoint,
      'pat',
      UnknownLogin.InitialAuthFetch,
      '',
      0
    )

    assert.equal(await countFetches(() => refreshToken(api)), 0)
  })

  it('does not try to refresh a GitLab account without a refresh token', async () => {
    const api = GitLabAPI.get(
      'https://git.example.com/api/v4',
      'pat',
      UnknownLogin.InitialAuthFetch,
      '',
      0
    )

    assert.equal(await countFetches(() => refreshToken(api)), 0)
  })

  it('does not try to refresh a Forgejo account without a refresh token', async () => {
    const api = ForgejoAPI.get(
      'https://git.example.com/api/v1',
      'pat',
      UnknownLogin.InitialAuthFetch,
      '',
      0
    )

    assert.equal(await countFetches(() => refreshToken(api)), 0)
  })

  it('refreshes when there is a refresh token', async () => {
    const api = GitLabAPI.get(
      'https://git.example.com/api/v4',
      'expired',
      UnknownLogin.InitialAuthFetch,
      'refresh-me',
      0
    )

    assert.equal(await countFetches(() => refreshToken(api)), 1)
  })
})

describe('ForgejoAPI.get', () => {
  it('builds a GiteaAPI rather than its Forgejo base class', () => {
    const api = GiteaAPI.get(
      'https://gitea.example.com/api/v1',
      'pat',
      'joan',
      '',
      0
    )

    assert.ok(api instanceof GiteaAPI)
  })

  it('reuses the cached instance for the same endpoint and login', () => {
    const endpoint = 'https://cached.example.com/api/v1'
    const api = GiteaAPI.get(endpoint, 'pat', 'joan', '', 0)

    assert.equal(GiteaAPI.get(endpoint, 'pat', 'joan', '', 0), api)
    assert.notEqual(GiteaAPI.get(endpoint, 'pat', 'ada', '', 0), api)
  })

  it('discards a cached instance of the other forge for the same endpoint', () => {
    const endpoint = 'https://switching.example.com/api/v1'
    const forgejo = ForgejoAPI.get(endpoint, 'pat', 'joan', '', 0)
    assert.ok(!(forgejo instanceof GiteaAPI))

    const gitea = GiteaAPI.get(endpoint, 'pat', 'joan', '', 0)
    assert.ok(gitea instanceof GiteaAPI)
    assert.notEqual(gitea, forgejo)

    // ...and switching back drops the Gitea instance again
    const backToForgejo = ForgejoAPI.get(endpoint, 'pat', 'joan', '', 0)
    assert.ok(!(backToForgejo instanceof GiteaAPI))
    assert.notEqual(backToForgejo, gitea)
  })
})
