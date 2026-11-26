// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

/** Pure, defensive conversion from lossless Jubarte metadata to CSS-pixel geometry.
 * Numeric structured lengths use inches, matching the metadata parser; explicit
 * unit strings accept in, cm, mm, pt and px. Source metadata is never mutated.
 */
const PRESETS = {Letter: [816, 1056], A4: [210 * 96 / 25.4, 297 * 96 / 25.4], Legal: [816, 1344]};
const SIDES = ['top', 'right', 'bottom', 'left'];
const UNITS = {in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, px: 1};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const pixels = value => {
  if (typeof value === 'number') return value * 96;
  if (typeof value !== 'string') return NaN;
  const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(in|cm|mm|pt|px)?$/i);
  return match ? Number(match[1]) * UNITS[(match[2] || 'in').toLowerCase()] : NaN;
};

export function resolvePageGeometry(result = {}) {
  const normalized = result.metadata?.page ?? result.document?.metadata?.page;
  const raw = object(normalized) && own(normalized, 'raw') ? normalized.raw
    : result.metadata?.raw?.page ?? result.document?.frontmatter?.data?.page ?? normalized;
  const warnings = [];
  let preset = 'Letter', orientation = 'portrait', customWidth, customHeight;
  const margins = Object.fromEntries(SIDES.map(side => [`${side}Px`, 96]));
  const warn = message => warnings.push(message);
  const size = value => {
    if (typeof value !== 'string') { warn(`Invalid page size; keeping ${preset}.`); return; }
    const match = value.trim().match(/^(Letter|A4|Legal)(?:\s+(portrait|landscape))?$/i);
    if (match) {
      preset = Object.keys(PRESETS).find(key => key.toLowerCase() === match[1].toLowerCase());
      if (match[2]) orientation = match[2].toLowerCase();
    } else warn(`Unsupported page size “${value}”; using ${preset}.`);
  };
  const orient = value => {
    if (typeof value === 'string' && /^(portrait|landscape)$/i.test(value.trim())) orientation = value.trim().toLowerCase();
    else warn(`Invalid page orientation; keeping ${orientation}.`);
  };
  const margin = (side, value) => {
    const px = pixels(value);
    if (Number.isFinite(px) && px >= 0 && px <= 1200) margins[`${side}Px`] = px;
    else warn(`Invalid ${side} margin; keeping ${margins[`${side}Px`]}px.`);
  };
  const allMargins = value => {
    if (object(value)) {
      for (const [side, length] of Object.entries(value)) {
        if (SIDES.includes(side)) margin(side, length);
        else warn(`Unsupported margin field “${side}”; preserved in source.`);
      }
    } else for (const side of SIDES) margin(side, value);
  };
  if (typeof raw === 'string') {
    for (const clause of raw.split(',').map(part => part.trim()).filter(Boolean)) {
      let match;
      if (/^(Letter|A4|Legal)(?:\s|$)/i.test(clause)) size(clause);
      else if (/^(portrait|landscape)$/i.test(clause)) orient(clause);
      else if ((match = clause.match(/^margins?\s+(.+)$/i))) allMargins(match[1]);
      else if ((match = clause.match(/^(top|right|bottom|left)(?:\s+margin)?\s+(.+)$/i))) margin(match[1].toLowerCase(), match[2]);
      else if (/^(header\/footer|header|footer)\s+/i.test(clause)) { /* Not body-page geometry. */ }
      else warn(`Unsupported page setting “${clause}”; preserved in source.`);
    }
  } else if (object(raw)) {
    if (raw.size != null || raw.preset != null || raw.format != null) size(raw.size ?? raw.preset ?? raw.format);
    if (raw.orientation != null) orient(raw.orientation);
    if (raw.margins != null || raw.margin != null) allMargins(raw.margins ?? raw.margin);
    for (const side of SIDES) if (raw[side] != null) margin(side, raw[side]);
    customWidth = raw.width ?? (raw.widthIn != null ? raw.widthIn : undefined);
    customHeight = raw.height ?? (raw.heightIn != null ? raw.heightIn : undefined);
    const supported = new Set(['size', 'preset', 'format', 'orientation', 'margins', 'margin', ...SIDES, 'width', 'height', 'widthIn', 'heightIn', 'header', 'footer', 'headerIn', 'footerIn']);
    // A normalized object can be supplied without its lossless raw field.
    for (const key of Object.keys(raw)) if (!supported.has(key) && !['clauses', 'unknown', 'origin'].includes(key)) warn(`Unsupported page field “${key}”; preserved in source.`);
  } else if (raw != null) warn('Invalid page settings; using Letter portrait with 1in margins.');
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
    const width = pixels(customWidth), height = pixels(customHeight);
    if ([width, height].every(value => Number.isFinite(value) && value >= 192 && value <= 2400)) {
      widthPx = width; heightPx = height;
      const physical=[width,height].sort((a,b)=>a-b),standard=[...PRESETS[preset]].sort((a,b)=>a-b);
      if (Math.abs(physical[0]-standard[0])>0.01 || Math.abs(physical[1]-standard[1])>0.01) preset=undefined;
    } else warn('Invalid custom page dimensions; using the selected standard paper size (192–2400px per side required).');
  }
  if ((orientation === 'landscape' && widthPx < heightPx) || (orientation === 'portrait' && widthPx > heightPx)) [widthPx, heightPx] = [heightPx, widthPx];
  for (const [dimension, first, second] of [[widthPx, 'leftPx', 'rightPx'], [heightPx, 'topPx', 'bottomPx']]) {
    if (dimension - margins[first] - margins[second] < 96) {
      const fallback = Math.min(96, (dimension - 96) / 2);
      margins[first] = margins[second] = fallback;
      warn(`Margins leave less than 96px of content space; ${first.replace('Px', '')} and ${second.replace('Px', '')} margins reset to safe defaults.`);
    }
  }
  const label = `${preset || `${Math.round(widthPx)} × ${Math.round(heightPx)}px`} ${orientation}`;
  return {page: {widthPx, heightPx, ...(['Letter', 'A4'].includes(preset) ? {preset: preset.toLowerCase()} : {})}, margins, label, warnings};
}
