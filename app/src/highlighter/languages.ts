import type { Parser } from '@lezer/common'

import { IStreamParser } from './stream'

interface ILezerLanguage {
  readonly kind: 'lezer'
  readonly parser: Parser
}

interface IStreamLanguage {
  readonly kind: 'stream'
  readonly parser: IStreamParser<unknown>
}

export type HighlighterLanguage = ILezerLanguage | IStreamLanguage

export interface ILanguageDefinition {
  readonly name: string
  readonly modeClass: string
  readonly load: () => Promise<HighlighterLanguage>
  readonly mappings: ReadonlyArray<string>
  readonly basenames?: ReadonlyArray<string>
  readonly compatibilityFallback?: string
}

function lezer(parser: Parser): HighlighterLanguage {
  return { kind: 'lezer', parser }
}

function stream(parser: unknown): HighlighterLanguage {
  // @codemirror/legacy-modes exposes StreamParser values whose public runtime
  // shape is compatible with our worker-only adapter. Its declaration uses a
  // class with private fields, so the structural boundary needs one cast.
  return { kind: 'stream', parser: parser as IStreamParser<unknown> }
}

async function loadHTML(vue = false): Promise<HighlighterLanguage> {
  const [
    { parseMixed },
    { parser: html },
    { parser: javascript },
    { parser: css },
  ] = await Promise.all([
    import('@lezer/common'),
    import('@lezer/html'),
    import('@lezer/javascript'),
    import('@lezer/css'),
  ])
  const expression = javascript.configure({ top: 'SingleExpression' })

  return lezer(
    html.configure({
      dialect: vue ? 'selfClosing' : undefined,
      wrap: parseMixed((node, input) => {
        if (node.name === 'ScriptText') {
          return { parser: javascript, bracketed: true }
        }
        if (node.name === 'StyleText') {
          return { parser: css, bracketed: true }
        }
        if (!vue) {
          return null
        }

        const source = input.read(node.from, node.to)

        if (node.name === 'Text') {
          const ranges: Array<{ from: number; to: number }> = []
          const interpolation = /{{([\s\S]*?)}}/g
          let match: RegExpExecArray | null

          while ((match = interpolation.exec(source)) !== null) {
            ranges.push({
              from: node.from + match.index + 2,
              to: node.from + match.index + match[0].length - 2,
            })
          }

          return ranges.length === 0
            ? null
            : { parser: expression, overlay: ranges }
        }

        if (
          node.name === 'Attribute' &&
          /^(?:v-|@|:)/.test(source.trimStart())
        ) {
          const value = /=\s*(["'])([\s\S]*)\1\s*$/.exec(source)

          if (value !== null) {
            const start = source.indexOf(value[1], value.index) + 1
            return {
              parser: expression,
              overlay: [
                {
                  from: node.from + start,
                  to: node.from + start + value[2].length,
                },
              ],
            }
          }
        }

        return null
      }),
    })
  )
}

async function loadPHP(): Promise<HighlighterLanguage> {
  const [{ parseMixed }, { parser: php }, { styleTags, tags }, html] =
    await Promise.all([
      import('@lezer/common'),
      import('@lezer/php'),
      import('@lezer/highlight'),
      loadHTML(),
    ])
  const phpStyleExtensions = styleTags({
    'Attribute/Name': tags.annotation,
    readonly: tags.modifier,
  })

  return lezer(
    php.configure({
      props: [phpStyleExtensions],
      top: 'Template',
      wrap: parseMixed(node =>
        !node.type.isTop || html.kind !== 'lezer'
          ? null
          : {
              parser: html.parser,
              overlay: descendant => descendant.name === 'Text',
            }
      ),
    })
  )
}

async function loadMarkdown(): Promise<HighlighterLanguage> {
  const { parser, GFM, Subscript, Superscript, Emoji } = await import(
    '@lezer/markdown'
  )

  return lezer(parser.configure([GFM, Subscript, Superscript, Emoji]))
}

async function loadPug(): Promise<HighlighterLanguage> {
  const { pug } = await import('@codemirror/legacy-modes/mode/pug')

  return stream(pug)
}

const StreamLanguage = { define: stream }

export const languageDefinitions: ReadonlyArray<ILanguageDefinition> = [
  {
    name: 'JavaScript',
    modeClass: 'javascript',
    load: async () => lezer((await import('@lezer/javascript')).parser),
    mappings: ['.js', '.mjs', '.cjs'],
  },
  {
    name: 'TypeScript',
    modeClass: 'javascript',
    load: async () =>
      lezer(
        (await import('@lezer/javascript')).parser.configure({ dialect: 'ts' })
      ),
    mappings: ['.ts', '.mts', '.cts'],
  },
  {
    name: 'JSON',
    modeClass: 'javascript',
    load: async () => lezer((await import('@lezer/json')).parser),
    mappings: ['.json'],
  },
  {
    name: 'JSX',
    modeClass: 'javascript',
    load: async () =>
      lezer(
        (await import('@lezer/javascript')).parser.configure({ dialect: 'jsx' })
      ),
    mappings: ['.jsx', '.mjsx', '.cjsx'],
  },
  {
    name: 'TSX',
    modeClass: 'javascript',
    load: async () =>
      lezer(
        (await import('@lezer/javascript')).parser.configure({
          dialect: 'jsx ts',
        })
      ),
    mappings: ['.tsx', '.mtsx', '.ctsx'],
  },
  {
    name: 'CoffeeScript',
    modeClass: 'coffeescript',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/coffeescript'))
          .coffeeScript
      ),
    mappings: ['.coffee'],
  },
  {
    name: 'HTML',
    modeClass: 'htmlmixed',
    load: loadHTML,
    mappings: ['.html', '.htm', '.astro'],
  },
  {
    name: 'ASP and JSP templates',
    modeClass: 'htmlmixed',
    load: loadHTML,
    mappings: ['.aspx', '.cshtml', '.jsp'],
    compatibilityFallback: 'HTML',
  },
  {
    name: 'CSS',
    modeClass: 'css',
    load: async () => lezer((await import('@lezer/css')).parser),
    mappings: ['.css'],
  },
  {
    name: 'SCSS',
    modeClass: 'css',
    load: async () => lezer((await import('@lezer/sass')).parser),
    mappings: ['.scss'],
  },
  {
    name: 'LESS',
    modeClass: 'css',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/css')).less
      ),
    mappings: ['.less'],
  },
  {
    name: 'Vue',
    modeClass: 'vue',
    load: async () => loadHTML(true),
    mappings: ['.vue'],
  },
  {
    name: 'Markdown',
    modeClass: 'markdown',
    load: loadMarkdown,
    mappings: ['.markdown', '.md', '.mdx'],
  },
  {
    name: 'reStructuredText',
    modeClass: 'markdown',
    load: loadMarkdown,
    mappings: ['.rst'],
    compatibilityFallback: 'Markdown',
  },
  {
    name: 'YAML',
    modeClass: 'yaml',
    load: async () => lezer((await import('@lezer/yaml')).parser),
    mappings: ['.yaml', '.yml'],
  },
  {
    name: 'XML',
    modeClass: 'xml',
    load: async () => lezer((await import('@lezer/xml')).parser),
    mappings: [
      '.xml',
      '.xaml',
      '.xsd',
      '.csproj',
      '.fsproj',
      '.vcxproj',
      '.vbproj',
      '.svg',
      '.resx',
      '.props',
      '.targets',
    ],
  },
  {
    name: 'Diff',
    modeClass: 'diff',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/diff')).diff
      ),
    mappings: ['.diff', '.patch'],
  },
  {
    name: 'Objective-C',
    modeClass: 'clike',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/clike')).objectiveC
      ),
    mappings: ['.m'],
  },
  {
    name: 'Scala',
    modeClass: 'clike',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/clike')).scala
      ),
    mappings: ['.scala', '.sc'],
  },
  {
    name: 'C#',
    modeClass: 'clike',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/clike')).csharp
      ),
    mappings: ['.cs', '.cake'],
  },
  {
    name: 'Java',
    modeClass: 'clike',
    load: async () => lezer((await import('@lezer/java')).parser),
    mappings: ['.java'],
  },
  {
    name: 'C',
    modeClass: 'clike',
    load: async () => lezer((await import('@lezer/cpp')).parser),
    mappings: ['.c', '.h', '.ino'],
  },
  {
    name: 'C++',
    modeClass: 'clike',
    load: async () => lezer((await import('@lezer/cpp')).parser),
    mappings: ['.cpp', '.hpp', '.cc', '.hh', '.hxx', '.cxx'],
  },
  {
    name: 'Kotlin',
    modeClass: 'clike',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/clike')).kotlin
      ),
    mappings: ['.kt'],
  },
  {
    name: 'OCaml',
    modeClass: 'mllike',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/mllike')).oCaml
      ),
    mappings: ['.ml'],
  },
  {
    name: 'F#',
    modeClass: 'mllike',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/mllike')).fSharp
      ),
    mappings: ['.fs', '.fsx', '.fsi'],
  },
  {
    name: 'Swift',
    modeClass: 'swift',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/swift')).swift
      ),
    mappings: ['.swift'],
  },
  {
    name: 'Shell',
    modeClass: 'shell',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/shell')).shell
      ),
    mappings: ['.sh'],
  },
  {
    name: 'SQL',
    modeClass: 'sql',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/sql')).standardSQL
      ),
    mappings: ['.sql'],
  },
  {
    name: 'Cypher',
    modeClass: 'cypher',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/cypher')).cypher
      ),
    mappings: ['.cql'],
  },
  {
    name: 'Go',
    modeClass: 'go',
    load: async () => lezer((await import('@lezer/go')).parser),
    mappings: ['.go'],
  },
  {
    name: 'Perl',
    modeClass: 'perl',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/perl')).perl
      ),
    mappings: ['.pl'],
  },
  {
    name: 'PHP',
    modeClass: 'php',
    load: loadPHP,
    mappings: ['.php'],
  },
  {
    name: 'Python',
    modeClass: 'python',
    load: async () => lezer((await import('@lezer/python')).parser),
    mappings: ['.py', '.pyi', '.vpy'],
  },
  {
    name: 'Ruby',
    modeClass: 'ruby',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/ruby')).ruby
      ),
    mappings: ['.rb'],
  },
  {
    name: 'HAML',
    modeClass: 'ruby',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/ruby')).ruby
      ),
    mappings: ['.haml'],
    compatibilityFallback: 'Ruby',
  },
  {
    name: 'Slim',
    modeClass: 'ruby',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/ruby')).ruby
      ),
    mappings: ['.slim'],
    compatibilityFallback: 'Ruby',
  },
  {
    name: 'Clojure',
    modeClass: 'clojure',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/clojure')).clojure
      ),
    mappings: ['.clj', '.cljc', '.cljs', '.edn'],
  },
  {
    name: 'Rust',
    modeClass: 'rust',
    load: async () => lezer((await import('@lezer/rust')).parser),
    mappings: ['.rs'],
  },
  {
    name: 'Elixir',
    modeClass: 'elixir',
    load: async () => lezer((await import('lezer-elixir')).parser),
    mappings: ['.ex', '.exs'],
  },
  {
    name: 'Haxe',
    modeClass: 'haxe',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/haxe')).haxe
      ),
    mappings: ['.hx'],
  },
  {
    name: 'R',
    modeClass: 'r',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/r')).r
      ),
    mappings: ['.r'],
  },
  {
    name: 'PowerShell',
    modeClass: 'powershell',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/powershell')).powerShell
      ),
    mappings: ['.ps1'],
  },
  {
    name: 'Visual Basic',
    modeClass: 'vb',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/vb')).vb
      ),
    mappings: ['.vb'],
  },
  {
    name: 'Fortran',
    modeClass: 'fortran',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/fortran')).fortran
      ),
    mappings: ['.f', '.f90'],
  },
  {
    name: 'Lua',
    modeClass: 'lua',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/lua')).lua
      ),
    mappings: ['.lua'],
  },
  {
    name: 'Luau',
    modeClass: 'luau',
    load: async () => stream((await import('./languages/luau')).luau),
    mappings: ['.luau'],
  },
  {
    name: 'Crystal',
    modeClass: 'crystal',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/crystal')).crystal
      ),
    mappings: ['.cr'],
  },
  {
    name: 'Julia',
    modeClass: 'julia',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/julia')).julia
      ),
    mappings: ['.jl'],
  },
  {
    name: 'sTeX',
    modeClass: 'stex',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/stex')).stex
      ),
    mappings: ['.tex'],
  },
  {
    name: 'SPARQL',
    modeClass: 'sparql',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/sparql')).sparql
      ),
    mappings: ['.rq'],
  },
  {
    name: 'Stylus',
    modeClass: 'stylus',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/stylus')).stylus
      ),
    mappings: ['.styl'],
  },
  {
    name: 'Soy',
    modeClass: 'htmlmixed',
    load: loadHTML,
    mappings: ['.soy'],
    compatibilityFallback: 'HTML',
  },
  {
    name: 'Smalltalk',
    modeClass: 'smalltalk',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/smalltalk')).smalltalk
      ),
    mappings: ['.st'],
  },
  {
    name: 'Sieve',
    modeClass: 'sieve',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/sieve')).sieve
      ),
    mappings: ['.sieve'],
  },
  {
    name: 'Scheme',
    modeClass: 'scheme',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/scheme')).scheme
      ),
    mappings: ['.ss', '.sls', '.scm'],
  },
  {
    name: 'RPM',
    modeClass: 'rpm',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/rpm')).rpmSpec
      ),
    mappings: ['.rpm'],
  },
  {
    name: 'Q',
    modeClass: 'q',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/q')).q
      ),
    mappings: ['.q'],
  },
  {
    name: 'Puppet',
    modeClass: 'puppet',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/puppet')).puppet
      ),
    mappings: ['.pp'],
  },
  {
    name: 'Pug',
    modeClass: 'pug',
    load: loadPug,
    mappings: ['.pug'],
  },
  {
    name: 'Protobuf',
    modeClass: 'protobuf',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/protobuf')).protobuf
      ),
    mappings: ['.proto'],
  },
  {
    name: 'Properties',
    modeClass: 'properties',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/properties')).properties
      ),
    mappings: ['.properties', '.ini'],
    basenames: ['.gitattributes', '.gitignore', '.editorconfig'],
  },
  {
    name: 'Apache Pig',
    modeClass: 'pig',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/pig')).pig
      ),
    mappings: ['.pig'],
  },
  {
    name: 'ASCII Armor',
    modeClass: 'asciiarmor',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/asciiarmor')).asciiArmor
      ),
    mappings: ['.pgp'],
  },
  {
    name: 'Oz',
    modeClass: 'oz',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/oz')).oz
      ),
    mappings: ['.oz'],
  },
  {
    name: 'Pascal',
    modeClass: 'pascal',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/pascal')).pascal
      ),
    mappings: ['.pas'],
  },
  {
    name: 'TOML',
    modeClass: 'toml',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/toml')).toml
      ),
    mappings: ['.toml'],
    basenames: ['cargo.lock'],
  },
  {
    name: 'Dart',
    modeClass: 'clike',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/clike')).dart
      ),
    mappings: ['.dart'],
  },
  {
    name: 'Zig',
    modeClass: 'zig',
    load: async () => stream((await import('./languages/zig')).zig),
    mappings: ['.zig'],
  },
  {
    name: 'CMake',
    modeClass: 'cmake',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/cmake')).cmake
      ),
    mappings: ['.cmake'],
  },
  {
    name: 'Dockerfile',
    modeClass: 'dockerfile',
    load: async () =>
      StreamLanguage.define(
        (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile
      ),
    mappings: [],
    basenames: ['dockerfile'],
  },
]

