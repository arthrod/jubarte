// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! arthrod/jubarte#156 — `--mode word-windows`: a heading and the table
//! under it stay Equal when a deleted gap opens in front of them.
//!
//! broken_ones_two file_8 → file_9 cuts the executive-summary block (three
//! bullets, a callout, an evidence heading and a sources table) out of its
//! place and appends a second copy at the tail. Windows Word's compare
//! leaves the capability matrix that follows the cut, with its heading,
//! unmarked, and moves the cut block down. jubarte emitted the matrix
//! twice, a `moveTo` copy and a `moveFrom` copy with `w:cellIns`, which
//! cost a page. Three things brought that about, and each is undone under
//! [`WordPlatform::Windows`] alone:
//!
//! - the skip-ahead promotion (`promote_skip_ahead_equals`) rewrote an
//!   `Equal` heading and table after a deleted gap into an inserted copy
//!   and a deleted copy, which the move pass then paired;
//! - nothing paired the heading and the matrix by hash (a comment anchor,
//!   narrower grid columns), so Step H zipped the replaced region in
//!   order and set the original's callout against the revision's matrix;
//!   `find_common_end_by_text` now takes blocks that end the region and
//!   read the same off as pairs of their own;
//! - the move pass's expansion drop (M118) then dropped the cut block's
//!   own relocations.
//!
//! [`WordPlatform::Mac`], the `word` preset, is unchanged throughout.

use std::io::{Cursor, Read};

use jubarte::comparer::{CompareMode, WmlComparerSettings};
use jubarte::document_comparer::compare_documents_with_settings;
use jubarte::namespaces::W;
use jubarte::xmllinq::{Dom, NodeId};

use crate::common::docx::{self, para};

const HEADING: &str =
    "3. Capability matrix: Word has all the expected basics plus professional depth";
const PREFIX: &str = "1. Executive summary keeps its place in both documents here";
const TAIL: &str = "4. Visual proof: capability depth continues after the table";

/// The redline of `original` against `revised` in `mode`.
fn redline(original: &[u8], revised: &[u8], mode: CompareMode) -> Vec<u8> {
    compare_documents_with_settings(original, revised, &WmlComparerSettings::new(mode))
        .expect("the compare succeeds")
}

/// `word/document.xml` of a package.
fn document_xml(docx: &[u8]) -> String {
    let mut zip = zip::ZipArchive::new(Cursor::new(docx.to_vec())).unwrap();
    let mut text = String::new();
    zip.by_name("word/document.xml")
        .unwrap()
        .read_to_string(&mut text)
        .unwrap();
    text
}

/// `xml` parsed, with its root element.
fn parse(xml: &str) -> (Dom, NodeId) {
    let mut dom = Dom::new();
    let document = dom.parse_xdocument(xml);
    let root = dom.root(document).expect("a root element");
    (dom, root)
}

/// The `w:t` and `w:delText` under `node`, in order.
fn text(dom: &Dom, node: NodeId) -> String {
    let mut out = String::new();
    for n in dom.descendants(node, None) {
        if dom.name_is(n, &W::t()) || dom.name_is(n, &W::del_text()) {
            out.push_str(&dom.value(n));
        }
    }
    out
}

/// The revision kinds under `node`: the local names of its `w:ins`,
/// `w:del`, `w:moveFrom`, `w:moveTo`, `w:cellIns` and `w:cellDel`
/// descendants, sorted and without repeats.
fn revisions(dom: &Dom, node: NodeId) -> Vec<String> {
    let names = [
        W::ins(),
        W::del(),
        W::move_from(),
        W::move_to(),
        W::cell_ins(),
        W::cell_del(),
    ];
    let mut kinds: Vec<String> = dom
        .descendants(node, None)
        .into_iter()
        .filter_map(|n| dom.name(n))
        .filter(|name| names.iter().any(|known| name == known))
        .map(|name| name.local_name().to_string())
        .collect();
    kinds.sort();
    kinds.dedup();
    kinds
}

/// The body's top-level blocks: `p` or `tbl`, the first twelve characters
/// of the block's text, and its revision kinds.
fn blocks(dom: &Dom, root: NodeId) -> Vec<(String, String, Vec<String>)> {
    dom.elements(dom.element(root, &W::body()).unwrap(), None)
        .into_iter()
        .filter(|&b| dom.name_is(b, &W::p()) || dom.name_is(b, &W::tbl()))
        .map(|b| {
            let kind = if dom.name_is(b, &W::p()) { "p" } else { "tbl" };
            (
                kind.to_string(),
                text(dom, b).chars().take(12).collect(),
                revisions(dom, b),
            )
        })
        .collect()
}

