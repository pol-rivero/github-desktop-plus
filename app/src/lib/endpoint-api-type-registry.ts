/**
 * Mapps API endpoints of self-hosted third-party instances to their API type.
 *
 * The cloud endpoints and GitHub (dotcom/GHE/GHES) endpoints are not stored here,
 * only self-hosted endpoints. Unknown hosts continue to fall back to
 * GitHub Enterprise. Entries outlive account removal, because Owner records in the DB
 * may still reference the endpoint after the account is gone).
 */

const StorageKey = 'api-endpoint-types'

export type RegisteredApiType = 'bitbucket' | 'gitlab' | 'codeberg'

export function isRegisteredApiType(type: string): type is RegisteredApiType {
  return type === 'bitbucket' || type === 'gitlab' || type === 'codeberg'
}

let cache: Map<string, RegisteredApiType> | null = null
let cachedRaw: string | null = null

function parse(raw: string | null): Map<string, RegisteredApiType> {
  const map = new Map<string, RegisteredApiType>()
  try {
    for (const [endpoint, type] of Object.entries(JSON.parse(raw ?? '{}'))) {
      if (typeof type === 'string' && isRegisteredApiType(type)) {
        map.set(endpoint, type)
      }
    }
  } catch (e) {
    console.error('Failed to parse endpoint API type registry', e)
  }
  return map
}

/**
 * Every window runs its own renderer process, so the parsed map can't be
 * cached indefinitely because it can be modified by other windows.
 * Reads the raw string back on each lookup keeps windows in sync.
 */
function getCache(): Map<string, RegisteredApiType> {
  let raw: string | null

  try {
    raw = localStorage.getItem(StorageKey)
  } catch (e) {
    // Unavailable storage: return empty Map
    return (cache ??= new Map())
  }

  if (cache === null || raw !== cachedRaw) {
    cachedRaw = raw
    cache = parse(raw)
  }

  return cache
}

function persist(map: Map<string, RegisteredApiType>) {
  const raw = JSON.stringify(Object.fromEntries(map))
  try {
    localStorage.setItem(StorageKey, raw)
    cache = map
    cachedRaw = raw
  } catch (e) {
    console.error('Failed to persist endpoint API type registry', e)
    invalidateCache()
  }
}

function invalidateCache() {
  cache = null
  cachedRaw = null
}

function tryGetHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch (e) {
    return undefined
  }
}

/** Discard the in-memory cache. For testing purposes only. */
export function resetEndpointApiTypeRegistryForTesting() {
  invalidateCache()
}

/** Get the registered API type for an endpoint, if any (exact match). */
export function getRegisteredApiType(
  endpoint: string
): RegisteredApiType | undefined {
  return getCache().get(endpoint)
}

/**
 * Register the API type for a self-hosted third-party endpoint.
 *
 * Any existing entry for the same hostname is replaced (host may have
 * installed a different git server).
 */
export function registerEndpointApiType(
  endpoint: string,
  type: RegisteredApiType
): void {
  const map = getCache()
  const hostname = tryGetHostname(endpoint)
  let changed = false

  for (const existing of [...map.keys()]) {
    if (existing !== endpoint && tryGetHostname(existing) === hostname) {
      map.delete(existing)
      changed = true
    }
  }

  if (map.get(endpoint) !== type) {
    map.set(endpoint, type)
    changed = true
  }

  if (changed) {
    persist(map)
  }
}

/**
 * Remove any registered entries for the given hostname.
 */
export function unregisterHostname(hostname: string): void {
  const map = getCache()
  let changed = false

  for (const endpoint of [...map.keys()]) {
    if (tryGetHostname(endpoint) === hostname) {
      map.delete(endpoint)
      changed = true
    }
  }

  if (changed) {
    persist(map)
  }
}

/**
 * Reverse lookup: find the registered endpoint (+ its type) served from
 * the given hostname. Only root-installed instances are supported, so a
 * hostname-level match is unambiguous.
 */
export function findRegisteredEndpointForHostname(
  hostname: string
): { endpoint: string; type: RegisteredApiType } | undefined {
  for (const [endpoint, type] of getCache()) {
    if (tryGetHostname(endpoint) === hostname) {
      return { endpoint, type }
    }
  }
  return undefined
}
