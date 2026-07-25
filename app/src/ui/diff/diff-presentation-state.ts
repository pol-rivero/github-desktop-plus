import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { getShowWholeFile, setShowWholeFile } from '../lib/diff-mode'

export interface IDiffPresentationState {
  readonly canExpandWholeFile: boolean
  readonly showWholeFile: boolean
}

/**
 * Shared whole-file/minimap state for diff surfaces that render the same
 * header and switcher controls. The whole-file preference is persisted, while
 * expansion availability is specific to the active diff being shown.
 */
export abstract class DiffPresentationStateComponent<
  P,
  S extends IDiffPresentationState
> extends React.Component<P, S> {
  protected abstract getDispatcher(): Dispatcher

  protected createDiffPresentationState(): IDiffPresentationState {
    return {
      canExpandWholeFile: false,
      showWholeFile: getShowWholeFile(),
    }
  }

  /**
   * Availability depends on the currently loaded diff contents, so callers
   * should clear it whenever their active file/diff context changes.
   */
  protected resetWholeFileExpansionAvailability() {
    if (!this.state.canExpandWholeFile) {
      return
    }

    this.setState({ canExpandWholeFile: false } as Pick<
      S,
      'canExpandWholeFile'
    >)
  }

  protected onShowDiffMinimapChanged = (showDiffMinimap: boolean) => {
    return this.getDispatcher().onShowDiffMinimapChanged(showDiffMinimap)
  }

  protected onWrapDiffLinesChanged = (wrapDiffLines: boolean) => {
    return this.getDispatcher().onWrapDiffLinesChanged(wrapDiffLines)
  }

  protected onShowWholeFileChanged = (showWholeFile: boolean) => {
    // Persist the preference globally so changes/history stay in sync, while
    // each active diff still decides whether whole-file mode can be applied.
    setShowWholeFile(showWholeFile)
    this.setState({ showWholeFile } as Pick<S, 'showWholeFile'>)
  }

  protected onWholeFileExpansionAvailabilityChanged = (
    canExpandWholeFile: boolean
  ) => {
    this.setState(prevState => {
      if (prevState.canExpandWholeFile === canExpandWholeFile) {
        return null
      }

      return { canExpandWholeFile } as Pick<S, 'canExpandWholeFile'>
    })
  }

  /**
   * The persisted preference can outlive the currently selected diff.
   * The header toggle should only appear active when this diff can actually
   * render in whole-file mode.
   */
  protected getShowWholeFileToggleState() {
    return this.state.showWholeFile && this.state.canExpandWholeFile
  }
}
