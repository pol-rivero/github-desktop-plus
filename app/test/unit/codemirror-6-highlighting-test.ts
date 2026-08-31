import assert from 'node:assert'
import { describe, it } from 'node:test'

import { highlightRequest } from '../../src/highlighter/highlight'
import { languageDefinitions } from '../../src/highlighter/languages'
import { IHighlightRequest, ITokens } from '../../src/lib/highlighter/types'

function request(
  contentLines: ReadonlyArray<string>,
  extension: string,
  options: Partial<IHighlightRequest> = {}
): IHighlightRequest {
  return {
    contentLines,
    extension,
    basename: `fixture${extension}`,
    tabSize: 4,
    addModeClass: true,
    ...options,
  }
}

function tokenAt(
  tokens: ITokens,
  line: number,
  offset: number
): string | undefined {
  const lineTokens = tokens[line]

  if (lineTokens === undefined) {
    return undefined
  }

  for (const [startText, token] of Object.entries(lineTokens)) {
    const start = Number(startText)

    if (start <= offset && start + token.length > offset) {
      return token.token
    }
  }

  return undefined
}

function tokenFor(
  tokens: ITokens,
  lines: ReadonlyArray<string>,
  line: number,
  text: string
): string | undefined {
  const offset = lines[line].indexOf(text)
  assert.notStrictEqual(offset, -1, `${text} must be present on line ${line}`)

  return tokenAt(tokens, line, offset)
}

