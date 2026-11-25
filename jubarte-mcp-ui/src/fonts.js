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
// The page faces (#99): Carlito and Liberation Sans, Serif and Mono, subset to
// Latin and renamed, since a modified OFL font may not keep its Reserved Font
// Name. Each has the advances of Calibri, Arial, Times New Roman or Courier New.
import pageCRegular from "./fonts/page/jubarte-page-c-regular.woff2?inline";
import pageCBold from "./fonts/page/jubarte-page-c-bold.woff2?inline";
import pageCItalic from "./fonts/page/jubarte-page-c-italic.woff2?inline";
import pageCBolditalic from "./fonts/page/jubarte-page-c-bolditalic.woff2?inline";
import pageSansRegular from "./fonts/page/jubarte-page-sans-regular.woff2?inline";
import pageSansBold from "./fonts/page/jubarte-page-sans-bold.woff2?inline";
import pageSansItalic from "./fonts/page/jubarte-page-sans-italic.woff2?inline";
import pageSansBolditalic from "./fonts/page/jubarte-page-sans-bolditalic.woff2?inline";
import pageSerifRegular from "./fonts/page/jubarte-page-serif-regular.woff2?inline";
import pageSerifBold from "./fonts/page/jubarte-page-serif-bold.woff2?inline";
import pageSerifItalic from "./fonts/page/jubarte-page-serif-italic.woff2?inline";
import pageSerifBolditalic from "./fonts/page/jubarte-page-serif-bolditalic.woff2?inline";
import pageMonoRegular from "./fonts/page/jubarte-page-mono-regular.woff2?inline";
import pageMonoBold from "./fonts/page/jubarte-page-mono-bold.woff2?inline";
import pageMonoItalic from "./fonts/page/jubarte-page-mono-italic.woff2?inline";
import pageMonoBolditalic from "./fonts/page/jubarte-page-mono-bolditalic.woff2?inline";

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
  ["Jubarte Page C", "400", pageCRegular, undefined, "normal"],
  ["Jubarte Page C", "700", pageCBold, undefined, "normal"],
  ["Jubarte Page C", "400", pageCItalic, undefined, "italic"],
  ["Jubarte Page C", "700", pageCBolditalic, undefined, "italic"],
  ["Jubarte Page Sans", "400", pageSansRegular, undefined, "normal"],
  ["Jubarte Page Sans", "700", pageSansBold, undefined, "normal"],
  ["Jubarte Page Sans", "400", pageSansItalic, undefined, "italic"],
  ["Jubarte Page Sans", "700", pageSansBolditalic, undefined, "italic"],
  ["Jubarte Page Serif", "400", pageSerifRegular, undefined, "normal"],
  ["Jubarte Page Serif", "700", pageSerifBold, undefined, "normal"],
  ["Jubarte Page Serif", "400", pageSerifItalic, undefined, "italic"],
  ["Jubarte Page Serif", "700", pageSerifBolditalic, undefined, "italic"],
  ["Jubarte Page Mono", "400", pageMonoRegular, undefined, "normal"],
  ["Jubarte Page Mono", "700", pageMonoBold, undefined, "normal"],
  ["Jubarte Page Mono", "400", pageMonoItalic, undefined, "italic"],
  ["Jubarte Page Mono", "700", pageMonoBolditalic, undefined, "italic"],
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
    FACES.map(async ([family, weight, url, unicodeRange, style = "normal"]) => {
      const descriptors = {
        weight,
        style,
        display: "block",
        ...(unicodeRange ? { unicodeRange } : {}),
      };
      const face = new FontFace(family, dataUrlBytes(url), descriptors);
      fonts.add(await face.load());
    }),
  );
  return loaded.filter((r) => r.status === "rejected").map((r) => String(r.reason));
}
