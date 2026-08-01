/**
 * Maps API endpoints of self-hosted third-party instances to their API type and
 * web root.
 *
 * The cloud endpoints and GitHub (dotcom/GHE/GHES) endpoints are not stored here,
 * only self-hosted endpoints. Unknown hosts continue to fall back to
 * GitHub Enterprise. Entries outlive account removal, because Owner records in the DB
 * may still reference the endpoint after the account is gone).
 *
 * Entries are keyed by the full API endpoint and carry the instance's web root
 * (`webBaseUrl`), so instances installed under a subpath
 * (`https://example.com/forgejo`) resolve back to their web URL instead of just
 * the origin.
 */

const StorageKey = 'api-endpoint-types'

export type RegisteredApiType = 'bitbucket' | 'gitlab' | 'forgejo'

export type RegisteredEndpoint = {
  readonly apiType: RegisteredApiType
  /** The instance's web root, without a trailing slash. */
  readonly webBaseUrl: string
}

export type RegisteredEndpointMatch = RegisteredEndpoint & {
  readonly endpoint: string
}

export function isRegisteredApiType(type: string): type is RegisteredApiType {
  return type === 'bitbucket' || type === 'gitlab' || type === 'forgejo'
}

/** The path each provider roots its REST API at, relative to the web root. */
const apiPathSuffixes: Record<RegisteredApiType, RegExp> = {
  bitbucket: /\/rest\/api\/[\d.]+$/,
  gitlab: /\/api\/v\d+$/,
  forgejo: /\/api\/v\d+$/,
}

const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, '')

/**
 * Derive an instance's web root from its API endpoint by stripping the
 * provider's API path, e.g. https://example.com/forgejo/api/v1 ->
 * https://example.com/forgejo
 */
export function deriveWebBaseUrl(
  endpoint: string,
  apiType: RegisteredApiType
): string {
  const trimmed = trimTrailingSlashes(endpoint)
  const webBaseUrl = trimmed.replace(apiPathSuffixes[apiType], '')
  return webBaseUrl.length > 0 ? webBaseUrl : trimmed
}

let cache: Map<string, RegisteredEndpoint> | null = null
let cachedRaw: string | null = null

function parseEntry(value: unknown): RegisteredEndpoint | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const { apiType, webBaseUrl } = value as Record<string, unknown>

  return typeof apiType === 'string' &&
    isRegisteredApiType(apiType) &&
    typeof webBaseUrl === 'string' &&
    webBaseUrl.length > 0
    ? { apiType, webBaseUrl: trimTrailingSlashes(webBaseUrl) }
    : undefined
}

function parse(raw: string | null): Map<string, RegisteredEndpoint> {
  const map = new Map<string, RegisteredEndpoint>()
  try {
    for (const [endpoint, value] of Object.entries(JSON.parse(raw ?? '{}'))) {
      const entry = parseEntry(value)
      if (entry !== undefined) {
        map.set(endpoint, entry)
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
function getCache(): Map<string, RegisteredEndpoint> {
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

function persist(map: Map<string, RegisteredEndpoint>) {
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

/** The host (hostname and any explicit port) of a URL, if it can be parsed. */
export function tryGetHost(url: string): string | undefined {
  try {
    return new URL(url).host
  } catch (e) {
    return undefined
  }
}

/**
 * Strip the port from a host. Operates on a host rather than a URL so that bare
 * hosts (such as the ones `parseRemote` returns) can be compared too.
 */
function hostnameOf(host: string): string {
  const colon = host.lastIndexOf(':')
  // For IPv6 literals:
  return colon > host.lastIndexOf(']') ? host.slice(0, colon) : host
}

/** Discard the in-memory cache. For testing purposes only. */
export function resetEndpointApiTypeRegistryForTesting() {
  invalidateCache()
}

/** Get the registry entry for an endpoint, if any (exact match). */
export function getRegisteredEndpoint(
  endpoint: string
): RegisteredEndpoint | undefined {
  return getCache().get(endpoint)
}

/** Get the registered API type for an endpoint, if any (exact match). */
export function getRegisteredApiType(
  endpoint: string
): RegisteredApiType | undefined {
  return getRegisteredEndpoint(endpoint)?.apiType
}

/**
 * Register the API type for a self-hosted third-party endpoint.
 *
 * `webBaseUrl` is the instance's web root; when omitted it's derived from the
 * endpoint by stripping the provider's API path.
 *
 * Any existing entry for the same host is replaced (the host may have installed
 * a different git server, or moved to a different API version). Entries for the
 * same hostname on a different port are left alone, since those are separate
 * instances.
 */
export function registerEndpointApiType(
  endpoint: string,
  apiType: RegisteredApiType,
  webBaseUrl?: string
): void {
  const map = getCache()
  const host = tryGetHost(endpoint)
  const entry: RegisteredEndpoint = {
    apiType,
    webBaseUrl:
      webBaseUrl !== undefined
        ? trimTrailingSlashes(webBaseUrl)
        : deriveWebBaseUrl(endpoint, apiType),
  }
  let changed = false

  for (const existing of [...map.keys()]) {
    if (existing !== endpoint && tryGetHost(existing) === host) {
      map.delete(existing)
      changed = true
    }
  }

  const current = map.get(endpoint)
  if (
    current?.apiType !== entry.apiType ||
    current?.webBaseUrl !== entry.webBaseUrl
  ) {
    map.set(endpoint, entry)
    changed = true
  }

  if (changed) {
    persist(map)
  }
}

/**
 * Remove any registered entries for the given host (hostname and any explicit
 * port).
 */
export function unregisterHost(host: string): void {
  const map = getCache()
  let changed = false

  for (const endpoint of [...map.keys()]) {
    if (tryGetHost(endpoint) === host) {
      map.delete(endpoint)
      changed = true
    }
  }

  if (changed) {
    persist(map)
  }
}

/**
 * Reverse lookup: find the registered endpoint served from the given host.
 *
 * An exact host (hostname and port) match wins. A host without a port also
 * matches an instance registered on a non-default port, because a remote SSH URL
 * doesn't necessarily carry the instance's web port.
 */
export function findRegisteredEndpointForHost(
  host: string | undefined
): RegisteredEndpointMatch | undefined {
  if (host === undefined) {
    return undefined
  }

  const hostname = hostnameOf(host)
  const hasPort = hostname !== host
  let hostnameMatch: RegisteredEndpointMatch | undefined = undefined

  for (const [endpoint, entry] of getCache()) {
    const endpointHost = tryGetHost(endpoint)
    if (endpointHost === undefined) {
      continue
    }

    if (endpointHost === host) {
      return { endpoint, ...entry }
    }

    if (
      !hasPort &&
      hostnameMatch === undefined &&
      hostnameOf(endpointHost) === hostname
    ) {
      hostnameMatch = { endpoint, ...entry }
    }
  }

  return hostnameMatch
}
