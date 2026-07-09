import { Disposable } from 'event-kit'
import { Account, UnknownLogin } from '../../models/account'
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
  getBitbucketAPIEndpoint,
  getBitbucketOAuthAuthorizationURL,
  requestOAuthTokenBitbucket,
  getCodebergAPIEndpoint,
  getCodebergOAuthAuthorizationURL,
  getGitLabAPIEndpoint,
  getGitLabOAuthAuthorizationURL,
  requestOAuthTokenCodeberg,
  requestOAuthTokenGitLab,
} from '../../lib/api'

import { TypedBaseStore } from './base-store'
import { IOAuthAction } from '../parse-app-url'
import { shell } from '../app-shell'
import noop from 'lodash/noop'
import { AccountsStore } from './accounts-store'
import { RepoType } from '../../models/github-repository'
import {
  addGiteaEndpoint,
  getGiteaAPIEndpoint,
  removeGiteaEndpoint,
} from '../gitea-endpoints'

/**
 * An enumeration of the possible steps that the sign in
 * store can be in save for the uninitialized state (null).
 */
export enum SignInStep {
  EndpointEntry = 'EndpointEntry',
  ExistingAccountWarning = 'ExistingAccountWarning',
  Authentication = 'Authentication',
  TwoFactorAuthentication = 'TwoFactorAuthentication',
  /** Gitea step 1: enter the self-hosted instance URL. */
  GiteaEndpointEntry = 'GiteaEndpointEntry',
  /** Gitea step 2: enter a personal access token for the resolved instance. */
  GiteaTokenEntry = 'GiteaTokenEntry',
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
  | IGiteaEndpointEntryState
  | IGiteaTokenEntryState
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

  readonly resultCallback: (result: SignInResult) => void
}

/**
 * State interface representing the endpoint entry step.
 * This is the initial step in the Enterprise sign in
 * flow and is not present when signing in to GitHub.com
 */
export interface IEndpointEntryState extends ISignInState {
  readonly kind: SignInStep.EndpointEntry
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

  readonly resultCallback: (result: SignInResult) => void

  readonly oauthState?: {
    state: string
    endpoint: string
    oauthProvider: OAuthProvider
    onAuthCompleted: (account: Account) => void
    onAuthError: (error: Error) => void
  }
}

/**
 * State interface representing the first step of the Gitea sign in flow, where
 * the user provides the URL of their self-hosted Gitea instance.
 */
export interface IGiteaEndpointEntryState extends ISignInState {
  readonly kind: SignInStep.GiteaEndpointEntry
  readonly resultCallback: (result: SignInResult) => void
}

/**
 * State interface representing the second step of the Gitea sign in flow, where
 * the user provides a personal access token for the (already resolved) instance.
 */
export interface IGiteaTokenEntryState extends ISignInState {
  readonly kind: SignInStep.GiteaTokenEntry

  /** The resolved Gitea API endpoint, e.g. `https://git.example.com/api/v1`. */
  readonly endpoint: string

  readonly resultCallback: (result: SignInResult) => void
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

type OAuthProvider = RepoType

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

