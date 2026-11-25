// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! #171 — behind a paragraph both documents keep, the revision replaces the
//! original's last paragraph with a run of paragraphs that closes on an
//! empty one. Word pairs the two documents' final marks: the original's last
//! paragraph, deleted in full, stands on that mark as the body's last block,
//! and the same mark is the revision's closing paragraph.
//!
//! `splice_trailing_short_pure_dels_midstream` lifts a short pure-deleted
//! paragraph out of the end of a wholesale insert run and nests it under the
//! revision's first numbered heading, a layout Word gives other pairs
//! (document_100 × comments). For this shape it leaves the deleted paragraph
//! mid-document, and the revision's closing paragraph with it: accepted, the
//! redline is not the revision (bench pair file_77 × file_78).
//!
//! Windows Word 2024 writes the original's final paragraph at the head of the
//! replacement, merged into its first inserted paragraph with the deletion
//! first, and leaves the paired mark as the story's empty closing paragraph.
//! Mac Word 16 leaves the deleted paragraph at the end, which is #165's
//! (`m165_replaced_tail_keeps_deleted_block`): `--mode word` is not this
//! change's, so the tests below assert its placement of nothing.

use std::io::{Cursor, Read};

use jubarte::comparer::{CompareMode, WmlComparerSettings};
use jubarte::document_comparer::compare_documents_with_settings;
use jubarte::namespaces::W;
use jubarte::revision_processor::{accept_revisions_document, reject_revisions_document};
use jubarte::xmllinq::{Dom, NodeId, XName};

use crate::common::docx;

/// The original (file_77.docx): a title and a final paragraph.
const ORIGINAL: [&str; 2] = ["file_77.docx", "Ouch."];

/// The sign-off table, twice in the revision.
const TABLE: [[&str; 3]; 3] = [
    ["Role", "Name", "Date"],
    ["Contributor", "", ""],
    ["Maintainer", "", ""],
];

/// A block of the revision's body.
#[derive(Debug, PartialEq)]
enum Block {
    Para(String),
    Table,
}

impl Block {
    fn para(text: &str) -> Self {
        Block::Para(text.to_string())
    }

    /// The paragraphs it reads as, a table's cells in order.
    fn texts(&self) -> Vec<String> {
        match self {
            Block::Para(text) => vec![text.clone()],
            Block::Table => TABLE
                .iter()
                .flatten()
                .map(|cell| cell.to_string())
                .collect(),
        }
    }

    fn xml(&self) -> String {
        match self {
            Block::Para(text) => docx::para(text),
            Block::Table => {
                let rows: String = TABLE
                    .iter()
                    .map(|row| {
                        let cells: String = row
                            .iter()
                            .map(|cell| format!("<w:tc>{}</w:tc>", docx::para(cell)))
                            .collect();
                        format!("<w:tr>{cells}</w:tr>")
                    })
                    .collect();
                format!(
                    "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr><w:tblGrid><w:gridCol w:w=\"2000\"/><w:gridCol w:w=\"2000\"/><w:gridCol w:w=\"2000\"/></w:tblGrid>{rows}</w:tbl>"
                )
            }
        }
    }
}

/// The revision (file_78.docx): the title edited, then the charter that
/// replaces `Ouch.`. It is long enough, and numbered, to be the shape the
/// mid-stream splice acts on: forty-odd blocks, half of them inserted, under
/// a `1.` heading; its table keeps the whole-replacement shortcut off; it
/// closes on an empty paragraph behind a table.
fn revision() -> Vec<Block> {
    let mut blocks = vec![
        Block::para("file_78.docx"),
        Block::para("eigenpal/docx-editor"),
        Block::para("Project Charter & Contributor Agreement"),
        Block::para(""),
        Block::para("1. What this is"),
        Block::para("An editor for React documents."),
    ];
    for n in 2..=37 {
        blocks.push(Block::para(&format!("{n}. Section {n} of the charter.")));
        if n % 7 == 3 {
            blocks.push(Block::para(""));
        }
        if n == 12 {
            blocks.push(Block::Table);
        }
    }
    blocks.extend([
        Block::para("signature · date"),
        Block::Table,
        Block::para(""),
    ]);
    blocks
}

fn original() -> Vec<u8> {
    let body: String = ORIGINAL.iter().map(|line| docx::para(line)).collect();
    docx::docx(&body)
}

fn revised() -> Vec<u8> {
    let body: String = revision().iter().map(Block::xml).collect();
    docx::docx(&body)
}

