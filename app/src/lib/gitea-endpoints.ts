/**
 * Gitea is the first supported provider that lives on an arbitrary, user-supplied
 * host (GitHub.com/GitLab.com/Bitbucket.org are all fixed SaaS endpoints, and
 * GitHub Enterprise is detected via its `/api/v3` shape). We therefore can't
 * identify a Gitea endpoint by comparing it against a constant. Instead we keep a
 * small registry of the Gitea API endpoints the user has signed in to, persisted
 * in localStorage, and use it to answer the synchronous `isGitea` predicates that
 * the rest of the provider plumbing relies on.
 *
 * Note: this module is imported by `api.ts`, which runs in both the renderer and
 * the main process. `localStorage` only exists in the renderer, so every accessor
 * guards against it being undefined and treats the registry as empty in the main
 * process. That's safe because the main-process code paths (the git credential
 * helper) identify a Gitea host by matching a stored account's origin, not by
 * calling `isGitea`.
 */

const giteaEndpointsKey = 'gitea-endpoints'

const hasLocalStorage = () => typeof localStorage !== 'undefined'

/** The set of Gitea API endpoints (e.g. `https://git.example.com/api/v1`) the user has linked. */
export function getGiteaEndpoints(): ReadonlySet<string> {
  if (!hasLocalStorage()) {
    return new Set()
  }

  try {
    const raw = localStorage.getItem(giteaEndpointsKey)
    const parsed = raw === null ? [] : JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed) : new Set()
  } catch {
    return new Set()
  }
}

function saveGiteaEndpoints(endpoints: ReadonlySet<string>) {
  if (!hasLocalStorage()) {
    return
  }
  localStorage.setItem(giteaEndpointsKey, JSON.stringify([...endpoints]))
}

/** Remember that the given API endpoint belongs to a Gitea instance. */
export function addGiteaEndpoint(endpoint: string) {
  const endpoints = new Set(getGiteaEndpoints())
  endpoints.add(endpoint)
  saveGiteaEndpoints(endpoints)
}

/** Forget a previously linked Gitea API endpoint. */
export function removeGiteaEndpoint(endpoint: string) {
  const endpoints = new Set(getGiteaEndpoints())
  if (endpoints.delete(endpoint)) {
    saveGiteaEndpoints(endpoints)
  }
}

/** Whether the given API endpoint is a known Gitea instance. */
export function isGitea(endpoint: string): boolean {
  return getGiteaEndpoints().has(endpoint)
}

/** Whether the given hostname corresponds to a known Gitea instance. */
export function isGiteaHost(hostname: string): boolean {
  return getGiteaEndpointForHost(hostname) !== null
}

/**
 * Return the linked Gitea API endpoint served from the given hostname, or null if
 * none is known. Used to map a repository's remote host back to the API endpoint
 * (and therefore the signed-in account) it belongs to.
 */
export function getGiteaEndpointForHost(hostname: string): string | null {
  for (const endpoint of getGiteaEndpoints()) {
    try {
      if (new URL(endpoint).hostname === hostname) {
        return endpoint
      }
    } catch {
      // Ignore malformed entries.
    }
  }
  return null
}

/**
 * Compute the Gitea API endpoint for an instance's web URL. Gitea's REST API is
 * rooted at `<base>/api/v1`, where `<base>` is the instance URL including any
 * subpath the instance is hosted under (e.g. `https://example.com/gitea`).
 */
export function getGiteaAPIEndpoint(htmlUrl: string): string {
  const base = htmlUrl.replace(/\/+$/, '')
  return `${base}/api/v1`
}

/**
 * Compute the web URL for a Gitea API endpoint by stripping the `/api/v1` suffix.
 * The inverse of {@link getGiteaAPIEndpoint}.
 */
export function getGiteaHTMLURL(endpoint: string): string {
  return endpoint.replace(/\/api\/v1\/?$/, '')
}
