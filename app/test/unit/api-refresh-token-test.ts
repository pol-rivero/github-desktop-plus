import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  BitbucketAPI,
  ForgejoAPI,
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
