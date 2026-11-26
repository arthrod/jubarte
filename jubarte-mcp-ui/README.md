<!--
SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC

SPDX-License-Identifier: Apache-2.0
-->

# jubarte-mcp-ui

The document card that `jubarte-mcp` serves to MCP Apps hosts as
`ui://jubarte/document.html`. When a host such as Claude, VS Code, ChatGPT
or Antigravity calls `docx_text`, `docx_compare`, `docx_edit` or `docx_view`,
it shows the document as paginated paper, with tracked changes, the
Tracked/Original/Accepted views and the discussions, inline or in a side
panel.

The view is jubarte-app's reader (`reader/`, copied from jubarte-app) dressed
in the desk's stylesheet (`src/desk/styles.css`, unchanged), around the
[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) bridge. It is
private to this repository: nothing here is published to npm. The build
writes one self-contained HTML file into the Python package, which commits
it.

## Build

```sh
cd jubarte-mcp-ui
pnpm install
pnpm build   # writes ../jubarte-python/python/jubarte/ui/document.html
pnpm test    # vitest for src/, node:test for the copied reader
```

The build is reproducible, so the same sources give the same bytes. After
changing anything here, rebuild and commit `document.html` with the change.

## What the build guarantees

- One file and no fetches. Hosts render the view under a default-deny CSP
  (`font-src 'self'`, no `data:`). Scripts and styles are inlined, and the
  fonts are registered from bytes with `FontFace`, which is not a fetch. The
  reader's own `@font-face` rules point at `/fonts/…` on the app's server, so
  the build drops them, and it fails if they move.
- Licences travel with it. The file opens with the full licence text of every
  npm package Rollup bundled, found from the bundle's module list, and of
  the three fonts. A bundled package without a licence file fails the build.
- Links stay outside the card. An in-document anchor scrolls the card; a web
  or mail link goes to the host (`ui/open-link`); anything else is ignored.

## Layout

| Path | What |
| --- | --- |
| `src/document.html`, `src/view.js`, `src/view.css` | the card |
| `src/pick.js` | which document a tool call shows; needs no tool name |
| `src/fonts.js`, `src/fonts/` | Manrope, JetBrains Mono, Source Serif 4 (OFL-1.1) |
| `src/desk/` | jubarte-app's stylesheet and icon |
| `reader/` | jubarte-app's reader and its vendored Premirror |
| `THIRD_PARTY_NOTICES.md` | what comes from other projects |

## License

Apache-2.0, except the vendored and font files listed in
`THIRD_PARTY_NOTICES.md`.
