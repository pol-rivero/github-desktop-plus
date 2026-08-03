import { Disposable } from 'event-kit'
import { Account, AccountAPIType, UnknownLogin } from '../../models/account'
import { assertNever, fatalError } from '../fatal-error'
import {
  validateURL,
  InvalidURLErrorName,
  InvalidProtocolErrorName,
} from '../../ui/lib/enterprise-validate-url'

import {
  fetchUser,
  getDotComAPIEndpoint,
  getEnterpriseAPIURL,
  requestOAuthToken,
  getOAuthAuthorizationURL,
  BitbucketCloudAPIEndpoint,
  getBitbucketOAuthAuthorizationURL,
  requestOAuthTokenBitbucket,
  CodebergCloudAPIEndpoint,
  getCodebergOAuthAuthorizationURL,
  GitLabCloudAPIEndpoint,
  getGitLabOAuthAuthorizationURL,
  requestOAuthTokenCodeberg,
  requestOAuthTokenGitLab,
  GitLabApiPath,
  ForgejoApiPath,
  GitLabRequiredScopes,
  ForgejoRequiredScopes,
} from '../../lib/api'

import { APIError } from '../http'
import { TypedBaseStore } from './base-store'
import { generatePKCEParameters } from '../pkce'
import { IOAuthAction } from '../parse-app-url'
import { shell } from '../app-shell'
import noop from 'lodash/noop'
import { AccountsStore } from './accounts-store'
import { RepoType } from '../../models/github-repository'

/**
 * An enumeration of the possible steps that the sign in
 * store can be in save for the uninitialized state (null).
 */
export enum SignInStep {
  EndpointEntry = 'EndpointEntry',
  ExistingAccountWarning = 'ExistingAccountWarning',
  Authentication = 'Authentication',
  TokenEntry = 'TokenEntry',
  TwoFactorAuthentication = 'TwoFactorAuthentication',
  Success = 'Success',
}

/**
 * The union type of all possible states that the sign in
 * store can be in save the uninitialized state (null).
 */
export type SignInState =
  | IEndpointEntryState
  | IExistingAccountWarning
  | IAuthenticationState
  | ITokenEntryState
  | ISuccessState

/**
 * Base interface for shared properties between states
 */
export interface ISignInState {
  /**
   * The sign in step represented by this state
   */
  readonly kind: SignInStep

  /**
   * An error which, if present, should be presented to the
   * user in close proximity to the actions or input fields
   * related to the current step.
   */
  readonly error: Error | null

  /**
   * A value indicating whether or not the sign in store is
   * busy processing a request. While this value is true all
   * form inputs and actions save for a cancel action should
   * be disabled and the user should be made aware that the
   * sign in process is ongoing.
   */
  readonly loading: boolean

  readonly resultCallback: (result: SignInResult) => void
}

/**
 * State interface representing the endpoint entry step.
 * This is the initial step in the Enterprise sign in
 * flow and is not present when signing in to GitHub.com
 */
export interface IExistingAccountWarning extends ISignInState {
  readonly kind: SignInStep.ExistingAccountWarning
  /**
   * The URL to the host which we're currently authenticating
   * against. This will be either https://api.github.com when
   * signing in against GitHub.com or a user-specified
   * URL when signing in against a GitHub Enterprise
   * instance.
   */
  readonly existingAccount: Account
  readonly endpoint: string
  readonly apiType: AccountAPIType

  readonly resultCallback: (result: SignInResult) => void
}

/**
 * State interface representing the endpoint entry step.
 * This is the initial step in the Enterprise sign in
 * flow and is not present when signing in to GitHub.com
 */
export interface IEndpointEntryState extends ISignInState {
  readonly kind: SignInStep.EndpointEntry

  readonly apiType: 'enterprise' | SelfHostedApiType

  readonly resultCallback: (result: SignInResult) => void
}

/**
 * State interface representing the personal access token entry step, the
 * second step when signing in to a self-hosted instance.
 */
export interface ITokenEntryState extends ISignInState {
  readonly kind: SignInStep.TokenEntry

  /** The API endpoint of the instance, e.g. https://git.example.com/api/v4 */
  readonly endpoint: string