/// A table cell holding `text`.
fn cell(text: &str) -> String {
    format!(
        r#"<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>{}</w:tc>"#,
        para(text)
    )
}

/// A table of `rows`.
fn table(rows: &[&[&str]]) -> String {
    let grid = "<w:gridCol w:w=\"2400\"/>".repeat(rows[0].len());
    let body: String = rows
        .iter()
        .map(|row| {
            let cells: String = row.iter().map(|c| cell(c)).collect();
            format!("<w:tr>{cells}</w:tr>")
        })
        .collect();
    format!(
        r#"<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{body}</w:tbl>"#
    )
}

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
    &[
        "Comments & mentions",
        "Comments and suggestions",
        "Threaded comments and mentions",
    ],
    &[
        "Version history",
        "Restore prior versions",
        "Version history through OneDrive",
    ],
];

const BULLETS: &[&str] = &[
    "Parity: real-time coauthoring, comments, mentions, sharing links, version history and templates.",
    "Word advantage: track changes controls, compare and combine, mail merge, advanced styles and captions.",
    "Enterprise advantage: integration with SharePoint, OneDrive, Teams, Purview, Copilot, Outlook and Excel.",
];

/// A document whose body is `blocks`.
fn document(blocks: &str) -> Vec<u8> {
    docx::docx(blocks)
}

/// The pair with the gap file_8 → file_9 opens: three bullets, a callout
/// table, an evidence heading and a sources table, all deleted, in front of
/// the unchanged heading and matrix.
fn gap_with_tables() -> (Vec<u8>, Vec<u8>) {
    let bullets: String = BULLETS.iter().map(|b| para(b)).collect();
    let callout = table(&[&[
        "Bottom line: Google Docs is excellent for lightweight browser-first collaboration.",
    ]]);
    let sources = table(&[
        &["Source", "What it supports"],
        &["Microsoft Support", "Track Changes in Word"],
        &["Microsoft Blog", "Secure collaboration"],
    ]);
    let evidence = format!(
        "{}{sources}",
        para("2. Evidence base and source notes keeps its own heading here")
    );
    let gap = format!("{bullets}{callout}{evidence}");
    let kept = format!("{}{}{}", para(HEADING), table(MATRIX), para(TAIL));
    (
        document(&format!("{}{gap}{kept}", para(PREFIX))),
        document(&format!("{}{kept}", para(PREFIX))),
    )
}

/// The narrower pair: only the three bullets are deleted in front of the
/// unchanged heading and matrix.
fn gap_of_bullets() -> (Vec<u8>, Vec<u8>) {
    let gap: String = BULLETS.iter().map(|b| para(b)).collect();
    let kept = format!("{}{}{}", para(HEADING), table(MATRIX), para(TAIL));
    (
        document(&format!("{}{gap}{kept}", para(PREFIX))),
        document(&format!("{}{kept}", para(PREFIX))),
    )
}

