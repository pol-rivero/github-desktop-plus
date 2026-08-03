import * as React from 'react'
import { Account, isDotComAccount } from '../../models/account'
import { IAvatarUser } from '../../models/avatar'
import { lookupPreferredEmail } from '../../lib/email'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { DialogContent, DialogPreferredFocusClassName } from '../dialog'
import { Avatar } from '../lib/avatar'
import { CallToAction } from '../lib/call-to-action'
import { LinkButton } from '../lib/link-button'
import { getHTMLURL } from '../../lib/api'
import { isCodebergCloud, isGitLabCloud } from '../../lib/endpoint-capabilities'
import { SelfHostedApiType } from '../../lib/stores/sign-in-store'

interface IAccountsProps {
  readonly accounts: ReadonlyArray<Account>

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onBitbucketSignIn: () => void
  readonly onGitLabSignIn: () => void
  readonly onCodebergSignIn: () => void
  readonly onSelfHostedSignIn: (apiType: SelfHostedApiType) => void
  readonly onLogout: (account: Account) => void
}

enum SignInType {
  DotCom,
  Enterprise,
  Bitbucket,
  GitLab,
  Forgejo,
}

const isSelfHostedAccount = (account: Account) =>
  (account.apiType === 'gitlab' && !isGitLabCloud(account.endpoint)) ||
  (account.apiType === 'forgejo' && !isCodebergCloud(account.endpoint))

/** The provider a section can add a self-hosted instance of, if any. */
const selfHostedApiTypeFor = (
  type: SignInType
): SelfHostedApiType | undefined => {
  switch (type) {
    case SignInType.GitLab:
      return 'gitlab'
    case SignInType.Forgejo:
      return 'forgejo'
    default:
      return undefined
  }
}

export class Accounts extends React.Component<IAccountsProps, {}> {
  public render() {
    return (
      <DialogContent className="accounts-tab">
        <h2>GitHub.com</h2>
        {this.renderMultipleDotComAccounts()}

        <h2>GitHub Enterprise</h2>
        {this.renderMultipleEnterpriseAccounts()}

        <h2>Bitbucket</h2>
        {this.renderMultipleBitbucketAccounts()}

        <h2>GitLab</h2>
        {this.renderMultipleGitLabAccounts()}

        <h2>Codeberg</h2>
        {this.renderMultipleForgejoAccounts()}
      </DialogContent>
    )
  }

  private renderMultipleDotComAccounts() {
    const dotComAccounts = this.props.accounts.filter(isDotComAccount)
    return this.renderMultipleAccounts(
      dotComAccounts,
      SignInType.DotCom,
      'Add GitHub account',
      this.props.onDotComSignIn
    )
  }

  private renderMultipleEnterpriseAccounts() {
    const enterpriseAccounts = this.props.accounts.filter(
      a => a.apiType === 'enterprise'
    )
    return this.renderMultipleAccounts(
      enterpriseAccounts,
      SignInType.Enterprise,
      'Add GitHub Enterprise account',
      this.props.onEnterpriseSignIn
    )
  }

  private renderMultipleBitbucketAccounts() {
    const bitbucketAccounts = this.props.accounts.filter(
      a => a.apiType === 'bitbucket'
    )
    return this.renderMultipleAccounts(
      bitbucketAccounts,
      SignInType.Bitbucket,
      'Add Bitbucket account',
      this.props.onBitbucketSignIn
    )
  }

  private renderMultipleGitLabAccounts() {
    const gitlabAccounts = this.props.accounts.filter(
      a => a.apiType === 'gitlab'
    )
    return this.renderMultipleAccounts(
      gitlabAccounts,
      SignInType.GitLab,
      'Add GitLab account',
      this.props.onGitLabSignIn
    )
  }

  private renderMultipleForgejoAccounts() {
    const forgejoAccounts = this.props.accounts.filter(
      a => a.apiType === 'forgejo'
    )
    return this.renderMultipleAccounts(
      forgejoAccounts,
      SignInType.Forgejo,
      'Add Codeberg account',
      this.props.onCodebergSignIn
    )
  }

