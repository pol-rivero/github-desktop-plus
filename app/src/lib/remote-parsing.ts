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

// Examples:
// https://github.com/octocat/Hello-World.git
// https://github.com/octocat/Hello-World.git/
// git@github.com:octocat/Hello-World.git
// git:github.com/octocat/Hello-World.git
const remoteRegexes: ReadonlyArray<{ protocol: GitProtocol; regex: RegExp }> = [
  {
    protocol: 'https',
    regex: new RegExp(
      '^https?://(?:.+@)?(\\[[^\\]]+\\]|[^/:]+)(?::\\d+)?/(.+)/([^/]+?)(?:/|\\.git/?)?$'
    ),
  },
  {
    protocol: 'ssh',
    regex: new RegExp('^git@(.+):([^/]+)/([^/]+?)(?:/|\\.git)?$'),
  },
  {
    protocol: 'ssh',
    regex: new RegExp(
      '^(?:.+)@(.+\\.ghe\\.com):([^/]+)/([^/]+?)(?:/|\\.git)?$'
    ),
  },
  {
    protocol: 'ssh',
    regex: new RegExp('^git:(.+)/([^/]+)/([^/]+?)(?:/|\\.git)?$'),
  },
  {
    // Self-hosted SSH URLs like ssh://git@git.example.com:2222/owner/name.git
    // The port is matched but not captured: it's the SSH port, which
    // says nothing about the port the instance serves its web UI and API on.
    protocol: 'ssh',
    regex: new RegExp(
      '^ssh://git@(\\[[^\\]]+\\]|[^/:]+):\\d+/(.+)/(.+?)(?:/|\\.git)?$'
    ),
  },
  {
    protocol: 'ssh',
    regex: new RegExp('^ssh://git@(.+)/(.+)/(.+?)(?:/|\\.git)?$'),
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
