import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  matchGitHubRepository,
  urlMatchesRemote,
  urlMatchesCloneURL,
} from '../../src/lib/repository-matching'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import {
  registerEndpointApiType,
  resetEndpointApiTypeRegistryForTesting,
} from '../../src/lib/endpoint-api-type-registry'

describe('repository-matching', () => {
  describe('matchGitHubRepository', () => {
    it('matches HTTPS URLs', () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://api.github.com',
          'dotcom',
          '',
          '',
          0,
          [],
          '',
          1,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo.git',
        null
      )
      assert(repo !== null)
      assert.equal(repo.name, 'somerepo')
      assert.equal(repo.owner, 'someuser')
    })

    it('matches HTTPS URLs without the git extension', () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://api.github.com',
          'dotcom',
          '',
          '',
          0,
          [],
          '',
          1,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo',
        null
      )
      assert(repo !== null)
      assert.equal(repo.name, 'somerepo')
      assert.equal(repo.owner, 'someuser')
    })

    it('matches git URLs', () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://api.github.com',
          'dotcom',
          '',
          '',
          0,
          [],
          '',
          1,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'git:github.com/someuser/somerepo.git',
        null
      )
      assert(repo !== null)
      assert.equal(repo.name, 'somerepo')
      assert.equal(repo.owner, 'someuser')
    })

    it('matches SSH URLs', () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://api.github.com',
          'dotcom',
          '',
          '',
          0,
          [],
          '',
          1,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'git@github.com:someuser/somerepo.git',
        null
      )
      assert(repo !== null)
      assert.equal(repo.name, 'somerepo')
      assert.equal(repo.owner, 'someuser')
    })

    it('prefers the account whose login matches the remote owner when login is null', () => {
      const accounts = [
        new Account(
          'firstaccount',
          'https://api.github.com',
          'dotcom',
          '',
          '',
          0,
          [],
          '',
          1,
          '',
          'free'
        ),
        new Account(
          'someuser',
          'https://api.github.com',
          'dotcom',
          '',
          '',
          0,
          [],
          '',
          2,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo.git',
        null
      )
      assert(repo !== null)
      assert.equal(repo.account.login, 'someuser')
    })

    it('falls back to first hostname match when no account matches the remote owner', () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://api.github.com',
          'dotcom',
          '',
          '',
          0,
          [],
          '',
          1,
          '',
          'free'
        ),
        new Account(
          'cbabbage',
          'https://api.github.com',
          'dotcom',
          '',
          '',
          0,
          [],
          '',
          2,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo.git',
        null
      )
      assert(repo !== null)
      assert.equal(repo.account.login, 'alovelace')
    })

    it(`doesn't match if there aren't any users with that endpoint`, () => {
      const accounts = [
        new Account(
          'alovelace',
          'https://github.babbageinc.com',
          'enterprise',
          '',
          '',
          0,
          [],
          '',
          1,
          '',
          'free'
        ),
      ]
      const repo = matchGitHubRepository(
        accounts,
        'https://github.com/someuser/somerepo.git',
        null
      )
      assert(repo === null)
    })
  })

  it('picks the account whose port matches the remote', () => {
    const accounts = [
      new Account(
        'gl-user',
        'https://git.example.com:8443/api/v4',
        'gitlab',
        '',
        '',
        0,
        [],
        '',
        1,
        '',
        'free'
      ),
      new Account(
        'fj-user',
        'https://git.example.com:3000/api/v1',
        'forgejo',
        '',
        '',
        0,
        [],
        '',
        2,
        '',
        'free'
      ),
    ]
    registerEndpointApiType('https://git.example.com:8443/api/v4', 'gitlab')
    registerEndpointApiType('https://git.example.com:3000/api/v1', 'forgejo')

    try {
      assert.equal(
        matchGitHubRepository(
          accounts,
          'https://git.example.com:3000/someuser/somerepo.git',
          null
        )?.account.login,
        'fj-user'
      )
      assert.equal(
        matchGitHubRepository(
          accounts,
          'https://git.example.com:8443/someuser/somerepo.git',
          null
        )?.account.login,
        'gl-user'
      )
    } finally {
      localStorage.removeItem('api-endpoint-types')
      resetEndpointApiTypeRegistryForTesting()
    }
  })

  it('matches an ssh remote to a ported instance, ignoring the ssh port', () => {
    const accounts = [
      new Account(
        'fj-user',
        'https://git.example.com:3000/api/v1',
        'forgejo',
        '',
        '',
        0,
        [],
        '',
        1,
        '',
        'free'
      ),
    ]
    registerEndpointApiType('https://git.example.com:3000/api/v1', 'forgejo')

    try {
      // The ssh port (2222) is unrelated to the instance's web port (3000)
      const repo = matchGitHubRepository(
        accounts,
        'ssh://git@git.example.com:2222/someuser/somerepo.git',
        null
      )
      assert(repo !== null)
      assert.equal(repo.account.login, 'fj-user')
      assert.equal(repo.owner, 'someuser')
      assert.equal(repo.name, 'somerepo')
    } finally {
      localStorage.removeItem('api-endpoint-types')
      resetEndpointApiTypeRegistryForTesting()
    }
  })

  describe('urlMatchesRemote', () => {
    describe('with HTTPS remote', () => {
      const remote = {
        name: 'origin',
        url: 'https://github.com/shiftkey/desktop',
      }
      const remoteWithSuffix = {
        name: 'origin',
        url: 'https://github.com/shiftkey/desktop.git',
      }

      it('does not match null', () => {
        assert(!urlMatchesRemote(null, remoteWithSuffix))
      })

      it('matches cloneURL from API', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        assert(urlMatchesRemote(cloneURL, remoteWithSuffix))
      })

      it('matches cloneURL from API with different casing', () => {
        const cloneURL = 'https://GITHUB.COM/SHIFTKEY/DESKTOP.git'
        assert(urlMatchesRemote(cloneURL, remoteWithSuffix))
      })

      it('matches cloneURL from API without suffix', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        assert(urlMatchesRemote(cloneURL, remote))
      })

      it('matches htmlURL from API', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        assert(urlMatchesRemote(htmlURL, remoteWithSuffix))
      })

      it('matches htmlURL from API with different casing', () => {
        const htmlURL = 'https://GITHUB.COM/SHIFTKEY/DESKTOP'
        assert(urlMatchesRemote(htmlURL, remoteWithSuffix))
      })

      it('matches htmlURL from API without suffix', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        assert(urlMatchesRemote(htmlURL, remote))
      })
    })

    describe('with SSH remote', () => {
      const remote = {
        name: 'origin',
        url: 'git@github.com:shiftkey/desktop.git',
      }
      it('does not match null', () => {
        assert(!urlMatchesRemote(null, remote))
      })

      it('matches cloneURL from API', () => {
        const cloneURL = 'https://github.com/shiftkey/desktop.git'
        assert(urlMatchesRemote(cloneURL, remote))
      })

      it('matches htmlURL from API', () => {
        const htmlURL = 'https://github.com/shiftkey/desktop'
        assert(urlMatchesRemote(htmlURL, remote))
      })
    })
  })

  describe('cloneUrlMatches', () => {
    const repository = gitHubRepoFixture({
      name: 'desktop',
      owner: 'shiftkey',
      isPrivate: false,
    })

    const repositoryWithoutCloneURL: GitHubRepository = {
      dbID: 1,
      name: 'desktop',
      type: 'github',
      fullName: 'shiftkey/desktop',
      cloneURL: null,
      owner: {
        login: 'shiftkey',
        id: 1234,
        endpoint: 'https://api.github.com/',
      },
      isPrivate: false,
      htmlURL: 'https://github.com/shiftkey/desktop',
      parent: null,
      endpoint: 'https://api.github.com/',
      fork: true,
      login: 'shiftkey',
      loginForApi: 'shiftkey',
      hash: 'whatever',
      issuesEnabled: true,
      isArchived: false,
      permissions: null,
    }

    it('returns true for exact match', () => {
      assert.equal(
        urlMatchesCloneURL(
          'https://github.com/shiftkey/desktop.git',
          repository
        ),
        true
      )
    })

    it(`returns true when URL doesn't have a .git suffix`, () => {
      assert.equal(
        urlMatchesCloneURL('https://github.com/shiftkey/desktop', repository),
        true
      )
    })

    it(`returns false when URL belongs to a different owner`, () => {
      assert.equal(
        urlMatchesCloneURL(
          'https://github.com/outofambit/desktop.git',
          repository
        ),
        false
      )
    })

    it(`returns false if GitHub repository does't have a cloneURL set`, () => {
      assert.equal(
        urlMatchesCloneURL(
          'https://github.com/shiftkey/desktop',
          repositoryWithoutCloneURL
        ),
        false
      )
    })
  })
})
