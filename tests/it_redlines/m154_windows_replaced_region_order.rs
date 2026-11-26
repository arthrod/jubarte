// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! #154 — Windows Word 2024 keeps a replaced region's deleted paragraphs in
//! document order, interleaved with the insertions around the words the two
//! sides share, and writes the region's trailing insertion after the deleted
//! region. Mac Word 16, the `word` preset's reference, keeps its own order;
//! its redline of the same pairs is snapshotted here and must not move.
//!
//! The sections marked "the review of #160" came with its review. Each shape
//! there pins Accept All reading as the revised document and Reject All as
//! the original; the last one pins the public finalizer's four-argument
//! entry point.

use crate::common;

use common::docx::{Part, W_NS, docx_with, docx_with_sect, esc};
use common::validity::assert_word_valid_package;
use jubarte::comparer::finalize::{
    merge_replaced_paragraphs_for_platform, merge_replaced_paragraphs_in,
};
use jubarte::comparer::{CompareMode, WmlComparerSettings, WordPlatform};
use jubarte::document_comparer::{
    accept_revisions, compare_documents_with_settings, reject_revisions,
};
use jubarte::namespaces::W;
use jubarte::revision_processor::{accept_revisions_document, reject_revisions_document};
use jubarte::xmllinq::{Dom, NodeId, XName};
use jubarte_opc::validate_dom::has_unique_revision_id;
use std::io::{Cursor, Read};

const STYLES: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
const NUMBERING: &str =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";
const HEADER: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
const HEADER_REL: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";

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
    redline_with(original, revised, mode, &[])
}