  /** The web root of the instance, e.g. https://git.example.com */
  readonly webBaseUrl: string

  /** The provider the instance is running. */
  readonly apiType: SelfHostedApiType

  readonly resultCallback: (result: SignInResult) => void
}

/**
 * State interface representing the Authentication step where
 * the user provides credentials and/or initiates a browser
 * OAuth sign in process. This step occurs as the first step
 * when signing in to GitHub.com and as the second step when
 * signing in to a GitHub Enterprise instance.
 */
export interface IAuthenticationState extends ISignInState {
  readonly kind: SignInStep.Authentication

  /**
   * The URL to the host which we're currently authenticating
   * against. This will be either https://api.github.com when
   * signing in against GitHub.com or a user-specified
   * URL when signing in against a GitHub Enterprise
   * instance.
   */
  readonly endpoint: string
  readonly apiType: AccountAPIType

  readonly resultCallback: (result: SignInResult) => void

  readonly oauthState?: {
    state: string
    codeVerifier: string
    endpoint: string
    oauthProvider: OAuthProvider
    onAuthCompleted: (account: Account) => void
    onAuthError: (error: Error) => void
  }
}

/**
 * Sentinel step representing a successful sign in process. Sign in
 * components may use this as a signal to dismiss the ongoing flow
 * or to show a message to the user indicating that they've been
 * successfully signed in.
 */
export interface ISuccessState {
  readonly kind: SignInStep.Success
  readonly resultCallback: (result: SignInResult) => void
}

interface IAuthenticationEvent {
  readonly account: Account
}

/** The third-party providers that users can host on their own instance. */
export type SelfHostedApiType = 'gitlab' | 'forgejo'

export const isSelfHostedApiType = (
  apiType: AccountAPIType
): apiType is SelfHostedApiType => apiType === 'gitlab' || apiType === 'forgejo'

/** The path each provider serves its REST API at, relative to the web root. */
const selfHostedApiPaths: Record<SelfHostedApiType, string> = {
  gitlab: GitLabApiPath,
  forgejo: ForgejoApiPath,
}

/** The name we show users for a self-hosted provider. */
export function friendlySelfHostedName(apiType: SelfHostedApiType) {
  switch (apiType) {
    case 'gitlab':
      return 'GitLab'
    case 'forgejo':
      return 'Forgejo'
    default:
      assertNever(apiType, `Unknown self-hosted API type ${apiType}`)
  }
}

/** The scopes a personal access token needs, per provider. */
export const selfHostedTokenScopes: Record<SelfHostedApiType, string[]> = {
  gitlab: GitLabRequiredScopes,
  forgejo: ForgejoRequiredScopes,
}

/** The page where the user creates a personal access token on their instance. */
export function getSelfHostedTokenSettingsURL(
  webBaseUrl: string,
  apiType: SelfHostedApiType
) {
  switch (apiType) {
    case 'gitlab':
      return `${webBaseUrl}/-/user_settings/personal_access_tokens/legacy/new`
    case 'forgejo':
      return `${webBaseUrl}/user/settings/applications/tokens/new`
    default:
      assertNever(apiType, `Unknown self-hosted API type ${apiType}`)
  }
}

/**
 * Validate and normalize the address of a self-hosted instance, returning its
 * web root (protocol, host and any explicit port, without a trailing slash).
 */
function parseSelfHostedInstanceURL(
  url: string,
  apiType: SelfHostedApiType
): string {
  const name = friendlySelfHostedName(apiType)

  // Assume https when the address doesn't name a scheme
  const trimmed = url.trim()
  const address =
    trimmed === '' || /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`

  let validUrl: string
  try {
    validUrl = validateURL(address)
  } catch (e) {
    if (e.name === InvalidURLErrorName) {
      throw new Error(
        `The ${name} instance address doesn't appear to be a valid URL. We're expecting something like https://git.example.com.`
      )
    } else if (e.name === InvalidProtocolErrorName) {
      throw new Error(
        `Unsupported protocol. Only https is supported when signing in to a self-hosted ${name} instance.`
      )
    }
    throw e
  }

  let parsed: URL
  try {
    parsed = new URL(validUrl)
  } catch {
    throw new Error(
      `The ${name} instance address doesn't appear to be a valid URL. We're expecting something like https://git.example.com.`
    )
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error(
      `The ${name} instance address must not contain a username or a password.`
    )
  }

  if (parsed.search !== '' || parsed.hash !== '') {
    throw new Error(
      `The ${name} instance address must not contain a query string or a fragment.`
    )
  }

  if (parsed.pathname.replace(/\/+/g, '') !== '') {
    throw new Error(
      `Only ${name} instances installed at the root of a host are supported, so the address can't contain a path. We're expecting something like https://git.example.com.`
    )
  }

  if (isGitHubHostname(parsed.hostname)) {
    throw new Error(
      `${parsed.hostname} is a GitHub address. Sign in to GitHub.com or to a GitHub Enterprise instance instead.`
    )
  }

  return `${parsed.protocol}//${parsed.host}`
}

