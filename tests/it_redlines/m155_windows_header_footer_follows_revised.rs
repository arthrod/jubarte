// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! #155 -- `--mode word-windows` takes the result's headers and footers from
//! the revised document, as Windows Word 2024 does.
//!
//! A Windows shape never outranks what Accept All and Reject All read as:
//! the accepted package shows the revised document's stories, the rejected
//! one the original's.

use std::io::{Cursor, Read};

use jubarte::comparer::{CompareMode, WmlComparerSettings};
use jubarte::document_comparer::{
    accept_revisions, compare_documents_with_settings, reject_revisions,
};
use jubarte::namespaces::{R, W};
use jubarte::opc::PartFs;
use jubarte::xmllinq::{Dom, NodeId, XName};

use crate::common::docx::{self, Part, W_NS};

const OD_REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const HEADER: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
const FOOTER: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

fn redline(original: &[u8], revised: &[u8], mode: CompareMode) -> Vec<u8> {
    compare_documents_with_settings(original, revised, &WmlComparerSettings::new(mode))
        .expect("the compare succeeds")
}

fn accepted(docx: &[u8]) -> Vec<u8> {
    accept_revisions(docx).expect("Accept All succeeds")
}

fn rejected(docx: &[u8]) -> Vec<u8> {
    reject_revisions(docx).expect("Reject All succeeds")
}

fn part(docx: &[u8], name: &str) -> String {
    let mut zip = zip::ZipArchive::new(Cursor::new(docx.to_vec())).unwrap();
    let mut text = String::new();
    zip.by_name(name)
        .unwrap()
        .read_to_string(&mut text)
        .unwrap();
    text
}

fn has_part(docx: &[u8], name: &str) -> bool {
    let mut zip = zip::ZipArchive::new(Cursor::new(docx.to_vec())).unwrap();
    zip.by_name(name).is_ok()
}

fn parse(xml: &str) -> (Dom, NodeId) {
    let mut dom = Dom::new();
    let document = dom.parse_xdocument(xml);
    let root = dom.root(document).expect("a root element");
    (dom, root)
}

fn text(dom: &Dom, node: NodeId) -> String {
    let mut out = String::new();
    for n in dom.descendants(node, None) {
        if dom.name_is(n, &W::t()) || dom.name_is(n, &W::del_text()) {
            out.push_str(&dom.value(n));
        }
    }
    out
}

fn count(dom: &Dom, node: NodeId, name: &XName) -> usize {
    dom.descendants(node, Some(name)).len()
}

/// One header/footer story a document displays: the index of its section,
/// `header` or `footer`, the `w:type`, and the story's text.
type Story = (usize, String, String, String);

/// What a document shows in its headers and footers: every section's
/// references, each resolved to its story's text, in a fixed order. An
/// empty story is left out: a blank header shows what no header shows.
fn shown_stories(docx: &[u8]) -> Vec<Story> {
    let pkg = PartFs::open(docx).expect("the document opens");
    let main = pkg
        .main_document_part()
        .unwrap_or_else(|| "word/document.xml".to_string());
    let (dom, root) = parse(&pkg.part_string(&main).expect("a main document"));
    let rels = pkg
        .read_rels_for(&main)
        .expect("the main document's relationships");
    let sections: Vec<NodeId> = dom
        .descendants(root, Some(&W::sect_pr()))
        .into_iter()
        .filter(|&s| {
            dom.parent(s)
                .is_some_and(|p| dom.name_is(p, &W::p_pr()) || dom.name_is(p, &W::body()))
        })
        .collect();
    let mut shown = Vec::new();
    for (index, &sect) in sections.iter().enumerate() {
        for reference in dom.elements(sect, None) {
            let kind = if dom.name_is(reference, &W::header_reference()) {
                "header"
            } else if dom.name_is(reference, &W::footer_reference()) {
                "footer"
            } else {
                continue;
            };
            let ty = dom
                .attribute(reference, &W::type_())
                .unwrap_or("default")
                .to_string();
            let Some(rid) = dom.attribute(reference, &R::id()) else {
                continue;
            };
            let Some(target) = rels
                .items
                .iter()
                .find(|rel| rel.id == rid)
                .map(|rel| rel.target.clone())
            else {
                continue;
            };
            let story = pkg.resolve_rel_target(&main, &target);
            let text = pkg
                .part_string(&story)
                .map(|xml| {
                    let (story_dom, story_root) = parse(&xml);
                    text(&story_dom, story_root)
                })
                .unwrap_or_default();
            if !text.is_empty() {
                shown.push((index, kind.to_string(), ty, text));
            }
        }
    }
    shown.sort();
    shown
}

