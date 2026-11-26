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


def test_pages_are_sorted_even_when_extracted_out_of_order():
    from summary import group_paragraphs

    grouped = group_paragraphs([box("S02", 100, page=2), box("S01", 100, page=1)])
    assert [(p["label"], p["page"]) for p in grouped] == [("S01", 1), ("S02", 2)]


def test_oversized_last_box_keeps_clean_pitch():
    from summary import line_metrics

    assert line_metrics([box("l1", 100), box("l2", 114.4), box("l3", 128.8), box("BIG", 140, bottom=170)]) == (
        4,
        14.4,
        0.0,
        "3 clean lines; 1 box excluded",
    )


def test_superscript_alone_leaves_too_few_clean_lines():
    from summary import line_metrics

    assert line_metrics([box("text", 100, right=150), box("1", 96, left=152, right=158, bottom=103)]) == (
        1,
        None,
        None,
        "mixed-size boxes; 1 clean line; 1 box excluded",
    )


def test_superscript_does_not_discard_normal_line_pitch(summarize):
    output = summarize(
        [
            box("S01 text", 100, right=150),
            box("1", 96, left=152, right=158, bottom=103),
            box("next line", 114.4),
        ]
    )
    assert "pitch  14.40 (lines 2, spread 0.0; 2 clean lines; 1 box excluded)" in output


def test_excluded_middle_line_does_not_create_double_pitch():
    from summary import line_metrics

    assert line_metrics([box("l1", 100), box("BIG", 114.4, bottom=144.4), box("l3", 128.8), box("l4", 143.2)]) == (
        4,
        14.4,
        0.0,
        "3 clean lines; 1 box excluded",
    )


def test_closest_baseline_wins_when_two_visual_lines_overlap():
    import summary

    # A and B share horizontal space, so they are distinct lines. C could
    # join either; its bottom (a baseline proxy) is nearer B's.
    grouped = summary.visual_lines(
        [
            box("A", 100, right=150),
            box("B", 104, left=100, right=380),
            box("C", 106, left=400, right=500),
        ]
    )
    assert [[b["text"] for b in line["boxes"]] for line in grouped] == [["A"], ["B", "C"]]


def test_review_stale_baseline_case_groups_by_nearest_bottom():
    import summary

    # The #111 round-2 review's case: A2 (bottom 122.0) is 1.48 from B's bottom
    # and 8.52 from A's, so it joins B, not A; C then joins B too.
    grouped = summary.visual_lines(
        [
            {"page": 1, "text": "A", "xMin": 72, "xMax": 200, "yMin": 100, "yMax": 113.48},
            {"page": 1, "text": "B", "xMin": 72, "xMax": 200, "yMin": 110, "yMax": 123.48},
            {"page": 1, "text": "A2", "xMin": 250, "xMax": 300, "yMin": 105, "yMax": 122.0},
            {"page": 1, "text": "C", "xMin": 350, "xMax": 400, "yMin": 107.52, "yMax": 121.0},
        ]
    )
    assert [[b["text"] for b in line["boxes"]] for line in grouped] == [["A"], ["B", "A2", "C"]]


def test_review_abc_chain_still_has_no_bogus_pitch():
    from summary import line_metrics

    assert line_metrics(
        [
            box("A", 100, right=150),
            box("B", 104, left=300, right=380),
            box("C", 106, left=400, right=500),
        ]
    ) == (1, None, None, "mixed-size boxes; 0 clean lines; 3 boxes excluded")


@pytest.mark.parametrize("pitch", [10.0, 14.4])
def test_two_columns_preserve_rows_with_closest_merge(pitch):
    from summary import line_metrics

    assert line_metrics(
        [
            box("left top", 100, right=150),
            box("left bottom", 100 + pitch, right=150),
            box("right top", 100, left=300, right=380),
            box("right bottom", 100 + pitch, left=300, right=380),
        ]
    ) == (2, pitch, 0.0, None)


@pytest.mark.parametrize("delta, count", [(0.4, 1), (0.5, 1), (0.6, 2), (-0.4, 1)])
@pytest.mark.parametrize("top", [100.24, 100.25])
def test_table_row_tolerance_across_rounded_keys(delta, count, top):
    from summary import group_paragraphs

    assert len(group_paragraphs([box("T01", top), box("T01", top + delta)])) == count


def test_non_table_labels_are_not_coalesced():
    from summary import group_paragraphs

    assert len(group_paragraphs([box("S01", 100), box("S01", 100)])) == 2