/// The redline of the original against the revision in `mode`.
fn redline(mode: CompareMode) -> Vec<u8> {
    compare_documents_with_settings(&original(), &revised(), &WmlComparerSettings::new(mode))
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

/// The redline's main part, parsed, with its root element.
fn parse(docx: &[u8]) -> (Dom, NodeId) {
    let mut dom = Dom::new();
    let document = dom.parse_xdocument(&part(docx, "word/document.xml"));
    let root = dom.root(document).expect("a root element");
    (dom, root)
}

/// The paragraphs and tables directly under the body, in order.
fn body_blocks(dom: &Dom, root: NodeId) -> Vec<NodeId> {
    let body = dom.element(root, &W::body()).expect("a body");
    dom.elements(body, None)
        .into_iter()
        .filter(|&b| dom.name_is(b, &W::p()) || dom.name_is(b, &W::tbl()))
        .collect()
}

/// How a paragraph reads, outside its properties: its deletions (`d`),
/// insertions (`i`) and unchanged text (`x`), each with its text; runs of
/// one kind are joined.
fn reads(dom: &Dom, paragraph: NodeId) -> Vec<(char, String)> {
    let mut out: Vec<(char, String)> = Vec::new();
    for child in dom.elements(paragraph, None) {
        if dom.name_is(child, &W::p_pr()) {
            continue;
        }
        let kind = match dom.name(child) {
            Some(name) if name == W::del() => 'd',
            Some(name) if name == W::ins() => 'i',
            _ => 'x',
        };
        let mut text = String::new();
        for n in dom.descendants_and_self(child, None) {
            if dom.name_is(n, &W::t()) || dom.name_is(n, &W::del_text()) {
                text.push_str(&dom.value(n));
            }
        }
        match out.last_mut() {
            Some((k, s)) if *k == kind => s.push_str(&text),
            _ => out.push((kind, text)),
        }
    }
    out
}

/// A paragraph's mark: `+` inserted, `-` deleted, ` ` neither.
fn mark(dom: &Dom, paragraph: NodeId) -> char {
    let carries = |name: &XName| {
        dom.element(paragraph, &W::p_pr())
            .and_then(|ppr| dom.element(ppr, &W::r_pr()))
            .is_some_and(|rpr| dom.element(rpr, name).is_some())
    };
    match (carries(&W::ins()), carries(&W::del())) {
        (true, false) => '+',
        (false, true) => '-',
        _ => ' ',
    }
}

/// The text of every paragraph under `root`, a table's cells in order.
fn paragraph_texts(dom: &Dom, root: NodeId) -> Vec<String> {
    let body = dom.element(root, &W::body()).expect("a body");
    dom.elements(body, None)
        .into_iter()
        .filter(|&b| dom.name_is(b, &W::p()) || dom.name_is(b, &W::tbl()))
        .flat_map(|b| {
            if dom.name_is(b, &W::tbl()) {
                dom.descendants(b, Some(&W::p()))
            } else {
                vec![b]
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

/// The body's text with every revision accepted, and with every one
/// rejected.
fn views(docx: &[u8]) -> (String, String) {
    let (dom, root) = parse(docx);
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

fn revision_texts() -> Vec<String> {
    revision().iter().flat_map(Block::texts).collect()
}

/// Windows Word 2024 opens the replacement with the original's final
/// paragraph: the first inserted paragraph reads the deletion, then its own
/// insertion, on an inserted mark, and the paired final mark closes the story
/// on an empty paragraph (file_77 × file_78).
#[test]
fn windows_opens_the_replacement_with_the_originals_final_paragraph() {
    let out = redline(CompareMode::WordWindows);
    let (dom, root) = parse(&out);
    let blocks = body_blocks(&dom, root);
    let joined = blocks[1];
    assert!(
        dom.name_is(joined, &W::p()),
        "a paragraph follows the title"
    );
    assert_eq!(
        reads(&dom, joined),
        [
            ('d', "Ouch.".to_string()),
            ('i', "eigenpal/docx-editor".to_string())
        ],
        "the original's final paragraph opens the first inserted one"
    );
    assert_eq!(mark(&dom, joined), '+', "on an inserted mark");
    let closes = *blocks.last().expect("the body ends on a block");
    assert!(
        dom.name_is(closes, &W::p()),
        "the story closes on a paragraph"
    );
    assert_eq!(reads(&dom, closes), [], "the closing paragraph is empty");
    assert_eq!(mark(&dom, closes), ' ', "on the paired, unrevised mark");
    let elsewhere = blocks
        .iter()
        .filter(|&&b| b != joined)
        .filter(|&&b| reads(&dom, b).contains(&('d', "Ouch.".to_string())))
        .count();
    assert_eq!(elsewhere, 0, "the deleted paragraph stands nowhere else");
    crate::common::validity::assert_word_valid_package(&out);
}

/// Accepting the Windows redline reads the revision, rejecting it the
/// original, paragraph for paragraph: the paired mark closes the revision's
/// own closing paragraph.
#[test]
fn windows_accepts_to_the_revision_and_rejects_to_the_original() {
    let out = redline(CompareMode::WordWindows);
    let (mut dom, root) = parse(&out);
    let accepted = accept_revisions_document(&mut dom, root);
    assert_eq!(
        paragraph_texts(&dom, accepted),
        revision_texts(),
        "Accept All"
    );
    let (mut dom, root) = parse(&out);
    let rejected = reject_revisions_document(&mut dom, root);
    assert_eq!(
        paragraph_texts(&dom, rejected),
        ORIGINAL.map(String::from),
        "Reject All"
    );
}

/// `--mode word` deletes the original's final paragraph once and reads as
/// the two documents once accepted or rejected. Its placement is #165's.
#[test]
fn word_accepts_to_the_revisions_text_and_rejects_to_the_original() {
    let out = redline(CompareMode::Word);
    let (dom, root) = parse(&out);
    let deleted: String = dom
        .descendants(root, Some(&W::del_text()))
        .into_iter()
        .map(|t| dom.value(t))
        .collect();
    assert_eq!(
        deleted, "77Ouch.",
        "the title's number and the final paragraph"
    );
    let (mut dom, root) = parse(&out);
    let rejected = reject_revisions_document(&mut dom, root);
    assert_eq!(
        paragraph_texts(&dom, rejected),
        ORIGINAL.map(String::from),
        "Reject All"
    );
    let (accepted, rejected) = views(&out);
    assert_eq!(rejected, ORIGINAL.concat(), "Reject All");
    assert_eq!(accepted, revision_texts().concat(), "Accept All");
    crate::common::validity::assert_word_valid_package(&out);
}
