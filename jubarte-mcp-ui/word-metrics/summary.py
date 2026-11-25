# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0
"""What Word did with each fixture paragraph (#98): its page, its top, the
gap from the paragraph before, and its line pitch (top to top), in points.

    python3 jubarte-mcp-ui/word-metrics/summary.py word/NAME_byword.pdf [...]

A paragraph begins at a line whose first word is a label (S03, L-arial-11-
auto150, ...); the lines up to the next label are its continuation lines.
"""

import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ytable import lines

LABEL = re.compile(r"^([A-Z]\d\d[a-z]?|L-[a-z]+-\d+-[a-z0-9]+|F\d\d)\b")


def paragraphs(pdf):
    out = []
    for line in lines(pdf):
        m = LABEL.match(line["text"])
        if m:
            out.append({"label": m.group(1), "page": line["page"], "top": line["yMin"], "tops": [line["yMin"]]})
        elif out and line["page"] == out[-1]["page"]:
            out[-1]["tops"].append(line["yMin"])
    return out


def main():
    for pdf in sys.argv[1:]:
        print(f"## {Path(pdf).name}")
        prev = None
        for p in paragraphs(pdf):
            if p["label"].startswith("F") and not p["label"].startswith("F00"):
                prev = p
                continue
            gap = round(p["top"] - prev["top"], 2) if prev and prev["page"] == p["page"] else None
            pitches = [round(b - a, 2) for a, b in zip(p["tops"], p["tops"][1:])]
            pitch = statistics.median(pitches) if pitches else None
            spread = round(max(pitches) - min(pitches), 2) if pitches else None
            print(
                f"{p['label']:24} page {p['page']} top {p['top']:7.2f}"
                f"{'' if gap is None else f'  gap {gap:6.2f}'}"
                f"{'' if pitch is None else f'  pitch {pitch:6.2f} (lines {len(p["tops"])}, spread {spread})'}"
            )
            prev = p


if __name__ == "__main__":
    main()
