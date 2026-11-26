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
    seen = {}
    for line in extracted:
        m = LABEL.match(line["text"])
        if m:
            label = m.group(1)
            # Half-point buckets bound lookup to five keys while preserving
            # the inclusive 0.5pt tolerance, including round-to-even ties.
            top_key = round(line["yMin"] * 2)
            candidates = [
                seen[key]
                for offset in (-2, -1, 0, 1, 2)
                if label.startswith("T")
                and (key := (label, line["page"], top_key + offset)) in seen
                and abs(seen[key][1]["top"] - line["yMin"]) <= 0.5
            ]
            current = min(candidates, key=lambda item: item[0])[1] if candidates else None
            if current is None:
                current = {"label": label, "page": line["page"], "top": line["yMin"], "boxes": []}
                out.append(current)
                if label.startswith("T"):
                    seen[label, line["page"], top_key] = (len(out), current)
        if current is not None:
            current["boxes"].append(line)
    return sorted(out, key=lambda p: (p["page"], p["top"]))


def visual_lines(boxes):
    """Group horizontal fragments; PDF bottoms are only a baseline proxy."""
    visual = []
    # Left-to-right processing keeps a merged box from spanning an unprocessed
    # fragment; extraction can enumerate separate text runs in any order.
    for box in sorted(boxes, key=lambda b: (b["page"], b["xMin"], b["yMin"])):
        candidates = [
            v
            for v in visual
            if v["page"] == box["page"]
            and min(v["yMax"], box["yMax"]) > max(v["yMin"], box["yMin"])
            and (box["xMin"] >= v["xMax"] or box["xMax"] <= v["xMin"])
        ]
        same_line = min(candidates, key=lambda v: abs(v["baseline"] - box["yMax"]), default=None)
        if same_line is None:
            visual.append({**box, "boxes": [box], "baseline": box["yMax"]})
        else:
            same_line["boxes"].append(box)
            for key in ("xMin", "yMin"):
                same_line[key] = min(same_line[key], box[key])
            for key in ("xMax", "yMax"):
                same_line[key] = max(same_line[key], box[key])
    return sorted(visual, key=lambda v: (v["page"], v["yMin"]))


def line_metrics(boxes):
    """Measure adjacent clean lines, excluding anomalous boxes with a count.

    A raised, shorter fragment can be removed without moving the normal line.
    A taller or baseline-shifted fragment contaminates its entire visual line:
    its neighbours cannot establish where that line's baseline really lies.
    Never bridge an excluded line: that could report a multiple of the pitch.
    """
    visual = visual_lines(boxes)
    retained = []
    excluded = 0
    for line in visual:
        normal = [
            b
            for b in line["boxes"]
            if not any(
                b["yMax"] - b["yMin"] < other["yMax"] - other["yMin"] - 0.5
                and b["yMin"] < other["yMin"]
                and other["yMin"] < b["yMax"] < other["yMax"]
                and (b["xMin"] >= other["xMax"] or b["xMax"] <= other["xMin"])
                for other in line["boxes"]
            )
        ]
        excluded += len(line["boxes"]) - len(normal)
        retained.append(normal)
    heights = [b["yMax"] - b["yMin"] for group in retained for b in group]
    typical = statistics.median(heights) if heights else 0
    clean = []
    for group in retained:
        top = min(b["yMin"] for b in group)
        bottom = max(b["yMax"] for b in group)
        if abs(bottom - top - typical) <= 0.5 and all(
            abs(b["yMin"] - top) <= 0.5 and abs(b["yMax"] - bottom) <= 0.5 for b in group
        ):
            clean.append({"page": group[0]["page"], "top": top})
        else:
            excluded += len(group)
            clean.append(None)
    pitches = [
        round(float(b["top"] - a["top"]), 2)
        for a, b in pairwise(clean)
        if a is not None and b is not None and a["page"] == b["page"]
    ]
    invalid = "non-increasing line tops" if any(p <= 0 for p in pitches) else None
    if excluded and not pitches:
        invalid = "mixed-size boxes"
    pitch = statistics.median(pitches) if pitches and not invalid else None
    spread = round(max(pitches) - min(pitches), 2) if pitch is not None else None
    note = invalid
    if excluded:
        count = sum(line is not None for line in clean)
        detail = f"{count} clean {'line' if count == 1 else 'lines'}; "
        detail += f"{excluded} {'box' if excluded == 1 else 'boxes'} excluded"
        note = f"{invalid}; {detail}" if invalid else detail
    return len(visual), pitch, spread, note


def main():
    for pdf in sys.argv[1:]:
        print(f"## {Path(pdf).name}")
        prev = None
        for p in paragraphs(pdf):
            if p["label"].startswith("F") and not p["label"].startswith("F00"):
                prev = p
                continue
            gap = round(p["top"] - prev["top"], 2) if prev and prev["page"] == p["page"] else None
            count, pitch, spread, note = line_metrics(p["boxes"])
            if pitch is not None:
                detail = f"; {note}" if note else ""
                metric = f"  pitch {pitch:6.2f} (lines {count}, spread {spread}{detail})"
            elif note:
                metric = f"  pitch n/a (invalid: {note}; lines {count})"
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