/// The header parts of `docx` whose text holds `needle`, with their XML. A
/// part is a header by its root element, whatever name it was copied under.
fn headers_holding(docx: &[u8], needle: &str) -> Vec<(String, String)> {
    let pkg = PartFs::open(docx).expect("the document opens");
    let mut found = Vec::new();
    for name in pkg.parts() {
        if !(name.starts_with("word/") && name.ends_with(".xml")) {
            continue;
        }
        let Some(xml) = pkg.part_string(&name) else {
            continue;
        };
        let (dom, root) = parse(&xml);
        if !dom.name_is(root, &W::hdr()) {
            continue;
        }
        if text(&dom, root).contains(needle) {
            found.push((name, xml));
        }
    }
    found
}

fn story_xml(header: bool, text: &str) -> String {
    let (tag, style) = if header {
        ("hdr", "Header")
    } else {
        ("ftr", "Footer")
    };
    format!(
        r#"<w:{tag} xmlns:w="{W_NS}"><w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr><w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p></w:{tag}>"#
    )
}

/// A document of `body` with the header/footer stories `stories` in order (a
/// header is `(true, text)`, a footer `(false, text)`) and `refs` at the
/// start of its final `w:sectPr`. Story `i` is relationship `rIdX{i}` and
/// takes the next number of its kind (`word/header1.xml`, `word/footer1.xml`).
fn document(body: &str, stories: &[(bool, &str)], refs: &str) -> Vec<u8> {
    let mut numbers = [0usize; 2];
    let built: Vec<(String, String, String)> = stories
        .iter()
        .map(|&(header, text)| {
            let kind = if header { "header" } else { "footer" };
            numbers[usize::from(!header)] += 1;
            (
                format!("word/{kind}{}.xml", numbers[usize::from(!header)]),
                format!("{OD_REL}/{kind}"),
                story_xml(header, text),
            )
        })
        .collect();
    let parts: Vec<Part<'_>> = built
        .iter()
        .zip(stories)
        .map(|((name, rel_type, xml), &(header, _))| Part {
            name,
            content_type: if header { HEADER } else { FOOTER },
            rel_type,
            xml,
        })
        .collect();
    docx::docx_with_sect(body, &parts, refs)
}

/// A section-break paragraph whose `w:sectPr` holds `refs`.
fn break_paragraph(refs: &str) -> String {
    format!(
        r#"<w:p><w:pPr><w:sectPr>{refs}<w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:pPr></w:p>"#
    )
}

