import * as Path from 'path'
import { getDocumentsPath } from './app-proxy'
import { Account } from '../../models/account'

const localStorageKey = 'last-clone-location'

/** The path to the default directory. */
export async function getDefaultDir(): Promise<string> {
  return (
    localStorage.getItem(localStorageKey) ||
    Path.join(await getDocumentsPath(), 'GitHub')
  )
}

export function setDefaultDir(path: string) {
  localStorage.setItem(localStorageKey, path)
}

function accountStorageKey(account: Account): string {
  return `${localStorageKey}-${account.endpoint}-${account.login}`
}

/**
 * The path to the default directory for the given account, falling back
 * to the global default when the account has no stored location.
 */
export async function getDefaultDirForAccount(
  account: Account | null
): Promise<string> {
  const accountDir = account
    ? localStorage.getItem(accountStorageKey(account))
    : null
  return accountDir || (await getDefaultDir())
}

/**
 * Store the last clone location for the given account, or the
 * global default when no account is provided.
 */
export function setDefaultDirForAccount(path: string, account: Account | null) {
  if (account !== null) {
    localStorage.setItem(accountStorageKey(account), path)
  } else {
    setDefaultDir(path)
  }
}
