// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! #155 -- `--mode word-windows` takes the result's headers and footers from
//! the revised document, as Windows Word 2024 does.

use std::io::{Cursor, Read};

use jubarte::comparer::{CompareMode, WmlComparerSettings};
use jubarte::document_comparer::compare_documents_with_settings;
use jubarte::namespaces::W;
use jubarte::xmllinq::{Dom, NodeId};

use crate::common::docx::{self, Part, W_NS};

const OD_REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const HEADER: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
const FOOTER: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

fn redline(original: &[u8], revised: &[u8], mode: CompareMode) -> Vec<u8> {
    compare_documents_with_settings(original, revised, &WmlComparerSettings::new(mode))
        .expect("the compare succeeds")
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

fn with_header_footer(header_text: &str, footer_text: &str) -> Vec<u8> {
    with_header_footer_body(&docx::para("shared body"), header_text, footer_text)
}

/// Two sections: a section break after the first paragraph, the
/// header/footer references on the final section.
fn sectioned_with_header_footer(header_text: &str, footer_text: &str) -> Vec<u8> {
    let body = format!(
        r#"{}<w:p><w:pPr><w:sectPr/></w:pPr></w:p>{}"#,
        docx::para("first section"),
        docx::para("shared body")
    );
    with_header_footer_body(&body, header_text, footer_text)
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

#[test]
fn windows_keeps_base_only_header_footer_text_untracked_when_sectioned() {
    let original = sectioned_with_header_footer("Base header text", "Base footer text");
    let revised = docx::docx(&format!(
        r#"{}<w:p><w:pPr><w:sectPr/></w:pPr></w:p>{}"#,
        docx::para("first section"),
        docx::para("shared body")
    ));
    let out = redline(&original, &revised, CompareMode::WordWindows);
    for name in ["word/header1.xml", "word/footer1.xml"] {
        assert!(has_part(&out, name), "{name} stays referenced");
        let (dom, root) = parse(&part(&out, name));
        let revisions = dom.descendants(root, Some(&W::ins())).len()
            + dom.descendants(root, Some(&W::del())).len();
        assert_eq!(revisions, 0, "{name} carries no revision marks");
        assert!(
            text(&dom, root).starts_with("Base "),
            "{name} keeps the original's text"
        );
    }
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
