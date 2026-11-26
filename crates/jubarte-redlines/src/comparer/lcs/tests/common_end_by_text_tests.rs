// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! arthrod/jubarte#156 — [`find_common_end_by_text`]: under Windows Word, whole blocks
//! that end a replaced region and read the same come off as pairs of their
//! own, though they are not common by hash.

use super::*;
use crate::comparer::atoms::{ComparisonUnitGroup, ComparisonUnitWord, Sha1Keyed};
use ComparisonUnitGroupType::{Cell, Paragraph, Row, Table};
use CorrelationStatus::{Deleted, Inserted, Unknown};

const HEADING: &str =
    "3. Capability matrix: Word has all the expected basics plus professional depth";
const MATRIX: &[&[&str]] = &[
    &[
        "Capability",
        "Google Docs expectation",
        "Microsoft Word answer",
    ],
    &[
        "Real-time coauthoring",
        "Multiple users edit in a browser",
        "Coauthoring in Word desktop and web",
    ],
];

fn group(
    kind: ComparisonUnitGroupType,
    contents: Vec<ComparisonUnit>,
    hash: &str,
) -> ComparisonUnit {
    ComparisonUnit::Group(ComparisonUnitGroup {
        correlation_status: CorrelationStatus::Nil,
        group_type: kind,
        contents,
        level: 0,
        sha1: Sha1Keyed::new(hash.to_string()),
        correlated_sha1_hash: None,
        structure_sha1_hash: None,
        atom_count_memo: std::cell::Cell::new(usize::MAX),
    })
}

/// A block group of `kind` whose one word holds `text`.
fn block(dom: &mut Dom, kind: ComparisonUnitGroupType, text: &str, hash: &str) -> ComparisonUnit {
    let node = dom.new_element(W::t());
    dom.add_text(node, text);
    group(
        kind,
        vec![ComparisonUnit::Word(ComparisonUnitWord::new(vec![
            ComparisonUnitAtom::new(node, Vec::<NodeId>::new(), text),
        ]))],
        hash,
    )
}

/// A paragraph group whose words are the pieces of `text` between its
/// spaces, each space starting the word after it, the way a cell of several
/// runs reads.
fn words(dom: &mut Dom, text: &str) -> ComparisonUnit {
    let mut pieces = Vec::new();
    let mut piece = String::new();
    for c in text.chars() {
        if c == ' ' && !piece.is_empty() {
            pieces.push(piece);
            piece = String::new();
        }
        piece.push(c);
    }
    if !piece.is_empty() {
        pieces.push(piece);
    }
    let contents = pieces
        .iter()
        .map(|piece| {
            let node = dom.new_element(W::t());
            dom.add_text(node, piece);
            ComparisonUnit::Word(ComparisonUnitWord::new(vec![ComparisonUnitAtom::new(
                node,
                Vec::<NodeId>::new(),
                piece,
            )]))
        })
        .collect();
    group(Paragraph, contents, text)
}

/// A table of `rows`, each cell holding a paragraph that reads as its
/// text, nested as the unit builder nests a real table: table, row, cell.
fn table(dom: &mut Dom, rows: &[&[&str]], hash: &str) -> ComparisonUnit {
    let mut trs = Vec::new();
    for row in rows {
        let tcs: Vec<_> = row
            .iter()
            .map(|text| group(Cell, vec![words(dom, text)], text))
            .collect();
        trs.push(group(Row, tcs, &row.join("|")));
    }
    group(Table, trs, hash)
}

fn settings(platform: WordPlatform) -> WmlComparerSettings {
    WmlComparerSettings {
        word_platform: platform,
        ..WmlComparerSettings::default()
    }
}

fn unknown(left: Vec<ComparisonUnit>, right: Vec<ComparisonUnit>) -> CorrelatedSequence {
    CorrelatedSequence::paired(Unknown, left, right)
}