/// [`redline`] with the related `parts` (styles, numbering, …) on both sides.
fn redline_with(
    original: &str,
    revised: &str,
    mode: CompareMode,
    parts: &[Part<'_>],
) -> (Dom, NodeId) {
    parse(&part(
        &compared(original, revised, mode, parts),
        "word/document.xml",
    ))
}

/// The redline package of `original` against `revised` in `mode`. It must
/// pass the Ring-1 validity gate.
fn compared(original: &str, revised: &str, mode: CompareMode, parts: &[Part<'_>]) -> Vec<u8> {
    let out = compare_documents_with_settings(
        &docx_with(original, parts),
        &docx_with(revised, parts),
        &WmlComparerSettings::new(mode),
    )
    .expect("the compare succeeds");
    assert_word_valid_package(&out);
    out
}

/// One XML part of a package.
fn part(docx: &[u8], name: &str) -> String {
    let mut xml = String::new();
    zip::ZipArchive::new(Cursor::new(docx.to_vec()))
        .unwrap()
        .by_name(name)
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    xml
}

/// The 001 fixture's related parts: the `ListParagraph` style and the two
/// lists (`numId` 1 and 2) its paragraphs number with.
fn list_parts() -> [Part<'static>; 2] {
    [
        Part {
            name: "word/styles.xml",
            content_type: STYLES,
            rel_type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
            xml: r#"<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style></w:styles>"#,
        },
        Part {
            name: "word/numbering.xml",
            content_type: NUMBERING,
            rel_type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
            xml: r#"<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num></w:numbering>"#,
        },
    ]
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
/// when the paragraph mark is inserted or deleted, else ` `. A tab, a line
/// break or a carriage return a run holds reads `<TAB>`, `<BR>`, `<CR>`.
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
        } else if dom.parent(node).is_some_and(|r| dom.name_is(r, &W::r())) {
            // A tab, a line break or a carriage return the run holds.
            let Some(text) = [("<TAB>", "tab"), ("<BR>", "br"), ("<CR>", "cr")]
                .into_iter()
                .find(|(_, local)| dom.name_is(node, &XName::get(local, W::URI)))
                .map(|(text, _)| text)
            else {
                continue;
            };
            let chain: Vec<NodeId> = dom
                .ancestors(node, None)
                .into_iter()
                .take_while(|&a| a != paragraph)
                .collect();
            let kind = if chain.iter().any(|&a| dom.name_is(a, &W::ins())) {
                '+'
            } else if chain.iter().any(|&a| dom.name_is(a, &W::del())) {
                '-'
            } else {
                ' '
            };
            (kind, text.to_string())
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

/// What a body reads as: a paragraph as its text, a table as its rows of
/// cells, each cell as the texts of its own paragraphs.
#[derive(Debug, PartialEq)]
enum Block {
    Para(String),
    Table(Vec<Vec<Vec<String>>>),
}

/// A paragraph's text: `w:t` and `w:delText` in order, and `<TAB>`, `<BR>`,
/// `<CR>` for the breaks its runs hold.
fn paragraph_text(dom: &Dom, paragraph: NodeId) -> String {
    let mut text = String::new();
    for node in dom.descendants(paragraph, None) {
        if dom.name_is(node, &W::t()) || dom.name_is(node, &W::del_text()) {
            text.push_str(&dom.value(node));
        } else if dom.parent(node).is_some_and(|r| dom.name_is(r, &W::r())) {
            for (mark, local) in [("<TAB>", "tab"), ("<BR>", "br"), ("<CR>", "cr")] {
                if dom.name_is(node, &XName::get(local, W::URI)) {
                    text.push_str(mark);
                }
            }
        }
    }
    text
}

/// What the body of `docx` reads as, top to bottom.
fn reads_as(docx: &[u8]) -> Vec<Block> {
    let (dom, root) = parse(&part(docx, "word/document.xml"));
    let body = dom.element(root, &W::body()).expect("a body");
    dom.elements(body, None)
        .into_iter()
        .filter(|&child| dom.name_is(child, &W::p()) || dom.name_is(child, &W::tbl()))
        .map(|child| {
            if dom.name_is(child, &W::tbl()) {
                Block::Table(
                    dom.elements(child, Some(&W::tr()))
                        .into_iter()
                        .map(|row| {
                            dom.elements(row, Some(&W::tc()))
                                .into_iter()
                                .map(|cell| {
                                    dom.descendants(cell, Some(&W::p()))
                                        .into_iter()
                                        .map(|p| paragraph_text(&dom, p))
                                        .collect::<Vec<String>>()
                                })
                                .collect()
                        })
                        .collect(),
                )
            } else {
                Block::Para(paragraph_text(&dom, child))
            }
        })
        .collect()
}

/// Accept All on `redline` reads as `revised` and Reject All as `original`,
/// the package-level way (`jubarte accept`, `jubarte reject`).
fn assert_reads_as_both_sides(redline: &[u8], original: &[u8], revised: &[u8]) {
    let accepted = accept_revisions(redline).expect("Accept All succeeds");
    let rejected = reject_revisions(redline).expect("Reject All succeeds");
    assert_eq!(
        reads_as(&accepted),
        reads_as(revised),
        "Accept All must read as the revised document"
    );
    assert_eq!(
        reads_as(&rejected),
        reads_as(original),
        "Reject All must read as the original"
    );
}

/// The Windows Word 2024 redline of the pair, parsed, after Accept All and
/// Reject All each read as its document.
fn windows_redline(original: &str, revised: &str, parts: &[Part<'_>]) -> (Dom, NodeId) {
    let out = compared(original, revised, CompareMode::WordWindows, parts);
    assert_reads_as_both_sides(
        &out,
        &docx_with(original, parts),
        &docx_with(revised, parts),
    );
    parse(&part(&out, "word/document.xml"))
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

// ─── the review of #160: a closing paragraph that is not empty ────────────

/// [`pair_015`] with `tail` for the original's closing paragraph.
fn pair_015_closing(tail: &str) -> (String, String) {
    let (original, revised) = pair_015();
    let original = original
        .strip_suffix(&empty())
        .expect("the 015 original closes on an empty paragraph");
    (format!("{original}{tail}"), revised)
}

/// The 015 redline through its deleted table. The trailing insertion stands
/// behind the table and closes on the paired final mark.
const WINDOWS_015_THROUGH_THE_TABLE: [&str; 6] = [
    "[-This paragraph formatting-]{+Here’s some text. It has a comment.+}¶+",
    "{+I+} will [-change.-]¶-",
    "[-This paragraph will have words.-]¶-",
    "[-This paragraph will be deleted.-]¶-",
    "[-This word will be deleted.-]¶-",
    "[TBL [-Cell text-]¶-]",
];

/// The tail pass pairs the story's final marks over the original's closing
/// paragraph when it holds nothing the revision keeps or adds: empty, as in
/// pair 015, or only what the revision deletes. Three spaces, a tab or a
/// line break there are content Reject All must restore: they open the
/// trailing insertion's paragraph, ahead of the insertion, and the redline
/// reads as both documents.
#[test]
fn windows_015_keeps_a_closing_paragraph_that_holds_content() {
    for (tail, restored, closing) in [
        (
            r#"<w:p><w:r><w:t xml:space="preserve">   </w:t></w:r></w:p>"#,
            "   ",
            "[-   -]{+add a comment to this one too.+}¶ ",
        ),
        (
            "<w:p><w:r><w:tab/></w:r></w:p>",
            "<TAB>",
            "[-<TAB>-]{+add a comment to this one too.+}¶ ",
        ),
        (
            "<w:p><w:r><w:br/></w:r></w:p>",
            "<BR>",
            "[-<BR>-]{+add a comment to this one too.+}¶ ",
        ),
    ] {
        let (original, revised) = pair_015_closing(tail);
        let out = compared(&original, &revised, CompareMode::WordWindows, &[]);
        assert_reads_as_both_sides(&out, &docx_with(&original, &[]), &docx_with(&revised, &[]));
        let rejected = reject_revisions(&out).expect("Reject All succeeds");
        assert_eq!(
            reads_as(&rejected).last(),
            Some(&Block::Para(restored.to_string())),
            "Reject All restores {restored:?}"
        );
        let (dom, root) = parse(&part(&out, "word/document.xml"));
        let mut expected = WINDOWS_015_THROUGH_THE_TABLE.map(String::from).to_vec();
        expected.push(closing.to_string());
        assert_eq!(body_shape(&dom, root), expected, "{tail}");
    }
}

/// Mac Word 16's redline of the same pairs (snapshot: must not move).
#[test]
fn mac_015_closing_paragraph_that_holds_content_keeps_its_own_order() {
    for (tail, closing) in [
        (
            r#"<w:p><w:r><w:t xml:space="preserve">   </w:t></w:r></w:p>"#,
            "[-   -]¶ ",
        ),
        ("<w:p><w:r><w:tab/></w:r></w:p>", "[-<TAB>-]¶ "),
        ("<w:p><w:r><w:br/></w:r></w:p>", "[-<BR>-]¶ "),
    ] {
        let (original, revised) = pair_015_closing(tail);
        let (dom, root) = redline(&original, &revised, CompareMode::Word);
        let mut expected = [
            "{+Here’s some text. It has a comment.+}[-This paragraph formatting-]¶+",
            "{+I+} will {+add a comment to this one too+}[-change-].¶+",
            "¶-",
            "[-This paragraph will have words.-]¶-",
            "[-This paragraph will be deleted.-]¶-",
            "[-This word will be deleted.-]¶-",
            "[TBL [-Cell text-]¶-]",
        ]
        .map(String::from)
        .to_vec();
        expected.push(closing.to_string());
        assert_eq!(body_shape(&dom, root), expected, "{tail}");
    }
}

// ─── the review of #160: the closing paragraph's property history ─────────

/// `w:after` of the story's closing paragraph's `w:spacing`, if any, in the
/// document part of `docx`.
fn closing_spacing_after(docx: &[u8]) -> Option<String> {
    let (dom, root) = parse(&part(docx, "word/document.xml"));
    let body = dom.element(root, &W::body()).expect("a body");
    let last = dom
        .elements(body, None)
        .into_iter()
        .rev()
        .find(|&child| dom.name_is(child, &W::p()))
        .expect("the story closes on a paragraph");
    let spacing = dom
        .element(last, &W::p_pr())
        .and_then(|ppr| dom.element(ppr, &W::spacing_el()))?;
    dom.attribute(spacing, &W::name("after"))
        .map(str::to_string)
}

/// The original's closing paragraph keeps spacing the revision drops; the
/// pipeline parks that spacing in a `w:pPrChange` before the tail pass
/// runs. The tail still moves behind the table, and the moved paragraph
/// stands for the closing one: Reject All restores the spacing, and Accept
/// All reads the revision without it (the review of #160: the history went
/// away with the paragraph, and Reject All lost the spacing).
#[test]
fn windows_015_closing_paragraph_keeps_its_property_history_on_reject() {
    let (original, revised) =
        pair_015_closing(r#"<w:p><w:pPr><w:spacing w:after="720"/></w:pPr></w:p>"#);
    let out = compared(&original, &revised, CompareMode::WordWindows, &[]);
    assert_reads_as_both_sides(&out, &docx_with(&original, &[]), &docx_with(&revised, &[]));
    let (dom, root) = parse(&part(&out, "word/document.xml"));
    let mut expected = WINDOWS_015_THROUGH_THE_TABLE.map(String::from).to_vec();
    expected.push("{+add a comment to this one too.+}¶ ".to_string());
    assert_eq!(body_shape(&dom, root), expected);
    let rejected = reject_revisions(&out).expect("Reject All succeeds");
    assert_eq!(
        closing_spacing_after(&rejected).as_deref(),
        Some("720"),
        "Reject All restores the original's closing spacing"
    );
    let accepted = accept_revisions(&out).expect("Accept All succeeds");
    assert_eq!(
        closing_spacing_after(&accepted),
        None,
        "Accept All reads the revision's closing paragraph"
    );
}

/// One element of a `w:pPr`, canonicalized: its qualified name, its
/// attributes sorted (the volatile `w:rsid*` left out, which Accept All and
/// Reject All strip by contract), then its element children in order. Text
/// between children is insignificant here, so it is skipped.
fn canonical_element(dom: &Dom, node: NodeId) -> String {
    let name = dom.name(node).expect("an element");
    let mut out = format!("{{{}}}{}", name.namespace_name(), name.local_name());
    let mut attrs: Vec<String> = dom
        .attributes(node)
        .into_iter()
        .filter(|(name, _)| {
            !(name.namespace_name() == W::URI && name.local_name().starts_with("rsid"))
        })
        .map(|(name, value)| format!("{{{}}}{}={value}", name.namespace_name(), name.local_name()))
        .collect();
    attrs.sort();
    out.push('(');
    out.push_str(&attrs.join(" "));
    out.push(')');
    out.push('{');
    for child in dom.elements(node, None) {
        out.push_str(&canonical_element(dom, child));
    }
    out.push('}');
    out
}

/// The canonical form of the story's closing paragraph's whole `w:pPr`, or
/// the empty string when it carries none.
fn canonical_closing_properties(docx: &[u8]) -> String {
    let (dom, root) = parse(&part(docx, "word/document.xml"));
    let body = dom.element(root, &W::body()).expect("a body");
    let last = dom
        .elements(body, None)
        .into_iter()
        .rev()
        .find(|&child| dom.name_is(child, &W::p()))
        .expect("the story closes on a paragraph");
    match dom.element(last, &W::p_pr()) {
        Some(ppr) => canonical_element(&dom, ppr),
        None => String::new(),
    }
}

/// The original's closing paragraph carries direct properties with no
/// history the pipeline parked them in: a `w:rsidR` attribute, a style, its
/// justification and paragraph-mark run properties (the reviewer's
/// `exact-rpr-a` probe). The tail moves the replaced region behind the
/// table, and the moved paragraph stands for the closing one: Reject All
/// restores the original's whole `w:pPr` — attributes, mark run properties
/// and all — and Accept All reads the revision's closing paragraph. The
/// `w:pPrChange` keeps the original's attributes and bare children; the
/// mark's `w:rPr` goes into a `w:rPrChange` inside the carrier's mark
/// `w:rPr` (the second review of #160).
#[test]
fn windows_015_reject_restores_the_exact_closing_paragraph_properties() {
    let closing = r#"<w:pPr w:rsidR="00AA00AA"><w:pStyle w:val="Heading2"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr></w:pPr>"#;
    let (original, revised) = pair_015_closing(&format!("<w:p>{closing}</w:p>"));
    let out = compared(&original, &revised, CompareMode::WordWindows, &[]);
    assert_reads_as_both_sides(&out, &docx_with(&original, &[]), &docx_with(&revised, &[]));
    let (dom, root) = parse(&part(&out, "word/document.xml"));
    let mut expected = WINDOWS_015_THROUGH_THE_TABLE.map(String::from).to_vec();
    expected.push("{+add a comment to this one too.+}¶ ".to_string());
    assert_eq!(body_shape(&dom, root), expected);

    // The redline records the original's attributes and its mark's run
    // properties, not only the live carrier's view of them.
    let (dom, root) = parse(&part(&out, "word/document.xml"));
    let carrier = dom
        .elements(dom.element(root, &W::body()).expect("a body"), None)
        .into_iter()
        .rev()
        .find(|&child| dom.name_is(child, &W::p()))
        .expect("the story closes on a paragraph");
    let ppr = dom
        .element(carrier, &W::p_pr())
        .expect("the carrier's properties");
    let recorded = dom
        .element(ppr, &W::p_pr_change())
        .and_then(|change| dom.element(change, &W::p_pr()))
        .expect("the carrier records the closing properties");
    assert_eq!(
        dom.attribute(recorded, &W::name("rsidR")),
        Some("00AA00AA"),
        "the record keeps the closing paragraph's attributes"
    );
    let mark = dom
        .element(ppr, &W::r_pr())
        .expect("the carrier's mark has run properties");
    let mark_change = dom
        .element(mark, &W::r_pr_change())
        .and_then(|change| dom.element(change, &W::r_pr()))
        .expect("the carrier's mark records the closing mark's properties");
    let fonts = dom
        .element(mark_change, &W::name("rFonts"))
        .expect("the closing mark's rFonts are recorded");
    assert_eq!(
        dom.attribute(fonts, &W::name("ascii")).map(str::to_string),
        Some("Courier New".to_string())
    );

    let rejected = reject_revisions(&out).expect("Reject All succeeds");
    assert_eq!(
        canonical_closing_properties(&rejected),
        canonical_closing_properties(&docx_with(&original, &[])),
        "Reject All restores the original's whole closing w:pPr"
    );
    let accepted = accept_revisions(&out).expect("Accept All succeeds");
    assert_eq!(
        canonical_closing_properties(&accepted),
        canonical_closing_properties(&docx_with(&revised, &[])),
        "Accept All reads the revision's closing paragraph"
    );
}

/// Every `w:id` the package-wide carrier set — the validator's own
/// [`has_unique_revision_id`] — holds in every `word/*.xml` part of `docx`,
/// with the element's local name and the part that holds it.
fn revision_ids_in_package(docx: &[u8]) -> Vec<(String, String, String)> {
    let mut ids = Vec::new();
    let names: Vec<String> = zip::ZipArchive::new(Cursor::new(docx.to_vec()))
        .unwrap()
        .file_names()
        .filter_map(Result::ok)
        .map(|name| name.to_string())
        .filter(|name| name.starts_with("word/") && name.ends_with(".xml"))
        .collect();
    for name in names {
        let xml = part(docx, &name);
        let (dom, root) = parse(&xml);
        for node in dom.descendants(root, None) {
            let Some(node_name) = dom.name(node) else {
                continue;
            };
            if has_unique_revision_id(&node_name)
                && let Some(id) = dom.attribute(node, &W::id())
            {
                ids.push((
                    name.clone(),
                    node_name.local_name().to_string(),
                    id.to_string(),
                ));
            }
        }
    }
    ids
}

/// A `…RangeStart` / `…RangeEnd` pair's two local names share one id by
/// design; nothing else may.
fn same_range_pair(first: &str, second: &str) -> bool {
    match (
        first.strip_suffix("RangeStart"),
        second.strip_suffix("RangeEnd"),
    ) {
        (Some(stem), Some(end)) => stem == end,
        _ => false,
    }
}

/// Assert no revision id repeats in the whole package — styles included, the
/// package-wide space the fourth review of #160 requires — allowing only the
/// one documented repeat: a range's start and its end in the same part.
fn assert_revision_ids_unique(docx: &[u8]) -> usize {
    let ids = revision_ids_in_package(docx);
    let mut by_id: std::collections::HashMap<&str, Vec<(&str, &str)>> =
        std::collections::HashMap::new();
    for (part, local, id) in &ids {
        by_id.entry(id).or_default().push((part, local));
    }
    for (id, holders) in &by_id {
        if holders.len() == 1 {
            continue;
        }
        let paired = holders.len() == 2
            && holders[0].0 == holders[1].0
            && (same_range_pair(holders[0].1, holders[1].1)
                || same_range_pair(holders[1].1, holders[0].1));
        assert!(
            paired,
            "w:id {id} repeats: {holders:?} (a start/end pair in one part is the only allowed repeat)"
        );
    }
    ids.len()
}

/// `prefix` as a header of 16 paragraphs, each of which the other side
/// replaces outright: the header comparison mints one revision id per
/// paragraph, with nothing to seed them from.
fn sixteen_paragraph_header(prefix: &str) -> String {
    let paragraphs: String = (1..=16)
        .map(|n| format!("<w:p><w:r><w:t>{prefix}{n:02}</w:t></w:r></w:p>"))
        .collect();
    format!("<w:hdr xmlns:w=\"{W_NS}\">{paragraphs}</w:hdr>")
}

/// `xml` as the default header part.
fn header_part(xml: &str) -> Part<'_> {
    Part {
        name: "word/header1.xml",
        content_type: HEADER,
        rel_type: HEADER_REL,
        xml,
    }
}

/// A stylesheet whose `Normal` style spaces paragraphs `after` twips (the
/// comparison records the other side's value in a `w:pPrChange`).
fn normal_style(after: &str) -> String {
    format!(
        r#"<w:styles xmlns:w="{W_NS}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="{after}" w:line="240" w:lineRule="auto"/></w:pPr></w:style></w:styles>"#
    )
}

/// `xml` as the styles part.
fn styles_part(xml: &str) -> Part<'_> {
    Part {
        name: "word/styles.xml",
        content_type: STYLES,
        rel_type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
        xml,
    }
}

/// A changed header and a changed body are compared in separate parts, and
/// each part numbers its revision ids from 1 — so the synthesized
/// `w:pPrChange` reused a header's id. The review's `hdr16` probe requires
/// no `w:id` to repeat anywhere in the package (the third review of #160).
#[test]
fn windows_015_revision_ids_do_not_repeat_in_the_package() {
    let (original, revised) =
        pair_015_closing(r#"<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr></w:p>"#);
    let header_a = sixteen_paragraph_header("OLD");
    let header_b = sixteen_paragraph_header("NEW");
    let sect = r#"<w:headerReference w:type="default" r:id="rIdX0"/>"#;
    let out = compare_documents_with_settings(
        &docx_with_sect(&original, &[header_part(&header_a)], sect),
        &docx_with_sect(&revised, &[header_part(&header_b)], sect),
        &WmlComparerSettings::new(CompareMode::WordWindows),
    )
    .expect("the compare succeeds");
    assert_word_valid_package(&out);
    let count = assert_revision_ids_unique(&out);
    assert!(count > 30, "the probe exercises both parts: {count}");
}

/// The stylesheet is one more `word/*.xml` part of the revision-id space
/// (the fourth review of #160). The comparison itself mints a style record:
/// Normal's paragraph spacing differs, so the stylesheet gains a
/// `w:pPrChange` numbered from 1 — the id the body's revisions take. Word
/// never repeats a revision id across parts. The pass reserves the
/// stylesheet's ids first and leaves its own numbering alone.
#[test]
fn windows_015_style_revision_ids_share_the_package_space() {
    let (original, revised) =
        pair_015_closing(r#"<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr></w:p>"#);
    let header_a = sixteen_paragraph_header("OLD");
    let header_b = sixteen_paragraph_header("NEW");
    let sect = r#"<w:headerReference w:type="default" r:id="rIdX0"/>"#;
    let out = compare_documents_with_settings(
        &docx_with_sect(
            &original,
            &[header_part(&header_a), styles_part(&normal_style("160"))],
            sect,
        ),
        &docx_with_sect(
            &revised,
            &[header_part(&header_b), styles_part(&normal_style("400"))],
            sect,
        ),
        &WmlComparerSettings::new(CompareMode::WordWindows),
    )
    .expect("the compare succeeds");
    assert_word_valid_package(&out);
    let count = assert_revision_ids_unique(&out);
    assert!(count > 30, "the probe exercises both parts: {count}");
    let (dom, root) = parse(&part(&out, "word/styles.xml"));
    let style_ids: Vec<String> = dom
        .descendants(root, Some(&W::p_pr_change()))
        .into_iter()
        .filter_map(|change| dom.attribute(change, &W::id()).map(str::to_string))
        .collect();
    assert_eq!(
        style_ids,
        ["1"],
        "the stylesheet keeps the id the comparison gave its Normal record"
    );
}

/// Mac Word 16's redline of the same pair (snapshot: must not move): the
/// closing paragraph stays, with its history, and Reject All restores the
/// spacing as it does on Windows.
#[test]
fn mac_015_closing_paragraph_keeps_its_property_history() {
    let (original, revised) =
        pair_015_closing(r#"<w:p><w:pPr><w:spacing w:after="720"/></w:pPr></w:p>"#);
    let (dom, root) = redline(&original, &revised, CompareMode::Word);
    assert_eq!(
        body_shape(&dom, root).last().map(String::as_str),
        Some("¶ ")
    );
    let out = compared(&original, &revised, CompareMode::Word, &[]);
    let rejected = reject_revisions(&out).expect("Reject All succeeds");
    assert_eq!(closing_spacing_after(&rejected).as_deref(), Some("720"));
}

// ─── the review of #160: a paragraph behind the replaced region ───────────

/// [`pair_001`] with `tail` appended to the original.
fn pair_001_then(tail: &str) -> (String, String) {
    let (original, revised) = pair_001();
    (format!("{original}{tail}"), revised)
}

/// The original ends on an empty paragraph behind the list. The story's
/// final marks pair over it, so "b" keeps its own deleted mark ahead of the
/// inserted paragraphs and the final mark: Reject All reads the original's
/// four paragraphs, `["a", "test", "b", ""]`.
#[test]
fn windows_001_keeps_the_trailing_empty_paragraph() {
    let (original, revised) = pair_001_then(&empty());
    let (dom, root) = windows_redline(&original, &revised, &list_parts());
    assert_eq!(
        body_shape(&dom, root),
        [
            "[-a-]¶-",
            "{+Item 1+}¶+",
            "¶+",
            "{+Break +}test¶ ",
            "[-b-]¶-",
            "¶+",
            "{+Item 2+}¶+",
            "¶+",
            "{+New list starts here (num 1)+}¶+",
            "{+Num 2+}¶ ",
        ],
    );
    let rejected = reject_revisions(&compared(
        &original,
        &revised,
        CompareMode::WordWindows,
        &list_parts(),
    ))
    .expect("Reject All succeeds");
    assert_eq!(
        reads_as(&rejected),
        [
            Block::Para("a".to_string()),
            Block::Para("test".to_string()),
            Block::Para("b".to_string()),
            Block::Para(String::new()),
        ],
    );
}

/// Two list items deleted behind the shared word: each keeps its deleted
/// mark ahead of the paired final one, so Accept All reads the revision and
/// Reject All the original's five paragraphs.
#[test]
fn windows_list_keeps_every_deleted_item_ahead_of_the_trailing_empty_paragraph() {
    let original = [
        item("a", 2),
        para("test"),
        item("b", 2),
        item("c", 2),
        empty(),
    ]
    .concat();
    let revised = pair_001().1;
    let (dom, root) = windows_redline(&original, &revised, &list_parts());
    assert_eq!(
        body_shape(&dom, root),
        [
            "[-a-]¶-",
            "{+Item 1+}¶+",
            "¶+",
            "{+Break +}test¶ ",
            "[-b-]¶-",
            "[-c-]¶-",
            "¶+",
            "{+Item 2+}¶+",
            "¶+",
            "{+New list starts here (num 1)+}¶+",
            "{+Num 2+}¶ ",
        ],
    );
}

/// Mac Word 16's redline of the pair with the trailing empty paragraph
/// (snapshot: must not move).
#[test]
fn mac_001_trailing_empty_paragraph_keeps_its_own_order() {
    let (original, revised) = pair_001_then(&empty());
    let (dom, root) = redline_with(&original, &revised, CompareMode::Word, &list_parts());
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
            "[-b-]¶-",
            "¶ ",
        ],
    );
}

// ─── the review of #160: the public finalizer's calling convention ────────

const BY: &str = r#"w:author="Editor" w:date="2026-01-01T00:00:00Z""#;

/// A restreamed region's cell as the pipeline hands the merge pass: a
/// deleted word closed by the next empty paragraph's inserted mark.
fn deleted_under_inserted_mark(text: &str) -> String {
    format!(
        r#"<w:p><w:pPr><w:rPr><w:ins w:id="1" {BY}/></w:rPr></w:pPr><w:del w:id="2" {BY}><w:r><w:delText>{text}</w:delText></w:r></w:del></w:p>"#
    )
}

/// A paragraph wholly inserted, its mark too.
fn inserted_paragraph(text: &str) -> String {
    format!(
        r#"<w:p><w:pPr><w:rPr><w:ins w:id="3" {BY}/></w:rPr></w:pPr><w:ins w:id="4" {BY}><w:r><w:t>{text}</w:t></w:r></w:ins></w:p>"#
    )
}

/// A document whose body is `body`.
fn document(body: &str) -> String {
    format!(r#"<w:document xmlns:w="{W_NS}"><w:body>{body}<w:sectPr/></w:body></w:document>"#)
}

/// The base crate published the finalizer with four arguments, and a
/// downstream caller still passes four (the review of #160). It keeps
/// compiling, and keeps Mac Word 16's result: the pair folds into one
/// paragraph, the insertion first. The platform-aware entry point is where
/// a caller names Windows Word 2024, whose merge leaves the gap alone.
#[test]
fn four_argument_finalizer_keeps_its_signature_and_its_result() {
    // The review's downstream caller, verbatim.
    fn finalize(dom: &mut Dom, root: NodeId) {
        merge_replaced_paragraphs_in(dom, root, "Editor", false);
    }
    let body = format!(
        "{}{}",
        deleted_under_inserted_mark("b"),
        inserted_paragraph("Item 2")
    );
    let (mut dom, root) = parse(&document(&body));
    finalize(&mut dom, root);
    assert_eq!(body_shape(&dom, root), ["{+Item 2+}[-b-]¶ "]);

    // Mac by name, the default included: the same result.
    for platform in [WordPlatform::Mac, WordPlatform::default()] {
        let (mut dom, root) = parse(&document(&body));
        merge_replaced_paragraphs_for_platform(&mut dom, root, "Editor", false, platform);
        assert_eq!(
            body_shape(&dom, root),
            ["{+Item 2+}[-b-]¶ "],
            "{platform:?}"
        );
    }

    // Windows Word 2024: the deleted word keeps the inserted mark the stream
    // closed it with, ahead of the inserted paragraph.
    let (mut dom, root) = parse(&document(&body));
    merge_replaced_paragraphs_for_platform(&mut dom, root, "Editor", false, WordPlatform::Windows);
    assert_eq!(body_shape(&dom, root), ["[-b-]¶+", "{+Item 2+}¶+"]);
}

// ─── the review of #160: a zero-pair region that adds a paragraph ─────────

/// A zero-pair region between two kept paragraphs: one original paragraph
/// against two revised ones, sharing a word with it and no paragraph.
fn pair_zero_pair() -> (String, String) {
    let original = [
        para("Intro line stays."),
        para("alpha will omega"),
        para("Outro line stays."),
    ]
    .concat();
    let revised = [
        para("Intro line stays."),
        para("beta will gamma"),
        para("delta epsilon"),
        para("Outro line stays."),
    ]
    .concat();
    (original, revised)
}

/// The public pipeline keeps this short replacement as whole paragraphs,
/// with deletions first on Windows. Both source documents must still be
/// recovered. The isolated render test in `cross_para.rs` exercises C77's
/// expanding zero-pair stream; its intermediate cells are not a snapshot
/// of the final public redline for this fixture.
#[test]
fn windows_zero_pair_region_that_adds_a_paragraph_preserves_both_sources() {
    let (original, revised) = pair_zero_pair();
    let out = compared(&original, &revised, CompareMode::WordWindows, &[]);
    assert_reads_as_both_sides(&out, &docx_with(&original, &[]), &docx_with(&revised, &[]));
    let (dom, root) = parse(&part(&out, "word/document.xml"));
    assert_eq!(
        body_shape(&dom, root),
        [
            "Intro line stays.¶ ",
            "[-alpha will omega-]¶-",
            "{+beta will gamma+}¶+",
            "{+delta epsilon+}¶+",
            "Outro line stays.¶ ",
        ]
    );
}

/// Mac Word 16's redline of the same pair (snapshot: must not move).
#[test]
fn mac_zero_pair_region_that_adds_a_paragraph_keeps_its_own_order() {
    let (original, revised) = pair_zero_pair();
    let (dom, root) = redline(&original, &revised, CompareMode::Word);
    assert_eq!(
        body_shape(&dom, root),
        [
            "Intro line stays.¶ ",
            "{+beta+}[-alpha-] will {+gamma+}[-omega-]¶ ",
            "{+delta epsilon+}¶+",
            "Outro line stays.¶ ",
        ]
    );
}
