# Third-party notices

The tests are licensed under the Apache License 2.0 (see
[`LICENSE`](../LICENSE)), except for the test material below, which comes
from other projects and keeps its own licence. No package ships it. The
notices live here, not beside the fixtures, because the tests read every
file in those folders as a fixture.

| Files | From | Licence |
| --- | --- | --- |
| `it_markdown/docx_to_markdown_critic_markup.rs`<br>`it_markdown/docx_to_markdown_critic_synthetic.rs`<br>`it_markdown/docx_to_markdown_office_samples.rs`<br>`fixtures/from-docx/` | anymd's `anymd-formats` crate: its Word to Markdown tests, fixtures and fixture scripts, adapted | MIT, Copyright (c) 2024-2026 SylphxAI; Jandira's changes Apache-2.0 |
| `fixtures/from-docx/equations.docx` | microsoft/markitdown's tests (`packages/markitdown/tests/test_files`), by way of anymd's | MIT, Copyright (c) Microsoft Corporation |
| `fixtures/math/builtin-equations.docx`<br>`fixtures/math/quadratic-in-table.docx` | Docling's test data | MIT, The Docling Contributors |
| `fixtures/math/floating-table-subsup.docx`<br>`fixtures/math/mismatched-delimiters.docx`<br>`fixtures/math/open-brace-delimiter.docx`<br>`fixtures/math/brackets-and-braces.docx`<br>`fixtures/math/accents-dot.docx`<br>`fixtures/math/accent-overline.docx`<br>`fixtures/math/word2007-equations.docx`<br>`fixtures/math/bold-italic-math.docx`<br>`fixtures/math/literal-bracket-chars.docx`<br>`fixtures/math/inline-symbol-runs.docx` | LibreOffice's test data | [MPL-2.0](https://mozilla.org/MPL/2.0/), LibreOffice contributors |
| `fixtures/math/tracked-changes-equations.docx`<br>`fixtures/math/strict-binomial.docx` | docx4j's test data | Apache-2.0, Plutext Pty Ltd |
| `fixtures/math/rev-inserted-math.docx`<br>`fixtures/math/rev-deleted-math.docx` | Open-Xml-PowerTools' test files | MIT, Microsoft Corporation |
| `fixtures/math/matrix-angle-brackets.docx`<br>`fixtures/math/ssubsup-arg-size.docx`<br>`fixtures/math/eqarr-row-spacing.docx` | the Open XML SDK's test assets | MIT, .NET Foundation and Contributors |
| `fixtures/math/matrix-subscripts.docx` | Apache POI's test data | Apache-2.0, The Apache Software Foundation |
| `fixtures/math/inline-binomial-parens.docx` | docx-equation | MIT, 2020 zlqm |
| `fixtures/md-roundtrip/eLife.00047.md` | Ferguson et al., eLife 2012 | [CC-BY-3.0](https://creativecommons.org/licenses/by/3.0/), Copyright (c) 2012, Ferguson et al. |
| `fixtures/md-roundtrip/git_manuscript.md`<br>`fixtures/md-roundtrip/list_of_figures.md` | Ram, Source Code for Biology and Medicine 2013 | [CC-BY-2.0](https://creativecommons.org/licenses/by/2.0/), Copyright (c) 2013 Ram; licensee BioMed Central Ltd. |
| `fixtures/md-roundtrip/dolphins.md` | Thompson et al., PLoS ONE 2013 | Creative Commons Attribution License, version not stated; Copyright (c) 2013 Thompson et al. |
| `fixtures/md-roundtrip/demo.docx` | [docen](https://github.com/DemoMacro/docen)'s feature showcase | MIT, Copyright (c) 2025 Demo Macro |
| `fixtures/fonts/STIXTwoMath.otf` | STIX Two Math, unmodified (geometry tests only) | OFL-1.1, text and copyright in [`fixtures/fonts/STIXTwoMath-OFL.txt`](fixtures/fonts/STIXTwoMath-OFL.txt) |

[`fixtures/math/SOURCES.md`](fixtures/math/SOURCES.md) gives each Office Math
fixture's URL. The Apache-2.0 fixtures are under the licence whose text is
the repository's [`LICENSE`](../LICENSE).

## anymd

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

## docen

```text
MIT License

Copyright (c) 2025 Demo Macro

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

## The other MIT fixtures

Docling, markitdown, Open-Xml-PowerTools, the Open XML SDK and
docx-equation publish these files under the MIT License, with the copyright
notices the table gives:

```text
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

## The manuscripts

dolphins.md, eLife.00047.md, git_manuscript.md and list_of_figures.md are
third-party scholarly manuscripts in Pandoc Markdown, added on 2026-10-14
as round-trip inputs at Arthur Souza Rodrigues's request. They are not
licensed by Jandira Technologies, LLC and are not covered by this
repository's Apache-2.0 license. Each stays under the license its
publisher states (checked 2026-10-14), kept unmodified, for testing only:

- eLife.00047.md: Ferguson, Mansur, Peters, Ren and Smith, "DNA-PK is a
  DNA sensor for IRF-3-dependent innate immunity", eLife 2012;1:e00047,
  doi:10.7554/eLife.00047. Copyright (c) 2012, Ferguson et al. Creative
  Commons Attribution License 3.0 (CC-BY-3.0,
  https://creativecommons.org/licenses/by/3.0/).

- git_manuscript.md and list_of_figures.md: Karthik Ram, "Git can
  facilitate greater reproducibility and increased transparency in
  science", Source Code for Biology and Medicine 2013, 8:7,
  doi:10.1186/1751-0473-8-7, and its list of figures. Copyright (c) 2013
  Ram; licensee BioMed Central Ltd. Creative Commons Attribution License
  2.0 (CC-BY-2.0, https://creativecommons.org/licenses/by/2.0/).

- dolphins.md: Thompson, Abraham and Berkenbusch, "Common Dolphin
  (Delphinus delphis) Bycatch in New Zealand Commercial Trawl Fisheries",
  PLoS ONE 2013, 8(5): e64438, doi:10.1371/journal.pone.0064438.
  Copyright (c) 2013 Thompson et al. PLOS states: "This is an open-access
  article distributed under the terms of the Creative Commons Attribution
  License, which permits unrestricted use, distribution, and reproduction
  in any medium, provided the original author and source are credited."
  The statement names no version, so none is claimed here.
