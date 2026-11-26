// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The desk's three faces (SIL OFL 1.1; licences in ../licenses/), the same
// variable files jubarte-app bundles. MCP App hosts build the view's CSP with
// `font-src 'self'` and no `data:`, so an @font-face data URI may be refused.
// FontFace from bytes is not a fetch, so no CSP directive applies to it.
import manropeLatin from "./fonts/manrope-latin-wght-normal.woff2?inline";
import manropeExt from "./fonts/manrope-latin-ext-wght-normal.woff2?inline";
import monoLatin from "./fonts/jetbrains-mono-latin-wght-normal.woff2?inline";
import monoExt from "./fonts/jetbrains-mono-latin-ext-wght-normal.woff2?inline";
import serifLatin from "./fonts/source-serif-4-latin-opsz-normal.woff2?inline";
import serifExt from "./fonts/source-serif-4-latin-ext-opsz-normal.woff2?inline";

// The unicode ranges of jubarte-app's src/fonts.css.
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

const FACES = [
  ["Manrope", "200 800", manropeLatin, LATIN],
  ["Manrope", "200 800", manropeExt, LATIN_EXT],
  ["JetBrains Mono", "100 800", monoLatin, LATIN],
  ["JetBrains Mono", "100 800", monoExt, LATIN_EXT],
  ["Source Serif 4", "200 900", serifLatin, LATIN],
  ["Source Serif 4", "200 900", serifExt, LATIN_EXT],
];

/** The bytes of a `data:...;base64,` URL, without fetching it. */
export function dataUrlBytes(url) {
  const comma = url.indexOf(",");
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Registers every face; resolves when they are usable. A face that fails falls back to the stack. */
export async function loadFonts(fonts = document.fonts) {
  const loaded = await Promise.allSettled(
    FACES.map(async ([family, weight, url, unicodeRange]) => {
      const face = new FontFace(family, dataUrlBytes(url), { weight, style: "normal", unicodeRange, display: "block" });
      fonts.add(await face.load());
    }),
  );
  return loaded.filter((r) => r.status === "rejected").map((r) => String(r.reason));
}
