// Adapted from codemirror-mode-luau, copyright Kyle Smith.
// Distributed under the MIT license.

import { IStreamParser, IStringStream } from '../stream'

type LuauTokenizer = (stream: IStringStream, state: ILuauState) => string | null

interface ILuauState {
  tokenize: LuauTokenizer | null
  afterColon: boolean
  afterTypeKeyword: boolean
}

const keywords =
  /\b(function|export|type|end|if|then|else|elseif|while|do|for|in|repeat|until|return|local|not|and|or)\b/
const globals =
  /\b(print|math|table|string|coroutine|Vector2|Vector3|UDim|UDim2|os|io|debug|package|require|_G|shared|game|pairs|ipairs|setmetatable|getmetatable|newproxy)\b/

function longComment(stream: IStringStream, state: ILuauState) {
  while (!stream.eol()) {
    if (stream.match(/\]\]/)) {
      state.tokenize = null
      break
    }
    stream.next()
  }
  return 'comment'
}

function backtickString(stream: IStringStream, state: ILuauState) {
  while (!stream.eol()) {
    if (stream.match(/`/)) {
      state.tokenize = null
      break
    }
    stream.next()
  }
  return 'string'
}

export const luau: IStreamParser<ILuauState> = {
  name: 'luau',
  startState: () => ({
    tokenize: null,
    afterColon: false,
    afterTypeKeyword: false,
  }),

  token: (stream, state) => {
    if (state.tokenize !== null) {
      return state.tokenize(stream, state)
    }

    if (stream.match(/--\[\[/)) {
      state.tokenize = longComment
      return state.tokenize(stream, state)
    }
    if (stream.match(/`/)) {
      state.tokenize = backtickString
      return state.tokenize(stream, state)
    }
    if (stream.match(/--/)) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match(/"([^"\\]|\\.)*"?/)) {
      return 'string'
    }
    if (stream.match(/'([^'\\]|\\.)*'?/)) {
      return 'string'
    }
    if (stream.match(/\b\d+(\.\d+)?\b/)) {
      return 'number'
    }
    if (stream.match(/\btype\b/)) {
      state.afterTypeKeyword = true
      return 'keyword'
    }
    if (state.afterTypeKeyword && stream.match(/[a-zA-Z_]\w*/)) {
      state.afterTypeKeyword = false
      return 'type'
    }
    if (stream.match(keywords)) {
      return 'keyword'
    }
    if (stream.match(/self/)) {
      return 'variable-3'
    }
    if (state.afterColon && stream.match(/[a-zA-Z_]\w*/)) {
      state.afterColon = false
      return 'type'
    }
    if (stream.match(globals)) {
      return 'builtin'
    }
    if (stream.match(/\b(true|false)\b/)) {
      return 'atom'
    }
    if (stream.match(/[a-zA-Z_]\w*/)) {
      if (stream.match(/\s*&\s*{/, false)) {
        return 'type'
      }

      const currentPosition = stream.pos
      if (
        stream.match(
          /\s*:\s*[a-zA-Z_]\w*\s*,|\s*,\s*[a-zA-Z_]\w*\s*|\s*\)\s*(do)?/,
          false
        )
      ) {
        stream.pos = currentPosition
        return 'variable-2'
      }

      return 'variable'
    }
    if (stream.match(/:/)) {
      const currentPosition = stream.pos
      if (stream.match(/\s*[a-zA-Z_]\w*\s*\(/, false)) {
        stream.pos = currentPosition
        return 'operator'
      }
      state.afterColon = true
      return 'operator'
    }
    if (stream.match(/\|/)) {
      state.afterColon = true
      return 'operator'
    }
    if (stream.match(/==|~=|>=|<=|[=+\-*/|()?#\[\]&]/)) {
      state.afterColon = false
      return 'operator'
    }
    if (stream.match(/[{}]/)) {
      return 'bracket'
    }

    stream.next()
    return null
  },
}
