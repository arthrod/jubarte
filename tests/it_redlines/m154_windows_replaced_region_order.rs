// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! #154 — Windows Word 2024 keeps a replaced region's deleted paragraphs in
//! document order, interleaved with the insertions around the words the two
//! sides share, and writes the region's trailing insertion after the deleted
//! region. Mac Word 16, the `word` preset's reference, keeps its own order;
//! its redline of the same pairs is snapshotted here and must not move.

use crate::common;

use common::docx::{docx_with, esc};
use jubarte::comparer::{CompareMode, WmlComparerSettings};
use jubarte::document_comparer::compare_documents_with_settings;
use jubarte::namespaces::W;
use jubarte::revision_processor::{accept_revisions_document, reject_revisions_document};
use jubarte::xmllinq::{Dom, NodeId};
use std::io::{Cursor, Read};

/// A plain body paragraph.
fn para(text: &str) -> String {
    format!(
        r#"<w:p><w:r><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        esc(text)
    )
}

/// An empty body paragraph.
fn empty() -> String {
    "<w:p/>".to_string()
}

/// A numbered `ListParagraph` body paragraph (`numId`).
fn item(text: &str, num_id: u32) -> String {
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num_id}"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        esc(text)
    )
}

/// A one-row one-cell table whose only cell holds `text`.
fn table(text: &str) -> String {
    format!(
        r#"<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="3117" w:type="dxa"/></w:tcPr>{}</w:tc></w:tr></w:tbl>"#,
        para(text)
    )
}

/// `xml` parsed, with its root element.
fn parse(xml: &str) -> (Dom, NodeId) {
    let mut dom = Dom::new();
    let document = dom.parse_xdocument(xml);
    let root = dom.root(document).expect("a root element");
    (dom, root)
}

/// The redline of `original` against `revised` in `mode`, parsed.
fn redline(original: &str, revised: &str, mode: CompareMode) -> (Dom, NodeId) {
    let out = compare_documents_with_settings(
        &docx_with(original, &[]),
        &docx_with(revised, &[]),
        &WmlComparerSettings::new(mode),
    )
    .expect("the compare succeeds");
    let mut xml = String::new();
    zip::ZipArchive::new(Cursor::new(out))
        .unwrap()
        .by_name("word/document.xml")
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    parse(&xml)
}

/// One line per body child: a paragraph as `kept{+inserted+}[-deleted-]`
/// text, then `¶` followed by `+`/`-` when its mark is inserted/deleted; a
/// table as `[TBL]` with its cells' paragraphs on the same line.
fn body_shape(dom: &Dom, root: NodeId) -> Vec<String> {
    let body = dom.element(root, &W::body()).expect("a body");
    dom.elements(body, None)
        .into_iter()
        .filter(|&child| dom.name_is(child, &W::tbl()) || dom.name_is(child, &W::p()))
        .map(|child| {
            if dom.name_is(child, &W::tbl()) {
                let cells = dom
                    .descendants(child, Some(&W::p()))
                    .into_iter()
                    .map(|p| paragraph_shape(dom, p))
                    .collect::<Vec<_>>()
                    .join(" | ");
                return format!("[TBL {cells}]");
            }
            paragraph_shape(dom, child)
        })
        .collect()
}

/// One paragraph as `kept{+inserted+}[-deleted-]`, then `¶` with `+`/`-`
/// when the paragraph mark is inserted or deleted, else ` `.
fn paragraph_shape(dom: &Dom, paragraph: NodeId) -> String {
    let mut segs: Vec<(char, String)> = Vec::new();
    for node in dom.descendants(paragraph, None) {
        let (kind, text) = if dom.name_is(node, &W::del_text()) {
            ('-', dom.value(node))
        } else if dom.name_is(node, &W::t()) {
            let inserted = dom
                .ancestors(node, None)
                .into_iter()
                .take_while(|&a| a != paragraph)
                .any(|a| dom.name_is(a, &W::ins()));
            (if inserted { '+' } else { '=' }, dom.value(node))
        } else {
            continue;
        };
        match segs.last_mut() {
            Some((k, s)) if *k == kind => s.push_str(&text),
            _ => segs.push((kind, text)),
        }
    }
    let mut line: String = segs
        .into_iter()
        .map(|(k, s)| match k {
            '+' => format!("{{+{s}+}}"),
            '-' => format!("[-{s}-]"),
            _ => s,
        })
        .collect();
    line.push('¶');
    let mark = dom
        .element(paragraph, &W::p_pr())
        .and_then(|ppr| dom.element(ppr, &W::r_pr()))
        .and_then(|rpr| {
            dom.elements(rpr, None).into_iter().find_map(|c| {
                if dom.name_is(c, &W::ins()) {
                    Some('+')
                } else if dom.name_is(c, &W::del()) {
                    Some('-')
                } else {
                    None
                }
            })
        })
        .unwrap_or(' ');
    line.push(mark);
    line
}

/// The text of each body-level paragraph or table cell, in order.
fn texts(dom: &Dom, root: NodeId) -> Vec<String> {
    let body = dom.element(root, &W::body()).expect("a body");
    dom.elements(body, None)
        .into_iter()
        .filter(|&child| dom.name_is(child, &W::tbl()) || dom.name_is(child, &W::p()))
        .flat_map(|child| {
            if dom.name_is(child, &W::tbl()) {
                dom.descendants(child, Some(&W::p()))
            } else {
                vec![child]
            }
        })
        .map(|p| {
            dom.descendants(p, Some(&W::t()))
                .into_iter()
                .map(|t| dom.value(t))
                .collect::<String>()
        })
        .collect()
}

