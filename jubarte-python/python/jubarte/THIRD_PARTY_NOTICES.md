# Third-party notices

<!-- Written by scripts/sync_license_files.py from each crate's THIRD_PARTY_NOTICES.md and the renderer's font licences. Edit those, not this file. -->

This package carries the jubarte engine, compiled from its crates, and the
fonts its renderer embeds. jubarte is licensed under the Apache License 2.0
(see `LICENSE`). Parts of the engine are adapted from other projects, and
the fonts keep their own licence. Each crate's notices follow, with paths
relative to the crate in the source repository, and then the fonts' licence
texts.

## jubarte-cli

jubarte-cli is licensed under the Apache License 2.0 (see `LICENSE`), except
for what is listed here.

| Files | Adapted from | Licence |
| --- | --- | --- |
| `src/update/zipsign.rs` | [zipsign](https://github.com/Kijewski/zipsign): zipsign-api 0.2.2's `verify/`, `verify_unsign_tar.rs` and `constants.rs` | MIT |

### zipsign

The signature check of downloaded release archives is adapted from
zipsign-api, which is offered under
`MIT OR Apache-2.0 OR Apache-2.0 WITH LLVM-exception`; jubarte uses it under
MIT. The file names zipsign's author beside Jandira in its SPDX header and
carries `Apache-2.0 AND MIT`. zipsign's notice, as the MIT License requires:

```text
Copyright (c) 2023-2025 René Kijewski <crates.io@k6i.de>

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```

## jubarte-dom

jubarte-dom is licensed under the Apache License 2.0 (see `LICENSE`). The
files below port helpers of [Docxodus](https://github.com/JSv4/Docxodus), a
fork of Microsoft's
[Open-Xml-PowerTools](https://github.com/OfficeDev/Open-Xml-PowerTools); both
projects are under the MIT License. Each file names the upstream copyright
holders beside Jandira's in its SPDX header and carries
`Apache-2.0 AND MIT`. The two notices the MIT License requires follow.

| Files | Ported from | Licence |
| --- | --- | --- |
| `src/namespaces.rs`<br>`src/unid.rs`<br>`src/util/mod.rs` | Docxodus: `PtOpenXmlUtil`'s namespace constants, `UnidHelper` and `PtUtil` | MIT |

### Docxodus

[Docxodus](https://github.com/JSv4/Docxodus), the project the code is
ported from:

```text
The MIT License (MIT)

Copyright (c) Microsoft Corporation
Copyright (c) 2025-2026 John Scrudato IV

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

### Open-Xml-PowerTools

[Open-Xml-PowerTools](https://github.com/OfficeDev/Open-Xml-PowerTools), the
Microsoft project Docxodus forks:

```text
The MIT License (MIT)

Copyright (c) .NET Foundation and Contributors
All rights reserved.

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

## jubarte-markdown

jubarte-markdown is licensed under the Apache License 2.0 (see `LICENSE`),
except for what is listed here.

| Files | From | Licence |
| --- | --- | --- |
| `src/markdown/from_docx/mod.rs`<br>`src/markdown/from_docx/critic.rs`<br>`src/markdown/from_docx/media.rs`<br>`src/markdown/from_docx/ooxml.rs`<br>`src/markdown/from_docx/revise.rs` | anymd's `anymd-formats` crate | MIT |
| `src/markdown/word_table_styles.tsv` | Microsoft Word's built-in table styles | Microsoft's, not licensed by Jandira |

### anymd

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

### Word's built-in table styles

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

## jubarte-opc

jubarte-opc is licensed under the Apache License 2.0 (see `LICENSE`). Two of
its files come from Microsoft projects under the MIT License:

- `src/markup_simplifier.rs` ports `SingleCharacterRunTransform` of
  [Docxodus](https://github.com/JSv4/Docxodus), a fork of Microsoft's
  [Open-Xml-PowerTools](https://github.com/OfficeDev/Open-Xml-PowerTools).
- `src/word_default_theme.rs` embeds, unchanged, the theme part Word writes
  into a document that has none, as Microsoft publishes it in
  [microsoft/PPCC25-ALM](https://github.com/microsoft/PPCC25-ALM)
  (`docs/labs/lab3/source/Lab3_extracted/word/theme/theme1.xml`).

Each names the upstream copyright holders beside Jandira's in its SPDX header
and carries `Apache-2.0 AND MIT`. The notices the MIT License requires
follow.

| Files | From | Licence |
| --- | --- | --- |
| `src/markup_simplifier.rs` | Docxodus | MIT |
| `src/word_default_theme.rs` | microsoft/PPCC25-ALM | MIT |

### Docxodus

[Docxodus](https://github.com/JSv4/Docxodus), the project the code is
ported from:

The same notice as under jubarte-dom, above.

### Open-Xml-PowerTools

[Open-Xml-PowerTools](https://github.com/OfficeDev/Open-Xml-PowerTools), the
Microsoft project Docxodus forks:

The same notice as under jubarte-dom, above.

### Word's default theme

[microsoft/PPCC25-ALM](https://github.com/microsoft/PPCC25-ALM), the source of
the theme part:

```text
MIT License

Copyright (c) 2025 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## jubarte-redlines

jubarte-redlines is licensed under the Apache License 2.0 (see `LICENSE`).
Its document comparer is a Rust port of the comparer of
[Docxodus](https://github.com/JSv4/Docxodus), a fork of Microsoft's
[Open-Xml-PowerTools](https://github.com/OfficeDev/Open-Xml-PowerTools):
`WmlComparer`, `DocumentComparer`, `RevisionProcessor` and their helpers.
Both projects are under the MIT License. The files below port that code;
each names the upstream copyright holders beside Jandira's in its SPDX
header and carries `Apache-2.0 AND MIT`. The two notices the MIT License
requires follow.

| Files | Ported from | Licence |
| --- | --- | --- |
| `src/comparer/mod.rs`<br>`src/comparer/atomize.rs`<br>`src/comparer/atoms.rs`<br>`src/comparer/cross_para.rs`<br>`src/comparer/finalize/mod.rs`<br>`src/comparer/finalize/markup_cleanup.rs`<br>`src/comparer/finalize/schema_order.rs`<br>`src/comparer/formatchg.rs`<br>`src/comparer/lcs/mod.rs`<br>`src/comparer/lcs_table.rs`<br>`src/comparer/moves.rs`<br>`src/comparer/preprocess.rs`<br>`src/comparer/units.rs`<br>`src/comparison_log.rs`<br>`src/document_comparer/mod.rs`<br>`src/revision_processor.rs`<br>`src/wml_document.rs` | Docxodus | MIT |

### Docxodus

[Docxodus](https://github.com/JSv4/Docxodus), the project the code is
ported from:

The same notice as under jubarte-dom, above.

### Open-Xml-PowerTools

[Open-Xml-PowerTools](https://github.com/OfficeDev/Open-Xml-PowerTools), the
Microsoft project Docxodus forks:

The same notice as under jubarte-dom, above.

## jubarte-render

jubarte-render is licensed under the Apache License 2.0 (see `LICENSE`),
except for what is listed here.

| Files | From | Licence |
| --- | --- | --- |
| `src/convert/math_font.rs`<br>`src/convert/math_layout.rs` | [markdown2pdf](https://github.com/theiskaa/markdown2pdf) | MIT |
| `assets/fonts/Carlito-*.ttf` | Carlito, Copyright (c) 2010-2013 tyPoland Lukasz Dziedzic | OFL-1.1, text in `assets/fonts/LICENSE-Carlito` |
| `assets/fonts/Liberation*.ttf` | Liberation Sans, Serif and Mono, Digitized data copyright (c) 2010 Google Corporation and Copyright (c) 2012 Red Hat, Inc. | OFL-1.1, text in `assets/fonts/LICENSE-Liberation` |

### markdown2pdf

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

### The fonts

The renderer embeds these fonts, unmodified: Carlito and the Liberation
families are the metric-compatible stand-ins LibreOffice uses for Calibri,
Arial, Times New Roman and Courier New. They keep the SIL Open Font License
1.1; its text, with each family's copyright notice, is in the two files
beside them, which ship in this crate.

## The fonts' licences

### LICENSE-Carlito

```text
Copyright (c) 2010-2013 by tyPoland Lukasz Dziedzic with Reserved Font Name "Carlito".

This Font Software is licensed under the SIL Open Font License,
Version 1.1 as shown below.

SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE The goals of the Open Font License (OFL) are to stimulate
worldwide development of collaborative font projects, to support the font
creation efforts of academic and linguistic communities, and to provide
a free and open framework in which fonts may be shared and improved in
partnership with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves.
The fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works.  The fonts and derivatives,
however, cannot be released under any other type of license.  The
requirement for fonts to remain under this license does not apply to
any document created using the fonts or their derivatives.


DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such.
This may include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components
as distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting — in part or in whole —
any of the components of the Original Version, by changing formats or
by porting the Font Software to a new environment.

"Author" refers to any designer, engineer, programmer, technical writer
or other person who contributed to the Font Software.


PERMISSION & CONDITIONS

Permission is hereby granted, free of charge, to any person obtaining a
copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,in
   Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
   redistributed and/or sold with any software, provided that each copy
   contains the above copyright notice and this license. These can be
   included either as stand-alone text files, human-readable headers or
   in the appropriate machine-readable metadata fields within text or
   binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
   Name(s) unless explicit written permission is granted by the
   corresponding Copyright Holder. This restriction only applies to the
   primary font name as presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
   Software shall not be used to promote, endorse or advertise any
   Modified Version, except to acknowledge the contribution(s) of the
   Copyright Holder(s) and the Author(s) or with their explicit written
   permission.

5) The Font Software, modified or unmodified, in part or in whole, must
   be distributed entirely under this license, and must not be distributed
   under any other license. The requirement for fonts to remain under
   this license does not apply to any document created using the Font
   Software.



TERMINATION
This license becomes null and void if any of the above conditions are not met.



DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT.  IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM OTHER
DEALINGS IN THE FONT SOFTWARE.
```

### LICENSE-Liberation

```text
Digitized data copyright (c) 2010 Google Corporation
	with Reserved Font Name Arimo, Tinos and Cousine.
Copyright (c) 2012 Red Hat, Inc.
	with Reserved Font Name Liberation.

This Font Software is licensed under the SIL Open Font License,
Version 1.1.

This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE The goals of the Open Font License (OFL) are to stimulate
worldwide development of collaborative font projects, to support the font
creation efforts of academic and linguistic communities, and to provide
a free and open framework in which fonts may be shared and improved in
partnership with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves.
The fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works.  The fonts and derivatives,
however, cannot be released under any other type of license.  The
requirement for fonts to remain under this license does not apply to
any document created using the fonts or their derivatives.



DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such.
This may include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components
as distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting — in part or in whole —
any of the components of the Original Version, by changing formats or
by porting the Font Software to a new environment.

"Author" refers to any designer, engineer, programmer, technical writer
or other person who contributed to the Font Software.


PERMISSION & CONDITIONS

Permission is hereby granted, free of charge, to any person obtaining a
copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,in
   Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
   redistributed and/or sold with any software, provided that each copy
   contains the above copyright notice and this license. These can be
   included either as stand-alone text files, human-readable headers or
   in the appropriate machine-readable metadata fields within text or
   binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
   Name(s) unless explicit written permission is granted by the
   corresponding Copyright Holder. This restriction only applies to the
   primary font name as presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
   Software shall not be used to promote, endorse or advertise any
   Modified Version, except to acknowledge the contribution(s) of the
   Copyright Holder(s) and the Author(s) or with their explicit written
   permission.

5) The Font Software, modified or unmodified, in part or in whole, must
   be distributed entirely under this license, and must not be distributed
   under any other license. The requirement for fonts to remain under
   this license does not apply to any document created using the Font
   Software.



TERMINATION
This license becomes null and void if any of the above conditions are not met.



DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT.  IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM OTHER
DEALINGS IN THE FONT SOFTWARE.
```

## The MCP App view (`ui/document.html`, built from jubarte-mcp-ui)

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

### Premirror

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

### remark-critic-markup

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

### The fonts

The three desk faces are the variable WOFF2 files jubarte-app and jubarte.pro
serve. The four page faces (#99) draw the document's own text where the
machine lacks its font: they have the advances of Calibri, Arial, Times New
Roman and Courier New. They are subsets of the renderer's Carlito and
Liberation fonts. The OFL treats a subset as a Modified Version, which may not
use a Reserved Font Name, so each is renamed in its `name` table; the
copyright notices are kept. Their licence texts, with each font's copyright,
are in `licenses/`, and the built view quotes them in full.
