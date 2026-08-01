import { findRegisteredEndpointForHostname } from '../lib/endpoint-api-type-registry'
import { createEqualityHash } from './equality-hash'
import { Owner } from './owner'

export type GitHubRepositoryPermission = 'read' | 'write' | 'admin' | null

export type RepoType = 'github' | 'bitbucket' | 'gitlab' | 'forgejo'

/** A GitHub repository. */
export class GitHubRepository {
  /**
   * A hash of the properties of the object.
   *
   * Objects with the same hash are guaranteed to be structurally equal.
   */
  public readonly hash: string

  public constructor(
    public readonly name: string,
    public readonly type: RepoType,
    public readonly owner: Owner,
    public readonly login: string | null = null,
    /**
     * The ID of the repository in the app's local database. This is no relation
     * to the API ID.
     */
    public readonly dbID: number,
    public readonly isPrivate: boolean | null = null,
    public readonly htmlURL: string | null = null,
    public readonly cloneURL: string | null = null,
    public readonly issuesEnabled: boolean | null = null,
    public readonly isArchived: boolean | null = null,
    /** The user's permissions for this github repository. `null` if unknown. */
    public readonly permissions: GitHubRepositoryPermission = null,
    public readonly parent: GitHubRepository | null = null
  ) {
    this.hash = createEqualityHash(
      this.name,
      this.owner.login,
      this.login,
      this.dbID,
      this.isPrivate,
      this.htmlURL,
      this.cloneURL,
      this.issuesEnabled,
      this.isArchived,
      this.permissions,
      this.parent?.hash
    )
  }

  public get endpoint(): string {
    return this.owner.endpoint
  }

  /** Get the owner/name combo. */
  public get fullName(): string {
    return `${this.owner.login}/${this.name}`
  }

  /** Is the repository a fork? */
  public get fork(): boolean {
    return !!this.parent
  }

  public get loginForApi(): string {
    // If no login is set explicitly, assume we might be logged in as the repo owner
    return this.login ?? this.owner.login
  }
}

/**
 * Identical to `GitHubRepository`, except it **must** have a `parent`
 * (i.e it's a fork).
 *
 * See `isRepositoryWithForkedGitHubRepository`
 */
export type ForkedGitHubRepository = GitHubRepository & {
  readonly parent: GitHubRepository
  readonly fork: true
}

/**
 * Can the user push to this GitHub repository?
 *
 * (If their permissions are unknown, we assume they can.)
 */
export function hasWritePermission(
  gitHubRepository: GitHubRepository
): boolean {
  return (
    gitHubRepository.permissions === null ||
    gitHubRepository.permissions !== 'read'
  )
}

export function deduceRepositoryType(url: string): RepoType {
  try {
    const host = new URL(url).hostname
    if (host === 'bitbucket.org') {
      return 'bitbucket'
    } else if (host === 'gitlab.com') {
      return 'gitlab'
    } else if (host === 'codeberg.org') {
      return 'forgejo'
    }
    const registered = findRegisteredEndpointForHostname(host)
    if (registered !== undefined) {
      return registered.type
    }
    return 'github'
  } catch (e) {
    return 'github'
  }
}