describe('CodeMirror 6 syntax highlighting', () => {
  it('highlights modern Laravel PHP attributes and promoted properties', async () => {
    const lines = [
      '<?php',
      "#[Description('Analyze the category tree')]",
      '#[Signature(',
      "    'analyze:category-tree {--dump}',",
      ')]',
      'final class AnalyzeCategoryTreeCommand extends Command',
      '{',
      '    public const int VALID_ROOT_CATID = 2;',
      '    public function __construct(',
      '        #[Inject] private readonly CategoryService $service,',
      '    ) {}',
      '    public string $name { get => $this->name; }',
      '    # regular hash comment',
      '}',
    ]
    const tokens = await highlightRequest(request(lines, '.php'))

    assert.match(tokenFor(tokens, lines, 1, 'Description') ?? '', /\bmeta\b/)
    assert.match(tokenFor(tokens, lines, 2, 'Signature') ?? '', /\bmeta\b/)
    assert.match(tokenFor(tokens, lines, 5, 'class') ?? '', /\bkeyword\b/)
    assert.match(
      tokenFor(tokens, lines, 5, 'AnalyzeCategoryTreeCommand') ?? '',
      /\btype\b/
    )
    assert.doesNotMatch(
      tokenFor(tokens, lines, 5, 'class') ?? '',
      /\bcomment\b/
    )
    assert.match(tokenFor(tokens, lines, 9, 'Inject') ?? '', /\bmeta\b/)
    assert.match(tokenFor(tokens, lines, 9, 'private') ?? '', /\bkeyword\b/)
    assert.match(tokenFor(tokens, lines, 9, 'readonly') ?? '', /\bkeyword\b/)
    assert.match(
      tokenFor(tokens, lines, 9, 'CategoryService') ?? '',
      /\btype\b/
    )
    assert.match(tokenFor(tokens, lines, 9, '$service') ?? '', /\bvariable\b/)
    assert.match(tokenFor(tokens, lines, 11, 'public') ?? '', /\bkeyword\b/)
    assert.match(tokenFor(tokens, lines, 12, '#') ?? '', /\bcomment\b/)
  })

  it('splits multi-line parser ranges and returns only requested lines', async () => {
    const lines = ['/* first', 'middle', 'last */', 'const value = 1']
    const tokens = await highlightRequest(request(lines, '.js', { lines: [1] }))

    assert.deepStrictEqual(Object.keys(tokens), ['1'])
    assert.deepStrictEqual(tokens[1][0], {
      length: lines[1].length,
      token: 'comment m-javascript',
    })
  })

  it('preserves UTF-16 offsets used by the renderer', async () => {
    const lines = ["const emoji = '😀'"]
    const tokens = await highlightRequest(request(lines, '.js'))
    const stringOffset = lines[0].indexOf("'😀'")

    assert.deepStrictEqual(tokens[0][stringOffset], {
      length: "'😀'".length,
      token: 'string m-javascript',
    })
  })

  it('detects case-insensitive extensions, dotfiles, and shebangs', async () => {
    const php = await highlightRequest(request(['<?php return true;'], '.PHP'))
    const properties = await highlightRequest(
      request(['vendor/'], '', { basename: '.gitignore' })
    )
    const python = await highlightRequest(
      request(['#!/usr/bin/env python3', 'print("hello")'], '', {
        basename: 'script',
      })
    )
    const perl = await highlightRequest(
      request(['#!/usr/bin/env perl', 'print "hello";'], '', {
        basename: 'script',
      })
    )

    assert.notDeepStrictEqual(php, {})
    assert.notDeepStrictEqual(properties, {})
    assert.match(tokenAt(python, 1, 0) ?? '', /\bbuiltin\b|\bvariable\b/)
    assert.match(tokenAt(perl, 1, 0) ?? '', /\bkeyword\b/)
  })

  it('supports modern, official legacy, and local stream languages', async () => {
    const typescriptLines = ['interface User { id: number }']
    const shellLines = ['if test -f file; then echo yes; fi']
    const luauLines = ['export type User = { name: string }']
    const typescript = await highlightRequest(request(typescriptLines, '.ts'))
    const shell = await highlightRequest(request(shellLines, '.sh'))
    const luau = await highlightRequest(request(luauLines, '.luau'))

    assert.match(
      tokenFor(typescript, typescriptLines, 0, 'interface') ?? '',
      /\bkeyword\b/
    )
    assert.match(tokenFor(shell, shellLines, 0, 'if') ?? '', /\bm-shell\b/)
    assert.match(tokenFor(luau, luauLines, 0, 'User') ?? '', /\btype\b/)
  })

  it('preserves mixed HTML and Vue embedded-language highlighting', async () => {
    const htmlLines = [
      '<script>',
      'const message = "hello"',
      '</script>',
      '<style>.notice { color: red }</style>',
    ]
    const vueLines = [
      '<button :disabled="pending">{{ message.toUpperCase() }}</button>',
    ]
    const html = await highlightRequest(request(htmlLines, '.html'))
    const vue = await highlightRequest(request(vueLines, '.vue'))

    assert.match(tokenFor(html, htmlLines, 1, 'const') ?? '', /\bkeyword\b/)
    assert.match(tokenFor(html, htmlLines, 3, 'color') ?? '', /\bproperty\b/)
    assert.match(tokenFor(vue, vueLines, 0, 'pending') ?? '', /\bvariable\b/)
    assert.match(tokenFor(vue, vueLines, 0, 'message') ?? '', /\bvariable\b/)
  })

  it('keeps legacy stream state while filtering returned lines', async () => {
    const lines = ['/* first', 'middle', 'last */', '.rule { color: red }']
    const tokens = await highlightRequest(
      request(lines, '.less', { lines: [1] })
    )

    assert.deepStrictEqual(Object.keys(tokens), ['1'])
    assert.deepStrictEqual(tokens[1][0], {
      length: lines[1].length,
      token: 'comment m-css',
    })
  })

  it('returns no tokens for unknown files', async () => {
    assert.deepStrictEqual(
      await highlightRequest(request(['plain text'], '.unknown')),
      {}
    )
  })

  it('loads every configured language without throwing', async () => {
    for (const definition of languageDefinitions) {
      const language = await definition.load()

      if (language.kind === 'lezer') {
        assert.doesNotThrow(() => language.parser.parse('sample value'))
      } else {
        const extension = definition.mappings[0] ?? ''
        const basename = definition.basenames?.[0] ?? `fixture${extension}`

        await assert.doesNotReject(
          highlightRequest(
            request(['sample value'], extension, { basename, lines: [0] })
          )
        )
      }
    }
  })

  it('recovers from incomplete PHP without failing the worker', async () => {
    const lines = [
      '<?php',
      '#[Route(',
      'class Incomplete {',
      '    public function',
    ]

    await assert.doesNotReject(highlightRequest(request(lines, '.php')))
  })
})