const extensionLanguageMap = new Map<string, ILanguageDefinition>()
const basenameLanguageMap = new Map<string, ILanguageDefinition>()

for (const definition of languageDefinitions) {
  for (const mapping of definition.mappings) {
    extensionLanguageMap.set(mapping, definition)
  }

  for (const basename of definition.basenames ?? []) {
    basenameLanguageMap.set(basename, definition)
  }
}

function languageFromShebang(
  firstLine: string
): ILanguageDefinition | undefined {
  if (!firstLine.startsWith('#!')) {
    return undefined
  }

  const match = /^#!.*?(ts-node|node|bash|sh|perl|python(?:[\d.]+)?)/g.exec(
    firstLine
  )

  if (match === null) {
    return undefined
  }

  switch (match[1]) {
    case 'ts-node':
      return extensionLanguageMap.get('.ts')
    case 'node':
      return extensionLanguageMap.get('.js')
    case 'perl':
      return extensionLanguageMap.get('.pl')
    case 'sh':
    case 'bash':
      return extensionLanguageMap.get('.sh')
    default:
      return match[1].startsWith('python')
        ? extensionLanguageMap.get('.py')
        : undefined
  }
}

export function detectLanguage(
  extension: string,
  basename: string,
  contentLines: ReadonlyArray<string>
): ILanguageDefinition | undefined {
  const byPath =
    extensionLanguageMap.get(extension.toLowerCase()) ??
    basenameLanguageMap.get(basename.toLowerCase())

  if (byPath !== undefined) {
    return byPath
  }

  const firstLine = contentLines[0] ?? ''

  if (firstLine.startsWith('<?xml')) {
    return extensionLanguageMap.get('.xml')
  }

  return languageFromShebang(firstLine)
}