/// `<w:headerReference w:type="ty" r:id="rIdX{n}"/>`: part `n` of [`document`].
fn header_reference(ty: &str, part: usize) -> String {
    format!(r#"<w:headerReference w:type="{ty}" r:id="rIdX{part}"/>"#)
}

fn footer_reference(ty: &str, part: usize) -> String {
    format!(r#"<w:footerReference w:type="{ty}" r:id="rIdX{part}"/>"#)
}

fn two_sections() -> String {
    format!(
        r#"{}<w:p><w:pPr><w:sectPr/></w:pPr></w:p>{}"#,
        docx::para("first section"),
        docx::para("shared body")
    )
}

fn one_section() -> String {
    format!(
        "{}{}",
        docx::para("first section"),
        docx::para("shared body")
    )
}

/// A one-column table of one-cell rows.
fn table(rows: &[&str]) -> String {
    let rows: String = rows
        .iter()
        .map(|row| format!("<w:tr><w:tc>{}</w:tc></w:tr>", docx::para(row)))
        .collect();
    format!(r#"<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>{rows}</w:tbl>"#)
}

fn with_header_footer(header_text: &str, footer_text: &str) -> Vec<u8> {
    with_header_footer_body(&docx::para("shared body"), header_text, footer_text)
}

/// Two sections: a section break after the first paragraph, the
/// header/footer references on the final section.
fn sectioned_with_header_footer(header_text: &str, footer_text: &str) -> Vec<u8> {
    with_header_footer_body(&two_sections(), header_text, footer_text)
}

fn with_header_footer_body(body: &str, header_text: &str, footer_text: &str) -> Vec<u8> {
    let header = format!(
        r#"<w:hdr xmlns:w="{W_NS}"><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:t xml:space="preserve">{header_text}</w:t></w:r></w:p></w:hdr>"#
    );
    let footer = format!(
        r#"<w:ftr xmlns:w="{W_NS}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:t xml:space="preserve">{footer_text}</w:t></w:r></w:p></w:ftr>"#
    );
    docx::docx_with_sect(
        body,
        &[
            Part {
                name: "word/header1.xml",
                content_type: HEADER,
                rel_type: &format!("{OD_REL}/header"),
                xml: &header,
            },
            Part {
                name: "word/footer1.xml",
                content_type: FOOTER,
                rel_type: &format!("{OD_REL}/footer"),
                xml: &footer,
            },
        ],
        r#"<w:headerReference w:type="default" r:id="rIdX0"/><w:footerReference w:type="default" r:id="rIdX1"/>"#,
    )
}

fn plain() -> Vec<u8> {
    docx::docx(&docx::para("shared body"))
}

/// Two sections whose break shows a first-page header the original never
/// had (`word/header1.xml` in the revised document, whose default footer is
/// `rIdX1`): the revised document of the file-name collision shapes.
fn revised_with_a_first_page_header_on_the_break() -> Vec<u8> {
    document(
        &format!(
            "{}{}{}",
            docx::para("first section"),
            break_paragraph(&format!("{}<w:titlePg/>", header_reference("first", 0))),
            docx::para("shared body")
        ),
        &[(true, "Next header text"), (false, "Next footer text")],
        &footer_reference("default", 1),
    )
}

/// The original of the file-name collision shapes: a default footer
/// (`rIdX0`) and a default header kept in `word/header1.xml` (`rIdX1`), so
/// the revised first-page header's relationship id is the footer's.
fn original_with_a_default_header_in_header1(body: &str) -> Vec<u8> {
    document(
        body,
        &[(false, "Base footer text"), (true, "Base header text")],
        &format!(
            "{}{}",
            footer_reference("default", 0),
            header_reference("default", 1)
        ),
    )
}

#[test]
fn windows_accept_all_drops_the_stories_the_revised_document_removed() {
    let original = sectioned_with_header_footer("Base header text", "Base footer text");
    let revised = docx::docx(&two_sections());
    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        shown_stories(&accepted(&out)),
        shown_stories(&revised),
        "Accept All reads as the revised document, which has no header or footer"
    );
    assert_eq!(
        shown_stories(&rejected(&out)),
        shown_stories(&original),
        "Reject All reads as the original"
    );
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn windows_marks_a_story_a_live_section_keeps_deleted_when_the_revision_drops_it() {
    let original = sectioned_with_header_footer("Base header text", "Base footer text");
    let revised = docx::docx(&two_sections());
    let out = redline(&original, &revised, CompareMode::WordWindows);
    for name in ["word/header1.xml", "word/footer1.xml"] {
        assert!(has_part(&out, name), "{name} stays referenced");
        let xml = part(&out, name);
        let (dom, root) = parse(&xml);
        assert!(
            text(&dom, root).starts_with("Base "),
            "{name} keeps the original's text:\n{xml}"
        );
        assert!(
            count(&dom, root, &W::del()) > 0,
            "the final section still shows {name}, so Accept All needs its text deleted:\n{xml}"
        );
        assert_eq!(
            count(&dom, root, &W::ins()),
            0,
            "{name} is the original's story and carries no insertion:\n{xml}"
        );
    }
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn windows_accept_all_drops_a_story_a_deleted_break_shows() {
    // The original's first section alone references the header; the
    // following section shows it by inheritance. An accepted break hands
    // its references on to the section after it (Word's link to previous),
    // so the story's own text is what has to go.
    let body = format!(
        "{}{}{}",
        docx::para("first section"),
        break_paragraph(&header_reference("default", 0)),
        docx::para("shared body")
    );
    let original = document(&body, &[(true, "Base header text")], "");
    let revised = docx::docx(&one_section());
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let xml = part(&out, "word/header1.xml");
    let (dom, root) = parse(&xml);
    assert!(
        count(&dom, root, &W::del()) > 0,
        "the story's text is marked deleted:\n{xml}"
    );
    assert_eq!(
        shown_stories(&accepted(&out)),
        shown_stories(&revised),
        "Accept All reads as the revised document, which has no header"
    );
    assert_eq!(
        shown_stories(&rejected(&out)),
        shown_stories(&original),
        "Reject All reads as the original"
    );
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn windows_accept_all_drops_a_page_story_moved_to_the_final_section() {
    // A page-number footer behind a deleted break (#1833) moves to the final
    // section, which then shows it: its text has to stay deleted.
    let footer = format!(
        r#"<w:ftr xmlns:w="{W_NS}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>"#
    );
    let original = docx::docx_with_sect(
        &format!(
            "{}{}{}",
            table(&["keep", "gone"]),
            break_paragraph(&footer_reference("default", 0)),
            docx::para("last")
        ),
        &[Part {
            name: "word/footer1.xml",
            content_type: FOOTER,
            rel_type: &format!("{OD_REL}/footer"),
            xml: &footer,
        }],
        "",
    );
    let revised = docx::docx(&format!("{}{}", table(&["keep"]), docx::para("last")));
    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        shown_stories(&accepted(&out)),
        shown_stories(&revised),
        "Accept All reads as the revised document, which has no footer"
    );
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn windows_reject_all_keeps_the_original_header_behind_a_revised_file_name() {
    // Both documents keep their story in word/header1.xml: the original's
    // default header, the revision's first-page header.
    let original = document(
        &two_sections(),
        &[(true, "Base header text")],
        &header_reference("default", 0),
    );
    let revised = document(
        &two_sections(),
        &[(true, "Next header text")],
        &header_reference("first", 0),
    );
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let xml = part(&out, "word/header1.xml");
    let (dom, root) = parse(&xml);
    assert_eq!(
        count(&dom, root, &W::ins()),
        0,
        "the original's story is never marked inserted:\n{xml}"
    );
    let revised_story = headers_holding(&out, "Next header text");
    assert_eq!(revised_story.len(), 1, "the revised story is adopted once");
    let (dom, root) = parse(&revised_story[0].1);
    assert!(
        count(&dom, root, &W::ins()) > 0,
        "the revised story is marked inserted:\n{}",
        revised_story[0].1
    );
    assert_eq!(
        shown_stories(&rejected(&out)),
        shown_stories(&original),
        "Reject All reads as the original"
    );
    assert_eq!(
        shown_stories(&accepted(&out)),
        shown_stories(&revised),
        "Accept All reads as the revised document"
    );
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn windows_keeps_the_original_header_when_the_revised_shares_its_file_name_on_a_break() {
    // The revision gives the surviving break a first-page header that lives
    // in its own word/header1.xml; the result keeps the original's header1.xml
    // and copies the revised story under another name.
    let original = original_with_a_default_header_in_header1(&two_sections());
    let revised = revised_with_a_first_page_header_on_the_break();
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let revised_story = headers_holding(&out, "Next header text");
    assert_eq!(revised_story.len(), 1, "the revised story is kept once");
    assert_ne!(
        revised_story[0].0, "word/header1.xml",
        "it does not take the original's part's name"
    );
    let (dom, root) = parse(&revised_story[0].1);
    assert!(
        count(&dom, root, &W::ins()) > 0,
        "the revised story is marked inserted:\n{}",
        revised_story[0].1
    );
    let xml = part(&out, "word/header1.xml");
    let (dom, root) = parse(&xml);
    assert_eq!(
        count(&dom, root, &W::ins()),
        0,
        "the original's story is never marked inserted:\n{xml}"
    );
    assert_eq!(
        shown_stories(&rejected(&out)),
        shown_stories(&original),
        "Reject All reads as the original"
    );
    assert_eq!(
        shown_stories(&accepted(&out)),
        shown_stories(&revised),
        "Accept All reads as the revised document"
    );
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn windows_marks_the_revised_story_an_inserted_break_shows_inserted() {
    let original = original_with_a_default_header_in_header1(&one_section());
    let revised = revised_with_a_first_page_header_on_the_break();
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let revised_story = headers_holding(&out, "Next header text");
    assert_eq!(revised_story.len(), 1, "the revised story is kept once");
    let (dom, root) = parse(&revised_story[0].1);
    assert!(
        count(&dom, root, &W::ins()) > 0,
        "the revised story is marked inserted:\n{}",
        revised_story[0].1
    );
    assert_eq!(
        shown_stories(&rejected(&out)),
        shown_stories(&original),
        "Reject All reads as the original"
    );
    assert_eq!(
        shown_stories(&accepted(&out)),
        shown_stories(&revised),
        "Accept All reads as the revised document"
    );
    crate::common::validity::assert_word_valid_package(&out);

    // The Mac shape of the same story stays untracked.
    let mac = redline(&original, &revised, CompareMode::Word);
    let (dom, root) = parse(&headers_holding(&mac, "Next header text")[0].1);
    assert_eq!(
        count(&dom, root, &W::ins()),
        0,
        "the Mac redline keeps the story untracked"
    );
}

#[test]
fn windows_keeps_the_originals_story_untracked_when_the_revision_shares_it_in_a_new_slot() {
    // The revision shows the original's header as its first-page header too.
    // The adopt pass reuses the original's part for the new slot, and that
    // part stays the original's: marking it inserted would erase the header
    // the original's own slot shows.
    let original = document(
        &one_section(),
        &[(true, "Shared header")],
        &header_reference("default", 0),
    );
    let revised = document(
        &one_section(),
        &[(true, "Shared header")],
        &format!(
            "{}{}",
            header_reference("default", 0),
            header_reference("first", 0)
        ),
    );
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let xml = part(&out, "word/header1.xml");
    let (dom, root) = parse(&xml);
    assert_eq!(
        count(&dom, root, &W::ins()) + count(&dom, root, &W::del()),
        0,
        "the story is both documents' and carries no mark:\n{xml}"
    );
    let after_reject = rejected(&out);
    assert!(
        shown_stories(&after_reject).contains(&(
            0,
            "header".to_string(),
            "default".to_string(),
            "Shared header".to_string()
        )),
        "Reject All keeps the original's default header: {:?}",
        shown_stories(&after_reject)
    );
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn windows_keeps_deletion_marks_for_a_single_section_original() {
    let original = with_header_footer("Base header text", "Base footer text");
    let revised = plain();
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let mut seen = 0;
    for name in ["word/header1.xml", "word/footer1.xml"] {
        let (dom, root) = parse(&part(&out, name));
        seen += dom.descendants(root, Some(&W::del())).len();
        assert!(
            !text(&dom, root).is_empty(),
            "{name} still reads the base text"
        );
    }
    assert!(
        seen > 0,
        "a single-section original marks the dropped text deleted"
    );
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn word_keeps_the_mac_header_deletion_marks() {
    let original = with_header_footer("Base header text", "Base footer text");
    let revised = plain();
    let out = redline(&original, &revised, CompareMode::Word);
    let mut seen = 0;
    for name in ["word/header1.xml", "word/footer1.xml"] {
        let (dom, root) = parse(&part(&out, name));
        seen += dom.descendants(root, Some(&W::del())).len();
        assert!(
            !text(&dom, root).is_empty(),
            "{name} still reads the base text"
        );
    }
    assert!(seen > 0, "the Mac shape marks the dropped text deleted");
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn windows_marks_adopted_header_footer_content_inserted() {
    let original = plain();
    let revised = with_header_footer("Next header text", "Next footer text");
    let out = redline(&original, &revised, CompareMode::WordWindows);
    for (name, expected) in [
        ("word/header1.xml", "Next header text"),
        ("word/footer1.xml", "Next footer text"),
    ] {
        assert!(has_part(&out, name), "{name} is adopted");
        let xml = part(&out, name);
        let (dom, root) = parse(&xml);
        assert_eq!(text(&dom, root), expected, "{name} reads next's text");
        let inserted = dom.descendants(root, Some(&W::ins())).len();
        assert!(
            inserted > 0,
            "{name} marks the adopted content inserted:\n{xml}"
        );
        let paras = dom.descendants(root, Some(&W::p()));
        assert_eq!(paras.len(), 1, "{name} keeps one paragraph");
        let mark = dom
            .element(paras[0], &W::p_pr())
            .and_then(|ppr| dom.element(ppr, &W::r_pr()));
        assert!(
            mark.is_some_and(|m| dom.element(m, &W::ins()).is_some()),
            "{name} marks the paragraph mark inserted:\n{xml}"
        );
    }
    crate::common::validity::assert_word_valid_package(&out);
}
