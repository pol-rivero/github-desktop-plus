import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { Accounts } from '../../../src/ui/preferences/accounts'
import { Account } from '../../../src/models/account'
import { SelfHostedApiType } from '../../../src/lib/stores/sign-in-store'
import {
  registerEndpointApiType,
  resetEndpointApiTypeRegistryForTesting,
} from '../../../src/lib/endpoint-api-type-registry'

const selfHostedEndpoint = 'https://git.example.com:3000/api/v4'

const createGitLabAccount = () =>
  new Account(
    'joan',
    selfHostedEndpoint,
    'gitlab',
    't',
    '',
    0,
    [],
    '',
    1,
    'Joan'
  )

function renderAccounts(
  accounts: ReadonlyArray<Account>,
  onSelfHostedSignIn: (apiType: SelfHostedApiType) => void = () => {}
) {
  return render(
    <Accounts
      accounts={accounts}
      onDotComSignIn={() => {}}
      onEnterpriseSignIn={() => {}}
      onBitbucketSignIn={() => {}}
      onGitLabSignIn={() => {}}
      onCodebergSignIn={() => {}}
      onSelfHostedSignIn={onSelfHostedSignIn}
      onLogout={() => {}}
    />
  )
}

describe('preferences accounts tab', () => {
  beforeEach(() => {
    localStorage.removeItem('api-endpoint-types')
    resetEndpointApiTypeRegistryForTesting()
  })

  afterEach(() => {
    localStorage.removeItem('api-endpoint-types')
    resetEndpointApiTypeRegistryForTesting()
  })

  it('offers a self-hosted sign in for GitLab and Codeberg', () => {
    const chosen = new Array<SelfHostedApiType>()
    renderAccounts([], apiType => chosen.push(apiType))

    const links = screen.getAllByRole('button', {
      name: 'Add self-hosted instance…',
    })
    assert.equal(links.length, 2)

    fireEvent.click(links[0])
    fireEvent.click(links[1])

    assert.deepEqual(chosen, ['gitlab', 'forgejo'])
  })

  it('shows the instance address of a self-hosted account', () => {
    registerEndpointApiType(selfHostedEndpoint, 'gitlab')

    const view = renderAccounts([createGitLabAccount()])

    const endpoints = Array.from(
      view.container.querySelectorAll('.endpoint')
    ).map(e => e.textContent)

    assert.deepEqual(endpoints, ['https://git.example.com:3000'])
    assert.ok(screen.getByText('@joan (Joan)'))
  })
})
