// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! `--mode word-windows` writes a whole replacement's deletions before its
//! insertions, as Windows Word 2024's Compare does.
//!
//! When base and next are unrelated, the compare takes its whole-replacement
//! shortcut, which returns next's inserted sequence first and base's deleted
//! sequence after it: Mac Word 16's order, which `--mode word` keeps. On the
//! Windows platform the shortcut's deletions move ahead of its insertions.
//!
//! The pairs are small synthetic unrelated documents, in the shapes in which
//! that order reaches the page: a next that ends on a table, the same next
//! with an empty closing paragraph (Windows Word then joins the base's last
//! deleted paragraph and the revision's first words in one paragraph), and a
//! base that ends on an empty paragraph as well. Two other shapes are not
//! among them. A replacement whose last inserted paragraph folds into its
//! first deleted one is still written insertions first:
//! `merge_replaced_paragraphs_in` writes Mac Word's order there again. And
//! where the shortcut pairs words inside a paragraph (the stamped demos), the
//! reorder puts a paragraph's deleted words ahead of its kept ones, so
//! Accept All and Reject All no longer read as their sources.

use std::io::{Cursor, Read};

use jubarte::comparer::{CompareMode, WmlComparerSettings};
use jubarte::document_comparer::compare_documents_with_settings;
use jubarte::namespaces::W;
use jubarte::xmllinq::{Dom, NodeId, XName};

use crate::common::docx::{self, para};

const BASE: [&str; 3] = [
    "Helvetica Font Demo",
    "This document demonstrates the Helvetica font family.",
    "Helvetica is a classic Swiss sans-serif typeface.",
];

/// The revision: a title, two blank paragraphs and a checklist table.
const REVISION: [&str; 3] = ["HR Onboarding Checklist", "", ""];

/// The redline of `original` against `revised` in `mode`.
fn redline(original: &[u8], revised: &[u8], mode: CompareMode) -> Vec<u8> {
    compare_documents_with_settings(original, revised, &WmlComparerSettings::new(mode))
        .expect("the compare succeeds")
}

