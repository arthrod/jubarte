# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0
"""Builds the card's page faces (#99) from the renderer's bundled fonts.

Each of Carlito and Liberation Sans, Serif and Mono is subset to the card's
Latin and Latin Extended ranges, renamed (the OFL forbids a Modified Version
from keeping its Reserved Font Name) and written as WOFF2 to src/fonts/page/.
The copyright and licence name records stay. `--check` verifies instead that
every face keeps the original's advances and vertical metrics and carries no
reserved name.

    uvx --from 'fonttools[woff]' python -I jubarte-mcp-ui/scripts/page_fonts.py [--check]
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "crates/jubarte-render/assets/fonts"
OUT = ROOT / "jubarte-mcp-ui/src/fonts/page"
FAMILIES = {
    "Carlito": ("c", "Jubarte Page C"),
    "LiberationSans": ("sans", "Jubarte Page Sans"),
    "LiberationSerif": ("serif", "Jubarte Page Serif"),
    "LiberationMono": ("mono", "Jubarte Page Mono"),
}
STYLES = ("Regular", "Bold", "Italic", "BoldItalic")
RESERVED = ("Carlito", "Liberation", "Arimo", "Tinos", "Cousine")
# src/fonts.js's LATIN and LATIN_EXT ranges.
UNICODES = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,"
    "U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,"
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,"
    "U+1EF2-1EFF,U+2020,U+20A0-20C0,U+2113"
)
METRICS = [
    ("hhea", "ascent"),
    ("hhea", "descent"),
    ("hhea", "lineGap"),
    ("OS/2", "sTypoAscender"),
    ("OS/2", "sTypoDescender"),
    ("OS/2", "sTypoLineGap"),
    ("OS/2", "usWinAscent"),
    ("OS/2", "usWinDescent"),
]
KEPT = {0, 2, 5, 7, 8, 9, 11, 12, 13, 14}  # copyright, style, version, trademark, vendor, designer, URLs, licence


def faces():
    for stem, (slug, family) in FAMILIES.items():
        for style in STYLES:
            yield SRC / f"{stem}-{style}.ttf", OUT / f"jubarte-page-{slug}-{style.lower()}.woff2", family, style


def build(source, target, family, style):
    font = TTFont(source)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.flavor = "woff2"
    sub = subset.Subsetter(options)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    names = font["name"]
    label = "" if style == "Regular" else " " + style.replace("BoldItalic", "Bold Italic")
    for record in list(names.names):
        if record.nameID in (1, 16):
            record.string = family
        elif record.nameID == 4:
            record.string = family + label
        elif record.nameID == 6:
            record.string = family.replace(" ", "") + "-" + style
        elif record.nameID == 3:
            record.string = "Jubarte:" + family.replace(" ", "") + "-" + style
        elif record.nameID not in KEPT:
            names.removeNames(nameID=record.nameID)
    font.flavor = "woff2"
    target.parent.mkdir(parents=True, exist_ok=True)
    font.save(target)


def check(source, target):
    orig, sub = TTFont(source), TTFont(target)
    text = " ".join(str(r) for r in sub["name"].names if r.nameID not in (0, 7, 13, 14))
    problems = [f"reserved name {w}" for w in RESERVED if w in text]
    ocmap, scmap = orig.getBestCmap(), sub.getBestCmap()
    problems += [
        f"advance of U+{cp:04X}" for cp, g in scmap.items() if orig["hmtx"][ocmap[cp]][0] != sub["hmtx"][g][0]
    ]
    problems += [f"{t}.{a}" for t, a in METRICS if getattr(orig[t], a) != getattr(sub[t], a)]
    if orig["head"].unitsPerEm != sub["head"].unitsPerEm:
        problems.append("unitsPerEm")
    return problems


def main():
    verify = "--check" in sys.argv[1:]
    bad = 0
    for source, target, family, style in faces():
        if not verify:
            build(source, target, family, style)
        problems = check(source, target) if target.exists() else ["missing"]
        bad += bool(problems)
        print(
            ("ok  " if not problems else "BAD ")
            + target.name
            + ("" if not problems else ": " + ", ".join(problems[:5]))
        )
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
