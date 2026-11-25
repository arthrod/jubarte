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

use common::docx::{Part, W_NS, docx_with, esc};
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
use std::io::{Cursor, Read};

const STYLES: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
const NUMBERING: &str =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";

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