/// The shape of both pairs: the deleted gap alone, then the heading and the
/// matrix each Equal, then the tail.
fn assert_heading_and_matrix_stay_equal(original: &[u8], revised: &[u8], label: &str) {
    let out = redline(original, revised, CompareMode::WordWindows);
    let xml = document_xml(&out);
    for absent in ["moveFrom", "moveTo", "cellIns", "cellDel"] {
        assert!(
            !xml.contains(&format!("<w:{absent}")),
            "{label}: the redline holds a w:{absent}:\n{}",
            blocks_text(&out)
        );
    }
    let (dom, root) = parse(&xml);
    let blocks = blocks(&dom, root);
    let find = |kind: &str, head: &str| {
        let ats: Vec<usize> = blocks
            .iter()
            .enumerate()
            .filter(|(_, b)| b.0 == kind && b.1 == head)
            .map(|(at, _)| at)
            .collect();
        assert_eq!(
            ats.len(),
            1,
            "{label}: one {kind} {head:?} in\n{}",
            blocks_text(&out)
        );
        ats[0]
    };
    let heading = find("p", "3. Capabilit");
    let matrix = find("tbl", "CapabilityGo");
    let tail = blocks.len() - 1;
    assert_eq!(
        matrix,
        heading + 1,
        "{label}: the matrix follows its heading"
    );
    assert_eq!(
        blocks[heading],
        ("p".to_string(), "3. Capabilit".to_string(), Vec::new()),
        "{label}: the heading is Equal:\n{}",
        blocks_text(&out)
    );
    assert_eq!(
        blocks[matrix],
        ("tbl".to_string(), "CapabilityGo".to_string(), Vec::new()),
        "{label}: the matrix is Equal:\n{}",
        blocks_text(&out)
    );
    assert_eq!(
        blocks[0],
        ("p".to_string(), "1. Executive".to_string(), Vec::new()),
        "{label}: the prefix stays Equal:\n{}",
        blocks_text(&out)
    );
    assert_eq!(
        blocks[tail],
        ("p".to_string(), "4. Visual pr".to_string(), Vec::new()),
        "{label}: the tail stays Equal:\n{}",
        blocks_text(&out)
    );
    // Everything else is the deleted gap, plain deletions: nothing was
    // inserted, and nothing moved.
    for (at, block) in blocks.iter().enumerate().take(tail).skip(1) {
        if at == heading || at == matrix {
            continue;
        }
        assert!(
            !block.2.is_empty() && block.2.iter().all(|kind| kind == "del"),
            "{label}: block {at} is not a plain deletion:\n{}",
            blocks_text(&out)
        );
    }
    // The deletion is the only change: accepting gives the revision,
    // rejecting the original.
    let accepted = jubarte::document_comparer::accept_revisions(&out).unwrap();
    let rejected = jubarte::document_comparer::reject_revisions(&out).unwrap();
    assert_eq!(
        top_level_text(&accepted),
        top_level_text(revised),
        "{label}: accepted"
    );
    assert_eq!(
        top_level_text(&rejected),
        top_level_text(original),
        "{label}: rejected"
    );
    crate::common::validity::assert_word_valid_package(&out);
}

/// The text of every top-level block, `p` and `tbl` alike, each as one line.
fn top_level_text(docx: &[u8]) -> Vec<String> {
    let (dom, root) = parse(&document_xml(docx));
    let body = dom.element(root, &W::body()).unwrap();
    dom.elements(body, None)
        .into_iter()
        .filter(|&b| dom.name_is(b, &W::p()) || dom.name_is(b, &W::tbl()))
        .map(|b| text(&dom, b))
        .collect()
}

