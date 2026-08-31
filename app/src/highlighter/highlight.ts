import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'

import { IHighlightRequest, ITokens } from '../lib/highlighter/types'
import { detectLanguage } from './languages'
import { highlightStream } from './stream'

const desktopHighlighter = tagHighlighter([
  { tag: tags.definition(tags.variableName), class: 'def' },
  { tag: tags.definition(tags.propertyName), class: 'property def' },
  { tag: tags.local(tags.variableName), class: 'variable-2' },
  { tag: tags.special(tags.variableName), class: 'variable-3' },
  { tag: tags.standard(tags.variableName), class: 'builtin' },
  { tag: tags.annotation, class: 'meta' },
  { tag: tags.processingInstruction, class: 'meta' },
  { tag: tags.attributeName, class: 'attribute' },
  { tag: tags.tagName, class: 'tag' },
  { tag: tags.className, class: 'type' },
  { tag: tags.typeName, class: 'type' },
  { tag: tags.namespace, class: 'qualifier' },
  { tag: tags.labelName, class: 'qualifier' },
  { tag: tags.macroName, class: 'meta' },
  { tag: tags.propertyName, class: 'property' },
  { tag: tags.variableName, class: 'variable' },
  { tag: tags.regexp, class: 'string-2' },
  { tag: tags.escape, class: 'string-2' },
  { tag: tags.special(tags.string), class: 'string-2' },
  { tag: tags.string, class: 'string' },
  { tag: tags.bool, class: 'atom' },
  { tag: tags.null, class: 'atom' },
  { tag: tags.atom, class: 'atom' },
  { tag: tags.number, class: 'number' },
  { tag: tags.modifier, class: 'keyword' },
  { tag: tags.keyword, class: 'keyword' },
  { tag: tags.operator, class: 'operator' },
  { tag: tags.comment, class: 'comment' },
  { tag: tags.meta, class: 'meta' },
  { tag: tags.quote, class: 'quote' },
  { tag: tags.contentSeparator, class: 'hr' },
  { tag: tags.heading, class: 'header' },
  { tag: tags.link, class: 'link' },
  { tag: tags.url, class: 'link' },
  { tag: tags.bracket, class: 'bracket' },
  { tag: tags.invalid, class: 'error' },
])

function getLineStarts(lines: ReadonlyArray<string>): ReadonlyArray<number> {
  const starts = new Array<number>(lines.length)
  let position = 0

  for (const [line, contents] of lines.entries()) {
    starts[line] = position
    position += contents.length + 1
  }

  return starts
}

function findLine(lineStarts: ReadonlyArray<number>, position: number): number {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const middle = (low + high) >> 1
    const start = lineStarts[middle]
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY

    if (position < start) {
      high = middle - 1
    } else if (position >= next) {
      low = middle + 1
    } else {
      return middle
    }
  }

  return Math.max(0, Math.min(low, lineStarts.length - 1))
}

function addTokenRange(
  tokens: ITokens,
  lines: ReadonlyArray<string>,
  lineStarts: ReadonlyArray<number>,
  lineFilter: ReadonlySet<number> | null,
  from: number,
  to: number,
  token: string
) {
  let line = findLine(lineStarts, from)
  let position = from

  while (position < to && line < lines.length) {
    const lineStart = lineStarts[line]
    const lineEnd = lineStart + lines[line].length

    if (position < lineEnd) {
      const segmentEnd = Math.min(to, lineEnd)

      if (lineFilter === null || lineFilter.has(line)) {
        tokens[line] = tokens[line] ?? {}
        tokens[line][position - lineStart] = {
          length: segmentEnd - position,
          token,
        }
      }

      position = segmentEnd
    }

    if (position < to) {
      line += 1
      position = lineStarts[line] ?? to
    }
  }
}

export async function highlightRequest(
  request: IHighlightRequest
): Promise<ITokens> {
  if (request.contentLines.length === 0) {
    return {}
  }

  const definition = detectLanguage(
    request.extension,
    request.basename,
    request.contentLines
  )

  if (definition === undefined) {
    return {}
  }

  const lineFilter =
    request.lines !== undefined && request.lines.length > 0
      ? new Set(request.lines)
      : null
  const tokenSuffix =
    request.addModeClass === true ? ` m-${definition.modeClass}` : ''
  const language = await definition.load()

  if (language.kind === 'stream') {
    return highlightStream(
      language.parser,
      request.contentLines,
      lineFilter,
      request.tabSize,
      tokenSuffix
    )
  }

  const source = request.contentLines.join('\n')
  const lineStarts = getLineStarts(request.contentLines)
  const tokens: ITokens = {}

  highlightTree(
    language.parser.parse(source),
    desktopHighlighter,
    (from, to, style) => {
      addTokenRange(
        tokens,
        request.contentLines,
        lineStarts,
        lineFilter,
        from,
        to,
        `${style}${tokenSuffix}`
      )
    }
  )

  return tokens
}
