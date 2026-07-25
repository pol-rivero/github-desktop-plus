import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { IDiff, DiffType } from '../../models/diff'
import { Octicon, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'
import { DiffOptions } from './diff-options'
import { WholeFileToggle } from './whole-file-toggle'

interface IDiffHeaderProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diff: IDiff | null

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Called when the user changes the side by side diffs setting. */
  readonly onShowSideBySideDiffChanged: (checked: boolean) => void

  /** Whether we should display the diff minimap. */
  readonly showDiffMinimap: boolean

  /** Called when the user changes the diff minimap setting. */
  readonly onShowDiffMinimapChanged: (checked: boolean) => void

  /** Whether text diff lines should wrap within the viewport. */
  readonly wrapDiffLines: boolean

  /** Called when the user changes the diff line wrapping setting. */
  readonly onWrapDiffLinesChanged: (checked: boolean) => void

  /** Whether the current diff can be expanded to show the whole file. */
  readonly canExpandWholeFile: boolean

  /** Whether the current diff is showing the whole file. */
  readonly showWholeFile: boolean

  /** Called when the whole-file diff mode changes. */
  readonly onShowWholeFileChanged: (showWholeFile: boolean) => void

  /** Whether we should hide whitespace in diffs. */
  readonly hideWhitespaceInDiff: boolean

  /** Called when the user changes the hide whitespace in diffs setting. */
  readonly onHideWhitespaceInDiffChanged: (checked: boolean) => Promise<void>

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
}

/** Displays information about a file */
export class DiffHeader extends React.Component<IDiffHeaderProps, {}> {
  public render() {
    const status = this.props.status
    const fileStatus = mapStatus(status)

    return (
      <div className="header">
        <PathLabel path={this.props.path} status={this.props.status} />

        {this.renderWholeFileToggle()}

        {this.renderDiffOptions()}

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }

  private renderWholeFileToggle() {
    if (this.props.diff?.kind !== DiffType.Text) {
      return null
    }

    return (
      <WholeFileToggle
        enabled={this.props.canExpandWholeFile}
        showWholeFile={this.props.showWholeFile}
        onShowWholeFileChanged={this.props.onShowWholeFileChanged}
      />
    )
  }

  private renderDiffOptions() {
    if (this.props.diff?.kind === DiffType.Submodule) {
      return null
    }

    return (
      <DiffOptions
        isInteractiveDiff={true}
        onHideWhitespaceChangesChanged={
          this.props.onHideWhitespaceInDiffChanged
        }
        hideWhitespaceChanges={this.props.hideWhitespaceInDiff}
        onShowSideBySideDiffChanged={this.props.onShowSideBySideDiffChanged}
        showSideBySideDiff={this.props.showSideBySideDiff}
        onShowDiffMinimapChanged={this.props.onShowDiffMinimapChanged}
        showDiffMinimap={this.props.showDiffMinimap}
        wrapDiffLines={this.props.wrapDiffLines}
        onWrapDiffLinesChanged={this.props.onWrapDiffLinesChanged}
        onDiffOptionsOpened={this.props.onDiffOptionsOpened}
      />
    )
  }
}
