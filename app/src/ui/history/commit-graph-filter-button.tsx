import * as React from 'react'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import classNames from 'classnames'
import { FILTER_KEYS, TFilterKeys } from './commit-graph-sidebar'
import { TAuthorFilterOption } from '../../lib/app-state'

interface ICommitGraphFilterButtonProps {
  readonly authorOptions: ReadonlyArray<TAuthorFilterOption>
  readonly activeAuthorEmails: ReadonlySet<TAuthorFilterOption['email']>
  readonly onActiveAuthorEmailsClear: () => void
  readonly onActiveAuthorEmailsChange: (
    email: TAuthorFilterOption['email']
  ) => void
}
interface ICommitGraphFilterButtonState {
  readonly isParentFilterOptionsOpen: boolean
  readonly activeParentFilterName: TFilterKeys | null
  readonly hasParentFilterOptionsMounted: boolean
}

export class CommitGraphFilterButton extends React.Component<
  ICommitGraphFilterButtonProps,
  ICommitGraphFilterButtonState
> {
  private filterOptionsButtonRef: HTMLButtonElement | null = null
  private filterContainerRef: HTMLDivElement | null = null

  public constructor(props: ICommitGraphFilterButtonProps) {
    super(props)

    this.state = {
      isParentFilterOptionsOpen: false,
      activeParentFilterName: null,
      hasParentFilterOptionsMounted: false,
    }
  }

  private onFilterOptionsButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.filterOptionsButtonRef = buttonRef
  }

  private toggleParentFilterOptionsOpen = () => {
    this.setState(prevState => ({
      isParentFilterOptionsOpen: !prevState.isParentFilterOptionsOpen,
    }))
  }
  private closeParentFilterOptions = () => {
    this.setState({ isParentFilterOptionsOpen: false })
  }

  private onAuthorFilterCheckboxChange = () => {
    this.setState(prevState => ({
      activeParentFilterName:
        prevState.activeParentFilterName === FILTER_KEYS.author
          ? null
          : FILTER_KEYS.author,
    }))

    // this.props.onFilterUpdate(newFilters)
    // this.closeFilterOptions()
  }

  private closeAuthorSubFilterOptions = (
    evt: React.MouseEvent<HTMLButtonElement>
  ) => {
    evt.preventDefault()
    evt.stopPropagation()

    if (this.state.activeParentFilterName === FILTER_KEYS.author) {
      this.setState({
        activeParentFilterName: null,
      })
    }
  }

  private onParentFilterContainerRef = (divRef: HTMLDivElement | null) => {
    this.filterContainerRef = divRef
  }

  private onMountParentFilterOptions = () => {
    this.setState({
      hasParentFilterOptionsMounted: true,
    })
  }

  private onUnmountParentFilterOptions = () => {
    this.setState({
      hasParentFilterOptionsMounted: false,
    })
  }

  private onAuthorFilterOptionsCheckboxChange = (email: string) => {
    return () => {
      this.props.onActiveAuthorEmailsChange(email)
    }
  }

  private onClearAllParentFilters = () => {
    this.setState({
      activeParentFilterName: null,
    })
  }

  private onClearAllAuthorSubFilters = (
    evt: React.MouseEvent<HTMLButtonElement>
  ) => {
    evt.preventDefault()
    evt.stopPropagation()
    this.props.onActiveAuthorEmailsClear()
  }

  private renderParentFilterOptions = () => {
    let subFilterOptions = null
    if (this.state.hasParentFilterOptionsMounted) {
      if (this.state.activeParentFilterName === FILTER_KEYS.author) {
        subFilterOptions = this.renderAuthorSubFilterOptions()
      }
    }
    return (
      <>
        <Popover
          onContainerRef={this.onParentFilterContainerRef}
          className="filter-popover"
          ariaLabelledby="filter-options-header"
          anchor={this.filterOptionsButtonRef}
          anchorPosition={PopoverAnchorPosition.BottomRight}
          decoration={PopoverDecoration.Balloon}
          onMousedownOutside={this.closeParentFilterOptions}
          onClickOutside={this.closeParentFilterOptions}
          onComponentDidMount={this.onMountParentFilterOptions}
          onComponentWillUnmount={this.onUnmountParentFilterOptions}
        >
          <div className="filter-popover-header">
            <h3 id="filter-options-header">Filter Options</h3>
            <button
              className="close"
              onClick={this.closeParentFilterOptions}
              aria-label="Close"
            >
              <Octicon symbol={octicons.x} />
            </button>
          </div>
          <div className="filter-options">
            <Checkbox
              value={
                this.state.activeParentFilterName === FILTER_KEYS.author
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onAuthorFilterCheckboxChange}
              label={`Authors`}
            />
          </div>
          {this.state.activeParentFilterName !== null && (
            <div className="filter-options-footer">
              <Button onClick={this.onClearAllParentFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </Popover>
        {subFilterOptions}
      </>
    )
  }

  private renderAuthorSubFilterOptions = () => (
    <Popover
      className="popover-component filter-popover"
      ariaLabelledby="filter-options-header"
      anchor={this.filterContainerRef}
      anchorPosition={PopoverAnchorPosition.RightTop}
      decoration={PopoverDecoration.Balloon}
    >
      <div className="filter-popover-header">
        <h3 id="filter-options-header">Authors</h3>
        <button
          className="close"
          onMouseDown={this.closeAuthorSubFilterOptions}
          onClick={this.closeAuthorSubFilterOptions}
          aria-label="Close"
        >
          <Octicon symbol={octicons.x} />
        </button>
      </div>
      <div className="filter-options sub-filter-options">
        {this.props.authorOptions.map(({ name, email }) => {
          const onChange = this.onAuthorFilterOptionsCheckboxChange(email)
          return (
            <Checkbox
              key={email}
              value={
                this.props.activeAuthorEmails.has(email)
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={onChange}
              label={name}
            />
          )
        })}
      </div>
      {this.props.activeAuthorEmails.size > 0 && (
        <div className="filter-options-footer">
          <Button onClick={this.onClearAllAuthorSubFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </Popover>
  )

  public render = () => {
    const hasActiveAuthors = this.props.activeAuthorEmails.size > 0
    const buttonTextLabel = `Filter Options ${
      hasActiveAuthors ? `(${this.props.activeAuthorEmails.size} applied)` : ''
    }`
    return (
      <>
        <Button
          className={classNames('filter-button', {
            active: hasActiveAuthors,
          })}
          onClick={this.toggleParentFilterOptionsOpen}
          ariaExpanded={this.state.isParentFilterOptionsOpen}
          onButtonRef={this.onFilterOptionsButtonRef}
          tooltip={buttonTextLabel}
          ariaLabel={buttonTextLabel}
        >
          <span>
            <Octicon symbol={octicons.filter} />
          </span>
          {hasActiveAuthors ? (
            <span className="active-badge">
              <div className="badge-bg">
                <div className="badge"></div>
              </div>
            </span>
          ) : null}
          <Octicon symbol={octicons.triangleDown} />
        </Button>
        {this.state.isParentFilterOptionsOpen &&
          this.renderParentFilterOptions()}
      </>
    )
  }
}