const isGitHubHostname = (hostname: string) =>
  hostname === 'github.com' || hostname === 'api.github.com'

/** Turn an API failure from the token step into a user-facing message. */
function toTokenSignInError(
  e: any,
  apiType: SelfHostedApiType,
  endpoint: string,
  webBaseUrl: string
): Error {
  const name = friendlySelfHostedName(apiType)

  if (e instanceof APIError) {
    switch (e.responseStatus) {
      case 401:
        return new Error(
          `The personal access token was rejected by ${webBaseUrl}. Make sure it hasn't expired and that you copied it correctly.`
        )
      case 403: {
        const scopes = selfHostedTokenScopes[apiType].join(', ')
        return new Error(
          `The personal access token doesn't grant enough access. Create one with the scopes ${scopes}.`
        )
      }
      case 404:
        return new Error(
          `Couldn't find a ${name} API at ${endpoint}. Make sure the address points to a ${name} instance.`
        )
      default:
        return e
    }
  }

  if (e instanceof SyntaxError) {
    return new Error(`Could not sign in to ${webBaseUrl}. We received an invalid response from the API. Make sure the address is correct and the API is not protected by Anubis, Cloudflare, or similar security mechanisms.`)
  }

  return new Error(`Could not sign in to ${webBaseUrl}. ${e.message}`)
}

type OAuthProvider = RepoType

function apiTypeToOAuthProvider(apiType: AccountAPIType): OAuthProvider {
  switch (apiType) {
    case 'dotcom':
    case 'enterprise':
      return 'github'
    case 'bitbucket':
    case 'gitlab':
    case 'forgejo':
      return apiType
    default:
      return assertNever(apiType, `Unknown API type ${apiType}`)
  }
}

export type SignInResult =
  | { kind: 'success'; account: Account }
  | { kind: 'cancelled' }

/**
 * A store encapsulating all logic related to signing in a user
 * to GitHub.com, or a GitHub Enterprise instance.
 */
export class SignInStore extends TypedBaseStore<SignInState | null> {
  private state: SignInState | null = null

  private accounts: ReadonlyArray<Account> = []

  public constructor(private readonly accountStore: AccountsStore) {
    super()

    this.accountStore.getAll().then(accounts => {
      this.accounts = accounts
    })
    this.accountStore.onDidUpdate(accounts => {
      this.accounts = accounts
    })
  }

  private emitAuthenticate(account: Account) {
    const event: IAuthenticationEvent = { account }
    this.emitter.emit('did-authenticate', event)
    this.state?.resultCallback({ kind: 'success', account })
  }

  /**
   * Registers an event handler which will be invoked whenever
   * a user has successfully completed a sign-in process.
   */
  public onDidAuthenticate(fn: (account: Account) => void): Disposable {
    return this.emitter.on(
      'did-authenticate',
      ({ account }: IAuthenticationEvent) => {
        fn(account)
      }
    )
  }

  /**
   * Returns the current state of the sign in store or null if
   * no sign in process is in flight.
   */
  public getState(): SignInState | null {
    return this.state
  }

  /**
   * Update the internal state of the store and emit an update
   * event.
   */
  private setState(state: SignInState | null) {
    this.state = state
    this.emitUpdate(this.getState())
  }

