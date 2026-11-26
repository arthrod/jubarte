// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Which face draws a source font family (#99). The card asks for the family
// itself first, so a machine that has it draws its glyphs, and then for the
// bundled open face with the same advances, so line breaks come out the same
// where it is missing. On macOS, Word keeps Calibri, Cambria and Aptos inside
// its own app bundle, where browsers cannot see them.
//
// The classes follow the renderer's `mapped_face`
// (crates/jubarte-render/src/convert/font.rs). The card bundles only the four
// metric twins: Carlito for Calibri, and Liberation Sans, Serif and Mono for
// Arial, Times New Roman and Courier New, subset and renamed "Jubarte Page C",
// "Jubarte Page Sans", "Jubarte Page Serif" and "Jubarte Page Mono": a
// modified OFL font may not keep its Reserved Font Name. Any other family
// falls back by class, with `exact: false`.

/** The bundled faces, each with its generic family. */
export const BUNDLED = {
  "Jubarte Page C": "sans-serif",
  "Jubarte Page Sans": "sans-serif",
  "Jubarte Page Serif": "serif",
  "Jubarte Page Mono": "monospace",
};

/** Families whose bundled twin has the same advances. */
const TWINS = {
  calibri: "Jubarte Page C",
  carlito: "Jubarte Page C",
  arial: "Jubarte Page Sans",
  liberationsans: "Jubarte Page Sans",
  arimo: "Jubarte Page Sans",
  timesnewroman: "Jubarte Page Serif",
  liberationserif: "Jubarte Page Serif",
  tinos: "Jubarte Page Serif",
  couriernew: "Jubarte Page Mono",
  liberationmono: "Jubarte Page Mono",
  cousine: "Jubarte Page Mono",
};

/** A family's first name, unquoted. */
function firstName(family) {
  const first = String(family ?? "")
    .split(",")[0]
    .trim();
  return first.replace(/^(["'])(.*)\1$/, "$2").trim();
}

/** The renderer's key: lower case, without spaces or hyphens, and without a
 * trailing `PS MT` or `MT` (`Arial MT`, `Times New Roman PS MT`). */
function squash(name) {
  const key = name.toLowerCase().replace(/[\s-]/g, "");
  return key.replace(/(ps)?mt$/, "") || key;
}

/** The bundled face of a family no twin covers, by the renderer's classes. */
function byClass(key) {
  if (key.includes("calibri")) return "Jubarte Page C";
  const mono =
    ["courier", "monaco", "menlo", "cousine", "nimbusmono", "consolas"].some((k) =>
      key.includes(k),
    ) ||
    (key.endsWith("mono") && !key.includes("dejavu"));
  if (mono) return "Jubarte Page Mono";
  const sans =
    [
      "arial",
      "helvetica",
      "opensans",
      "roboto",
      "tahoma",
      "trebuchet",
      "geneva",
      "verdana",
      "aptos",
    ].some((k) => key.includes(k)) || key === "sansserif";
  if (sans) return "Jubarte Page Sans";
  return "Jubarte Page Serif";
}

/**
 * The CSS stack for a source family, the bundled face it falls back to, and
 * whether that face has the family's advances.
 * @param {string|undefined} family
 * @returns {{stack: string, bundled: string, exact: boolean}}
 */
export function faceFor(family) {
  const name = firstName(family) || "Calibri";
  const key = squash(name);
  const twin = Object.hasOwn(TWINS, key) ? TWINS[key] : undefined;
  const bundled = twin ?? byClass(key);
  const names = [name, bundled].filter((n, i, all) => all.indexOf(n) === i);
  return {
    stack: [...names.map((n) => JSON.stringify(n)), BUNDLED[bundled]].join(", "),
    bundled,
    exact: !!twin,
  };
}