  private renderMultipleAccounts(
    accounts: ReadonlyArray<Account>,
    type: SignInType,
    buttonText: string,
    onSignIn: () => void
  ) {
    return (
      <>
        {accounts.map(account => {
          return this.renderAccount(account, type)
        })}
        {accounts.length === 0 ? (
          this.renderSignIn(type)
        ) : (
          <div className='add-account-button-row'>
            <Button onClick={onSignIn}>{buttonText}</Button>
          </div>
        )}
        {this.renderSelfHostedSignIn(type)}
      </>
    )
  }

  private renderSelfHostedSignIn(type: SignInType) {
    const apiType = selfHostedApiTypeFor(type)

    return apiType === undefined ? null : (
      <Row>
        <LinkButton onClick={this.getOnSelfHostedSignIn(apiType)}>
          Add self-hosted instance…
        </LinkButton>
      </Row>
    )
  }

  private getOnSelfHostedSignIn = (apiType: SelfHostedApiType) => {
    return () => {
      this.props.onSelfHostedSignIn(apiType)
    }
  }

  private renderAccount(account: Account, type: SignInType) {
    const avatarUser: IAvatarUser = {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }

    // The DotCom account is shown first, so its sign in/out button should be
    // focused initially when the dialog is opened.
    const className =
      type === SignInType.DotCom ? DialogPreferredFocusClassName : undefined

    return (
      <Row
        key={account.endpoint + ' ' + account.login}
        className="account-info"
      >
        <div className="user-info-container">
          <Avatar accounts={this.props.accounts} user={avatarUser} />
          <div className="user-info">
            {account.apiType === 'enterprise' ||
            isSelfHostedAccount(account) ? (
              <>
                <div className="account-title">
                  {account.name === account.login
                    ? `@${account.login}`
                    : `@${account.login} (${account.name})`}
                </div>
                <div className="endpoint">{getHTMLURL(account.endpoint)}</div>
              </>
            ) : (
              <>
                <div className="name">{account.name}</div>
                <div className="login">@{account.login}</div>
              </>
            )}
          </div>
        </div>
        <Button onClick={this.logout(account)} className={className}>
          {__DARWIN__ ? 'Sign Out' : 'Sign out'}
        </Button>
      </Row>
    )
  }

  private onDotComSignIn = () => {
    this.props.onDotComSignIn()
  }

  private onEnterpriseSignIn = () => {
    this.props.onEnterpriseSignIn()
  }

  private onBitbucketSignIn = () => {
    this.props.onBitbucketSignIn()
  }

  private onGitLabSignIn = () => {
    this.props.onGitLabSignIn()
  }

  private onCodebergSignIn = () => {
    this.props.onCodebergSignIn()
  }

  private renderSignIn(type: SignInType) {
    const signInTitle = __DARWIN__ ? 'Sign Into' : 'Sign into'
    switch (type) {
      case SignInType.DotCom: {
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub.com'}
            onAction={this.onDotComSignIn}
            // The DotCom account is shown first, so its sign in/out button should be
            // focused initially when the dialog is opened.
            buttonClassName={DialogPreferredFocusClassName}
          >
            <div>
              Sign in to your GitHub.com account to access your repositories.
            </div>
          </CallToAction>
        )
      }
      case SignInType.Enterprise:
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub Enterprise'}
            onAction={this.onEnterpriseSignIn}
          >
            <div>
              If you are using GitHub Enterprise at work, sign in to it to get
              access to your repositories.
            </div>
          </CallToAction>
        )
      case SignInType.Bitbucket:
        return (
          <CallToAction
            actionTitle={signInTitle + ' Bitbucket'}
            onAction={this.onBitbucketSignIn}
          >
            <div>
              Sign in to your Bitbucket account to access your repositories.
            </div>
          </CallToAction>
        )
      case SignInType.GitLab:
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitLab'}
            onAction={this.onGitLabSignIn}
          >
            <div>
              Sign in to your GitLab account to access your repositories.
            </div>
          </CallToAction>
        )
      case SignInType.Forgejo:
        return (
          <CallToAction
            actionTitle={signInTitle + ' Codeberg'}
            onAction={this.onCodebergSignIn}
          >
            <div>
              Sign in to your Codeberg account to access your repositories.
            </div>
          </CallToAction>
        )
      default:
        return assertNever(type, `Unknown sign in type: ${type}`)
    }
  }

  private logout = (account: Account) => {
    return () => {
      this.props.onLogout(account)
    }
  }
}
