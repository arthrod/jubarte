# Third-party notices

jubarte-mcp-ui is licensed under the Apache License 2.0 (see `LICENSE` at the
repository root), except for what is listed here. The reader (`reader/`) and
the desk stylesheet (`src/desk/styles.css`) are Jandira's own, copied from
jubarte-app. The view it builds, `jubarte-python/python/jubarte/ui/document.html`,
also bundles npm packages; that file opens with the full licence text of every
package and font it contains.

| Files | Comes from | Licence |
| --- | --- | --- |
| `reader/vendor/premirror/` | [Premirror](https://github.com/arthrod/premirror) at `29b78634d6496206c84015068eb7d66d9cdc312c`, Sam Willis's pagination engine, with local integration changes (`reader/vendor/premirror/UPSTREAM.txt`) | MIT |
| `reader/vendor/remark-critic-markup-jubarte/` | [remark-critic-markup](https://www.npmjs.com/package/remark-critic-markup) 1.0.1 by Ben, with jubarte's dialect | MIT |
| `src/fonts/manrope-*.woff2` | [Manrope](https://github.com/sharanda/manrope), Copyright 2019 The Manrope Project Authors | OFL-1.1 (`licenses/LICENSE-manrope.txt`) |
| `src/fonts/jetbrains-mono-*.woff2` | [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), Copyright 2020 The JetBrains Mono Project Authors | OFL-1.1 (`licenses/LICENSE-jetbrains-mono.txt`) |
| `src/fonts/source-serif-4-*.woff2` | [Source Serif 4](https://github.com/adobe-fonts/source-serif) | OFL-1.1 (`licenses/LICENSE-source-serif-4.txt`) |

## Premirror

Each vendored file names Sam Willis in its SPDX header and carries `MIT`.
Premirror's notice, as the MIT License requires:

```text
MIT License

Copyright (c) 2026 Sam Willis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## remark-critic-markup

Each vendored file names Ben in its SPDX header and carries `MIT`. The
package's notice, as the MIT License requires:

```text
MIT License

Copyright (c) 2022 Ben

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## The fonts

The three faces are the variable WOFF2 files jubarte-app and jubarte.pro
serve. Their licence texts, with each font's copyright, are in `licenses/`,
and the built view quotes them in full.

The MCP App view bundles Source Serif 4, version 4.004. Its bundled WOFF2
files carry this copyright and reserved font name in their name table:

```text
© 2014 - 2021 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name ‘Source’.
```

The SIL Open Font License, Version 1.1, is reproduced in
`licenses/LICENSE-source-serif-4.txt` and in the built view.
