# Syntax Highlighted Diffs

We introduced syntax highlighted diffs in
[#3101](https://github.com/desktop/desktop/pull/3101).

<!-- markdownlint-disable-next-line MD013 -->
<img width="578" alt="A screenshot of GitHub Desktop showing a diff with syntax highlighting" src="https://user-images.githubusercontent.com/634063/31934229-d2ffdac8-b8ab-11e7-84e7-1bb2c0e1a0ec.png">

## Supported languages

We currently support syntax highlighting for the following languages and file
types.

JavaScript, JSON, TypeScript, CoffeeScript, HTML, ASP, JavaServer Pages, CSS,
SCSS, LESS, Vue, Markdown, YAML, XML, Diff, Objective-C, Scala, C#, Java, C,
C++, Kotlin, OCaml, F#, Swift, shell, SQL, Cypher, Go, Perl, PHP, Python, Ruby,
Clojure, Rust, Elixir, Haxe, R, PowerShell, Visual Basic, Fortran, Lua, Luau,
Crystal, Julia, sTeX, SPARQL, Stylus, Soy, Smalltalk, Slim, HAML, Sieve,
Scheme, reStructuredText, RPM, Q, Puppet, Pug, Protobuf, Properties, Apache Pig,
ASCII Armor (PGP), Oz, Pascal, TOML, Dart, CMake, Zig, Docker, and Astro.

This list was never meant to be exhaustive. We expect to add more languages
going forward.

Note, however, that this list is likely to grow stale. Check the language
registry in
[`app/src/highlighter/languages.ts`](../../app/src/highlighter/languages.ts)
for the authoritative list and its file mappings.

Most languages use maintained Lezer parsers. Languages without a dedicated
Lezer parser use official CodeMirror 6 legacy stream parsers where available.
The registry explicitly identifies the small number of compatibility
fallbacks, such as rendering reStructuredText with the Markdown parser.

### I want to add my favorite language

Cool! As long as it has a maintained Lezer parser, an official
[legacy stream parser][legacy-modes], or a compatible third-party `Parser` or
`StreamParser`, we should be able to make it work. Open an issue and we'll take
it from there.

[legacy-modes]: https://code.haverbeke.berlin/codemirror/legacy-modes

If you want to create a PR and add highlighter support for your favourite
programming language, don't forget to:

1. Submit a PR with a sample file for the language to
   [desktop/highlighter-tests](https://github.com/desktop/highlighter-tests).
2. Add a lazy-loaded definition and its mappings to
   [`languages.ts`](../../app/src/highlighter/languages.ts).
3. Add the language to the `Supported languages` list above.

## Why do the diffs on GitHub.com and Desktop look different

GitHub.com uses TextMate grammars, whereas Desktop Plus uses CodeMirror 6
Lezer and stream parsers. There are significant differences in both
granularity and tokenization between these systems, so their colors and token
boundaries will not always be identical.

## The Problem

Syntax highlighting is a well-understood problem with many available parser
systems. Desktop Plus uses CodeMirror 6 because its parsers can run without an
editor in the existing highlighter web worker and recover safely from
incomplete source in a diff.

Syntax highlighted diffs have been a much appreciated feature of GitHub.com
for a long time. Highlighting diffs is more complex than highlighting a normal
source file, though. Most languages are contextual: what happened on a line
higher up affects what happens further down. You cannot pull one line from a
diff and expect it to be highlighted correctly. Here's a good example:

<!-- markdownlint-disable-next-line MD013 -->
<img width="658" alt="A screenshot of GitHub Desktop showing a diff with a multi-line comment which is missing the opening statement" src="https://user-images.githubusercontent.com/634063/31782735-34dfe412-b4fc-11e7-8d79-46a949417ed2.png">

Had we tried to highlight individual lines, we would not have been able to
infer that the first line was part of a multi-line comment.

Instead, we take the contents of the file before and after the change and
highlight both versions. We can then stitch them together into one syntax
highlighted diff.

## The Approach

When highlighting a diff, we first scan it to determine which lines we need
from each file. Context lines can come from either version, while added and
removed lines must come from their corresponding version. If a file consists
entirely of additions or deletions, we can optimize further by loading only one
version.

Once we've got that settled, we load up to the first 1 MiB from both versions.
We pass this content, along with the lines that need tokens, to one or two web
workers. Each worker parses the complete supplied source prefix so that
highlighting remains context-aware, then returns only the requested line-local
token ranges. The worker keeps parsing off the UI thread and can be terminated
if it exceeds the timeout.

The worker adapts absolute Lezer highlight ranges, or stream-parser tokens, to
the existing `ITokens` line/UTF-16-offset protocol. The renderer then applies
the corresponding `cm-*` classes inside the diff. This means there is a small
window between displaying a diff and applying its highlighting, allowing the
diff itself to remain the first thing rendered.
