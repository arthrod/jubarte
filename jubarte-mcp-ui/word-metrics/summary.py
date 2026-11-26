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
from itertools import pairwise
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ytable import lines

LABEL = re.compile(r"^([A-Z]\d\d[a-z]?|L-[a-z]+-\d+-[a-z0-9]+|F\d\d)\b")


def paragraphs(pdf):
    return group_paragraphs(lines(pdf))


def group_paragraphs(extracted):
    """Keep extraction order within paragraphs, but unite cells of a table row."""
    out: list[dict] = []
    current: dict | None = None
    for line in extracted:
        m = LABEL.match(line["text"])
        if m:
            label = m.group(1)
            current = next(
                (
                    p
                    for p in out
                    if label.startswith("T")
                    and p["label"] == label
                    and p["page"] == line["page"]
                    and abs(p["top"] - line["yMin"]) <= 0.5
                ),
                None,
            )
            if current is None:
                current = {"label": label, "page": line["page"], "top": line["yMin"], "boxes": []}
                out.append(current)
        if current is not None:
            current["boxes"].append(line)
    return sorted(out, key=lambda p: (p["page"], p["top"]))


def line_metrics(boxes):
    """Join horizontally separate boxes on one visual line before measuring.

    PDF boxes are not baselines. Different box heights/tops on an overlapping
    line make a top-to-top pitch ambiguous, so report that measurement invalid.
    """
    visual = []
    mixed = False
    # Left-to-right processing keeps a merged box from spanning an unprocessed
    # fragment; extraction can enumerate separate text runs in any order.
    for box in sorted(boxes, key=lambda b: (b["page"], b["xMin"], b["yMin"])):
        same_line = next(
            (
                v
                for v in visual
                if v["page"] == box["page"]
                and min(v["yMax"], box["yMax"]) > max(v["yMin"], box["yMin"])
                and (box["xMin"] >= v["xMax"] or box["xMax"] <= v["xMin"])
            ),
            None,
        )
        if same_line is None:
            visual.append(dict(box))
        else:
            mixed |= abs(same_line["yMin"] - box["yMin"]) > 0.5 or abs(same_line["yMax"] - box["yMax"]) > 0.5
            for key in ("xMin", "yMin"):
                same_line[key] = min(same_line[key], box[key])
            for key in ("xMax", "yMax"):
                same_line[key] = max(same_line[key], box[key])
    visual.sort(key=lambda v: (v["page"], v["yMin"]))
    heights = [v["yMax"] - v["yMin"] for v in visual]
    mixed |= bool(heights and max(heights) - min(heights) > 0.5)
    pitches = [round(float(b["yMin"] - a["yMin"]), 2) for a, b in pairwise(visual) if a["page"] == b["page"]]
    invalid = "mixed-size boxes" if mixed else ("non-increasing line tops" if any(p <= 0 for p in pitches) else None)
    pitch = statistics.median(pitches) if pitches and not invalid else None
    spread = round(max(pitches) - min(pitches), 2) if pitch is not None else None
    return len(visual), pitch, spread, invalid


def main():
    for pdf in sys.argv[1:]:
        print(f"## {Path(pdf).name}")
        prev = None
        for p in paragraphs(pdf):
            if p["label"].startswith("F") and not p["label"].startswith("F00"):
                prev = p
                continue
            gap = round(p["top"] - prev["top"], 2) if prev and prev["page"] == p["page"] else None
            count, pitch, spread, invalid = line_metrics(p["boxes"])
            if invalid:
                metric = f"  pitch n/a (invalid: {invalid}; lines {count})"
            elif pitch is not None:
                metric = f"  pitch {pitch:6.2f} (lines {count}, spread {spread})"
            else:
                metric = f"  pitch n/a (lines {count}; no within-page interval)"
            print(
                f"{p['label']:24} page {p['page']} top {p['top']:7.2f}"
                f"{'' if gap is None else f'  gap {gap:6.2f}'}"
                f"{metric}"
            )
            prev = p


if __name__ == "__main__":
    main()
