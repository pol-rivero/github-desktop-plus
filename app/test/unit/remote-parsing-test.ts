import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseRemote } from '../../src/lib/remote-parsing'

describe('URL remote parsing', () => {
  it('parses HTTPS URLs with a trailing git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses HTTPS URLs with a trailing -git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo-git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo-git')
  })

  it('parses HTTPS URLs with a trailing -git and .git suffixes', () => {
    const remote = parseRemote('https://github.com/hubot/repo-git.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo-git')
  })

  it('parses HTTPS URLs without a trailing git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses HTTPS URLs with a trailing slash', () => {
    const remote = parseRemote('https://github.com/hubot/repo/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses HTTPS URLs with a trailing slash after the git suffix', () => {
    const remote = parseRemote('https://github.com/hubot/repo.git/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses HTTPS URLs which include a username', () => {
    const remote = parseRemote('https://monalisa@github.com/hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses HTTPS URLs with a non-default port', () => {
    const remote = parseRemote('https://git.example.com:3000/hubot/repo.git')
    assert(remote !== null)
    // The port is reported separately rather than in the hostname: resolving the
    // provider needs it, comparing two URLs of one repository must ignore it.
    assert.equal(remote.hostname, 'git.example.com')
    assert.equal(remote.port, '3000')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses IPv6 URLs with a non-default port', () => {
    const remote = parseRemote('https://[2001:db8::1]:3000/hubot/repo.git')
    assert(remote !== null)
    // The port is reported separately rather than in the hostname: resolving the
    // provider needs it, comparing two URLs of one repository must ignore it.
    assert.equal(remote.hostname, '[2001:db8::1]')
    assert.equal(remote.port, '3000')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('reports no port for HTTPS URLs on the default port', () => {
    assert.equal(parseRemote('https://github.com/hubot/repo.git')?.port, null)
    // An explicit :443 is the same instance as no port at all
    assert.equal(
      parseRemote('https://github.com:443/hubot/repo.git')?.port,
      null
    )
  })

  it('parses SSH URLs', () => {
    const remote = parseRemote('git@github.com:hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with custom username', () => {
    const remote = parseRemote('niik@niik.ghe.com:hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'niik.ghe.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs without the git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs without the git suffix but with -git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo-git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo-git')
  })

  it('parses SSH URLs with the .git suffix and -git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo-git.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo-git')
  })

  it('parses SSH URLs with a trailing slash', () => {
    const remote = parseRemote('git@github.com:hubot/repo/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with a trailing slash after the git suffix', () => {
    const remote = parseRemote('git@github.com:hubot/repo.git/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses git URLs', () => {
    const remote = parseRemote('git:github.com/hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses git URLs without the git suffix', () => {
    const remote = parseRemote('git:github.com/hubot/repo')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses git URLs with a trailing slash', () => {
    const remote = parseRemote('git:github.com/hubot/repo/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with the ssh prefix', () => {
    const remote = parseRemote('ssh://git@github.com/hubot/repo')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with the ssh prefix and trailing slash', () => {
    const remote = parseRemote('ssh://git@github.com/hubot/repo/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with the ssh prefix and a trailing slash after the git suffix', () => {
    const remote = parseRemote('ssh://git@github.com/hubot/repo.git/')
    assert(remote !== null)
    assert.equal(remote.hostname, 'github.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with the ssh prefix and a non-default port', () => {
    const remote = parseRemote('ssh://git@git.example.com:2222/hubot/repo.git')
    assert(remote !== null)
    // The SSH port says nothing about the port the instance serves its web UI
    // and API on, so it's neither kept in the hostname nor reported as a port.
    assert.equal(remote.hostname, 'git.example.com')
    assert.equal(remote.port, null)
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with an IPv6 host', () => {
    const remote = parseRemote('ssh://git@[2001:db8::1]/hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, '[2001:db8::1]')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with an IPv6 host and a non-default port', () => {
    const remote = parseRemote('ssh://git@[2001:db8::1]:2222/hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, '[2001:db8::1]')
    assert.equal(remote.port, null)
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  // Nested groups (GitLab subgroups, Bitbucket projects) mean the owner can
  // span more than one path component, whichever form the remote takes.
  it('parses HTTPS URLs of a repository in a nested group', () => {
    const remote = parseRemote('https://gitlab.example.com/group/sub/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'gitlab.example.com')
    assert.equal(remote.owner, 'group/sub')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs of a repository in a nested group', () => {
    const remote = parseRemote('git@gitlab.example.com:group/sub/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'gitlab.example.com')
    assert.equal(remote.owner, 'group/sub')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with the ssh prefix of a repository in a nested group', () => {
    const remote = parseRemote(
      'ssh://git@gitlab.example.com/group/sub/repo.git'
    )
    assert(remote !== null)
    // The group must not be swallowed by the hostname
    assert.equal(remote.hostname, 'gitlab.example.com')
    assert.equal(remote.owner, 'group/sub')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with a non-default port of a repository in a nested group', () => {
    const remote = parseRemote(
      'ssh://git@gitlab.example.com:2222/group/sub/repo.git'
    )
    assert(remote !== null)
    assert.equal(remote.hostname, 'gitlab.example.com')
    assert.equal(remote.owner, 'group/sub')
    assert.equal(remote.name, 'repo')
  })

  it('parses SSH URLs with a custom username of a repository in a nested group', () => {
    const remote = parseRemote('niik@niik.ghe.com:group/sub/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'niik.ghe.com')
    assert.equal(remote.owner, 'group/sub')
    assert.equal(remote.name, 'repo')
  })

  it('parses git URLs of a repository in a nested group', () => {
    const remote = parseRemote('git:gitlab.example.com/group/sub/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'gitlab.example.com')
    assert.equal(remote.owner, 'group/sub')
    assert.equal(remote.name, 'repo')
  })

  it('parses git protocol URLs', () => {
    const remote = parseRemote('git://gitlab.example.com/hubot/repo.git')
    assert(remote !== null)
    assert.equal(remote.hostname, 'gitlab.example.com')
    assert.equal(remote.owner, 'hubot')
    assert.equal(remote.name, 'repo')
  })

  it('does not parse invalid HTTP URLs when missing repo name', () => {
    const remote = parseRemote('https://github.com/someuser//')
    assert(remote === null)
  })

  it('does not parse invalid SSH URLs when missing repo name ', () => {
    const remote = parseRemote('git@github.com:hubot/')
    assert(remote === null)
  })

  it('does not parse invalid git URLs when missing repo name', () => {
    const remote = parseRemote('git:github.com/hubot/')
    assert(remote === null)
  })

  it('does not parse invalid HTTP URLs when missing repo owner', () => {
    const remote = parseRemote('https://github.com//somerepo')
    assert(remote === null)
  })

  it('does not parse invalid SSH URLs when missing repo owner', () => {
    const remote = parseRemote('git@github.com:/somerepo')
    assert(remote === null)
  })

  it('does not parse invalid git URLs when missing repo owner', () => {
    const remote = parseRemote('git:github.com/hubot/')
    assert(remote === null)
  })

  // A remote can be a local path, which names no host at all
  it('does not parse local paths', () => {
    assert.equal(parseRemote('/home/hubot/repo'), null)
    assert.equal(parseRemote('../repo'), null)
    assert.equal(parseRemote('C:\\Users\\hubot\\repo'), null)
    assert.equal(parseRemote('file:///home/hubot/repo'), null)
  })
})