/// `(status, original units, revised units)` of each sequence.
fn shape(out: &[CorrelatedSequence]) -> Vec<(CorrelationStatus, usize, usize)> {
    out.iter()
        .map(|s| {
            (
                s.correlation_status,
                s.com_units_1.as_ref().map_or(0, Vec::len),
                s.com_units_2.as_ref().map_or(0, Vec::len),
            )
        })
        .collect()
}

/// The `sha1` of each side's units: `((original hashes), (revised hashes))`.
fn hashes(sequence: &CorrelatedSequence) -> (Vec<&str>, Vec<&str>) {
    fn side(units: Option<&Vec<ComparisonUnit>>) -> Vec<&str> {
        units
            .map(|us| us.iter().map(ComparisonUnit::sha1).collect())
            .unwrap_or_default()
    }
    (
        side(sequence.com_units_1.as_ref()),
        side(sequence.com_units_2.as_ref()),
    )
}

/// `find_common_end_by_text` under Windows Word.
fn windows<'a>(
    dom: &Dom,
    left: impl IntoIterator<Item = &'a ComparisonUnit>,
    right: impl IntoIterator<Item = &'a ComparisonUnit>,
) -> Option<Vec<CorrelatedSequence>> {
    let unknown = unknown(
        left.into_iter().cloned().collect(),
        right.into_iter().cloned().collect(),
    );
    find_common_end_by_text(dom, &unknown, &settings(WordPlatform::Windows))
}

#[test]
fn windows_takes_the_heading_that_ends_the_region_off_as_its_own_pair() {
    let mut dom = Dom::new();
    let left = vec![
        block(&mut dom, Paragraph, "Removed provision", "p:removed"),
        block(&mut dom, Paragraph, HEADING, "p:heading:original"),
    ];
    let right = vec![block(&mut dom, Paragraph, HEADING, "p:heading:revision")];
    let out = windows(&dom, &left, &right).expect("the heading ends both sides and reads the same");
    assert_eq!(
        shape(&out),
        vec![(Deleted, 1, 0), (Unknown, 1, 1)],
        "the rest is deleted, then the pair"
    );
    assert_eq!(
        hashes(&out[0]).0,
        vec!["p:removed"],
        "the deleted rest is the original's own unit"
    );
    assert_eq!(
        hashes(&out[1]),
        (vec!["p:heading:original"], vec!["p:heading:revision"])
    );
}

#[test]
fn windows_takes_a_table_that_reads_the_same_off_too() {
    let mut dom = Dom::new();
    let left = vec![
        block(&mut dom, Paragraph, "Removed provision", "p:removed"),
        table(&mut dom, MATRIX, "t:matrix:original"),
    ];
    let right = vec![table(&mut dom, MATRIX, "t:matrix:revision")];
    let out = windows(&dom, &left, &right).expect("the table ends both sides and reads the same");
    assert_eq!(shape(&out), vec![(Deleted, 1, 0), (Unknown, 1, 1)]);
    assert_eq!(
        hashes(&out[1]),
        (vec!["t:matrix:original"], vec!["t:matrix:revision"])
    );
    assert!(matches!(
        &out[1].com_units_2.as_ref().unwrap()[0],
        ComparisonUnit::Group(g) if g.group_type == Table
    ));
}

#[test]
fn windows_takes_whole_blocks_off_the_end_one_after_the_other() {
    let mut dom = Dom::new();
    let left = vec![
        block(&mut dom, Paragraph, "Removed provision", "p:removed"),
        block(&mut dom, Paragraph, HEADING, "p:heading:original"),
        table(&mut dom, MATRIX, "t:matrix:original"),
    ];
    let right = vec![
        block(&mut dom, Paragraph, HEADING, "p:heading:revision"),
        table(&mut dom, MATRIX, "t:matrix:revision"),
    ];
    let out = windows(&dom, &left, &right).expect("the heading and the matrix");
    assert_eq!(
        shape(&out),
        vec![(Deleted, 1, 0), (Unknown, 1, 1), (Unknown, 1, 1)],
        "the rest first, then the pairs in document order"
    );
    assert_eq!(hashes(&out[1]).0, vec!["p:heading:original"]);
    assert_eq!(hashes(&out[2]).0, vec!["t:matrix:original"]);
    assert_eq!(hashes(&out[1]).1, vec!["p:heading:revision"]);
    assert_eq!(hashes(&out[2]).1, vec!["t:matrix:revision"]);
}

