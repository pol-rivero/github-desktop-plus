// Adapted from codemirror-mode-zig, copyright Kyle Rich.
// Distributed under the MIT license.

import { IStreamParser, IStringStream } from '../stream'

interface IZigState {
  tokenize: (stream: IStringStream, state: IZigState) => string | null
}

const keywords = new Set([
  'const',
  'var',
  'extern',
  'packed',
  'export',
  'pub',
  'noalias',
  'inline',
  'comptime',
  'test',
  'fn',
  'usingnamespace',
  'struct',
  'enum',
  'union',
  'if',
  'else',
  'switch',
  'while',
  'for',
  'break',
  'continue',
  'return',
  'defer',
  'errdefer',
  'as',
  'null',
])

const operatorCharacter = /[+\-*&%=<>!?|]/

function tokenString(quote: string) {
  return (stream: IStringStream, state: IZigState) => {
    let escaped = false
    let ended = false
    let next: string | void

    while ((next = stream.next()) !== undefined) {
      if (next === quote && !escaped) {
        ended = true
        break
      }
      escaped = !escaped && next === '\\'
    }

    if (ended || !escaped) {
      state.tokenize = tokenBase
    }

    return 'string'
  }
}

function tokenBase(stream: IStringStream, state: IZigState): string | null {
  const character = stream.next()

  if (character === '"') {
    state.tokenize = tokenString(character)
    return state.tokenize(stream, state)
  }
  if (character !== undefined && /\d/.test(character)) {
    stream.eatWhile(/[\w.]/)
    return 'number'
  }
  if (character !== undefined && /[\w_]/.test(character)) {
    stream.eatWhile(/[\w_]/)
    return keywords.has(stream.current()) ? 'keyword' : 'variable'
  }
  if (character !== undefined && operatorCharacter.test(character)) {
    stream.eatWhile(operatorCharacter)
    return 'operator'
  }
  if (character === '/' && stream.eat('/') !== undefined) {
    stream.skipToEnd()
    return 'comment'
  }

  return null
}

export const zig: IStreamParser<IZigState> = {
  name: 'zig',
  startState: () => ({ tokenize: tokenBase }),
  token: (stream, state) => {
    if (stream.eatSpace()) {
      return null
    }
    return state.tokenize(stream, state)
  },
}
