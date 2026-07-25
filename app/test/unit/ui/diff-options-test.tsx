import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { DiffOptions } from '../../../src/ui/diff/diff-options'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function ControlledDiffOptions() {
  const [wrapDiffLines, setWrapDiffLines] = React.useState(true)

  return (
    <DiffOptions
      isInteractiveDiff={false}
      hideWhitespaceChanges={false}
      onHideWhitespaceChangesChanged={() => {}}
      showSideBySideDiff={false}
      onShowSideBySideDiffChanged={() => {}}
      showDiffMinimap={false}
      onShowDiffMinimapChanged={() => {}}
      wrapDiffLines={wrapDiffLines}
      onWrapDiffLinesChanged={setWrapDiffLines}
      onDiffOptionsOpened={() => {}}
    />
  )
}

describe('DiffOptions', () => {
  it('controls the line wrapping preference through props', () => {
    render(<ControlledDiffOptions />)
    fireEvent.click(
      screen.getByRole('button', { name: /^Diff (Options|Settings)$/ })
    )

    const wrapLines = screen.getByLabelText(/wrap lines/i)
    assert.strictEqual((wrapLines as HTMLInputElement).checked, true)

    fireEvent.click(wrapLines)

    assert.strictEqual((wrapLines as HTMLInputElement).checked, false)
  })
})
