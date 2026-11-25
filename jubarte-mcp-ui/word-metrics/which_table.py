# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0
"""Which font table Word's single line height follows (#98): each bundled
face's hhea, typo and win heights x size, beside Word's measured pitch.

    uvx --from fonttools python -I jubarte-mcp-ui/word-metrics/which_table.py crates/jubarte-render/assets/fonts
"""

import sys
from fontTools.ttLib import TTFont

SRC = sys.argv[1]
WORD = {
    "Carlito": {10: 12.24, 11: 13.44, 12: 14.64, 14: 17.04},
    "LiberationSans": {10: 11.52, 11: 12.72, 12: 13.68, 14: 16.08},
    "LiberationSerif": {10: 11.52, 11: 12.72, 12: 13.92, 14: 16.08},
    "LiberationMono": {10: 11.28, 11: 12.48, 12: 13.68, 14: 15.84},
}
for fam, pts in WORD.items():
    f = TTFont(f"{SRC}/{fam}-Regular.ttf")
    u = f["head"].unitsPerEm
    h = f["hhea"]
    o = f["OS/2"]
    t = {
        "hhea": (h.ascent - h.descent + h.lineGap) / u,
        "typo": (o.sTypoAscender - o.sTypoDescender + o.sTypoLineGap) / u,
        "win": (o.usWinAscent + o.usWinDescent) / u,
        "win+gap": (o.usWinAscent + o.usWinDescent + h.lineGap) / u,
    }
    print(fam, {k: round(v, 4) for k, v in t.items()}, "USE_TYPO" if o.fsSelection & 128 else "")
    for size, w in pts.items():
        print(f"   {size}pt word={w:6.2f} " + " ".join(f"{k}={v * size:6.2f}" for k, v in t.items()))
