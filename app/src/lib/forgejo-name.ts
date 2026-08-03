import { Account } from '../models/account'
import { isCodebergCloud } from './endpoint-capabilities'

/**
 * The name to show users for the Forgejo instance served at `endpoint`.
 */
export function getForgejoName(endpoint: string | null | undefined): string {
  return endpoint && isCodebergCloud(endpoint) ? 'Codeberg' : 'Forgejo'
}

/**
 * The name to show users for a group of Forgejo accounts, such as the
 * tab title in the clone repository dialog.
 */
export function getForgejoNameForAccounts(
  forgejoAccounts: ReadonlyArray<Account>
): string {
  return forgejoAccounts.every(a => isCodebergCloud(a.endpoint))
    ? 'Codeberg'
    : 'Forgejo'
}
