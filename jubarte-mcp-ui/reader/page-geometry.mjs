// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

/** Pure, defensive conversion from lossless Jubarte metadata to CSS-pixel geometry.
 * Numeric structured lengths use inches, matching the metadata parser; explicit
 * unit strings accept in, cm, mm, pt and px. Source metadata is never mutated.
 */
// Word's paper list as the engine names it (WORD_PAGE_SIZES, twips / 15 = CSS px), short side first (#42).
const twips = (w, h) => [w / 15, h / 15];
const PRESETS = {
  Letter: [816, 1056],
  A4: [(210 * 96) / 25.4, (297 * 96) / 25.4],
  Legal: [816, 1344],
  Executive: twips(10440, 15120),
  Tabloid: twips(15840, 24480),
  Ledger: twips(15840, 24480),
  A3: twips(16838, 23811),
  A5: twips(8391, 11906),
  "B4 (JIS)": twips(14570, 20636),
  "B5 (JIS)": twips(10318, 14570),
};
const PAPER = Object.keys(PRESETS)
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[()]/g, "\\$&"))
  .join("|");
const PAPER_SIZE = new RegExp(`^(${PAPER})(?:\\s+(portrait|landscape))?$`, "i");
const PAPER_START = new RegExp(`^(${PAPER})(?:\\s|$)`, "i");
// Any other sheet: the engine's `6x9in portrait`, width by height as drawn.
const CUSTOM_SIZE = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)in(?:\s+(portrait|landscape))?$/i;
const SIDES = ["top", "right", "bottom", "left"];
const UNITS = { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, px: 1 };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const pixels = (value) => {
  if (typeof value === "number") return value * 96;
  if (typeof value !== "string") return NaN;
  const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(in|cm|mm|pt|px)?$/i);
  return match ? Number(match[1]) * UNITS[(match[2] || "in").toLowerCase()] : NaN;
};

