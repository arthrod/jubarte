// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! #165 — a wholly replaced tail keeps base's deleted block together.
//!
//! Behind a title both documents share, base's tail is wholly replaced.
//! Word never splits base's contiguous deleted paragraphs there. Mac Word
//! 16, the `word` preset's reference, writes every insertion first and the
//! whole deleted block at the end; Windows Word 2024 (`word-windows`) writes
//! the whole deleted block right after the title, then the insertions
//! (file_145 × file_146, file_13 × file_14).
//!
//! jubarte moved the deleted heading beside next's first numbered heading
//! and left the other two deleted paragraphs at the end:
//! `splice_trailing_short_pure_dels_midstream` nests a short deleted title
//! under the first numbered heading of a wholesale insert run, and the merge
//! pass then carries it to the next table. That is Word's layout only when
//! next replaces base's whole body (double_spacing_bold_demo ×
//! eigenpal_docx_editor_suggesting_mixed_edits). Behind a kept title the
//! deleted paragraphs are a tail, and the block stays whole.
//!
//! The pairs are synthetic, in the shape that reaches the page: a next whose
//! first numbered heading follows a table and is itself followed by one,
//! closing on an empty paragraph.

use std::io::{Cursor, Read};

use jubarte::comparer::{CompareMode, WmlComparerSettings};
use jubarte::document_comparer::compare_documents_with_settings;
use jubarte::namespaces::W;
use jubarte::revision_processor::{accept_revisions_document, reject_revisions_document};
use jubarte::xmllinq::{Dom, NodeId, XName};

use crate::common::docx::{self, para};

const BASE_TITLE: &str = "file_145.docx";
const NEXT_TITLE: &str = "file_146.docx";

/// Base's tail: a short heading, then two longer paragraphs.
const BASE_TAIL: [&str; 3] = [
    "Heading 4 Right Italic Demo",
    "Heading 4 style with right alignment and italic formatting.",
    "This creates unique stylized subheadings for document sections.",
];

/// Next's opening paragraphs; a table stands after the fourth and after the
/// last, so the first numbered heading sits between two tables.
const OPENING: [&str; 8] = [
    "eigenpal/docx-editor",
    "Project Charter & Contributor Agreement",
    "",
    "An open-source WYSIWYG .docx editor for React.",
    "",
    "1. What this is",
    "Most editors serialise to HTML and back.",
    "",
];

/// The inserted body blocks of the redline: next's blocks after its title,
/// less its closing empty paragraph, whose mark closes base's last deleted
/// paragraph.
const INSERTED: usize = 45;

/// A small table.
fn table() -> String {
    let rows = [["Step", "Task"], ["1", "Sign NDA"], ["2", "Setup laptop"]];
    let rows: String = rows
        .iter()
        .map(|row| {
            let cells: String = row
                .iter()
                .map(|cell| format!("<w:tc>{}</w:tc>", para(cell)))
                .collect();
            format!("<w:tr>{cells}</w:tr>")
        })
        .collect();
    format!(
        "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr><w:tblGrid/>{rows}</w:tbl>"
    )
}

/// Next: its title, the opening around the two tables, more paragraphs, and
/// a closing empty paragraph.
fn next() -> Vec<u8> {
    let mut body = para(NEXT_TITLE);
    for line in &OPENING[..4] {
        body.push_str(&para(line));
    }
    body.push_str(&table());
    for line in &OPENING[4..] {
        body.push_str(&para(line));
    }
    body.push_str(&table());
    for i in 9..44 {
        body.push_str(&para(&format!(
            "Contributor guideline paragraph number {i} of the charter."
        )));
    }
    body.push_str(&para(""));
    docx::docx(&body)
}

/// Base: its title when `titled`, then the tail. Untitled, next replaces the
/// whole body (the shape of double_spacing_bold_demo × eigenpal_…).
fn base(titled: bool) -> Vec<u8> {
    let mut body = String::new();
    if titled {
        body.push_str(&para(BASE_TITLE));
    }
    for line in BASE_TAIL {
        body.push_str(&para(line));
    }
    docx::docx(&body)
}

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
    dom.descendants(node, None)
        .into_iter()
        .filter(|&n| dom.name_is(n, &W::t()) || dom.name_is(n, &W::del_text()))
        .map(|n| dom.value(n))
        .collect()
}

/// The body blocks under `root`, in order. A block is a `w:p` or a `w:tbl`
/// directly under `w:body`.
fn body_blocks(dom: &Dom, root: NodeId) -> Vec<NodeId> {
    let body = dom.element(root, &W::body()).expect("a body");
    dom.elements(body, None)
        .into_iter()
        .filter(|&b| dom.name_is(b, &W::p()) || dom.name_is(b, &W::tbl()))
        .collect()
}

