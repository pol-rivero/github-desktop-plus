import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'

import {
  getDiffHorizontalScrollDelta,
  getWrapDiffLines,
  setWrapDiffLines,
  WrapDiffLinesDefault,
} from '../../src/ui/lib/diff-mode'

describe('diff presentation mode', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('wraps diff lines by default and persists changes', () => {
    assert.strictEqual(getWrapDiffLines(), WrapDiffLinesDefault)

    setWrapDiffLines(false)

    assert.strictEqual(getWrapDiffLines(), false)
  })

  it('maps shifted and native horizontal wheel input to one delta', () => {
    assert.strictEqual(getDiffHorizontalScrollDelta(0, 40, true), 40)
    assert.strictEqual(getDiffHorizontalScrollDelta(25, 0, true), 25)
    assert.strictEqual(getDiffHorizontalScrollDelta(25, 40, false), 25)
    assert.strictEqual(getDiffHorizontalScrollDelta(0, 40, false), 0)
  })
})
