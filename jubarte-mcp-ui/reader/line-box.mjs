// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Word line-spacing rules from convert/font.rs and word-metrics/README.md:
// Helvetica uses 1.2 em with a 0.975 em baseline; East Asian faces use
// 1.3 times the body, ignoring line gap and splitting the extra equally.
// Other faces use ascent + descent + line gap. auto scales that single line;
// exact replaces it; atLeast takes the larger height.
//
// The browser supplies measured ascent/descent/normal leading, NOT raw hhea
// or OS/2 tables. Known East Asian family names stand in for font.rs's OS/2
// code-page classification; CSS cannot expose those bits or Office 365's
// head-box exception. The multipliers are Word-derived; arbitrary installed
// fonts' metrics remain browser approximations. Unmeasurable source faces
// use face-metrics.json's bundled hhea metrics without source-family rules.
import metrics from "./face-metrics.json" with { type: "json" };
import { faceFor } from "./faces.mjs";

/** Measure a selected CSS stack in ems, after the page's fonts have loaded.
 * An inline span gives the font box; an empty inline-block marks its baseline.
 * The containing normal line also includes the selected face's line gap.
 * Do not cache: a later font load may change which face the stack selects.
 */
export function measureFace(stack, doc = globalThis.document) {
  if (!doc?.body) return undefined;
  const line = doc.createElement("div");
  const text = doc.createElement("span");
  const baseline = doc.createElement("span");
  line.style.cssText =
    "all:initial;position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;";
  line.style.font = `1000px ${stack}`;
  line.style.lineHeight = "normal";
  text.style.cssText = "all:initial;font:inherit;line-height:inherit;";
  text.textContent = "Hg";
  baseline.style.cssText =
    "all:initial;display:inline-block;width:0;height:0;vertical-align:baseline;";
  line.append(text, baseline);
  doc.body.append(line);
  try {
    // A missing source resolves to different generic fallbacks. Use widths:
    // Helvetica and Arial can have identical vertical boxes.
    const source = stack.match(/^"(?:[^"\\]|\\.)*"/)?.[0] ?? stack.split(",")[0];
    line.style.font = `1000px ${source}, monospace`;
    const monoWidth = text.getBoundingClientRect().width;
    line.style.font = `1000px ${source}, serif`;
    const serifWidth = text.getBoundingClientRect().width;
    if (monoWidth !== serifWidth) return undefined;
    line.style.font = `1000px ${stack}`;
    const box = text.getBoundingClientRect();
    const y = baseline.getBoundingClientRect().top;
    const ascent = (y - box.top) / 1000;
    const descent = (box.bottom - y) / 1000;
    const height = line.getBoundingClientRect().height / 1000;
    if (
      ![ascent, descent, height].every(Number.isFinite) ||
      ascent < 0 ||
      descent < 0 ||
      height <= 0
    )
      return undefined;
    return { ascent, descent, lineGap: height - ascent - descent };
  } finally {
    line.remove();
  }
}

// Word's named CJK families (font.rs CJK_FAMILIES), plus macOS faces.
const EAST_ASIAN = new Set(
  [
    "msmincho",
    "ms明朝",
    "mspmincho",
    "msp明朝",
    "msgothic",
    "msゴシック",
    "mspgothic",
    "mspゴシック",
    "msuigothic",
    "yugothic",
    "游ゴシック",
    "yugothicui",
    "yugothicmedium",
    "yugothiclight",
    "游ゴシックmedium",
    "游ゴシックlight",
    "yumincho",
    "游明朝",
    "yuminchodemibold",
    "yumincholight",
    "游明朝demibold",
    "游明朝light",
    "meiryo",
    "メイリオ",
    "meiryoui",
    "microsoftyahei",
    "微软雅黑",
    "microsoftyaheiui",
    "microsoftyaheilight",
    "microsoftjhenghei",
    "微軟正黑體",
    "microsoftjhengheiui",
    "simsun",
    "宋体",
    "nsimsun",
    "新宋体",
    "simhei",
    "黑体",
    "fangsong",
    "仿宋",
    "fangsonggb2312",
    "仿宋gb2312",
    "kaiti",
    "楷体",
    "kaitigb2312",
    "楷体gb2312",
    "mingliu",
    "細明體",
    "pmingliu",
    "新細明體",
    "mingliuhkscs",
    "batang",
    "바탕",
    "batangche",
    "gungsuh",
    "궁서",
    "gulim",
    "굴림",
    "gulimche",
    "dotum",
    "돋움",
    "dotumche",
    "malgungothic",
    "맑은고딕",
    "dengxian",
    "等线",
    "dengxianlight",
    "hg創英角ｺﾞｼｯｸub",
    "hgp創英角ｺﾞｼｯｸub",
    "hgs創英角ｺﾞｼｯｸub",
    "hgsoeikakugothicub",
    "hgpsoeikakugothicub",
    "hgssoeikakugothicub",
    "hgｺﾞｼｯｸe",
    "hgpｺﾞｼｯｸe",
    "hgsｺﾞｼｯｸe",
    "hggothice",
    "hgpgothice",
    "hgsgothice",
    "hg明朝e",
    "hgp明朝e",
    "hgs明朝e",
    "hgminchoe",
    "hgpminchoe",
    "hgsminchoe",
    "songtisc",
    "songtitc",
    "heitisc",
    "heititc",
    "stsong",
    "stheiti",
    "hiraginosans",
    "hiraginokakugothicpro",
    "hiraginokakugothicpron",
    "hiraginominchopro",
    "hiraginominchopron",
    "pingfangsc",
    "pingfangtc",
    "pingfanghk",
  ].map((name) => name.normalize("NFKC")),
);

function wordMetrics(family, face) {
  const name = String(family ?? "")
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
  if (/^Helvetica(?:-(?:Bold|Oblique|BoldOblique))?$/i.test(name))
    return { ascent: 0.975, descent: 0.225, lineGap: 0 };
  if (
    EAST_ASIAN.has(
      name
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\s_-]/g, ""),
    )
  ) {
    const half = (face.ascent + face.descent) * 0.15;
    return { ascent: face.ascent + half, descent: face.descent + half, lineGap: 0 };
  }
  return face;
}

/**
 * @param {string|undefined} family the source font family
 * @param {number} sizePt the font size, in points
 * @param {{line?: number, rule?: "auto"|"exact"|"atLeast"}} [spacing] w:spacing's
 *   line (in 240ths of a line for auto, twentieths of a point otherwise) and lineRule
 * @param {(stack: string) => {ascent: number, descent: number, lineGap: number}|undefined} [measure]
 *   selected-face metrics in ems; defaults to browser measurement
 * @returns {{ascent: number, descent: number, height: number}} in points
 */
export function lineBox(family, sizePt, { line, rule = "auto" } = {}, measure = measureFace) {
  const selected = faceFor(family);
  const measured = measure(selected.stack);
  const face = measured ? wordMetrics(family, measured) : metrics[selected.bundled];
  const ascent = face.ascent * sizePt;
  const descent = face.descent * sizePt;
  const single = ascent + descent + face.lineGap * sizePt;
  let height = single;
  if (Number.isFinite(line) && (line > 0 || (line === 0 && rule === "exact"))) {
    if (rule === "exact") height = line / 20;
    else if (rule === "atLeast") height = Math.max(line / 20, single);
    else height = (single * line) / 240;
  }
  return { ascent, descent, height };
}
