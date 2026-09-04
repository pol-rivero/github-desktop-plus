import { setupEnvironment } from 'dugite'
import { execFile } from '../exec-file'
import { parseSSHRemote } from '../remote-parsing'

/**
 * Resolved host names keyed on the host exactly as written in the remote (ssh
 * matches `Host` entries case-sensitively). The promise rather than its result
 * is cached so concurrent lookups of the same host share a single `ssh`
 * invocation, and a null result is cached too: a missing or failing `ssh`
 * mustn't be spawned once per repository.
 */
const resolvedHosts = new Map<string, Promise<string | null>>()

/** The settled results of `resolvedHosts`, for the synchronous lookups. */
const settledHostNames = new Map<string, string | null>()

async function queryHostName(host: string): Promise<string | null> {
  // `ssh` would read a leading dash as an option rather than a destination.
  if (host.startsWith('-')) {
    return null
  }

  try {
    // git runs with dugite's environment, whose PATH on Windows leads to the
    // ssh bundled with the embedded git, so this finds the same ssh git uses.
    const { env } = setupEnvironment({})
    if (__WIN32__) {
      // git sets HOME for the ssh it spawns, and MinGit's ssh finds
      // ~/.ssh/config through it.
      env.HOME = env.HOME ?? process.env.USERPROFILE
    }

    // `ssh -G` prints the resolved configuration without connecting. Its error
    // messages go to stderr, so only stdout is parsed.
    const { stdout } = await execFile('ssh', ['-G', host], {
      env,
      timeout: 5000,
      windowsHide: true,
    })

    return /^hostname (\S+)/m.exec(stdout)?.[1] ?? null
  } catch (err) {
    log.debug(`Failed resolving the SSH configuration for '${host}'`, err)
    return null
  }
}

function resolveSSHHost(host: string): Promise<string | null> {
  const cached = resolvedHosts.get(host)
  if (cached !== undefined) {
    return cached
  }

  const resolved = queryHostName(host)
  resolvedHosts.set(host, resolved)
  resolved.then(hostname => settledHostNames.set(host, hostname))
  return resolved
}

/**
 * Rewrite a remote naming an SSH host into the `git@host:path` form naming the
 * host the user's SSH config resolves it to, so the rest of the app can match
 * a remote written against a `Host` alias with the account of the instance the
 * alias points at. A host that isn't an alias resolves to itself, so such a
 * remote merely comes back in `git@` form, which also gives a user-less
 * scp-like remote (`gitlab.example.com:group/repo.git`) a shape `parseRemote`
 * understands.
 *
 * Returns the URL unchanged when it names no SSH host or when the host
 * couldn't be resolved. Never rejects: callers treat it as a best-effort
 * refinement of the URL.
 */
export async function resolveSSHRemoteAlias(url: string): Promise<string> {
  const remote = parseSSHRemote(url)
  if (remote === null) {
    return url
  }

  const hostname = await resolveSSHHost(remote.host)
  return hostname === null ? url : `git@${hostname}:${remote.path}`
}

/**
 * The `git@host:path` form of a remote whose SSH host has already been
 * resolved by `resolveSSHRemoteAlias`, or null if it hasn't been (or couldn't
 * be). For the synchronous matching helpers, which compare a remote with the
 * clone URL of the repository that `resolveSSHRemoteAlias` matched it with.
 */
export function getResolvedSSHRemoteUrl(url: string): string | null {
  const remote = parseSSHRemote(url)
  if (remote === null) {
    return null
  }

  const hostname = settledHostNames.get(remote.host)
  return hostname == null ? null : `git@${hostname}:${remote.path}`
}

/** Forgets every resolved and in-flight host. */
export function resetResolvedSSHHostsForTesting(): void {
  resolvedHosts.clear()
  settledHostNames.clear()
}
