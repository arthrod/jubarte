# Third-party notices

jubarte-markdown is licensed under the Apache License 2.0 (see `LICENSE`),
except for what is listed here.

| Files | From | Licence |
| --- | --- | --- |
| `src/markdown/from_docx/mod.rs`<br>`src/markdown/from_docx/critic.rs`<br>`src/markdown/from_docx/media.rs`<br>`src/markdown/from_docx/ooxml.rs`<br>`src/markdown/from_docx/revise.rs` | anymd's `anymd-formats` crate | MIT |
| `src/markdown/word_table_styles.tsv` | Microsoft Word's built-in table styles | Microsoft's, not licensed by Jandira |

## anymd

The Word to Markdown converter in `src/markdown/from_docx/` was copied from
anymd's `anymd-formats` crate and adapted: pictures are collected for the
caller to write instead of going to anymd's cache, and document properties
are not read. The files listed above keep its code; each names anymd's
copyright holder beside Jandira's in its SPDX header and carries
`Apache-2.0 AND MIT`. anymd's notice, as the MIT License requires:

```text
MIT License

Copyright (c) 2024-2026 SylphxAI

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

## Word's built-in table styles

The file holds the definitions of Microsoft Word's built-in Grid Table and
List Table styles (1 to 7, plain and Accent 1 to 6): borders, shading,
theme colours and tints, as Word writes them into a document that uses
them. scripts/table_styles_asset.py extracted them on 2026-10-14 from a
Word-written test fixture
(tests/corpus/bench/neurotic_docx_bench/grok_run/fixtures_500/
00f45b1b7812db57f5a024f116de6c6f0cfab5b79c9bc33657a6be57657d181d.docx),
replacing each resolved colour with a placeholder the writer resolves from
the written document's theme.

The style definitions are Microsoft's, not Jandira Technologies, LLC's,
and are not covered by this repository's Apache-2.0 license. They are
reproduced so a document that names one of these styles keeps the look
Word gives it.
