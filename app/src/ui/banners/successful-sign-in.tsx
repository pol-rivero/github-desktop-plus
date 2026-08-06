import * as React from 'react'
import { SuccessBanner } from './success-banner'

interface ISuccessfulSignInProps {
  readonly login: string
  readonly friendlyEndpoint: string
  readonly onDismissed: () => void
}

export class SuccessfulSignIn extends React.Component<ISuccessfulSignInProps> {
  public render() {
    return (
      <SuccessBanner timeout={5000} onDismissed={this.props.onDismissed}>
        Successfully signed in to {this.props.friendlyEndpoint} as{' '}
        <strong>{this.props.login}</strong>.
      </SuccessBanner>
    )
  }
}
