# CodeMirror 6 syntax-highlighter migration

## Scope

Desktop Plus no longer embeds a CodeMirror editor. CodeMirror 5 is used only by
the syntax-highlighting web worker, which converts source files into the
existing `ITokens` line/offset protocol consumed by the diff renderer. This
migration replaces that worker implementation without changing the renderer,
the worker lifecycle, or the diff token protocol.

The migration must:

- remove CodeMirror 5 and its ambient typings from the application;
- preserve every currently recognized extension and basename;
- preserve lazy language loading and the five-second worker timeout;
- parse the complete source prefix so highlighting remains context-aware;
- return token offsets in JavaScript UTF-16 string units, as before;
- split multi-line parser spans into line-local tokens;
- keep the existing `cm-*` CSS contract and mode-specific classes;
- render PHP 8 attributes without changing the source passed to the parser;
- keep unsupported and malformed code non-fatal through parser recovery; and
- avoid introducing the CodeMirror editor view into the worker bundle.

## Current architecture and constraints

- The UI loads at most 1 MiB from each side of a diff.
- One or two web workers highlight the before/after source and are terminated
  after five seconds.
- The CodeMirror 5 worker dynamically loads 59 mode modules. It tokenizes one
  line at a time and returns only the requested diff lines.
- The renderer expects `ITokens`, keyed first by zero-based line and then by a
  UTF-16 start offset. Token names are converted to `cm-${name}` classes.
- `addModeClass` adds `m-*` names used by five existing CSS compatibility
  selectors (CMake, CSS, shell, JavaScript, and TOML).
- The upstream highlighter fixture repository contains samples for the full
  supported-language list and is the parity corpus for this migration.

CodeMirror 6 is an architectural rewrite. Its Lezer parsers return absolute
document ranges, so there is no drop-in replacement for CodeMirror 5
`runMode`. The adapter must translate absolute ranges back to `ITokens`.

## Dependency plan

Only language and highlighting packages belong in the worker. The editor,
state, commands, autocomplete, and view packages are not needed directly.

Use maintained Lezer language packages for JavaScript/TypeScript/JSX, JSON,
HTML, CSS/SCSS/LESS, Vue, Markdown, YAML, XML, C/C++, Java, Go, SQL, PHP,
Python, and Rust. Use `@codemirror/legacy-modes` through `StreamLanguage` for
the remaining modes that it officially ports from CodeMirror 5. Use the
Lezer-based `codemirror-lang-elixir` and `codemirror-lang-zig` integrations for
Elixir and Zig.

Remove these dependencies:

- `codemirror`
- `@types/codemirror`
- `codemirror-mode-elixir`
- `codemirror-mode-luau`
- `codemirror-mode-zig`

Add direct dependencies for the CodeMirror language infrastructure, Lezer
highlighting, each modern language package used by Desktop Plus, the official
legacy-mode bridge, and the two third-party Lezer integrations. Direct
dependencies make webpack's static dynamic-import graph explicit and avoid
bundling every language known to `@codemirror/language-data`.

## Language coverage

### Modern Lezer parsers

- C, C++, CSS, Go, HTML, Java, JavaScript, JSON, JSX, LESS, Markdown, PHP,
  Python, Rust, SCSS, SQL, TSX, TypeScript, Vue, XML, and YAML.
- Existing aliases such as Astro-to-HTML, MDX-to-Markdown, and project files
  to XML stay explicit.

### Official CM6 legacy stream parsers

- ASCII Armor, C#, Clojure, CMake, CoffeeScript, Crystal, Cypher, Dart, diff,
  Dockerfile, F#, Fortran, Haxe, Julia, Kotlin, Lua, Objective-C, OCaml, Oz,
  Pascal, Perl, Pig, PowerShell, Properties/INI, Protobuf, Pug, Puppet, Q, R,
  RPM, Ruby, Scala, Scheme, shell, Sieve, Smalltalk, SPARQL, Stylus, Swift,
  sTeX, TOML, and Visual Basic.

