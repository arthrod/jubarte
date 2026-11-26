# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0
"""Run with Python 3.10 and 3.11 as well as newer supported interpreters."""

from pathlib import Path
from itertools import permutations

import pytest


def box(text, top, *, page=1, left=72.0, right=200.0, bottom=None):
    return {
        "text": text,
        "page": page,
        "xMin": left,
        "xMax": right,
        "yMin": top,
        "yMax": top + 13.48 if bottom is None else bottom,
    }


@pytest.fixture
def summarize(monkeypatch, capsys):
    # ytable.lines is our external-process adapter. No upstream fake exists;
    # replace only extraction, keeping the real grouping and report generation.
    import summary

    def run(boxes):
        monkeypatch.setattr(summary, "lines", lambda _pdf: boxes)
        monkeypatch.setattr(summary.sys, "argv", ["summary.py", "fixture.pdf"])
        summary.main()
        return capsys.readouterr().out

    return run


def test_summary_compiles_on_supported_python():
    """Integration: compile the shipped script without running PDF extraction."""
    script = Path(__file__).with_name("summary.py")
    error = None
    try:
        compile(script.read_text(), str(script), "exec")
    except SyntaxError as exc:
        error = str(exc)
    assert error is None, error


def test_table_cells_report_each_row_once_in_page_order(summarize):
    output = summarize(
        [
            box("T01 auto", 86.93),
            box("T02 exact", 102.05),
            box("T01 autob", 86.93, left=300, right=400),
            box("T02 exactb", 102.05, left=300, right=400),
            box("T03 atleast", 132.05),
            box("T04 auto", 172.61),
        ]
    )
    rows = output.splitlines()[1:]
    assert [row.split()[0] for row in rows] == ["T01", "T02", "T03", "T04"]
    assert [float(row.split("gap")[1].split()[0]) for row in rows[1:]] == [15.12, 30.0, 40.56]


@pytest.mark.parametrize(
    "boxes, count",
    [
        ([box("O03", 727.97, page=4, right=90.45), box("H", 72.0, page=4, left=92.92, right=529.07, bottom=926.8)], 1),
        (
            [
                box("M01 small", 109.73, right=118.45),
                box("BIG small again", 101.28, left=120.94, right=510.05, bottom=125.6),
                box("continuation", 127.49, right=435.26),
            ],
            2,
        ),
    ],
)
def test_mixed_size_boxes_have_no_numeric_pitch(summarize, boxes, count):
    output = summarize(boxes)
    assert "pitch n/a (invalid: mixed-size boxes" in output
    assert f"lines {count}" in output


def test_continuation_survives_page_break_without_cross_page_pitch(summarize):
    output = summarize(
        [
            box("S01 paragraph", 700),
            box("continuation", 714),
            box("next page", 72, page=2),
            box("more", 86, page=2),
            box("S02 next paragraph", 100, page=2),
        ]
    )
    row = output.splitlines()[1]
    assert "lines 4" in row
    assert "pitch  14.00" in row
    assert "spread 0.0" in row


def test_single_line_on_each_page_has_no_pitch(summarize):
    output = summarize([box("S01 paragraph", 700), box("continued", 72, page=2)])
    assert "pitch n/a (lines 2; no within-page interval)" in output


def test_repeated_label_on_other_row_or_page_is_preserved(summarize):
    output = summarize(
        [
            box("T01 auto", 86.93),
            box("T01 auto", 102.05),
            box("T01 auto", 86.93, page=2),
        ]
    )
    assert len(output.splitlines()) == 4


def test_unlabelled_preamble_and_filler_are_not_reported(summarize):
    output = summarize(
        [
            box("preamble", 50),
            box("F00 start", 72),
            box("F01 filler", 86),
            box("P01 start", 100),
        ]
    )
    assert "preamble" not in output
    assert "F00" in output
    assert "F01" not in output
    assert "gap  14.00" in output


def test_non_increasing_tops_are_invalid(summarize):
    output = summarize([box("S01 label", 100), box("overlapping box", 100)])
    assert "pitch n/a (invalid: non-increasing line tops; lines 2)" in output


def test_page_identities_are_retained():
    from summary import group_paragraphs

    grouped = group_paragraphs([box("S01 label", 700), box("continued", 72, page=2)])
    assert [line["page"] for line in grouped[0]["boxes"]] == [1, 2]


def test_visual_line_grouping_is_independent_of_fragment_order():
    from summary import line_metrics

    fragments = [
        box("left", 72, right=90),
        box("middle", 72, left=100, right=120),
        box("right", 72, left=130, right=150),
    ]
    for order in permutations(fragments):
        assert line_metrics([*order, box("next line", 86)]) == (2, 14.0, 0.0, None)


def test_multiline_table_cells_merge_in_visual_order(summarize):
    output = summarize(
        [
            box("T01 first cell", 72),
            box("bottom", 100),
            box("T01 second cell", 72, left=300, right=400),
            box("middle", 86, left=300, right=400),
            box("bottom", 100, left=300, right=400),
        ]
    )
    assert "pitch  14.00 (lines 3, spread 0.0)" in output
