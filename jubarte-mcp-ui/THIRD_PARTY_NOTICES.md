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
| `patches/@chenglou__pretext@0.0.5.patch` | A change to [@chenglou/pretext](https://github.com/chenglou/pretext) 0.0.5 (Copyright 2026 Pretext contributors), applied by pnpm when it installs the package: its measuring canvas does not kern (#94). The patched package is bundled in the view, which carries its licence text | MIT |
| `reader/vendor/remark-critic-markup-jubarte/` | [remark-critic-markup](https://www.npmjs.com/package/remark-critic-markup) 1.0.1 by Ben, with jubarte's dialect | MIT |
| `src/fonts/manrope-*.woff2` | [Manrope](https://github.com/sharanda/manrope), Copyright 2019 The Manrope Project Authors | OFL-1.1 (`licenses/LICENSE-manrope.txt`) |
| `src/fonts/jetbrains-mono-*.woff2` | [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), Copyright 2020 The JetBrains Mono Project Authors | OFL-1.1 (`licenses/LICENSE-jetbrains-mono.txt`) |
| `src/fonts/source-serif-4-*.woff2` | [Source Serif 4](https://github.com/adobe-fonts/source-serif) | OFL-1.1 (`licenses/LICENSE-source-serif-4.txt`) |
| `src/fonts/page/jubarte-page-c-*.woff2` | Modified from Carlito (the renderer's `crates/jubarte-render/assets/fonts/Carlito-*.ttf`), Copyright (c) 2010-2013 by tyPoland Lukasz Dziedzic with Reserved Font Name "Carlito": subset to Latin and Latin Extended, renamed "Jubarte Page C" | OFL-1.1 (`licenses/LICENSE-carlito.txt`) |
| `src/fonts/page/jubarte-page-sans-*.woff2` | Modified from Liberation Sans, Serif and Mono (the renderer's `crates/jubarte-render/assets/fonts/Liberation*.ttf`), Digitized data copyright (c) 2010 Google Corporation with Reserved Font Name Arimo, Tinos and Cousine, Copyright (c) 2012 Red Hat, Inc. with Reserved Font Name Liberation: subset to Latin and Latin Extended, renamed "Jubarte Page Sans", "Jubarte Page Serif" and "Jubarte Page Mono" | OFL-1.1 (`licenses/LICENSE-liberation.txt`) |
| `src/fonts/page/jubarte-page-serif-*.woff2` | Modified from Liberation Sans, Serif and Mono (the renderer's `crates/jubarte-render/assets/fonts/Liberation*.ttf`), Digitized data copyright (c) 2010 Google Corporation with Reserved Font Name Arimo, Tinos and Cousine, Copyright (c) 2012 Red Hat, Inc. with Reserved Font Name Liberation: subset to Latin and Latin Extended, renamed "Jubarte Page Sans", "Jubarte Page Serif" and "Jubarte Page Mono" | OFL-1.1 (`licenses/LICENSE-liberation.txt`) |
| `src/fonts/page/jubarte-page-mono-*.woff2` | Modified from Liberation Sans, Serif and Mono (the renderer's `crates/jubarte-render/assets/fonts/Liberation*.ttf`), Digitized data copyright (c) 2010 Google Corporation with Reserved Font Name Arimo, Tinos and Cousine, Copyright (c) 2012 Red Hat, Inc. with Reserved Font Name Liberation: subset to Latin and Latin Extended, renamed "Jubarte Page Sans", "Jubarte Page Serif" and "Jubarte Page Mono" | OFL-1.1 (`licenses/LICENSE-liberation.txt`) |

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

The three desk faces are the variable WOFF2 files jubarte-app and jubarte.pro
serve. The four page faces (#99) draw the document's own text where the
machine lacks its font: they have the advances of Calibri, Arial, Times New
Roman and Courier New. They are subsets of the renderer's Carlito and
Liberation fonts. The OFL treats a subset as a Modified Version, which may not
use a Reserved Font Name, so each is renamed in its `name` table; the
copyright notices are kept. Their licence texts, with each font's copyright,
are in `licenses/`, and the built view quotes them in full.