// ─── the 001 shape: list_with_break_exported_broken_45 →
//     list_with_break_from_word (Windows Word 2024 reference) ─────────────

fn pair_001() -> (String, String) {
    let original = [item("a", 2), para("test"), item("b", 2)].concat();
    let revised = [
        item("Item 1", 1),
        empty(),
        para("Break test"),
        empty(),
        item("Item 2", 1),
        empty(),
        item("New list starts here (num 1)", 2),
        item("Num 2", 2),
    ]
    .concat();
    (original, revised)
}

/// Windows Word 2024 anchors the shared word "test" inside "Break test",
/// keeps base's deleted "a" and "b" in their document places around it, and
/// pairs the story's final marks behind the inserted "Num 2".
#[test]
fn windows_001_interleaves_the_deletions_around_the_shared_word() {
    let (original, revised) = pair_001();
    let (dom, root) = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        body_shape(&dom, root),
        [
            "[-a-]¶-",
            "{+Item 1+}¶+",
            "¶+",
            "{+Break +}test¶ ",
            "[-b-]¶+",
            "{+Item 2+}¶+",
            "¶+",
            "{+New list starts here (num 1)+}¶+",
            "{+Num 2+}¶ ",
        ],
    );
}

/// Accepting the 001 redline reads the revised document, rejecting it the
/// original.
#[test]
fn windows_001_round_trips_on_accept_and_reject() {
    let (original, revised) = pair_001();
    let (mut dom, root) = redline(&original, &revised, CompareMode::WordWindows);
    let accepted = accept_revisions_document(&mut dom, root);
    assert_eq!(
        texts(&dom, accepted),
        [
            "Item 1",
            "",
            "Break test",
            "",
            "Item 2",
            "",
            "New list starts here (num 1)",
            "Num 2",
        ],
    );
    let (mut dom, root) = redline(&original, &revised, CompareMode::WordWindows);
    let rejected = reject_revisions_document(&mut dom, root);
    assert_eq!(texts(&dom, rejected), ["a", "test", "b"]);
}

/// Mac Word 16's redline of the same pair (snapshot: must not move).
#[test]
fn mac_001_keeps_its_own_order() {
    let (original, revised) = pair_001();
    let (dom, root) = redline(&original, &revised, CompareMode::Word);
    assert_eq!(
        body_shape(&dom, root),
        [
            "{+Item 1+}¶+",
            "¶+",
            "{+Break test+}¶+",
            "¶+",
            "{+Item 2+}¶+",
            "¶+",
            "{+New list starts here (num 1)+}¶+",
            "{+Num 2+}[-a-]¶-",
            "[-test-]¶-",
            "[-b-]¶ ",
        ],
    );
}

// ─── the 015 shape: super_editor diff_before7 → diff_before8
//     (Windows Word 2024 reference) ───────────────────────────────────────

fn pair_015() -> (String, String) {
    let original = [
        para("This paragraph formatting will change."),
        para("This paragraph will have words."),
        para("This paragraph will be deleted."),
        para("This word will be deleted."),
        table("Cell text"),
        empty(),
    ]
    .concat();
    let revised = [
        para("Here’s some text. It has a comment."),
        para("I will add a comment to this one too."),
    ]
    .concat();
    (original, revised)
}

/// Windows Word 2024 anchors the shared " will ", keeps base's paragraphs
/// and table in order after it, and writes the revised tail after the
/// deleted region, with no stray empty paragraph.
#[test]
fn windows_015_puts_the_tail_after_the_deleted_region() {
    let (original, revised) = pair_015();
    let (dom, root) = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        body_shape(&dom, root),
        [
            "[-This paragraph formatting-]{+Here’s some text. It has a comment.+}¶+",
            "{+I+} will [-change.-]¶-",
            "[-This paragraph will have words.-]¶-",
            "[-This paragraph will be deleted.-]¶-",
            "[-This word will be deleted.-]¶-",
            "[TBL [-Cell text-]¶-]",
            "{+add a comment to this one too.+}¶ ",
        ],
    );
}

/// Accepting the 015 redline reads the revised document, rejecting it the
/// original, table cell included.
#[test]
fn windows_015_round_trips_on_accept_and_reject() {
    let (original, revised) = pair_015();
    let (mut dom, root) = redline(&original, &revised, CompareMode::WordWindows);
    let accepted = accept_revisions_document(&mut dom, root);
    assert_eq!(
        texts(&dom, accepted),
        [
            "Here’s some text. It has a comment.",
            "I will add a comment to this one too.",
        ],
    );
    let (mut dom, root) = redline(&original, &revised, CompareMode::WordWindows);
    let rejected = reject_revisions_document(&mut dom, root);
    assert_eq!(
        texts(&dom, rejected),
        [
            "This paragraph formatting will change.",
            "This paragraph will have words.",
            "This paragraph will be deleted.",
            "This word will be deleted.",
            "Cell text",
            "",
        ],
    );
}

/// Mac Word 16's redline of the same pair (snapshot: must not move).
#[test]
fn mac_015_keeps_its_own_order() {
    let (original, revised) = pair_015();
    let (dom, root) = redline(&original, &revised, CompareMode::Word);
    assert_eq!(
        body_shape(&dom, root),
        [
            "{+Here’s some text. It has a comment.+}[-This paragraph formatting-]¶+",
            "{+I+} will {+add a comment to this one too+}[-change-].¶+",
            "¶-",
            "[-This paragraph will have words.-]¶-",
            "[-This paragraph will be deleted.-]¶-",
            "[-This word will be deleted.-]¶-",
            "[TBL [-Cell text-]¶-]",
            "¶ ",
        ],
    );
}
