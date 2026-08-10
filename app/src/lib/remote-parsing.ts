export type GitProtocol = 'ssh' | 'https'

interface IGitRemoteURL {
  readonly protocol: GitProtocol

  /** The hostname of the remote. */
  readonly hostname: string

  /**
   * Port the instance serves its web UI and API on. Null for ssh remotes.
   */
  readonly port: string | null

  /**
   * The owner of the GitHub repository. This will be null if the URL doesn't
   * take the form of a GitHub repository URL (e.g., owner/name).
   */
  readonly owner: string

  /**
   * The name of the GitHub repository. This will be null if the URL doesn't
   * take the form of a GitHub repository URL (e.g., owner/name).
   */
  readonly name: string
}

// A hostname, either an IPv6 literal in brackets or anything that isn't a path
// or port separator.
const hostnamePattern = '(\\[[^\\]]+\\]|[^/:]+)'

// The owner, followed by the repository name. The owner is allowed to span
// several path components, since a repository can live in a nested group.
const ownerAndNamePattern = '(.+)/([^/]+?)'

// The optional `.git` and/or trailing slash.
const gitSuffixPattern = '(?:\\.git)?/?'

// Examples:
// https://github.com/octocat/Hello-World.git
// https://github.com/octocat/Hello-World.git/
// git@github.com:octocat/Hello-World.git
// git:github.com/octocat/Hello-World.git
// git@gitlab.example.com:group/subgroup/Hello-World.git
const remoteRegexes: ReadonlyArray<{ protocol: GitProtocol; regex: RegExp }> = [
  {
    protocol: 'https',
    regex: new RegExp(
      `^https?://(?:.+@)?${hostnamePattern}(?::\\d+)?/${ownerAndNamePattern}${gitSuffixPattern}$`
    ),
  },
  {
    protocol: 'ssh',
    regex: new RegExp(
      `^git@${hostnamePattern}:${ownerAndNamePattern}${gitSuffixPattern}$`
    ),
  },
  {
    protocol: 'ssh',
    regex: new RegExp(
      `^(?:.+)@(.+\\.ghe\\.com):${ownerAndNamePattern}${gitSuffixPattern}$`
    ),
  },
  {
    protocol: 'ssh',
    regex: new RegExp(
      `^git:(?://)?${hostnamePattern}/${ownerAndNamePattern}${gitSuffixPattern}$`
    ),
  },
  {
    // Self-hosted SSH URLs like ssh://git@git.example.com:2222/owner/name.git
    // The port is matched but not captured: it's the SSH port, which
    // says nothing about the port the instance serves its web UI and API on.
    protocol: 'ssh',
    regex: new RegExp(
      `^ssh://git@${hostnamePattern}:\\d+/${ownerAndNamePattern}${gitSuffixPattern}$`
    ),
  },
  {
    protocol: 'ssh',
    regex: new RegExp(
      `^ssh://git@${hostnamePattern}/${ownerAndNamePattern}${gitSuffixPattern}$`
    ),
  },
]

function parseWebPort(url: string): string | null {
  try {
    return new URL(url).port || null
  } catch (e) {
    return null
  }
}

/** Parse the remote information from URL. */
export function parseRemote(url: string): IGitRemoteURL | null {
  for (const { protocol, regex } of remoteRegexes) {
    const match = regex.exec(url)
    if (match !== null && match.length >= 4) {
      return {
        protocol,
        hostname: match[1],
        port: protocol === 'https' ? parseWebPort(url) : null,
        owner: match[2],
        name: match[3],
      }
    }
  }

  return null
}

export function asHost(remote: IGitRemoteURL): string {
  return remote.port === null
    ? remote.hostname
    : `${remote.hostname}:${remote.port}`
}

export interface IRepositoryIdentifier {
  readonly hostname: string | null
  readonly owner: string
  readonly name: string
}

/**
 * Extracts a safe single-component directory name from a URL-derived repo name.
 *
 * Mirrors the approach of git's `git_url_basename()` in `dir.c`: treat `/`,
 * `\`, and `:` as path separators, take the last non-empty component, strip a
 * trailing `.git` suffix, and reject traversal segments. This ensures the
 * result is always a single path component that cannot escape the parent
 * directory when passed to `Path.join()`.
 *
 * Examples:
 *  - `"Hello-World"` → `"Hello-World"` (unchanged)
 *  - `"desktop.git/../../otherdir"` → `"otherdir"` (last component, traversal segments skipped)
 *  - `".."` → `null` (traversal-only name rejected)
 *
 * See: https://github.com/git/git/blob/master/dir.c (`git_url_basename`)
 */
export function sanitizeCloneName(name: string): string | null {
  const components = name.split(/[/\\:]/)

  let lastComponent = ''
  for (let i = components.length - 1; i >= 0; i--) {
    if (components[i].length > 0) {
      lastComponent = components[i]
      break
    }
  }

  if (lastComponent.length === 0) {
    return null
  }

  if (lastComponent.endsWith('.git')) {
    lastComponent = lastComponent.slice(0, -4)
  }

  if (
    lastComponent === '..' ||
    lastComponent === '.' ||
    lastComponent.length === 0
  ) {
    return null
  }

  return lastComponent
}

/** Try to parse an owner and name from a URL or owner/name shortcut. */
export function parseRepositoryIdentifier(
  url: string
): IRepositoryIdentifier | null {
  const parsed = parseRemote(url)
  // If we can parse it as a remote URL, we'll assume they gave us a proper
  // URL. If not, we'll try treating it as a GitHub repository owner/name
  // shortcut.
  if (parsed) {
    const { owner, name, hostname } = parsed
    if (owner && name) {
      return { owner, name, hostname }
    }
  }

  const pieces = url.split('/')
  if (pieces.length === 2 && pieces[0].length > 0 && pieces[1].length > 0) {
    const owner = pieces[0]
    const name = pieces[1]
    return { owner, name, hostname: null }
  }

  return null
}
