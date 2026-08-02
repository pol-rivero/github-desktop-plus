import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  SignInResult,
  SignInStore,
  SignInStep,
} from '../../src/lib/stores/sign-in-store'
import { AccountsStore } from '../../src/lib/stores'
import { Account } from '../../src/models/account'
import { getDotComAPIEndpoint, getHTMLURL } from '../../src/lib/api'
import {
  getRegisteredEndpoint,
  resetEndpointApiTypeRegistryForTesting,
} from '../../src/lib/endpoint-api-type-registry'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

function createAccountsStore(
  accounts: ReadonlyArray<Account> = []
): AccountsStore {
  const dataStore = new InMemoryStore()
  if (accounts.length > 0) {
    const serialized = accounts.map(a => ({
      login: a.login,
      endpoint: a.endpoint,
      token: a.token,
      emails: a.emails,
      avatarURL: a.avatarURL,
      id: a.id,
      name: a.name,
      plan: a.plan,
    }))
    dataStore.setItem('users', JSON.stringify(serialized))
  }
  return new AccountsStore(dataStore, new AsyncInMemoryStore())
}

function createDotComAccount(login = 'octocat'): Account {
  return new Account(
    login,
    getDotComAPIEndpoint(),
    'dotcom',
    'test-token',
    '',
    0,
    [],
    'https://avatars.githubusercontent.com/u/1',
    1,
    login,
    'free'
  )
}

function createEnterpriseAccount(
  login = 'enterprise-user',
  endpoint = 'https://github.example.com/api/v3'
): Account {
  return new Account(
    login,
    endpoint,
    'enterprise',
    'ent-token',
    '',
    0,
    [],
    '',
    2,
    login,
    'free'
  )
}

function createSelfHostedAccount(
  login: string,
  endpoint: string,
  apiType: 'gitlab' | 'forgejo'
): Account {
  return new Account(login, endpoint, apiType, 'pat', '', 0, [], '', 3, login)
}

