import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  catppuccinDiffTheme,
  defaultDiffTheme,
  getDiffThemeLabel,
  parseDiffTheme,
} from '../../src/models/diff-theme'

describe('diff theme', () => {
  it('parses supported persisted themes', () => {
    assert.strictEqual(parseDiffTheme('default'), defaultDiffTheme)
    assert.strictEqual(parseDiffTheme('catppuccin'), catppuccinDiffTheme)
  })

  it('falls back to the default for missing and unknown values', () => {
    assert.strictEqual(parseDiffTheme(null), defaultDiffTheme)
    assert.strictEqual(parseDiffTheme('unknown'), defaultDiffTheme)
  })

  it('describes the adaptive Catppuccin palette', () => {
    assert.strictEqual(
      getDiffThemeLabel(catppuccinDiffTheme),
      'Catppuccin (matches app theme)'
    )
  })
})
