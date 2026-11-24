# Third-party notices

jubarte-render is licensed under the Apache License 2.0 (see `LICENSE`),
except for what is listed here.

| Files | From | Licence |
| --- | --- | --- |
| `src/convert/math_font.rs`<br>`src/convert/math_layout.rs` | [markdown2pdf](https://github.com/theiskaa/markdown2pdf) | MIT |
| `assets/fonts/Carlito-*.ttf` | Carlito, Copyright (c) 2010-2013 tyPoland Lukasz Dziedzic | OFL-1.1, text in [`assets/fonts/LICENSE-Carlito`](assets/fonts/LICENSE-Carlito) |
| `assets/fonts/Liberation*.ttf` | Liberation Sans, Serif and Mono, Digitized data copyright (c) 2010 Google Corporation and Copyright (c) 2012 Red Hat, Inc. | OFL-1.1, text in [`assets/fonts/LICENSE-Liberation`](assets/fonts/LICENSE-Liberation) |

## markdown2pdf

The OpenType MATH reader and the math layout arithmetic in the two source
files are adapted from markdown2pdf's `src/lib/render/math/` modules. Each
names markdown2pdf's author beside Jandira in its SPDX header and carries
`Apache-2.0 AND MIT`. markdown2pdf's notice, as the MIT License requires:

```text
MIT License

Copyright (c) 2023 Ismael Shakverdiev

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

The renderer embeds these fonts, unmodified: Carlito and the Liberation
families are the metric-compatible stand-ins LibreOffice uses for Calibri,
Arial, Times New Roman and Courier New. They keep the SIL Open Font License
1.1; its text, with each family's copyright notice, is in the two files
beside them, which ship in this crate.