/// One XML part of a package.
fn part(docx: &[u8], name: &str) -> String {
    let mut zip = zip::ZipArchive::new(Cursor::new(docx.to_vec())).unwrap();
    let mut text = String::new();
    zip.by_name(name)
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

/// A checklist table.
fn table() -> String {
    let rows = [
        ["Step", "Task", "Done"],
        ["1", "Sign NDA", "Yes"],
        ["2", "Setup laptop", "No"],
    ]
    .iter()
    .map(|row| {
        let cells: String = row
            .iter()
            .map(|cell| format!("<w:tc>{}</w:tc>", para(cell)))
            .collect();
        format!("<w:tr>{cells}</w:tr>")
    })
    .collect::<String>();
    format!(
        "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr><w:tblGrid/>{rows}</w:tbl>"
    )
}

/// The body blocks of the redline `docx`, in order. A block is a `w:p` or a
/// `w:tbl` directly under `w:body`.
fn body_blocks(docx: &[u8]) -> (Dom, Vec<NodeId>) {
    let (dom, root) = parse(&part(docx, "word/document.xml"));
    let body = dom.element(root, &W::body()).expect("a body");
    let blocks = dom
        .elements(body, None)
        .into_iter()
        .filter(|&b| dom.name_is(b, &W::p()) || dom.name_is(b, &W::tbl()))
        .collect();
    (dom, blocks)
}

/// One sign per body block: `+` holds insertions only, `-` deletions only,
/// `*` both, `.` neither. Every `w:ins` and `w:del` under the block counts,
/// a deleted paragraph mark or a deleted row included.
fn signs(docx: &[u8]) -> String {
    let (dom, blocks) = body_blocks(docx);
    blocks
        .iter()
        .map(|&b| {
            let has = |name: &XName| !dom.descendants_and_self(b, Some(name)).is_empty();
            match (has(&W::ins()), has(&W::del())) {
                (true, false) => '+',
                (false, true) => '-',
                (true, true) => '*',
                (false, false) => '.',
            }
        })
        .collect()
}

/// Which side each body block takes in the order: `Some(true)` inserted,
/// `Some(false)` deleted, `None` neither. A paragraph stands on its mark,
/// whatever deleted or inserted text it holds: a paragraph whose mark is
/// inserted is an inserted paragraph. A table, and a paragraph without a
/// mark of one kind, go by the revisions under them.
fn sides(docx: &[u8]) -> Vec<Option<bool>> {
    let (dom, blocks) = body_blocks(docx);
    blocks
        .iter()
        .map(|&b| {
            let mark = dom
                .element(b, &W::p_pr())
                .and_then(|ppr| dom.element(ppr, &W::r_pr()))
                .and_then(
                    |rpr| match (dom.element(rpr, &W::ins()), dom.element(rpr, &W::del())) {
                        (Some(_), None) => Some(true),
                        (None, Some(_)) => Some(false),
                        _ => None,
                    },
                );
            mark.or_else(|| {
                let has = |name: &XName| !dom.descendants_and_self(b, Some(name)).is_empty();
                match (has(&W::ins()), has(&W::del())) {
                    (true, false) => Some(true),
                    (false, true) => Some(false),
                    _ => None,
                }
            })
        })
        .collect()
}

/// The body's text with every revision accepted, and with every one
/// rejected.
fn views(docx: &[u8]) -> (String, String) {
    let (dom, root) = parse(&part(docx, "word/document.xml"));
    let (mut accepted, mut rejected) = (String::new(), String::new());
    for n in dom.descendants(root, None) {
        let is_text = dom.name_is(n, &W::t());
        let is_deleted = dom.name_is(n, &W::del_text());
        if !is_text && !is_deleted {
            continue;
        }
        let under = |name: &XName| !dom.ancestors_and_self(n, Some(name)).is_empty();
        if is_text && !under(&W::del()) {
            accepted.push_str(&dom.value(n));
        }
        if is_deleted || (is_text && !under(&W::ins())) {
            rejected.push_str(&dom.value(n));
        }
    }
    (accepted, rejected)
}

/// A package whose body is `paragraphs`, then the checklist table when
/// `with_table`, then an empty paragraph when `closing`.
fn package(paragraphs: &[&str], with_table: bool, closing: bool) -> Vec<u8> {
    let mut body: String = paragraphs.iter().map(|line| para(line)).collect();
    if with_table {
        body.push_str(&table());
    }
    if closing {
        body.push_str(&para(""));
    }
    docx::docx(&body)
}

/// One unrelated pair: its name, its two packages, and the signs `--mode
/// word` and `--mode word-windows` write it in.
struct Pair {
    name: &'static str,
    original: Vec<u8>,
    revised: Vec<u8>,
    word: &'static str,
    windows: &'static str,
}

fn unrelated() -> Vec<Pair> {
    vec![
        Pair {
            name: "a next that ends on a table",
            original: package(&BASE, false, false),
            revised: package(&REVISION, true, false),
            word: "++++---",
            windows: "---++++",
        },
        Pair {
            name: "a next that closes on an empty paragraph after its table",
            original: package(&BASE, false, false),
            revised: package(&REVISION, true, true),
            word: "++++---",
            windows: "--*+++.",
        },
        Pair {
            name: "a base and a next that both close on an empty paragraph",
            original: package(&BASE, false, true),
            revised: package(&REVISION, true, true),
            word: "++++---.",
            windows: "---++++.",
        },
    ]
}

/// Every deleted body block precedes the first inserted one.
fn assert_deletions_first(label: &str, docx: &[u8]) {
    let sides = sides(docx);
    let first_inserted = sides
        .iter()
        .position(|&side| side == Some(true))
        .unwrap_or_else(|| panic!("{label}: nothing is inserted in {}", signs(docx)));
    let last_deleted = sides
        .iter()
        .rposition(|&side| side == Some(false))
        .unwrap_or_else(|| panic!("{label}: nothing is deleted in {}", signs(docx)));
    assert!(
        last_deleted < first_inserted,
        "{label}: a deleted block follows an inserted one in {}",
        signs(docx)
    );
}

#[test]
fn a_whole_replacement_writes_deletions_first_in_word_windows() {
    for pair in unrelated() {
        let out = redline(&pair.original, &pair.revised, CompareMode::WordWindows);
        assert_deletions_first(pair.name, &out);
        assert_eq!(signs(&out), pair.windows, "{}", pair.name);
        crate::common::validity::assert_word_valid_package(&out);
    }
}

#[test]
fn word_keeps_insertions_first_for_a_whole_replacement() {
    for pair in unrelated() {
        let out = redline(&pair.original, &pair.revised, CompareMode::Word);
        assert_eq!(signs(&out), pair.word, "{}: today's order", pair.name);
        let sides = sides(&out);
        let first_deleted = sides
            .iter()
            .position(|&side| side == Some(false))
            .expect("a deleted block");
        let last_inserted = sides
            .iter()
            .rposition(|&side| side == Some(true))
            .expect("an inserted block");
        assert!(
            last_inserted < first_deleted,
            "{}: a deleted block precedes an inserted one in {}",
            pair.name,
            signs(&out)
        );
    }
}

/// Windows Word joins the base's last deleted paragraph and the revision's
/// first words in one paragraph, on an inserted mark, the deletion before
/// the insertion; the base's other paragraphs keep their own.
#[test]
fn windows_word_joins_the_last_deleted_paragraph_with_the_first_inserted_one() {
    let pair = unrelated().remove(1);
    let out = redline(&pair.original, &pair.revised, CompareMode::WordWindows);
    let (dom, blocks) = body_blocks(&out);
    let joined = blocks[2];
    let mark = dom
        .element(joined, &W::p_pr())
        .and_then(|ppr| dom.element(ppr, &W::r_pr()))
        .expect("the joined paragraph has properties");
    assert!(
        dom.element(mark, &W::ins()).is_some(),
        "its mark is inserted"
    );
    assert!(
        dom.element(mark, &W::del()).is_none(),
        "its mark is not deleted"
    );
    let reads: Vec<(char, String)> = dom
        .elements(joined, None)
        .into_iter()
        .filter(|&c| !dom.name_is(c, &W::p_pr()))
        .map(|c| {
            let kind = match dom.name(c) {
                Some(n) if n == W::ins() => 'i',
                Some(n) if n == W::del() => 'd',
                _ => 'x',
            };
            (kind, text(&dom, c))
        })
        .collect();
    assert_eq!(
        reads,
        [
            (
                'd',
                "Helvetica is a classic Swiss sans-serif typeface.".to_string()
            ),
            ('i', "HR Onboarding Checklist".to_string()),
        ]
    );
    assert_eq!(text(&dom, blocks[0]), "Helvetica Font Demo");
    assert_eq!(
        text(&dom, blocks[1]),
        "This document demonstrates the Helvetica font family."
    );
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn the_two_orders_accept_and_reject_to_the_same_text() {
    for pair in unrelated() {
        let word = redline(&pair.original, &pair.revised, CompareMode::Word);
        let windows = redline(&pair.original, &pair.revised, CompareMode::WordWindows);
        assert_eq!(views(&word), views(&windows), "{}", pair.name);
    }
}