/// The redline's blocks, one line each, for a failure message.
fn blocks_text(docx: &[u8]) -> String {
    let (dom, root) = parse(&document_xml(docx));
    blocks(&dom, root)
        .into_iter()
        .map(|(kind, head, kinds)| format!("{kind} {head:?} {kinds:?}"))
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn an_unchanged_table_after_a_deleted_gap_stays_equal_in_word_windows() {
    let (original, revised) = gap_with_tables();
    assert_heading_and_matrix_stay_equal(&original, &revised, "gap with tables");
}

#[test]
fn an_unchanged_table_after_deleted_bullets_stays_equal_in_word_windows() {
    let (original, revised) = gap_of_bullets();
    assert_heading_and_matrix_stay_equal(&original, &revised, "gap of bullets");
}

/// The `word` preset (Mac Word 16) is unchanged: it still promotes the
/// heading and matrix over a deleted gap that holds tables, and a gap of
/// bullets alone still leaves them Equal.
#[test]
fn the_word_preset_keeps_its_promotion_of_the_run() {
    let (original, revised) = gap_with_tables();
    let out = redline(&original, &revised, CompareMode::Word);
    let (dom, root) = parse(&document_xml(&out));
    let blocks = blocks(&dom, root);
    let del = vec!["del".to_string()];
    let moved = ["del", "ins", "moveFrom", "moveTo"]
        .map(String::from)
        .to_vec();
    assert_eq!(
        blocks,
        vec![
            ("p".to_string(), "1. Executive".to_string(), Vec::new()),
            (
                "p".to_string(),
                "3. Capabilit".to_string(),
                moved[2..].to_vec()
            ),
            ("tbl".to_string(), "CapabilityGo".to_string(), moved),
            ("p".to_string(), "Parity: real".to_string(), del.clone()),
            ("p".to_string(), "Word advanta".to_string(), del.clone()),
            ("p".to_string(), "Enterprise a".to_string(), del.clone()),
            ("tbl".to_string(), "Bottom line:".to_string(), del.clone()),
            ("p".to_string(), "2. Evidence ".to_string(), del.clone()),
            ("tbl".to_string(), "SourceWhat i".to_string(), del),
            ("p".to_string(), "4. Visual pr".to_string(), Vec::new()),
        ],
        "the word preset's redline of the gap with tables"
    );

    let (original, revised) = gap_of_bullets();
    let out = redline(&original, &revised, CompareMode::Word);
    let xml = document_xml(&out);
    for absent in ["moveFrom", "moveTo", "cellIns", "cellDel"] {
        assert!(
            !xml.contains(&format!("<w:{absent}")),
            "the word preset moves nothing over a gap of bullets: w:{absent}"
        );
    }
    let (dom, root) = parse(&xml);
    let body = dom.element(root, &W::body()).unwrap();
    let matrices = dom
        .elements(body, Some(&W::tbl()))
        .into_iter()
        .filter(|&t| text(&dom, t).starts_with("Capability"))
        .count();
    assert_eq!(matrices, 1, "the matrix is in the redline once");
}

/// The pair itself, broken_ones_two file_8 → file_9, when the corpus is
/// fetched (`scripts/fetch_fixtures.py`): the capability matrix and its
/// heading stay Equal under Windows Word, the cut block in front of them
/// is the move, to its second copy at the tail, and no cell is inserted.
#[test]
fn file_8_file_9_keeps_the_capability_matrix_equal_in_word_windows() {
    use std::path::PathBuf;
    let root =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/corpus/broken_ones_two/sources");
    let (a, b) = (root.join("file_8.docx"), root.join("file_9.docx"));
    if !a.is_file() || !b.is_file() {
        eprintln!("skip: broken_ones_two sources missing");
        return;
    }
    let original = std::fs::read(&a).unwrap();
    let revised = std::fs::read(&b).unwrap();

    let out = redline(&original, &revised, CompareMode::WordWindows);
    let xml = document_xml(&out);
    assert!(
        !xml.contains("<w:cellIns") && !xml.contains("<w:cellDel"),
        "no cell of the unchanged matrix is inserted:\n{}",
        blocks_text(&out)
    );
    let (dom, root) = parse(&xml);
    let blocks = blocks(&dom, root);
    let outline = || blocks_text(&out);
    // Where the `kind` blocks whose text starts with `head` sit, in order.
    let ats_of = |kind: &str, head: &str| -> Vec<usize> {
        blocks
            .iter()
            .enumerate()
            .filter(|(_, b)| b.0 == kind && b.1 == head)
            .map(|(at, _)| at)
            .collect()
    };
    // The first of each is the one in place; the tail copy comes after.
    let first = |kind: &str, head: &str, how_many: usize| {
        let ats = ats_of(kind, head);
        assert_eq!(ats.len(), how_many, "{kind} {head:?}\n{}", outline());
        ats[0]
    };
    let heading = first("p", "3. Capabilit", 2);
    let prefix = first("p", "1. Executive", 2);
    let first_matrix = first("tbl", "CapabilityGo", 2);
    let second_matrix = ats_of("tbl", "CapabilityGo")[1];
    assert_eq!(first_matrix, heading + 1, "the matrix follows its heading");
    assert!(second_matrix > first_matrix);
    let equal: Vec<String> = Vec::new();
    assert_eq!(blocks[prefix].2, equal, "the prefix is Equal");
    assert_eq!(
        blocks[heading].2,
        equal,
        "the heading is Equal:\n{}",
        outline()
    );
    assert_eq!(
        blocks[first_matrix].2,
        equal,
        "the matrix after the cut is Equal:\n{}",
        outline()
    );
    assert_eq!(
        blocks[second_matrix].2,
        vec!["ins".to_string()],
        "the second matrix at the tail is inserted:\n{}",
        outline()
    );
    // The cut block sits where it was, between the prefix's own paragraph
    // and the heading, struck as moved away.
    let cut = &blocks[prefix + 2..heading];
    assert_eq!(
        cut.iter().map(|b| b.1.as_str()).collect::<Vec<_>>(),
        [
            "Parity: real",
            "Word advanta",
            "Enterprise a",
            "Bottom lineG",
            "2. Evidence ",
            "SourceWhat i",
        ],
        "the cut block:\n{}",
        outline()
    );
    for (head, kinds) in cut.iter().map(|b| (&b.1, &b.2)) {
        assert!(
            kinds.contains(&"moveFrom".to_string())
                && !kinds.contains(&"ins".to_string())
                && !kinds.contains(&"moveTo".to_string()),
            "{head:?} is moved away, not replaced: {kinds:?}"
        );
    }
    // Its copy at the tail is moved in, and nothing else moved.
    let mut moved_in = 0;
    for (head, kinds) in blocks[first_matrix + 1..]
        .iter()
        .map(|b| (&b.1, &b.2))
        .filter(|(head, _)| {
            ["Parity: real", "Bottom lineG", "2. Evidence "].contains(&head.as_str())
        })
    {
        assert!(
            kinds.contains(&"moveTo".to_string()),
            "{head:?} at the tail: {kinds:?}"
        );
        moved_in += 1;
    }
    assert_eq!(
        moved_in,
        3,
        "the cut block again at the tail:\n{}",
        outline()
    );
    crate::common::validity::assert_word_valid_package(&out);

    // The `word` preset is unchanged on the pair: Mac Word 16's redline
    // still marks the matrix as moved.
    let out = redline(&original, &revised, CompareMode::Word);
    let (dom, root) = parse(&document_xml(&out));
    let body = dom.element(root, &W::body()).unwrap();
    let marked = dom
        .elements(body, Some(&W::tbl()))
        .into_iter()
        .filter(|&t| text(&dom, t).starts_with("Capability"))
        .any(|t| {
            let kinds = revisions(&dom, t);
            kinds.contains(&"moveFrom".to_string()) && kinds.contains(&"moveTo".to_string())
        });
    assert!(marked, "the word preset keeps the matrix's move pair");
}

/// A cell's revision marks: its kept text (`w:t`), its deleted text
/// (`w:delText`) and its revision kinds.
type CellMarks = (String, String, Vec<String>);

/// The body's top-level blocks, each as its cells: a paragraph is one cell,
/// a table one cell per `w:tc`, row by row.
fn each_cell<T>(docx: &[u8], cell: impl Fn(&Dom, NodeId) -> T) -> Vec<Vec<T>> {
    let (dom, root) = parse(&document_xml(docx));
    let body = dom.element(root, &W::body()).unwrap();
    dom.elements(body, None)
        .into_iter()
        .filter(|&b| dom.name_is(b, &W::p()) || dom.name_is(b, &W::tbl()))
        .map(|b| {
            if dom.name_is(b, &W::p()) {
                vec![cell(&dom, b)]
            } else {
                dom.elements(b, Some(&W::tr()))
                    .into_iter()
                    .flat_map(|tr| dom.elements(tr, Some(&W::tc())))
                    .map(|tc| cell(&dom, tc))
                    .collect()
            }
        })
        .collect()
}

/// Each cell's text, for a package that holds no revision.
fn cell_texts(docx: &[u8]) -> Vec<Vec<String>> {
    each_cell(docx, text)
}

/// Each cell's revision marks.
fn cell_marks(docx: &[u8]) -> Vec<Vec<CellMarks>> {
    each_cell(docx, |dom, c| {
        let mut kept = String::new();
        let mut deleted = String::new();
        for n in dom.descendants(c, None) {
            if dom.name_is(n, &W::t()) {
                kept.push_str(&dom.value(n));
            } else if dom.name_is(n, &W::del_text()) {
                deleted.push_str(&dom.value(n));
            }
        }
        (kept, deleted, revisions(dom, c))
    })
}

fn kept(text: &str) -> CellMarks {
    (text.to_string(), String::new(), Vec::new())
}

fn deleted(text: &str) -> CellMarks {
    (String::new(), text.to_string(), vec!["del".to_string()])
}

fn edited(kept: &str, deleted: &str) -> CellMarks {
    (
        kept.to_string(),
        deleted.to_string(),
        vec!["del".to_string(), "ins".to_string()],
    )
}

/// One of the review's probes of #162: the revision edits a table's value
/// and removes a paragraph and a second table whose cells read the same as
/// the revised table's once their text runs together (`["Tax", " rate12%"]`
/// and `["Tax rate", "12%"]`).
struct Probe {
    label: &'static str,
    original: String,
    revised: String,
    /// The marks of each block of the redline.
    marks: Vec<Vec<CellMarks>>,
    /// What Reject All reads as when it is not `original`: two tables that
    /// touch, alike in every whole-table property, are one table in Word's
    /// model, and Word's save joins them (R8).
    rejected_as: Option<String>,
}

fn edited_table_before_a_lookalike() -> Vec<Probe> {
    let rate_table = |value: &str| table(&[&["Tax rate", value]]);
    let (first, edited_table, lookalike_table) = (
        rate_table("10%"),
        rate_table("12%"),
        table(&[&["Tax", " rate12%"]]),
    );
    let (terms, end) = (para("Terms"), para("End"));
    let (opening, other_opening) = (para("One opening"), para("Unrelated opening"));
    let edited_marks = vec![kept("Tax rate"), edited("12%", "10")];
    let lookalike_marks = vec![deleted("Tax"), deleted(" rate12%")];
    let end_marks = vec![kept("End")];
    // Both documents open with `opening`: the original goes on with the
    // first table, `between`, the lookalike and the end; the revision with
    // the edited table and the end.
    let alike = |opening: &str, between: &str| {
        (
            format!("{opening}{first}{between}{lookalike_table}{end}"),
            format!("{opening}{edited_table}{end}"),
        )
    };
    let probe = |label: &'static str, bodies: (String, String), marks| Probe {
        label,
        original: bodies.0,
        revised: bodies.1,
        marks,
        rejected_as: None,
    };
    vec![
        probe(
            "the tables alone",
            alike("", &para("Remove this explanation")),
            vec![
                edited_marks.clone(),
                vec![deleted("Remove this explanation")],
                lookalike_marks.clone(),
                end_marks.clone(),
            ],
        ),
        probe(
            "after a kept paragraph",
            alike(&terms, &para("Remove this explanation")),
            vec![
                vec![kept("Terms")],
                edited_marks.clone(),
                vec![deleted("Remove this explanation")],
                lookalike_marks.clone(),
                end_marks.clone(),
            ],
        ),
        probe(
            "another paragraph between the tables",
            alike("", &para("Exclusion list")),
            vec![
                edited_marks.clone(),
                vec![deleted("Exclusion list")],
                lookalike_marks.clone(),
                end_marks.clone(),
            ],
        ),
        Probe {
            rejected_as: Some(format!(
                "{}{end}",
                table(&[&["Tax rate", "10%"], &["Tax", " rate12%"]])
            )),
            ..probe(
                "the tables side by side",
                alike("", ""),
                vec![
                    edited_marks.clone(),
                    lookalike_marks.clone(),
                    end_marks.clone(),
                ],
            )
        },
        probe(
            "after a replaced paragraph",
            (
                format!(
                    "{opening}{first}{}{lookalike_table}{end}",
                    para("Deleted heading")
                ),
                format!("{other_opening}{edited_table}{end}"),
            ),
            vec![
                vec![edited("Unrelated opening", "One")],
                edited_marks.clone(),
                vec![deleted("Deleted heading")],
                lookalike_marks.clone(),
                end_marks.clone(),
            ],
        ),
    ]
}