/// One sign per body block of the redline `docx`: `+` inserted, `-`
/// deleted, `*` both, `.` neither. A paragraph stands on its mark, whatever
/// deleted or inserted text it holds: a paragraph whose mark is inserted is
/// an inserted paragraph. A table, and a paragraph without a mark of one
/// kind, go by the revisions under them.
fn order(docx: &[u8]) -> String {
    let (dom, root) = parse(&part(docx, "word/document.xml"));
    body_blocks(&dom, root)
        .into_iter()
        .map(|b| {
            let has = |name: &XName| !dom.descendants_and_self(b, Some(name)).is_empty();
            let (ins, del) = (has(&W::ins()), has(&W::del()));
            let mark = dom
                .element(b, &W::p_pr())
                .and_then(|ppr| dom.element(ppr, &W::r_pr()));
            let on_mark = |name: &XName| mark.is_some_and(|m| dom.element(m, name).is_some());
            match (
                on_mark(&W::ins()) && !on_mark(&W::del()),
                on_mark(&W::del()) && !on_mark(&W::ins()),
            ) {
                (true, false) => '+',
                (false, true) => '-',
                _ => match (ins, del) {
                    (true, false) => '+',
                    (false, true) => '-',
                    (true, true) => '*',
                    (false, false) => '.',
                },
            }
        })
        .collect()
}

/// The text of each deleted body block of the redline `docx`, in order: a
/// block whose sign is `-`.
fn deleted(docx: &[u8]) -> Vec<String> {
    let (dom, root) = parse(&part(docx, "word/document.xml"));
    let signs: Vec<char> = order(docx).chars().collect();
    body_blocks(&dom, root)
        .into_iter()
        .zip(signs)
        .filter(|(_, sign)| *sign == '-')
        .map(|(b, _)| text(&dom, b))
        .collect()
}

/// The text of each body paragraph and table cell paragraph under `root`,
/// in order, without a closing empty paragraph.
fn texts(dom: &Dom, root: NodeId) -> Vec<String> {
    let mut out: Vec<String> = body_blocks(dom, root)
        .into_iter()
        .flat_map(|b| {
            if dom.name_is(b, &W::tbl()) {
                dom.descendants(b, Some(&W::p()))
            } else {
                vec![b]
            }
        })
        .map(|p| text(dom, p))
        .collect();
    while out.last().is_some_and(|t| t.is_empty()) {
        out.pop();
    }
    out
}

/// Source paragraphs as [`texts`] reads them.
fn source(docx: &[u8]) -> Vec<String> {
    let (dom, root) = parse(&part(docx, "word/document.xml"));
    texts(&dom, root)
}

/// Accepting the redline reads the revised document, rejecting it the
/// original, in both orders.
#[test]
fn both_orders_accept_and_reject_to_the_two_documents() {
    let (original, revised) = (base(true), next());
    let (expected_rejected, expected_accepted) = (source(&original), source(&revised));
    for mode in [CompareMode::Word, CompareMode::WordWindows] {
        let out = redline(&original, &revised, mode);
        let (mut dom, root) = parse(&part(&out, "word/document.xml"));
        let accepted = accept_revisions_document(&mut dom, root);
        assert_eq!(
            texts(&dom, accepted),
            expected_accepted,
            "{mode:?}: Accept All"
        );
        let (mut dom, root) = parse(&part(&out, "word/document.xml"));
        let rejected = reject_revisions_document(&mut dom, root);
        assert_eq!(
            texts(&dom, rejected),
            expected_rejected,
            "{mode:?}: Reject All"
        );
    }
}

/// Mac Word 16's order: every insertion, then the whole deleted block.
#[test]
fn word_keeps_the_deleted_block_whole_at_the_end() {
    let out = redline(&base(true), &next(), CompareMode::Word);
    assert_eq!(
        order(&out),
        format!("*{}---", "+".repeat(INSERTED)),
        "Mac Word 16 writes every insertion, then base's whole deleted block"
    );
    assert_eq!(
        deleted(&out),
        BASE_TAIL,
        "the deleted paragraphs keep base's order"
    );
    crate::common::validity::assert_word_valid_package(&out);
}

/// Windows Word 2024's order: the whole deleted block right after the
/// title, then the insertions.
#[test]
fn word_windows_keeps_the_deleted_block_whole_after_the_title() {
    let out = redline(&base(true), &next(), CompareMode::WordWindows);
    assert_eq!(
        order(&out),
        format!("*---{}", "+".repeat(INSERTED)),
        "Windows Word 2024 writes the whole deleted block after the title"
    );
    assert_eq!(
        deleted(&out),
        BASE_TAIL,
        "the deleted paragraphs keep base's order"
    );
    crate::common::validity::assert_word_valid_package(&out);
}

/// Untitled, base's whole body is replaced and Word does nest its short
/// title in next's first numbered heading (double_spacing_bold_demo ×
/// eigenpal_docx_editor_suggesting_mixed_edits); the other two deleted
/// paragraphs stay together at the end.
#[test]
fn a_whole_body_replacement_still_nests_its_short_title() {
    let out = redline(&base(false), &next(), CompareMode::Word);
    let (dom, root) = parse(&part(&out, "word/document.xml"));
    assert_eq!(
        order(&out),
        format!("{}*{}--", "+".repeat(7), "+".repeat(INSERTED - 7)),
        "Word folds the short deleted title into the first numbered heading"
    );
    let blocks = body_blocks(&dom, root);
    assert_eq!(
        text(&dom, blocks[7]),
        format!("{}{}", OPENING[5], BASE_TAIL[0]),
        "the heading paragraph holds the inserted heading and the deleted title"
    );
    assert_eq!(
        deleted(&out),
        &BASE_TAIL[1..],
        "the other deleted paragraphs keep base's order at the end"
    );
    crate::common::validity::assert_word_valid_package(&out);
}
