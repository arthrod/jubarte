// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
// SPDX-License-Identifier: Apache-2.0

//! A row Word keeps on one page (`w:trPr/w:cantSplit`) says so on its
//! table's line, `cant-split t0.row1 t0.row2`, and comes back (#71). A
//! reader that paginates the view moves such a row whole to the next page.

use crate::common;

use common::docx::docx;
use jubarte::markdown::{DocxOptions, ReadOptions, TrackChanges, markdown_to_docx, read};

fn view(docx: &[u8]) -> String {
    let options = ReadOptions {
        page_markers: false,
        track_changes: TrackChanges::All,
        ..ReadOptions::default()
    };
    read(docx, &options)
        .expect("the docx reads")
        .markdown
        .lines()
        .filter(|l| !l.starts_with("sha256: "))
        .collect::<Vec<_>>()
        .join("\n")
}

fn write(markdown: &str) -> Vec<u8> {
    let docx = markdown_to_docx(markdown, &DocxOptions::default())
        .expect("the Markdown reads")
        .docx;
    common::validity::assert_word_valid_package(&docx);
    docx
}

/// A one-column table of three rows; `kept[i]` gives row `i` `w:cantSplit`.
fn three_rows(kept: [bool; 3]) -> Vec<u8> {
    let rows: String = ["A", "B", "C"]
        .iter()
        .zip(kept)
        .map(|(text, kept)| {
            let props = if kept { "<w:trPr><w:cantSplit/></w:trPr>" } else { "" };
            format!(
                "<w:tr>{props}<w:tc><w:tcPr><w:tcW w:w=\"4000\" w:type=\"dxa\"/></w:tcPr><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:tc></w:tr>"
            )
        })
        .collect();
    docx(&format!(
        "<w:tbl><w:tblPr><w:tblW w:w=\"4000\" w:type=\"dxa\"/></w:tblPr><w:tblGrid><w:gridCol w:w=\"4000\"/></w:tblGrid>{rows}</w:tbl><w:p/>"
    ))
}

/// Whether each `w:tr` of `docx`'s document holds `w:cantSplit`, in order.
fn kept_rows(docx: &[u8]) -> Vec<bool> {
    let document = common::docx::part_string(docx, "word/document.xml").expect("document");
    document
        .split("<w:tr>")
        .skip(1)
        .map(|row| {
            row.split("</w:tr>")
                .next()
                .unwrap_or("")
                .contains("<w:cantSplit")
        })
        .collect()
}

#[test]
fn rows_kept_on_one_page_are_named_and_come_back() {
    let source = three_rows([false, true, true]);
    let markdown = view(&source);
    let line = markdown
        .lines()
        .find(|line| line.starts_with("<!-- t0 "))
        .expect("a table line");
    assert!(line.contains("cant-split t0.row1 t0.row2"), "{line}");
    let again = write(&markdown);
    assert_eq!(kept_rows(&again), [false, true, true]);
    assert_eq!(view(&again), markdown, "the round trip changed the view");
}

#[test]
fn a_table_with_no_kept_row_says_nothing() {
    let markdown = view(&three_rows([false; 3]));
    assert!(!markdown.contains("cant-split"), "{markdown}");
    assert_eq!(kept_rows(&write(&markdown)), [false; 3]);
}
