# Third-party notices

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

## Docxodus

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

## Open-Xml-PowerTools

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
