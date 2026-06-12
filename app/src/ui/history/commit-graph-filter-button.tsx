import * as React from 'react'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

/**
 * A visual-only filter button for the commit graph sidebar.
 * This is a placeholder for future filter functionality.
 */
export class CommitGraphFilterButton extends React.Component {
  public render() {
    const buttonTextLabel = 'Filter Options'

    return (
      <Button
        className="filter-button"
        tooltip={buttonTextLabel}
        ariaLabel={buttonTextLabel}
      >
        <span>
          <Octicon symbol={octicons.filter} />
        </span>
        <Octicon symbol={octicons.triangleDown} />
      </Button>
    )
  }
}