/// The review of #162: `["Tax", " rate12%"]` and `["Tax rate", "12%"]` read
/// the same once their text runs together, and a trailing table came off
/// the region in place of the table the revision had edited.
#[test]
fn a_table_reads_as_its_cells_not_as_its_text_run_together() {
    let mut dom = Dom::new();
    let (edited, lookalike) = (
        table(&mut dom, &[&["Tax rate", "12%"]], "t:edited"),
        table(&mut dom, &[&["Tax", " rate12%"]], "t:lookalike"),
    );
    let gap = block(&mut dom, Paragraph, "Remove this explanation", "p:gap");
    // The lookalike ends the original and the edited table the revision.
    assert!(
        windows(&dom, [&gap, &lookalike], [&edited]).is_none(),
        "the cells differ"
    );
    // And the other way round.
    assert!(
        windows(&dom, [&gap, &edited], [&lookalike]).is_none(),
        "the cells differ"
    );
    // A cell that moved to another row is a difference too.
    let two_rows = table(&mut dom, &[&["Tax rate"], &["12%"]], "t:rows");
    let one_row = table(&mut dom, &[&["Tax rate", "12%"]], "t:row");
    assert!(windows(&dom, [&gap, &two_rows], [&one_row]).is_none());
    assert!(windows(&dom, [&gap, &one_row], [&two_rows]).is_none());
    // A cell without text is a cell too.
    let with_empty_cell = table(&mut dom, &[&["Tax rate", "12%", ""]], "t:empty");
    assert!(windows(&dom, [&gap, &with_empty_cell], [&one_row]).is_none());
    assert!(windows(&dom, [&gap, &one_row], [&with_empty_cell]).is_none());
}

#[test]
fn the_rest_is_left_to_the_resolvers_that_follow() {
    let mut dom = Dom::new();
    let removed = block(&mut dom, Paragraph, "Removed provision", "p:removed");
    let added = block(&mut dom, Paragraph, "Added provision", "p:added");
    let heading = |dom: &mut Dom, hash: &str| block(dom, Paragraph, HEADING, hash);

    // A block on each side in front of the pair: an `Unknown` of their own.
    let original = heading(&mut dom, "p:heading:original");
    let revision = heading(&mut dom, "p:heading:revision");
    let out = windows(&dom, [&removed, &original], [&added, &revision]).expect("the heading");
    assert_eq!(shape(&out), vec![(Unknown, 1, 1), (Unknown, 1, 1)]);
    assert_eq!(hashes(&out[0]).0, vec!["p:removed"]);
    assert_eq!(hashes(&out[0]).1, vec!["p:added"]);

    // The pair alone on the original's side: the revision's block in
    // front of it is inserted.
    let original = heading(&mut dom, "p:heading:original");
    let revision = heading(&mut dom, "p:heading:revision");
    let out = windows(&dom, [&original], [&added, &revision]).expect("the heading");
    assert_eq!(shape(&out), vec![(Inserted, 0, 1), (Unknown, 1, 1)]);
    assert_eq!(hashes(&out[0]).1, vec!["p:added"]);
}