/** Serve every request from the given handler for the duration of `fn`. */
async function withFetch(
  handler: (url: string) => Response,
  fn: () => Promise<void>
) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    handler(input.toString())) as typeof globalThis.fetch

  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('SignInStore', () => {
  let accountsStore: AccountsStore
  let signInStore: SignInStore

  beforeEach(() => {
    localStorage.removeItem('api-endpoint-types')
    resetEndpointApiTypeRegistryForTesting()
    accountsStore = createAccountsStore()
    signInStore = new SignInStore(accountsStore)
  })

  afterEach(() => {
    localStorage.removeItem('api-endpoint-types')
    resetEndpointApiTypeRegistryForTesting()
  })

  describe('initial state', () => {
    it('starts with null state', () => {
      assert.equal(signInStore.getState(), null)
    })
  })

  describe('beginDotComSignIn', () => {
    it('transitions to Authentication step when no existing account', async () => {
      signInStore.beginDotComSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.Authentication)
      if (state?.kind === SignInStep.Authentication) {
        assert.equal(state.endpoint, getDotComAPIEndpoint())
        assert.equal(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('transitions to Authentication even if a dotcom account exists', async () => {
      const existingAccount = createDotComAccount()
      accountsStore = createAccountsStore()
      signInStore = new SignInStore(accountsStore)

      await accountsStore.addAccount(existingAccount)

      signInStore.beginDotComSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.Authentication)
    })

    it('calls resultCallback when provided', async () => {
      let callbackCalled = false
      signInStore.beginDotComSignIn(() => {
        callbackCalled = true
      })

      // Reset triggers the callback with 'cancelled'
      signInStore.reset()
      assert.equal(callbackCalled, true)
    })
  })

  describe('beginEnterpriseSignIn', () => {
    it('transitions to EndpointEntry step', () => {
      signInStore.beginEnterpriseSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.EndpointEntry)
    })

    it('sets initial state correctly', () => {
      signInStore.beginEnterpriseSignIn()
      const state = signInStore.getState()
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.equal(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('resets previous state before starting', () => {
      // Start a dotcom sign-in first
      signInStore.beginDotComSignIn()
      assert.equal(signInStore.getState()?.kind, SignInStep.Authentication)

      // Starting enterprise sign-in should replace that state
      signInStore.beginEnterpriseSignIn()
      assert.equal(signInStore.getState()?.kind, SignInStep.EndpointEntry)
    })
  })

  describe('setEndpoint', () => {
    it('transitions to Authentication step for valid enterprise URL', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.Authentication)
    })

    it('redirects to dotcom flow for github.com URLs', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.com')

      const state = signInStore.getState()
      // Should redirect to the Authentication step with the dotcom endpoint
      assert.equal(state?.kind, SignInStep.Authentication)
      if (state?.kind === SignInStep.Authentication) {
        assert.equal(state.endpoint, getDotComAPIEndpoint())
      }
    })

    it('redirects to dotcom flow for api.github.com URLs', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://api.github.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.Authentication)
      if (state?.kind === SignInStep.Authentication) {
        assert.equal(state.endpoint, getDotComAPIEndpoint())
      }
    })

    it('sets error for non-HTTPS URL', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('http://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.notEqual(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('shows Authentication even if enterprise account exists', async () => {
      const endpoint = 'https://github.example.com/api/v3'
      const existingAccount = createEnterpriseAccount('user', endpoint)
      accountsStore = createAccountsStore()
      signInStore = new SignInStore(accountsStore)

      await accountsStore.addAccount(existingAccount)

      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.Authentication)
    })
  })

  describe('beginSelfHostedSignIn', () => {
    it('transitions to EndpointEntry with the chosen provider', () => {
      signInStore.beginSelfHostedSignIn('gitlab')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.equal(state.apiType, 'gitlab')
        assert.equal(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('resets previous state before starting', () => {
      signInStore.beginDotComSignIn()
      signInStore.beginSelfHostedSignIn('forgejo')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.equal(state.apiType, 'forgejo')
      }
    })
  })

  describe('setEndpoint for a self-hosted instance', () => {
    it('derives the GitLab API endpoint and advances to token entry', async () => {
      signInStore.beginSelfHostedSignIn('gitlab')
      await signInStore.setEndpoint('https://git.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.TokenEntry)
      if (state?.kind === SignInStep.TokenEntry) {
        assert.equal(state.endpoint, 'https://git.example.com/api/v4')
        assert.equal(state.webBaseUrl, 'https://git.example.com')
        assert.equal(state.apiType, 'gitlab')
        assert.equal(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('derives the Forgejo API endpoint and advances to token entry', async () => {
      signInStore.beginSelfHostedSignIn('forgejo')
      await signInStore.setEndpoint('https://git.example.com/')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.TokenEntry)
      if (state?.kind === SignInStep.TokenEntry) {
        assert.equal(state.endpoint, 'https://git.example.com/api/v1')
        assert.equal(state.webBaseUrl, 'https://git.example.com')
      }
    })

    it('keeps an explicit port', async () => {
      signInStore.beginSelfHostedSignIn('forgejo')
      await signInStore.setEndpoint('git.example.com:3000')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.TokenEntry)
      if (state?.kind === SignInStep.TokenEntry) {
        assert.equal(state.endpoint, 'https://git.example.com:3000/api/v1')
        assert.equal(state.webBaseUrl, 'https://git.example.com:3000')
      }
    })

    it('rejects an empty address', async () => {
      signInStore.beginSelfHostedSignIn('gitlab')
      await signInStore.setEndpoint('   ')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.match(state.error?.message ?? '', /valid URL/)
      }
    })

    it('rejects an address with a path', async () => {
      signInStore.beginSelfHostedSignIn('gitlab')
      await signInStore.setEndpoint('https://example.com/gitlab')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.match(state.error?.message ?? '', /can't contain a path/)
        assert.equal(state.loading, false)
      }
    })

    it('accepts an address with redundant trailing slashes', async () => {
      signInStore.beginSelfHostedSignIn('gitlab')
      await signInStore.setEndpoint('https://git.example.com//')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.TokenEntry)
      if (state?.kind === SignInStep.TokenEntry) {
        assert.equal(state.webBaseUrl, 'https://git.example.com')
      }
    })

    it('keeps an IPv6 literal and its port', async () => {
      signInStore.beginSelfHostedSignIn('forgejo')
      await signInStore.setEndpoint('https://[2001:db8::1]:3000')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.TokenEntry)
      if (state?.kind === SignInStep.TokenEntry) {
        assert.equal(state.endpoint, 'https://[2001:db8::1]:3000/api/v1')
      }
    })

    it('rejects an unbracketed IPv6 address with a friendly error', async () => {
      signInStore.beginSelfHostedSignIn('forgejo')
      await signInStore.setEndpoint('https://::1')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.match(state.error?.message ?? '', /valid URL/)
      }
    })

    it('rejects a GitHub address', async () => {
      signInStore.beginSelfHostedSignIn('gitlab')
      await signInStore.setEndpoint('https://github.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.match(state.error?.message ?? '', /is a GitHub address/)
      }
    })

    it('rejects a non-HTTPS address', async () => {
      signInStore.beginSelfHostedSignIn('gitlab')
      await signInStore.setEndpoint('http://git.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.match(state.error?.message ?? '', /Only https is supported/)
      }
    })

    it('rejects a host already used by another provider', async () => {
      await accountsStore.addAccount(
        createEnterpriseAccount('joan', 'https://git.example.com/api/v3')
      )

      signInStore.beginSelfHostedSignIn('gitlab')
      await signInStore.setEndpoint('https://git.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.match(state.error?.message ?? '', /already associated with a/)
      }
    })

    it('allows the same hostname on a different port', async () => {
      await accountsStore.addAccount(
        createSelfHostedAccount(
          'joan',
          'https://git.example.com:8443/api/v4',
          'gitlab'
        )
      )

      signInStore.beginSelfHostedSignIn('forgejo')
      await signInStore.setEndpoint('https://git.example.com:3000')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.TokenEntry)
    })
  })

  describe('setToken', () => {
    const gitlabUser = {
      id: 42,
      username: 'joan',
      name: 'Joan',
      avatar_url: 'https://git.example.com/avatar.png',
      web_url: 'https://git.example.com/joan',
    }

    const beginTokenEntry = async () => {
      signInStore.beginSelfHostedSignIn('gitlab')
      await signInStore.setEndpoint('https://git.example.com')
      assert.equal(signInStore.getState()?.kind, SignInStep.TokenEntry)
    }

    const signIn = async (
      apiType: 'gitlab' | 'forgejo',
      address: string,
      token = 'pat-1234'
    ) => {
      const results = new Array<SignInResult>()
      signInStore.beginSelfHostedSignIn(apiType, r => results.push(r))
      await signInStore.setEndpoint(address)
      assert.equal(signInStore.getState()?.kind, SignInStep.TokenEntry)

      await withFetch(
        url =>
          url.includes('/user/emails')
            ? jsonResponse([])
            : jsonResponse(gitlabUser),
        () => signInStore.setToken(token)
      )

      return results
    }

    it('signs in to GitLab with a personal access token', async () => {
      const results = await signIn('gitlab', 'https://git.example.com')

      assert.equal(signInStore.getState()?.kind, SignInStep.Success)
      assert.equal(results.length, 1)

      const [result] = results
      assert.equal(result.kind, 'success')
      if (result.kind === 'success') {
        const { account } = result
        assert.equal(account.login, 'joan')
        assert.equal(account.apiType, 'gitlab')
        assert.equal(account.endpoint, 'https://git.example.com/api/v4')
        assert.equal(account.token, 'pat-1234')
        assert.equal(account.refreshToken, '')
      }
    })

    it('signs in to Forgejo with a personal access token', async () => {
      const results = await signIn('forgejo', 'https://git.example.com:3000')

      const [result] = results
      assert.equal(result?.kind, 'success')
      if (result?.kind === 'success') {
        assert.equal(result.account.apiType, 'forgejo')
        assert.equal(
          result.account.endpoint,
          'https://git.example.com:3000/api/v1'
        )
      }
    })

    it('registers the instance so its web URLs resolve', async () => {
      // The account lands in the registry through AccountsStore, exactly as it
      // does in the app through AppStore's onDidAuthenticate handler.
      signInStore.onDidAuthenticate(account => {
        accountsStore.addAccount(account)
      })

      const results = await signIn('forgejo', 'https://git.example.com:3000')
      const [result] = results
      assert.equal(result?.kind, 'success')

      const endpoint = 'https://git.example.com:3000/api/v1'
      assert.deepEqual(getRegisteredEndpoint(endpoint), {
        apiType: 'forgejo',
        webBaseUrl: 'https://git.example.com:3000',
      })
      assert.equal(getHTMLURL(endpoint), 'https://git.example.com:3000')
    })

    it('reports a friendly error when the token is rejected', async () => {
      await beginTokenEntry()

      await withFetch(
        () => jsonResponse({ message: '401 Unauthorized' }, 401),
        () => signInStore.setToken('bad-token')
      )

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.TokenEntry)
      if (state?.kind === SignInStep.TokenEntry) {
        assert.match(
          state.error?.message ?? '',
          /personal access token was rejected by https:\/\/git.example.com/
        )
        assert.equal(state.loading, false)
      }
    })

    it('reports a friendly error when the instance has no such API', async () => {
      await beginTokenEntry()

      await withFetch(
        () => jsonResponse({ message: '404 Not Found' }, 404),
        () => signInStore.setToken('pat-1234')
      )

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.TokenEntry)
      if (state?.kind === SignInStep.TokenEntry) {
        assert.match(
          state.error?.message ?? '',
          /Couldn't find a GitLab API at https:\/\/git.example.com\/api\/v4/
        )
      }
    })

    it('reports a friendly error when the instance is unreachable', async () => {
      await beginTokenEntry()

      const original = globalThis.fetch
      globalThis.fetch = (async () => {
        throw new TypeError('Failed to fetch')
      }) as typeof globalThis.fetch

      try {
        await signInStore.setToken('pat-1234')
      } finally {
        globalThis.fetch = original
      }

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.TokenEntry)
      if (state?.kind === SignInStep.TokenEntry) {
        assert.match(
          state.error?.message ?? '',
          /Could not sign in to https:\/\/git.example.com\. Failed to fetch/
        )
      }
    })
  })

  describe('reset', () => {
    it('clears the state back to null', () => {
      signInStore.beginDotComSignIn()
      assert.notEqual(signInStore.getState(), null)

      signInStore.reset()
      assert.equal(signInStore.getState(), null)
    })

    it('calls resultCallback with cancelled', async () => {
      let result: any = null
      signInStore.beginDotComSignIn(r => {
        result = r
      })

      signInStore.reset()
      assert.notEqual(result, null)
      assert.equal(result.kind, 'cancelled')
    })
  })

  describe('onDidUpdate', () => {
    it('emits updates when state changes', async () => {
      const states: Array<any> = []
      signInStore.onDidUpdate(state => {
        states.push(state)
      })

      signInStore.beginDotComSignIn()
      assert.equal(states.length, 1)
      assert.equal(states[0]?.kind, SignInStep.Authentication)
    })

    it('emits null when reset', () => {
      const states: Array<any> = []
      signInStore.onDidUpdate(state => {
        states.push(state)
      })

      signInStore.beginDotComSignIn()
      signInStore.reset()

      // Should have: cancelled callback + null state + possibly more
      const lastState = states[states.length - 1]
      assert.equal(lastState, null)
    })
  })
})
