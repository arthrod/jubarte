# Third-party notices

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

## Word's default theme

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
