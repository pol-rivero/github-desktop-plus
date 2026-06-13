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

export const AUTHOR_FILTER_KEY = 'author'
export type TFilters = Map<string, Set<String>>
export type TFilterFillData = { name: string; email: string }
interface ICommitGraphFilterButtonProps {
  readonly filters: TFilters
  readonly filtersFillData: Record<string, Array<TFilterFillData>>
  readonly onFilterUpdate: (filters: TFilters) => void
}
interface ICommitGraphFilterButtonState {
  readonly isFilterOptionsOpen: boolean
  readonly isAuthorFilterChecked: boolean
  readonly hasFilterOptionsMounted: boolean
  readonly activeFilterData: TFilterFillData[]
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
      isFilterOptionsOpen: false,
      isAuthorFilterChecked: false,
      hasFilterOptionsMounted: false,
      activeFilterData: [],
    }
  }

  private onFilterOptionsButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.filterOptionsButtonRef = buttonRef
  }

  private toggleFilterOptionsOpen = () => {
    this.setState(prevState => ({
      isFilterOptionsOpen: !prevState.isFilterOptionsOpen,
    }))
  }
  private closeFilterOptions = () => {
    this.setState({ isFilterOptionsOpen: false })
  }
  private onAuthorFilterToIncludedInCommit = (
    evt: React.FormEvent<HTMLInputElement>
  ) => {
    const newFilters = new Map(this.props.filters)
    if (evt.currentTarget.checked) {
      newFilters.set(AUTHOR_FILTER_KEY, new Set())
      this.setState({
        isAuthorFilterChecked: true,
        activeFilterData: this.props.filtersFillData[AUTHOR_FILTER_KEY],
      })
    } else {
      newFilters.delete(AUTHOR_FILTER_KEY)
      this.setState({
        isAuthorFilterChecked: false,
      })
    }
    this.props.onFilterUpdate(newFilters)
    // this.closeFilterOptions()
  }

  private onAuthorSubFilterSelect = (
    event: React.FormEvent<HTMLInputElement>,
    key: string
  ) => {
    if (!key) return
    const checked = event.currentTarget.checked

    const newFilters = new Map(this.props.filters)
    const newSet = new Set(newFilters.get(AUTHOR_FILTER_KEY))
    newFilters.set(AUTHOR_FILTER_KEY, newSet)
    if (checked) {
      newSet.add(key)
    } else {
      newSet.delete(key)
    }
    this.props.onFilterUpdate(newFilters)
  }

  private onFilterContainerRef = (divRef: HTMLDivElement | null) => {
    this.filterContainerRef = divRef
  }

  private onMountFilterOptions = () => {
    this.setState({
      hasFilterOptionsMounted: true,
    })
  }

  private onUnmountFilterOptions = () => {
    this.setState({
      hasFilterOptionsMounted: false,
    })
  }

  private renderFilterOptions() {
    return (
      <>
        <Popover
          onContainerRef={this.onFilterContainerRef}
          className="filter-popover"
          ariaLabelledby="filter-options-header"
          anchor={this.filterOptionsButtonRef}
          anchorPosition={PopoverAnchorPosition.BottomRight}
          decoration={PopoverDecoration.Balloon}
          onMousedownOutside={this.closeFilterOptions}
          onClickOutside={this.closeFilterOptions}
          onComponentDidMount={this.onMountFilterOptions}
          onComponentWillUnmount={this.onUnmountFilterOptions}
        >
          <div className="filter-popover-header">
            <h3 id="filter-options-header">Filter Options</h3>
            <button
              className="close"
              onClick={this.closeFilterOptions}
              aria-label="Close"
            >
              <Octicon symbol={octicons.x} />
            </button>
          </div>
          <div className="filter-options">
            <Checkbox
              value={
                this.state.isAuthorFilterChecked
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onAuthorFilterToIncludedInCommit}
              label={`Search commit by authors`}
            />
          </div>
          {/* {filtersActive && (
            <div className="filter-options-footer">
              <Button onClick={this.onClearAllFilters}>Clear filters</Button>
            </div>
          )} */}
        </Popover>
        {this.state.hasFilterOptionsMounted &&
          this.props.filters.size > 0 &&
          this.renderSubFilterOptions()}
      </>
    )
  }

  public componentDidMount(): void {
    console.log(this.props.filtersFillData)
  }

  private renderSubFilterOptions() {
    return (
      <Popover
        className="popover-component filter-popover"
        ariaLabelledby="filter-options-header"
        anchor={this.filterContainerRef}
        anchorPosition={PopoverAnchorPosition.RightTop}
        decoration={PopoverDecoration.None}
        // onMousedownOutside={this.closeSubFilterOptions}
        // onClickOutside={this.closeSubFilterOptions}
      >
        <div className="filter-popover-header">
          <h3 id="filter-options-header">Authors</h3>
          {/* <button
            className="close"
            onClick={this.closeSubFilterOptions}
            aria-label="Close"
          >
            <Octicon symbol={octicons.x} />
          </button> */}
        </div>
        <div className="filter-options">
          {this.state.activeFilterData.map(({ name, email }) => {
            return (
              <Checkbox
                key={email}
                value={
                  this.props.filters.get(AUTHOR_FILTER_KEY)?.has(email)
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                onChange={event => this.onAuthorSubFilterSelect(event, email)}
                label={name}
              />
            )
          })}
        </div>
        {/* {filtersActive && (
            <div className="filter-options-footer">
              <Button onClick={this.onClearAllFilters}>Clear filters</Button>
            </div>
          )} */}
      </Popover>
    )
  }

  public render() {
    const authorFilterSet = this.props.filters.get(AUTHOR_FILTER_KEY)
    const activeFiltersCount = authorFilterSet ? authorFilterSet.size : 0
    const hasActiveFilters = authorFilterSet ? activeFiltersCount > 0 : false
    console.log({ hasActiveFilters })
    const buttonTextLabel = `Filter Options ${
      hasActiveFilters ? `(${activeFiltersCount} applied)` : ''
    }`
    return (
      <>
        <Button
          className={classNames('filter-button', {
            active: hasActiveFilters,
          })}
          onClick={this.toggleFilterOptionsOpen}
          ariaExpanded={this.state.isFilterOptionsOpen}
          onButtonRef={this.onFilterOptionsButtonRef}
          tooltip={buttonTextLabel}
          ariaLabel={buttonTextLabel}
        >
          <span>
            <Octicon symbol={octicons.filter} />
          </span>
          {hasActiveFilters ? (
            <span className="active-badge">
              <div className="badge-bg">
                <div className="badge"></div>
              </div>
            </span>
          ) : null}
          <Octicon symbol={octicons.triangleDown} />
        </Button>
        {this.state.isFilterOptionsOpen && this.renderFilterOptions()}
      </>
    )
  }
}
