// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0

//! A paragraph style's underline and strike are on the view's legend
//! (`Emph: Calibri underline strike 11pt`) and come back on the style
//! (#96). Neither prints inline: a run's marks come from the run and its
//! character style, so without the legend the look was lost.

use crate::common;

use jubarte::markdown::{DocxOptions, ReadOptions, TrackChanges, markdown_to_docx, read};

const STYLES_CT: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
const STYLES_REL: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";

fn view(docx: &[u8]) -> String {
    let options = ReadOptions {
        page_markers: false,
        track_changes: TrackChanges::All,
        ..ReadOptions::default()
    };
    read(docx, &options).expect("the docx reads").markdown
}

fn write(markdown: &str) -> Vec<u8> {
    let docx = markdown_to_docx(markdown, &DocxOptions::default())
        .expect("the Markdown reads")
        .docx;
    common::validity::assert_word_valid_package(&docx);
    docx
}

/// A docx whose paragraph `p0` is in `Emph`, whose run properties are
/// `rpr`, and `p1` in `Plain`, based on `Emph` with `plain` on top.
fn styled(rpr: &str, plain: &str) -> Vec<u8> {
    let w = common::docx::W_NS;
    let styles = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{w}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Emph"><w:name w:val="Emph"/><w:basedOn w:val="Normal"/><w:rPr>{rpr}</w:rPr></w:style><w:style w:type="paragraph" w:styleId="Plain"><w:name w:val="Plain"/><w:basedOn w:val="Emph"/><w:rPr>{plain}</w:rPr></w:style></w:styles>"#
    );
    let body = r#"<w:p><w:pPr><w:pStyle w:val="Emph"/></w:pPr><w:r><w:t>One</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Plain"/></w:pPr><w:r><w:t>Two</w:t></w:r></w:p>"#;
    common::docx::docx_with(
        body,
        &[common::docx::Part {
            name: "word/styles.xml",
            content_type: STYLES_CT,
            rel_type: STYLES_REL,
            xml: &styles,
        }],
    )
}

/// The legend line of `id` in `markdown`'s header.
fn legend<'a>(markdown: &'a str, id: &str) -> &'a str {
    markdown
        .lines()
        .find(|line| line.trim_start().starts_with(&format!("{id}: ")))
        .unwrap_or_else(|| panic!("no legend line for {id}:\n{markdown}"))
}

/// The `w:rPr` of style `id` in `docx`'s styles part.
fn style_rpr(docx: &[u8], id: &str) -> String {
    let styles = common::docx::part_string(docx, "word/styles.xml").expect("styles");
    let at = styles
        .find(&format!(r#"w:styleId="{id}""#))
        .unwrap_or_else(|| panic!("no style {id}"));
    let style = &styles[at..styles[at..]
        .find("</w:style>")
        .map_or(styles.len(), |e| at + e)];
    style
        .split_once("<w:rPr>")
        .and_then(|(_, rest)| rest.split_once("</w:rPr>"))
        .map_or(String::new(), |(rpr, _)| rpr.to_string())
}

#[test]
fn a_style_s_underline_and_strike_are_on_the_legend_and_come_back() {
    let markdown = view(&styled(r#"<w:u w:val="single"/><w:strike/>"#, ""));
    let line = legend(&markdown, "Emph");
    assert!(line.contains("Calibri underline strike 11pt"), "{line}");
    let again = write(&markdown);
    let rpr = style_rpr(&again, "Emph");
    assert!(rpr.contains(r#"<w:u w:val="single"/>"#), "{rpr}");
    assert!(rpr.contains("<w:strike/>"), "{rpr}");
    assert_eq!(legend(&view(&again), "Emph"), line);
}

#[test]
fn a_double_underline_and_a_double_strike_keep_their_kind() {
    let markdown = view(&styled(r#"<w:u w:val="double"/><w:dstrike/>"#, ""));
    let line = legend(&markdown, "Emph");
    assert!(
        line.contains("Calibri underline-double dstrike 11pt"),
        "{line}"
    );
    let rpr = style_rpr(&write(&markdown), "Emph");
    assert!(rpr.contains(r#"<w:u w:val="double"/>"#), "{rpr}");
    assert!(rpr.contains("<w:dstrike/>"), "{rpr}");
}

#[test]
fn a_style_that_turns_its_base_s_marks_off_says_so() {
    // `Plain` is based on `Emph` and turns both off: its legend names
    // neither (the legend is each style's resolved look), and the style
    // written back has neither line.
    let markdown = view(&styled(
        r#"<w:u w:val="single"/><w:strike/>"#,
        r#"<w:strike w:val="0"/><w:u w:val="none"/>"#,
    ));
    let line = legend(&markdown, "Plain");
    assert!(
        !line.contains("underline") && !line.contains("strike"),
        "{line}"
    );
    let again = write(&markdown);
    let rpr = style_rpr(&again, "Plain");
    assert!(!rpr.contains(r#"<w:u w:val="single"/>"#), "{rpr}");
    assert!(!rpr.contains("<w:strike/>"), "{rpr}");
    assert_eq!(legend(&view(&again), "Plain"), line);
}

#[test]
fn a_w_u_with_no_val_is_no_line() {
    // Word draws no underline for `<w:u w:color="000000"/>` (an Apple
    // Pages export writes it on every style): the legend names none.
    let markdown = view(&styled(r#"<w:u w:color="000000"/>"#, ""));
    let line = legend(&markdown, "Emph");
    assert!(!line.contains("underline"), "{line}");
}