/// The review of #162: a table that ends the region used to come off it
/// when its text, run together, read like the revised table's, so the
/// table the revision had edited came out deleted whole and the edit was
/// written into another table. A table reads the same as another only when
/// its cells do, cell for cell, so the revised table pairs with the one it
/// was edited from, and the lookalike is the deletion.
#[test]
fn the_revised_table_pairs_with_the_table_it_was_edited_from_in_word_windows() {
    for Probe {
        label,
        original,
        revised,
        marks,
        rejected_as,
    } in edited_table_before_a_lookalike()
    {
        let (original, revised) = (document(&original), document(&revised));
        let out = redline(&original, &revised, CompareMode::WordWindows);
        let xml = document_xml(&out);
        for absent in ["moveFrom", "moveTo", "cellIns", "cellDel"] {
            assert!(
                !xml.contains(&format!("<w:{absent}")),
                "{label}: the redline holds a w:{absent}:\n{}",
                blocks_text(&out)
            );
        }
        assert_eq!(
            cell_marks(&out),
            marks,
            "{label}: the edited table keeps its label and its edit, the lookalike is deleted:\n{}",
            blocks_text(&out)
        );
        let accepted = jubarte::document_comparer::accept_revisions(&out).unwrap();
        let rejected = jubarte::document_comparer::reject_revisions(&out).unwrap();
        assert_eq!(
            cell_texts(&accepted),
            cell_texts(&revised),
            "{label}: accepted"
        );
        let reads_as = match rejected_as {
            Some(body) => document(&body),
            None => original,
        };
        assert_eq!(
            cell_texts(&rejected),
            cell_texts(&reads_as),
            "{label}: rejected"
        );
        crate::common::validity::assert_word_valid_package(&out);
    }
}