export function resolvePageGeometry(result = {}) {
  const normalized = result.metadata?.page ?? result.document?.metadata?.page;
  const raw =
    object(normalized) && own(normalized, "raw")
      ? normalized.raw
      : (result.metadata?.raw?.page ?? result.document?.frontmatter?.data?.page ?? normalized);
  const warnings = [];
  let preset = "Letter",
    orientation = "portrait",
    customWidth,
    customHeight,
    customName,
    gridPitchPt;
  const margins = Object.fromEntries(SIDES.map((side) => [`${side}Px`, 96]));
  const warn = (message) => warnings.push(message);
  const size = (value) => {
    if (typeof value !== "string") {
      warn(`Invalid page size; keeping ${preset}.`);
      return;
    }
    const match = value.trim().match(PAPER_SIZE),
      custom = value.trim().match(CUSTOM_SIZE);
    if (custom) {
      customWidth = `${custom[1]}in`;
      customHeight = `${custom[2]}in`;
      customName = `${custom[1]}x${custom[2]}in`;
      if (custom[3]) orientation = custom[3].toLowerCase();
    } else if (match) {
      preset = Object.keys(PRESETS).find((key) => key.toLowerCase() === match[1].toLowerCase());
      if (match[2]) orientation = match[2].toLowerCase();
    } else warn(`Unsupported page size “${value}”; using ${preset}.`);
  };
  const orient = (value) => {
    if (typeof value === "string" && /^(portrait|landscape)$/i.test(value.trim()))
      orientation = value.trim().toLowerCase();
    else warn(`Invalid page orientation; keeping ${orientation}.`);
  };
  const margin = (side, value) => {
    const px = pixels(value);
    if (Number.isFinite(px) && px >= 0 && px <= 1200) margins[`${side}Px`] = px;
    else warn(`Invalid ${side} margin; keeping ${margins[`${side}Px`]}px.`);
  };
  const allMargins = (value) => {
    if (object(value)) {
      for (const [side, length] of Object.entries(value)) {
        if (SIDES.includes(side)) margin(side, length);
        else warn(`Unsupported margin field “${side}”; preserved in source.`);
      }
    } else for (const side of SIDES) margin(side, value);
  };
  if (typeof raw === "string") {
    // The engine appends revision metadata after the live page setup.
    for (const clause of raw
      .split(";")[0]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      let match;
      if (PAPER_START.test(clause) || CUSTOM_SIZE.test(clause)) size(clause);
      else if (/^(portrait|landscape)$/i.test(clause)) orient(clause);
      // `margins top 0.5in, right 0.5in, …`: the engine names the first side
      // after the word, the others in their own clauses.
      else if ((match = clause.match(/^margins?\s+(top|right|bottom|left)\s+(.+)$/i)))
        margin(match[1].toLowerCase(), match[2]);
      else if ((match = clause.match(/^margins?\s+(.+)$/i))) allMargins(match[1]);
      else if ((match = clause.match(/^(top|right|bottom|left)(?:\s+margin)?\s+(.+)$/i)))
        margin(match[1].toLowerCase(), match[2]);
      else if (
        (match = clause.match(/^(?:line(?: and char)?|char) grid (\d+(?:\.\d+)?)pt$/i)) &&
        Number(match[1]) > 0 &&
        Number.isFinite(Number(match[1]))
      )
        gridPitchPt = Number(match[1]);
      else if (/^(header\/footer|header|footer|starts)\s+/i.test(clause)) {
        /* Not body-page geometry. */
      } else warn(`Unsupported page setting “${clause}”; preserved in source.`);
    }
  } else if (object(raw)) {
    if (raw.size != null || raw.preset != null || raw.format != null)
      size(raw.size ?? raw.preset ?? raw.format);
    if (raw.orientation != null) orient(raw.orientation);
    if (raw.margins != null || raw.margin != null) allMargins(raw.margins ?? raw.margin);
    for (const side of SIDES) if (raw[side] != null) margin(side, raw[side]);
    customWidth = raw.width ?? (raw.widthIn != null ? raw.widthIn : undefined);
    customHeight = raw.height ?? (raw.heightIn != null ? raw.heightIn : undefined);
    const supported = new Set([
      "size",
      "preset",
      "format",
      "orientation",
      "margins",
      "margin",
      ...SIDES,
      "width",
      "height",
      "widthIn",
      "heightIn",
      "header",
      "footer",
      "headerIn",
      "footerIn",
    ]);
    // A normalized object can be supplied without its lossless raw field.
    for (const key of Object.keys(raw))
      if (!supported.has(key) && !["clauses", "unknown", "origin"].includes(key))
        warn(`Unsupported page field “${key}”; preserved in source.`);
  } else if (raw != null) warn("Invalid page settings; using Letter portrait with 1in margins.");
  // With absent raw metadata, normalized metadata is a useful compatibility fallback.
  if (raw == null && object(normalized)) {
    if (normalized.size) size(normalized.size);
    if (normalized.orientation) orient(normalized.orientation);
    if (normalized.margins) allMargins(normalized.margins);
    customWidth = normalized.widthIn;
    customHeight = normalized.heightIn;
  }
  let [widthPx, heightPx] = PRESETS[preset];
  if (customWidth !== undefined || customHeight !== undefined) {
    const width = pixels(customWidth),
      height = pixels(customHeight);
    if ([width, height].every((value) => Number.isFinite(value) && value >= 192 && value <= 2400)) {
      widthPx = width;
      heightPx = height;
      const physical = [width, height].sort((a, b) => a - b),
        standard = [...PRESETS[preset]].sort((a, b) => a - b);
      if (Math.abs(physical[0] - standard[0]) > 0.01 || Math.abs(physical[1] - standard[1]) > 0.01)
        preset = undefined;
    } else
      warn(
        "Invalid custom page dimensions; using the selected standard paper size (192–2400px per side required).",
      );
  }
  if (
    (orientation === "landscape" && widthPx < heightPx) ||
    (orientation === "portrait" && widthPx > heightPx)
  )
    [widthPx, heightPx] = [heightPx, widthPx];
  for (const [dimension, first, second] of [
    [widthPx, "leftPx", "rightPx"],
    [heightPx, "topPx", "bottomPx"],
  ]) {
    if (dimension - margins[first] - margins[second] < 96) {
      const fallback = Math.min(96, (dimension - 96) / 2);
      margins[first] = margins[second] = fallback;
      warn(
        `Margins leave less than 96px of content space; ${first.replace("Px", "")} and ${second.replace("Px", "")} margins reset to safe defaults.`,
      );
    }
  }
  const label = `${customName ?? (preset || `${Math.round(widthPx)} × ${Math.round(heightPx)}px`)} ${orientation}`;
  return {
    page: {
      widthPx,
      heightPx,
      ...(["Letter", "A4"].includes(preset) ? { preset: preset.toLowerCase() } : {}),
    },
    margins,
    label,
    warnings,
    ...(gridPitchPt != null ? { gridPitchPt } : {}),
  };
}

/** Each section after the first (#47): where it starts, how (Word's w:type,
 * `nextPage` unless the setup says otherwise) and its own page. The engine
 * names a section's page only when it differs from the first section's, and
 * writes it unquoted inside the section's flow mapping, so the clauses after
 * the first comma arrive as keys of their own; they are read back in order. */
export function resolveSections(result = {}) {
  const sections = result.metadata?.sections;
  if (!object(sections)) return [];
  const documentRaw = result.metadata?.page?.raw ?? result.metadata?.raw?.page;
  const startsOf = (setup) =>
    (typeof setup === "string" &&
      setup.match(
        /(?:^|,)\s*starts\s+(nextPage|continuous|evenPage|oddPage|nextColumn)\b/i,
      )?.[1]) ||
    "nextPage";
  return Object.entries(sections)
    .filter(([id]) => /^\d+$/.test(id))
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .flatMap(([id, section]) => {
      const start = section?.paragraphRanges?.[0]?.start,
        end = section?.paragraphRanges?.[0]?.end;
      if (!Number.isInteger(start)) return [];
      const raw = object(section.raw) ? section.raw : {},
        keys = Object.keys(raw),
        at = keys.indexOf("page");
      if (at < 0)
        return [
          { id, start, end, starts: startsOf(documentRaw), geometry: resolvePageGeometry(result) },
        ];
      const setup = [
        String(raw.page),
        ...keys.slice(at + 1).filter((key) => raw[key] === null && !/^p\d+-p\d+$/.test(key)),
      ].join(", ");
      return [
        {
          id,
          start,
          end,
          starts: startsOf(setup),
          geometry: resolvePageGeometry({ metadata: { page: { raw: setup } } }),
        },
      ];
    });
}
