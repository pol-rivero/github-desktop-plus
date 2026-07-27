import { Account } from '../../models/account'
import { IGitAccount } from '../../models/git-account'
import { API } from '../api'

/**
 * Username that Bitbucket requires for HTTP basic auth when the password is an
 * OAuth access token. See
 * https://developer.atlassian.com/cloud/bitbucket/rest/intro/#repository-object-and-uuid
 */
const BitbucketOAuthUsername = 'x-token-auth'

/**
 * Username that GitLab requires for HTTP basic auth when the password is an
 * OAuth access token. See
 * https://docs.gitlab.com/api/oauth2/#access-git-over-https-with-access-token
 */
const GitLabOAuthUsername = 'oauth2'

/**
 * Convert an account into the credentials git should use for HTTPS operations
 * against that account's host.
 *
 * GitHub (and GHE) accepts `login:token`, but the third-party providers
 * require a specific username when authenticating with an OAuth access token.
 * Additionally, third-party OAuth access tokens are short-lived, so refresh
 * them if needed before handing them to git: unlike API requests, git
 * operations may happen after a long idle period without anything else having
 * triggered a refresh.
 */
export async function accountToGitCredential(
  account: Account
): Promise<IGitAccount> {
  switch (account.apiType) {
    case 'bitbucket':
      return {
        login: BitbucketOAuthUsername,
        endpoint: account.endpoint,
        token: await getFreshToken(account),
      }
    case 'gitlab':
      return {
        login: GitLabOAuthUsername,
        endpoint: account.endpoint,
        token: await getFreshToken(account),
      }
    case 'codeberg':
      return {
        login: account.login,
        endpoint: account.endpoint,
        token: await getFreshToken(account),
      }
    default:
      return account
  }
}

async function getFreshToken(account: Account): Promise<string> {
  try {
    return await API.fromAccount(account).ensureFreshToken()
  } catch (e) {
    log.warn(`Could not refresh token for ${account.login}`, e)
    return account.token
  }
}

/**
 * Origins (per trampoline session) for which the credential handed to git
 * came from one of the user's signed-in accounts.
 *
 * Account tokens (in particular the short-lived OAuth access tokens of
 * third-party accounts) must not be persisted to the generic credential
 * store: they expire quickly and the account itself is their source of
 * truth. Git echoes the credential back on `store`/`erase` without saying
 * where it came from, so we record the origin when handing the credential
 * out and skip those callbacks when it's set. Keyed by origin rather than
 * the full credential url because git may report a different username (the
 * provider-specific OAuth username) than the one it asked with.
 */
const accountCredentialOrigins = new Map<string, Set<string>>()

/**
 * Remember that the credential provided to git for this url during the given
 * trampoline session came from one of the user's signed-in accounts.
 */
export function rememberAccountCredential(
  trampolineToken: string,
  credentialUrl: URL
) {
  const origins = accountCredentialOrigins.get(trampolineToken)
  if (origins) {
    origins.add(credentialUrl.origin)
  } else {
    accountCredentialOrigins.set(
      trampolineToken,
      new Set([credentialUrl.origin])
    )
  }
}

/**
 * Whether the credential for this url was provided from one of the user's
 * signed-in accounts during the given trampoline session.
 */
export function isAccountCredential(
  trampolineToken: string,
  credentialUrl: URL
) {
  return (
    accountCredentialOrigins.get(trampolineToken)?.has(credentialUrl.origin) ??
    false
  )
}

/** Drop all state recorded for the given trampoline session. */
export function forgetAccountCredentials(trampolineToken: string) {
  accountCredentialOrigins.delete(trampolineToken)
}
