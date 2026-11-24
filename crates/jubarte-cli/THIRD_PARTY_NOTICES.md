# Third-party notices

jubarte-cli is licensed under the Apache License 2.0 (see `LICENSE`), except
for what is listed here.

| Files | Adapted from | Licence |
| --- | --- | --- |
| `src/update/zipsign.rs` | [zipsign](https://github.com/Kijewski/zipsign): zipsign-api 0.2.2's `verify/`, `verify_unsign_tar.rs` and `constants.rs` | MIT |

## zipsign

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