#[test]
fn nothing_comes_off_that_is_not_the_same_block_of_text() {
    let mut dom = Dom::new();
    let heading = |dom: &mut Dom, hash: &str| block(dom, Paragraph, HEADING, hash);
    let removed = block(&mut dom, Paragraph, "Removed provision", "p:removed");
    let original = heading(&mut dom, "p:heading:original");
    let revised = heading(&mut dom, "p:heading:revision");
    // The end does not read the same.
    let evidence = block(
        &mut dom,
        Paragraph,
        "2. Evidence base and source notes",
        "p:evidence",
    );
    assert!(windows(&dom, [&removed, &original], [&evidence]).is_none());
    // The ends are blocks of different kinds.
    let as_table = table(&mut dom, &[&[HEADING]], "t:heading");
    assert!(windows(&dom, [&removed, &original], [&as_table]).is_none());
    // A cell is not a whole block, whatever it reads.
    let (cell, cell_revised) = (
        block(&mut dom, Cell, HEADING, "c:original"),
        block(&mut dom, Cell, HEADING, "c:revision"),
    );
    assert!(windows(&dom, [&removed, &cell], [&cell_revised]).is_none());
    // A block without text reads the same as any other empty one.
    let (blank, blank_revised) = (
        block(&mut dom, Paragraph, "   ", "p:blank:original"),
        block(&mut dom, Paragraph, "", "p:blank:revision"),
    );
    assert!(windows(&dom, [&removed, &blank], [&blank_revised]).is_none());
    // Common by hash: `find_common_at_beginning_and_end`'s to pair.
    let (same, same_again) = (
        heading(&mut dom, "p:heading"),
        heading(&mut dom, "p:heading"),
    );
    assert!(windows(&dom, [&removed, &same], [&same_again]).is_none());
    // The region is that one pair: the next resolver's, as it was.
    assert!(windows(&dom, [&original], [&revised]).is_none());
    // Nothing on one side.
    assert!(windows(&dom, [&removed], []).is_none());
    assert!(windows(&dom, [], [&revised]).is_none());
}

#[test]
fn only_the_blocks_at_the_end_come_off() {
    let mut dom = Dom::new();
    // The heading reads the same on both sides inside the region; the
    // block after it does not, so nothing comes off.
    let left = vec![
        block(&mut dom, Paragraph, "Removed provision", "p:removed"),
        block(&mut dom, Paragraph, HEADING, "p:heading:original"),
        block(
            &mut dom,
            Paragraph,
            "Original closing",
            "p:closing:original",
        ),
    ];
    let right = vec![
        block(&mut dom, Paragraph, HEADING, "p:heading:revision"),
        block(&mut dom, Paragraph, "Revised closing", "p:closing:revision"),
    ];
    assert!(windows(&dom, &left, &right).is_none());
}

#[test]
fn a_sequence_whole_on_one_side_declines() {
    let mut dom = Dom::new();
    let heading = block(&mut dom, Paragraph, HEADING, "p:heading:revision");
    let settings = settings(WordPlatform::Windows);
    assert!(
        find_common_end_by_text(
            &dom,
            &CorrelatedSequence::inserted(vec![heading.clone()]),
            &settings
        )
        .is_none()
    );
    assert!(
        find_common_end_by_text(&dom, &CorrelatedSequence::deleted(vec![heading]), &settings)
            .is_none()
    );
}

#[test]
fn the_word_preset_and_the_power_tools_preset_leave_the_region_alone() {
    let mut dom = Dom::new();
    let unknown = unknown(
        vec![
            block(&mut dom, Paragraph, "Removed provision", "p:removed"),
            block(&mut dom, Paragraph, HEADING, "p:heading:original"),
        ],
        vec![block(&mut dom, Paragraph, HEADING, "p:heading:revision")],
    );
    let windows_without_alignment_passes = WmlComparerSettings {
        word_platform: WordPlatform::Windows,
        merge_replaced_paragraphs: false,
        ..WmlComparerSettings::powertools_faithful()
    };
    for settings in [
        WmlComparerSettings::default(),
        WmlComparerSettings::powertools_faithful(),
        windows_without_alignment_passes,
    ] {
        let platform = if settings.word_platform == WordPlatform::Windows {
            "Windows"
        } else {
            "Mac"
        };
        assert!(
            find_common_end_by_text(&dom, &unknown, &settings).is_none(),
            "{platform}, merge_replaced_paragraphs={}: the region stays whole",
            settings.merge_replaced_paragraphs
        );
    }
}