    new Promise<Account>((resolve, reject) => {
      const { endpoint, resultCallback } = currentState
      log.info('[SignInStore] initializing OAuth flow')
      const oauthProvider = this.getOAuthProvider(endpoint)
      this.setState({
        kind: SignInStep.Authentication,
        endpoint,
        resultCallback,
        error: null,
        loading: true,
        oauthState: {
          oauthProvider,
          state: csrfToken,
          endpoint,
          onAuthCompleted: resolve,
          onAuthError: reject,
        },
      })
      shell.openExternal(
        this.getOauthAuthorizationURL(oauthProvider, endpoint, csrfToken)
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
    csrfToken: string
  ): string {
    switch (oauthProvider) {
      case 'github':
        return getOAuthAuthorizationURL(endpoint, csrfToken)
      case 'bitbucket':
        return getBitbucketOAuthAuthorizationURL(csrfToken)
      case 'gitlab':
        return getGitLabOAuthAuthorizationURL(csrfToken)
      case 'codeberg':
        return getCodebergOAuthAuthorizationURL(csrfToken)
      case 'gitea':
        // Gitea authenticates with a personal access token, not a browser OAuth
        // flow, so this code path is never reached for Gitea.
        return fatalError('Gitea does not use OAuth authorization')
      default:
        assertNever(oauthProvider, 'Unexpected oauth provider')
    }
  }

  private getOAuthProvider(endpoint: string): OAuthProvider {
    if (endpoint === getBitbucketAPIEndpoint()) {
      return 'bitbucket'
    } else if (endpoint === getGitLabAPIEndpoint()) {
      return 'gitlab'
    } else if (endpoint === getCodebergAPIEndpoint()) {
      return 'codeberg'
    } else {
      return 'github'
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

    const { endpoint } = this.state
    const tokenData = await this.getOauthTokenData(
      this.state.oauthState.oauthProvider,
      endpoint,
      action.code
    )

    if (tokenData) {
      const [token, refreshToken, expiresAt] = tokenData
      const account = await fetchUser(
        endpoint,
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
    code: string
  ) {
    switch (oauthProvider) {
      case 'github':
        return await requestOAuthToken(endpoint, code)
      case 'bitbucket':
        return await requestOAuthTokenBitbucket(code)
      case 'gitlab':
        return await requestOAuthTokenGitLab(code)
      case 'codeberg':
        return await requestOAuthTokenCodeberg(code)
      case 'gitea':
        // Gitea authenticates with a personal access token, not a browser OAuth
        // flow, so this code path is never reached for Gitea.
        return fatalError('Gitea does not use OAuth token exchange')
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
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  public beginBitbucketSignIn(resultCallback?: (result: SignInResult) => void) {
    if (this.state !== null) {
      this.reset()
    }

    const endpoint = getBitbucketAPIEndpoint()
    this.setState({
      kind: SignInStep.Authentication,
      endpoint,
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  public beginGitLabSignIn(resultCallback?: (result: SignInResult) => void) {
    if (this.state !== null) {
      this.reset()
    }

    const endpoint = getGitLabAPIEndpoint()
    this.setState({
      kind: SignInStep.Authentication,
      endpoint,
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  public beginCodebergSignIn(resultCallback?: (result: SignInResult) => void) {
    if (this.state !== null) {
      this.reset()
    }

    const endpoint = getCodebergAPIEndpoint()
    this.setState({
      kind: SignInStep.Authentication,
      endpoint,
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  /**
   * Initiate a sign in flow for a self-hosted Gitea instance. This puts the
   * store in the GiteaEndpointEntry step, ready to receive the instance URL.
   * Unlike the other providers Gitea authenticates with a personal access token
   * rather than a browser OAuth flow (each self-hosted instance has its own URL,
   * so no OAuth client id can be baked into the build).
   */
  public beginGiteaSignIn(resultCallback?: (result: SignInResult) => void) {
    if (this.state !== null) {
      this.reset()
    }

    this.setState({
      kind: SignInStep.GiteaEndpointEntry,
      error: null,
      loading: false,
      resultCallback: resultCallback ?? noop,
    })
  }

  /**
   * Advance from the GiteaEndpointEntry step with the given instance URL. The
   * URL is validated for syntactic correctness and, if valid, the store advances
   * to the GiteaTokenEntry step carrying the resolved `<url>/api/v1` endpoint.
   */
  public async setGiteaEndpoint(url: string): Promise<void> {
    const currentState = this.state

    if (currentState?.kind !== SignInStep.GiteaEndpointEntry) {
      const stepText = currentState ? currentState.kind : 'null'
      return fatalError(
        `Sign in step '${stepText}' not compatible with Gitea endpoint entry`
      )
    }

    this.setState({ ...currentState, loading: true })

    let validUrl: string
    try {
      validUrl = validateURL(url)
    } catch (e) {
      let error = e
      if (e.name === InvalidURLErrorName) {
        error = new Error(
          `The Gitea instance address doesn't appear to be a valid URL. We're expecting something like https://git.example.com.`
        )
      } else if (e.name === InvalidProtocolErrorName) {
        error = new Error(
          'Unsupported protocol. Only https is supported when authenticating with Gitea instances.'
        )
      }

      this.setState({ ...currentState, loading: false, error })
      return
    }

    const endpoint = getGiteaAPIEndpoint(validUrl)

    this.setState({
      kind: SignInStep.GiteaTokenEntry,
      endpoint,
      error: null,
      loading: false,
      resultCallback: currentState.resultCallback,
    })
  }

  /**
   * Complete the Gitea sign in flow by validating the given personal access
   * token against the resolved instance endpoint. On success the account is
   * added; on failure the (optimistically-registered) endpoint is removed and
   * an error is surfaced.
   */
  public async authenticateWithGiteaToken(token: string): Promise<void> {
    const currentState = this.state

    if (currentState?.kind !== SignInStep.GiteaTokenEntry) {
      const stepText = currentState ? currentState.kind : 'null'
      return fatalError(
        `Sign in step '${stepText}' not compatible with Gitea token entry`
      )
    }

    const { endpoint, resultCallback } = currentState
    this.setState({ ...currentState, loading: true, error: null })

    // Register the endpoint before fetching so that `fetchUser` recognises it as
    // a Gitea endpoint and constructs a GiteaAPI client.
    addGiteaEndpoint(endpoint)

    try {
      const account = await fetchUser(
        endpoint,
        token,
        '',
        0,
        UnknownLogin.InitialAuthFetch
      )

      if (this.state?.kind !== SignInStep.GiteaTokenEntry) {
        // The sign in flow has been aborted or replaced.
        log.warn('[SignInStore] Gitea account resolved but session has changed')
        return
      }

      log.info('[SignInStore] Gitea account resolved')
      this.emitAuthenticate(account)
      this.setState({ kind: SignInStep.Success, resultCallback })
    } catch (e) {
      removeGiteaEndpoint(endpoint)
      log.info('[SignInStore] error signing in to Gitea', e)

      if (this.state?.kind === SignInStep.GiteaTokenEntry) {
        this.setState({
          ...currentState,
          loading: false,
          error: new Error(
            'Failed to sign in to Gitea. Check that the server URL is correct and that your personal access token is valid.'
          ),
        })
      }
    }
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
      error: null,
      loading: false,
      resultCallback: currentState.resultCallback,
    })
  }
}
