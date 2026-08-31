// StringStream is adapted from @codemirror/language, copyright Marijn
// Haverbeke and others, and is distributed under the MIT license.

import { ITokens } from '../lib/highlighter/types'

export interface IStringStream {
  readonly string: string
  readonly indentUnit: number
  pos: number
  start: number
  eol(): boolean
  sol(): boolean
  peek(): string | undefined
  next(): string | void
  eat(match: string | RegExp | ((character: string) => boolean)): string | void
  eatWhile(match: string | RegExp | ((character: string) => boolean)): boolean
  eatSpace(): boolean
  skipToEnd(): void
  skipTo(character: string): boolean | void
  backUp(count: number): void
  column(): number
  indentation(): number
  match(
    pattern: string | RegExp,
    consume?: boolean,
    caseInsensitive?: boolean
  ): boolean | RegExpMatchArray | null
  current(): string
}

export interface IStreamParser<State> {
  readonly name?: string
  readonly startState?: (indentUnit: number) => State
  readonly token: (stream: IStringStream, state: State) => string | null
  readonly blankLine?: (state: State, indentUnit: number) => void
}

function countColumn(
  value: string,
  end: number | null,
  tabSize: number,
  startIndex = 0,
  startValue = 0
) {
  if (end === null) {
    end = value.search(/[^\s\u00a0]/)
    if (end === -1) {
      end = value.length
    }
  }

  let column = startValue

  for (let index = startIndex; index < end; index++) {
    column += value.charCodeAt(index) === 9 ? tabSize - (column % tabSize) : 1
  }

  return column
}

class StringStream {
  public pos = 0
  public start = 0
  private lastColumnPos = 0
  private lastColumnValue = 0

  public constructor(
    public readonly string: string,
    private readonly tabSize: number,
    public readonly indentUnit: number,
    private readonly overrideIndent?: number
  ) {}

  public eol() {
    return this.pos >= this.string.length
  }

  public sol() {
    return this.pos === 0
  }

  public peek() {
    return this.string.charAt(this.pos) || undefined
  }

  public next() {
    if (this.pos < this.string.length) {
      return this.string.charAt(this.pos++)
    }

    return undefined
  }

  public eat(match: string | RegExp | ((character: string) => boolean)) {
    const character = this.string.charAt(this.pos)
    const matches =
      typeof match === 'string'
        ? character === match
        : character !== '' &&
          (match instanceof RegExp ? match.test(character) : match(character))

    if (matches) {
      this.pos += 1
      return character
    }

    return undefined
  }

  public eatWhile(match: string | RegExp | ((character: string) => boolean)) {
    const start = this.pos
    while (this.eat(match) !== undefined) {}
    return this.pos > start
  }

  public eatSpace() {
    const start = this.pos
    while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) {
      this.pos += 1
    }
    return this.pos > start
  }

  public skipToEnd() {
    this.pos = this.string.length
  }

  public skipTo(character: string) {
    const found = this.string.indexOf(character, this.pos)
    if (found > -1) {
      this.pos = found
      return true
    }

    return undefined
  }

  public backUp(count: number) {
    this.pos -= count
  }

  public column() {
    if (this.lastColumnPos < this.start) {
      this.lastColumnValue = countColumn(
        this.string,
        this.start,
        this.tabSize,
        this.lastColumnPos,
        this.lastColumnValue
      )
      this.lastColumnPos = this.start
    }

    return this.lastColumnValue
  }

  public indentation() {
    return this.overrideIndent ?? countColumn(this.string, null, this.tabSize)
  }

  public match(
    pattern: string | RegExp,
    consume = true,
    caseInsensitive = false
  ): boolean | RegExpMatchArray | null {
    if (typeof pattern === 'string') {
      const normalize = (value: string) =>
        caseInsensitive ? value.toLowerCase() : value
      const candidate = this.string.substr(this.pos, pattern.length)

      if (normalize(candidate) !== normalize(pattern)) {
        return null
      }

      if (consume) {
        this.pos += pattern.length
      }

      return true
    }

    const result = this.string.slice(this.pos).match(pattern)
    if (result !== null && (result.index ?? 0) > 0) {
      return null
    }

    if (result !== null && consume) {
      this.pos += result[0].length
    }

    return result
  }

  public current() {
    return this.string.slice(this.start, this.pos)
  }
}

function readToken<State>(
  parser: IStreamParser<State>,
  stream: StringStream,
  state: State
) {
  stream.start = stream.pos

  for (let attempt = 0; attempt < 10; attempt++) {
    const token = parser.token(stream, state)
    if (stream.pos > stream.start) {
      return token
    }
  }

  throw new Error('Stream parser failed to advance stream.')
}

export function highlightStream<State>(
  parser: IStreamParser<State>,
  lines: ReadonlyArray<string>,
  lineFilter: ReadonlySet<number> | null,
  tabSize: number,
  tokenSuffix: string
): ITokens {
  const indentUnit = tabSize
  const state = parser.startState?.(indentUnit) ?? (true as State)
  const tokens: ITokens = {}

  for (const [lineNumber, line] of lines.entries()) {
    if (line.length === 0) {
      parser.blankLine?.(state, indentUnit)
      continue
    }

    const stream = new StringStream(line, tabSize, indentUnit)

    while (!stream.eol()) {
      const token = readToken(parser, stream, state)

      if (
        token !== null &&
        (lineFilter === null || lineFilter.has(lineNumber))
      ) {
        tokens[lineNumber] = tokens[lineNumber] ?? {}
        tokens[lineNumber][stream.start] = {
          length: stream.pos - stream.start,
          token: `${token}${tokenSuffix}`,
        }
      }
    }
  }

  return tokens
}