### Dedicated CM6 integrations

- Elixir and Zig use third-party Lezer language packages.
- Luau uses a small local `StreamParser` port of the currently bundled
  MIT-licensed Luau mode. This preserves Luau-specific types and globals
  without retaining CodeMirror 5.

### Audited compatibility fallbacks

CM6 currently has no maintained parser for HAML, Slim, reStructuredText, Soy,
or the ASP/JSP mixed templates used here. These extensions remain supported by
the closest CM6 parser instead of becoming plain text:

- HAML and Slim use Ruby;
- reStructuredText uses Markdown;
- Soy, ASPX, CSHTML, and JSP use HTML.

These fallbacks preserve useful highlighting but do not promise exact embedded
language parity. They are the principal known migration compromise and must be
called out in any upstream pull request.

## Token adapter

Use a public Lezer `tagHighlighter` to map semantic tags to the existing token
names (`keyword`, `atom`, `number`, `def`, `variable`, `type`, `comment`,
`meta`, `string`, `property`, and so on). This keeps the renderer and themes
independent of generated CM6 CSS classes.

For each highlighted absolute range:

1. Find the containing line using precomputed line-start offsets.
2. Split ranges crossing a newline into one token per non-empty line segment.
3. Convert absolute positions to line-local UTF-16 offsets.
4. Drop segments for lines outside the requested filter.
5. Append the definition's stable `m-*` compatibility class when requested.

## PHP compatibility

The current `@lezer/php` parser handles the original Laravel class-attribute
case, typed class constants, null-coalescing assignment, ordinary hash
comments, and property hooks. It recovers locally around attributes and
`readonly` on promoted constructor properties.

Use the supported `parser.configure({ props: [styleTags(...)] })` mechanism to
tag PHP attribute names and `readonly`. This improves highlighting without
rewriting source or changing offsets. Grammar recovery remains safe for the
read-only diff use case. The underlying promoted-property grammar gap should
also be reported to `lezer/php`; it is not a reason to keep CodeMirror 5.

## Build changes

- Remove the CodeMirror 5 webpack aliases and ambient declarations.
- Update async chunk naming for scoped `@codemirror/lang-*`, official legacy
  modes, and third-party language packages.
- Keep shared CM6/Lezer infrastructure in a common async chunk.
- Verify that no `@codemirror/view` code enters `highlighter.js` or its chunks.

## Verification matrix

Before considering the migration complete:

1. Unit-test detection, unknown files, case-insensitive extensions, shebangs,
   requested-line filtering, multi-line range splitting, and mode classes.
2. Test PHP class attributes, multi-line attributes, promoted properties,
   `readonly`, regular hash comments, property hooks, typed constants, and
   malformed input recovery.
3. Smoke-load every unique language definition and parse a small source.
4. Highlight every fixture in `desktop/highlighter-tests` without throwing and
   confirm every recognized fixture returns useful tokens.
5. Run TypeScript, ESLint/Prettier, unit tests, and production webpack.
6. Benchmark representative modern, legacy, mixed, and PHP files at small,
   medium, and 1 MiB sizes. Each must stay well below the five-second timeout.
7. Compare highlighter entry/chunk sizes with the CodeMirror 5 build and record
   the result in the pull-request notes.
8. Launch the cherry-picked standalone build and visually inspect PHP,
   TypeScript, HTML/Vue, shell, and at least one legacy mode in real diffs.

## Branch and commit structure

1. Keep this audit/design as the first commit on the CM6 feature branch.
2. Commit dependency/build changes separately from the worker implementation.
3. Commit tests and documentation with the behavior they verify.
4. Keep the Catppuccin diff theme on its existing independent branch.
5. Create the local trial branch from current Desktop Plus `main`, cherry-pick
   the CM6 and theme commits, then add a final standalone product identity
   commit. Do not include the obsolete CodeMirror 5 PHP source-mask commit.
