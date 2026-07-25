import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RadioButton } from '../lib/radio-button'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { Tooltip, TooltipDirection } from '../lib/tooltip'
import { createObservableRef } from '../lib/observable-ref'

interface IDiffOptionsProps {
  readonly isInteractiveDiff: boolean
  readonly hideWhitespaceChanges: boolean
  readonly onHideWhitespaceChangesChanged: (
    hideWhitespaceChanges: boolean
  ) => void

  readonly showSideBySideDiff: boolean
  readonly onShowSideBySideDiffChanged: (showSideBySideDiff: boolean) => void

  readonly showDiffMinimap: boolean
  readonly onShowDiffMinimapChanged: (showDiffMinimap: boolean) => void

  readonly wrapDiffLines: boolean
  readonly onWrapDiffLinesChanged: (wrapDiffLines: boolean) => void

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
}

interface IDiffOptionsState {
  readonly isPopoverOpen: boolean
}

export class DiffOptions extends React.Component<
  IDiffOptionsProps,
  IDiffOptionsState
> {
  private innerButtonRef = createObservableRef<HTMLButtonElement>()
  private diffOptionsRef = React.createRef<HTMLDivElement>()
  private gearIconRef = React.createRef<HTMLSpanElement>()

  public constructor(props: IDiffOptionsProps) {
    super(props)
    this.state = {
      isPopoverOpen: false,
    }
  }

  private onButtonClick = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (this.state.isPopoverOpen) {
      this.closePopover()
    } else {
      this.openPopover()
    }
  }

  private openPopover = () => {
    this.setState(prevState => {
      if (!prevState.isPopoverOpen) {
        this.props.onDiffOptionsOpened()
        return { isPopoverOpen: true }
      }
      return null
    })
  }

  private closePopover = () => {
    this.setState(prevState => {
      if (prevState.isPopoverOpen) {
        return { isPopoverOpen: false }
      }

      return null
    })
  }

  private onHideWhitespaceChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    return this.props.onHideWhitespaceChangesChanged(
      event.currentTarget.checked
    )
  }

  private onShowDiffMinimapChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    return this.props.onShowDiffMinimapChanged(event.currentTarget.checked)
  }

  private onWrapDiffLinesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    return this.props.onWrapDiffLinesChanged(event.currentTarget.checked)
  }

  public render() {
    const buttonLabel = `Diff ${__DARWIN__ ? 'Settings' : 'Options'}`
    return (
      <div className="diff-options-component" ref={this.diffOptionsRef}>
        <button
          aria-label={buttonLabel}
          onClick={this.onButtonClick}
          aria-expanded={this.state.isPopoverOpen}
          ref={this.innerButtonRef}
        >
          <Tooltip
            target={this.innerButtonRef}
            direction={TooltipDirection.NORTH}
            applyAriaDescribedBy={false}
          >
            {buttonLabel}
          </Tooltip>
          <span ref={this.gearIconRef}>
            <Octicon symbol={octicons.gear} />
          </span>
          <Octicon symbol={octicons.triangleDown} />
        </button>
        {this.state.isPopoverOpen && this.renderPopover()}
      </div>
    )
  }

  private renderPopover() {
    const header = `Diff ${__DARWIN__ ? 'Settings' : 'Options'}`
    return (
      <Popover
        ariaLabelledby="diff-options-popover-header"
        anchor={this.gearIconRef.current}
        anchorPosition={PopoverAnchorPosition.BottomRight}
        decoration={PopoverDecoration.Balloon}
        onMousedownOutside={this.closePopover}
        onClickOutside={this.closePopover}
      >
        <h3 id="diff-options-popover-header">{header}</h3>
        {this.renderHideWhitespaceChanges()}
        {this.renderShowSideBySide()}
        {this.renderWrapDiffLines()}
        {this.renderShowDiffMinimap()}
      </Popover>
    )
  }

  private onUnifiedSelected = () => {
    this.props.onShowSideBySideDiffChanged(false)
  }
  private onSideBySideSelected = () => {
    this.props.onShowSideBySideDiffChanged(true)
  }

  private renderShowSideBySide() {
    return (
      <fieldset role="radiogroup">
        <legend>Diff display</legend>
        <RadioButton
          value="Unified"
          checked={!this.props.showSideBySideDiff}
          label="Unified"
          onSelected={this.onUnifiedSelected}
        />
        <RadioButton
          value="Split"
          checked={this.props.showSideBySideDiff}
          label={
            <>
              <div>Split</div>
            </>
          }
          onSelected={this.onSideBySideSelected}
        />
      </fieldset>
    )
  }

  private renderHideWhitespaceChanges() {
    return (
      <fieldset>
        <legend>Whitespace</legend>
        <Checkbox
          value={
            this.props.hideWhitespaceChanges
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          onChange={this.onHideWhitespaceChangesChanged}
          label={
            __DARWIN__ ? 'Hide Whitespace Changes' : 'Hide whitespace changes'
          }
        />
        {this.props.isInteractiveDiff && (
          <p className="secondary-text">
            Interacting with individual lines or hunks will be disabled while
            hiding whitespace.
          </p>
        )}
      </fieldset>
    )
  }

  private renderShowDiffMinimap() {
    return (
      <fieldset>
        <legend>Minimap</legend>
        <Checkbox
          value={
            this.props.showDiffMinimap ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onShowDiffMinimapChanged}
          label={__DARWIN__ ? 'Show Minimap' : 'Show minimap'}
        />
      </fieldset>
    )
  }

  private renderWrapDiffLines() {
    return (
      <fieldset>
        <legend>Line wrapping</legend>
        <Checkbox
          value={
            this.props.wrapDiffLines ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onWrapDiffLinesChanged}
          label={__DARWIN__ ? 'Wrap Lines' : 'Wrap lines'}
        />
      </fieldset>
    )
  }
}