  /**
   * Clear any in-flight sign in state and return to the
   * initial (no sign-in) state.
   */
  public reset() {
    const currentState = this.state
    this.state?.resultCallback({ kind: 'cancelled' })
    this.setState(null)

    if (currentState?.kind === SignInStep.Authentication) {
      currentState.oauthState?.onAuthError(new Error('cancelled'))
    }
  }

  /**
   * Initiate a sign in flow for github.com. This will put the store
   * in the Authentication step ready to receive user credentials.
   */
  public beginDotComSignIn(resultCallback?: (result: SignInResult) => void) {
    const endpoint = getDotComAPIEndpoint()

    if (this.state !== null) {
      this.reset()
    }

    this.setState({
      kind: SignInStep.Authentication,
      endpoint,
      apiType: 'dotcom',
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  /**
   * Initiate an OAuth sign in using the system configured browser.
   * This method must only be called when the store is in the authentication
   * step or an error will be thrown.
   */
  public async authenticateWithBrowser() {
    const currentState = this.state

    if (
      currentState?.kind !== SignInStep.Authentication &&
      currentState?.kind !== SignInStep.ExistingAccountWarning
    ) {
      const stepText = currentState ? currentState.kind : 'null'
      return fatalError(
        `Sign in step '${stepText}' not compatible with browser authentication`
      )
    }

    this.setState({ ...currentState, loading: true })

    if (currentState.kind === SignInStep.ExistingAccountWarning) {
      const { existingAccount } = currentState
      // Try to avoid emitting an error out of AccountsStore if the account
      // is already gone.
      if (this.accounts.find(x => x.endpoint === existingAccount.endpoint)) {
        await this.accountStore.removeAccount(existingAccount)
      }
    }

    const csrfToken = crypto.randomUUID()
    const { codeVerifier, codeChallenge } = await generatePKCEParameters()

    new Promise<Account>((resolve, reject) => {
      const { endpoint, apiType, resultCallback } = currentState
      log.info('[SignInStore] initializing OAuth flow')
      const oauthProvider = apiTypeToOAuthProvider(apiType)
      this.setState({
        kind: SignInStep.Authentication,
        endpoint,
        apiType,
        resultCallback,
        error: null,
        loading: true,
        oauthState: {
          oauthProvider,
          state: csrfToken,
          codeVerifier,
          endpoint,
          onAuthCompleted: resolve,
          onAuthError: reject,
        },
      })
      shell.openExternal(
        this.getOauthAuthorizationURL(
          oauthProvider,
          endpoint,
          csrfToken,
          codeChallenge
        )
      )
    })
      .then(account => {
        if (!this.state || this.state.kind !== SignInStep.Authentication) {
          // Looks like the sign in flow has been aborted
          log.warn('[SignInStore] account resolved but session has changed')
          return
        }

        log.info('[SignInStore] account resolved')
        this.emitAuthenticate(account)
        this.setState({
          kind: SignInStep.Success,
          resultCallback: this.state.resultCallback,
        })
      })
      .catch(e => {
        // Make sure we're still in the same sign in session
        if (
          this.state?.kind === SignInStep.Authentication &&
          this.state.oauthState?.state === csrfToken
        ) {
          log.info('[SignInStore] error with OAuth flow', e)
          this.setState({ ...this.state, error: e, loading: false })
        } else {
          log.info(`[SignInStore] OAuth error but session has changed: ${e}`)
        }
      })
  }

  private getOauthAuthorizationURL(
    oauthProvider: RepoType,
    endpoint: string,
    csrfToken: string,
    codeChallenge: string
  ): string {
    switch (oauthProvider) {
      case 'github':
        return getOAuthAuthorizationURL(endpoint, csrfToken, codeChallenge)
      case 'bitbucket':
        return getBitbucketOAuthAuthorizationURL(csrfToken, codeChallenge)
      case 'gitlab':
        return getGitLabOAuthAuthorizationURL(csrfToken, codeChallenge)
      case 'forgejo':
        return getCodebergOAuthAuthorizationURL(csrfToken, codeChallenge)
      default:
        assertNever(oauthProvider, 'Unexpected oauth provider')
    }
  }

  public async resolveOAuthRequest(action: IOAuthAction) {
    if (!this.state || this.state.kind !== SignInStep.Authentication) {
      return
    }

    if (!this.state.oauthState) {
      return
    }

    if (this.state.oauthState.state !== action.state) {
      log.warn(
        'requestAuthenticatedUser was not called with valid OAuth state. This is likely due to a browser reloading the callback URL. Contact GitHub Support if you believe this is an error'
      )
      return
    }

    const { endpoint, apiType } = this.state
    const tokenData = await this.getOauthTokenData(
      this.state.oauthState.oauthProvider,
      endpoint,
      action.code,
      this.state.oauthState.codeVerifier
    )

    if (tokenData) {
      const [token, refreshToken, expiresAt] = tokenData
      const account = await fetchUser(
        endpoint,
        apiType,
        token,
        refreshToken,
        expiresAt,
        UnknownLogin.InitialAuthFetch
      )
      this.state.oauthState.onAuthCompleted(account)
    } else {
      this.state.oauthState.onAuthError(
        new Error('Failed retrieving authenticated user')
      )
    }
  }

  private async getOauthTokenData(
    oauthProvider: OAuthProvider,
    endpoint: string,
    code: string,
    codeVerifier: string
  ) {
    switch (oauthProvider) {
      case 'github':
        return await requestOAuthToken(endpoint, code, codeVerifier)
      case 'bitbucket':
        return await requestOAuthTokenBitbucket(code, codeVerifier)
      case 'gitlab':
        return await requestOAuthTokenGitLab(code, codeVerifier)
      case 'forgejo':
        return await requestOAuthTokenCodeberg(code, codeVerifier)
      default:
        assertNever(oauthProvider, 'Unexpected oauth provider')
    }
  }

  /**
   * Initiate a sign in flow for a GitHub Enterprise instance.
   * This will put the store in the EndpointEntry step ready to
   * receive the url to the enterprise instance.
   */
  public beginEnterpriseSignIn(
    resultCallback?: (result: SignInResult) => void
  ) {
    if (this.state !== null) {
      this.reset()
    }

    this.setState({
      kind: SignInStep.EndpointEntry,
      apiType: 'enterprise',
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  /**
   * Initiate a sign in flow for a self-hosted instance of a third-party
   * provider. This will put the store in the EndpointEntry step ready to
   * receive the address of the instance.
   */
  public beginSelfHostedSignIn(
    apiType: SelfHostedApiType,
    resultCallback?: (result: SignInResult) => void
  ) {
    if (this.state !== null) {
      this.reset()
    }

    this.setState({
      kind: SignInStep.EndpointEntry,
      apiType,
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  public beginBitbucketSignIn(resultCallback?: (result: SignInResult) => void) {
    if (this.state !== null) {
      this.reset()
    }

    this.setState({
      kind: SignInStep.Authentication,
      endpoint: BitbucketCloudAPIEndpoint,
      apiType: 'bitbucket',
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  public beginGitLabSignIn(resultCallback?: (result: SignInResult) => void) {
    if (this.state !== null) {
      this.reset()
    }

    this.setState({
      kind: SignInStep.Authentication,
      endpoint: GitLabCloudAPIEndpoint,
      apiType: 'gitlab',
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  public beginCodebergSignIn(resultCallback?: (result: SignInResult) => void) {
    if (this.state !== null) {
      this.reset()
    }

    this.setState({
      kind: SignInStep.Authentication,
      endpoint: CodebergCloudAPIEndpoint,
      apiType: 'forgejo',
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  /**
   * Attempt to advance from the EndpointEntry step with the given endpoint
   * url. This method must only be called when the store is in the authentication
   * step or an error will be thrown.
   *
   * The provided endpoint url will be validated for syntactic correctness as
   * well as connectivity before the promise resolves. If the endpoint url is
   * invalid or the host can't be reached the promise will be rejected and the
   * sign in state updated with an error to be presented to the user.
   *
   * If validation is successful the store will advance to the authentication
   * step.
   */
  public async setEndpoint(url: string): Promise<void> {
    const currentState = this.state

    if (
      currentState?.kind !== SignInStep.EndpointEntry &&
      currentState?.kind !== SignInStep.ExistingAccountWarning
    ) {
      const stepText = currentState ? currentState.kind : 'null'
      return fatalError(
        `Sign in step '${stepText}' not compatible with endpoint entry`
      )
    }

    if (isSelfHostedApiType(currentState.apiType)) {
      return this.setSelfHostedEndpoint(url, currentState.apiType, currentState)
    }

    /**
     * If the user enters a github.com url in the GitHub Enterprise sign-in
     * flow we'll redirect them to the GitHub.com sign-in flow.
     */
    if (/^(?:https:\/\/)?(?:api\.)?github\.com($|\/)/.test(url)) {
      this.beginDotComSignIn(currentState.resultCallback)
      return
    }

    this.setState({ ...currentState, loading: true })

    let validUrl: string
    try {
      validUrl = validateURL(url)
    } catch (e) {
      let error = e
      if (e.name === InvalidURLErrorName) {
        error = new Error(
          `The GitHub Enterprise instance address doesn't appear to be a valid URL. We're expecting something like https://example.ghe.com.`
        )
      } else if (e.name === InvalidProtocolErrorName) {
        error = new Error(
          'Unsupported protocol. Only https is supported when authenticating with GitHub Enterprise instances.'
        )
      }

      this.setState({ ...currentState, loading: false, error })
      return
    }

    const endpoint = getEnterpriseAPIURL(validUrl)

    this.setState({
      kind: SignInStep.Authentication,
      endpoint,
      apiType: 'enterprise',
      error: null,
      loading: false,
      resultCallback: currentState.resultCallback,
    })
  }

  /**
   * Advance from the EndpointEntry step to the TokenEntry step for a
   * self-hosted instance, deriving the API endpoint from the address the user
   * entered and rejecting hosts that are already used by another provider.
   */
  private async setSelfHostedEndpoint(
    url: string,
    apiType: SelfHostedApiType,
    currentState: IEndpointEntryState | IExistingAccountWarning
  ): Promise<void> {
    this.setState({ ...currentState, loading: true, error: null })
    const loadingState = this.state

    let webBaseUrl: string
    try {
      webBaseUrl = parseSelfHostedInstanceURL(url, apiType)
    } catch (e) {
      this.setState({ ...currentState, loading: false, error: e })
      return
    }

    const endpoint = `${webBaseUrl}${selfHostedApiPaths[apiType]}`

    // Surface a host conflict here rather than after the user has gone and
    // created a token for us.
    const conflict = await this.accountStore.findApiTypeConflict(
      endpoint,
      apiType
    )

    if (this.state !== loadingState) {
      log.warn('[SignInStore] endpoint resolved but session has changed')
      return
    }

    if (conflict !== null) {
      this.setState({ ...currentState, loading: false, error: conflict })
      return
    }

    this.setState({
      kind: SignInStep.TokenEntry,
      endpoint,
      webBaseUrl,
      apiType,
      error: null,
      loading: false,
      resultCallback: currentState.resultCallback,
    })
  }

  /**
   * Attempt to complete a self-hosted sign in using the given personal access
   * token. This method must only be called when the store is in the token
   * entry step or an error will be thrown.
   */
  public async setToken(token: string): Promise<void> {
    const currentState = this.state

    if (currentState?.kind !== SignInStep.TokenEntry) {
      const stepText = currentState ? currentState.kind : 'null'
      return fatalError(
        `Sign in step '${stepText}' not compatible with token entry`
      )
    }

    const { endpoint, webBaseUrl, apiType, resultCallback } = currentState

    this.setState({ ...currentState, loading: true, error: null })
    const loadingState = this.state

    let account: Account
    try {
      account = await fetchUser(
        endpoint,
        apiType,
        token,
        '',
        0,
        UnknownLogin.InitialAuthFetch
      )
    } catch (e) {
      log.info('[SignInStore] personal access token sign in failed', e)

      if (this.state === loadingState) {
        this.setState({
          ...currentState,
          loading: false,
          error: toTokenSignInError(e, apiType, endpoint, webBaseUrl),
        })
      }
      return
    }

    if (this.state !== loadingState) {
      log.warn('[SignInStore] account resolved but session has changed')
      return
    }

    this.emitAuthenticate(account)
    this.setState({ kind: SignInStep.Success, resultCallback })
  }
}
