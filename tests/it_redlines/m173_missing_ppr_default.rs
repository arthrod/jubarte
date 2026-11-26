// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! #173 -- a revised document without `w:pPrDefault` is read with Word's
//! template spacing, `w:after="160" w:line="278" w:lineRule="auto"`, not
//! with the spec's empty defaults (0 and 240).
//!
//! Measured on Word's redlines of 43 bench pairs (#173): a style the
//! revision defines resolves to the revision's value, and a spacing
//! property no style of its `w:basedOn` chain declares reads as the
//! template spacing when the revision's stylesheet has no `w:pPrDefault`
//! element (no `w:docDefaults`, or one without it). An empty
//! `w:pPrDefault` is the document's own and is not filled.
//!
//! The redline's own `w:docDefaults` stay the original's under `word` and
//! become the revision's under `word-windows`; where the revision's have
//! no `w:pPrDefault`, Windows Word writes the template spacing in their
//! place.
//!
//! Every spacing here is read from the output package by [`spacing`],
//! which resolves a style as the bench's `effstyles.py` does.

use jubarte::comparer::{CompareMode, WmlComparerSettings};
use jubarte::document_comparer::{
    accept_revisions, compare_documents_with_settings, reject_revisions,
};
use jubarte::namespaces::W;
use jubarte::xmllinq::{Dom, NodeId};

use crate::common::docx::{self, Part, W_NS};

const STYLES_CT: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
const STYLES_REL: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
/// Word's template spacing: 8 pt after, 1.16 lines.
const TEMPLATE: (&str, &str) = ("160", "278");
/// The spec's defaults, where nothing declares a spacing property.
const SPEC: (&str, &str) = ("0", "240");

/// The `w:docDefaults` a revised stylesheet is built with.
#[derive(Clone, Copy, Debug)]
enum RevisionDefaults {
    /// No `w:docDefaults` at all (a LibreOffice export).
    None,
    /// A `w:docDefaults` without `w:pPrDefault`.
    WithoutPprDefault,
    /// A `w:docDefaults` with an empty `w:pPrDefault`.
    EmptyPprDefault,
}

impl RevisionDefaults {
    fn xml(self) -> &'static str {
        match self {
            Self::None => "",
            Self::WithoutPprDefault => {
                r#"<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults>"#
            }
            Self::EmptyPprDefault => {
                r#"<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>"#
            }
        }
    }
}

/// The original's Normal: it sets 0/240, so the original reads tighter
/// than its own defaults.
const ORIGINAL_NORMAL: &str = r#"<w:name w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr>"#;
/// A Normal that sets run properties only, as the revision of
/// e54c9bd21f's does.
const STRUCTURED_NORMAL: &str =
    r#"<w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Segoe UI"/><w:sz w:val="22"/></w:rPr>"#;
/// A Normal that is a name and nothing else.
const BARE_NORMAL: &str = r#"<w:name w:val="Normal"/>"#;

/// The original: Word's own defaults (200 after, 276 lines), the Normal
/// `normal`, and three styles of its own.
fn original_with(normal: &str) -> Vec<u8> {
    let styles = format!(
        r#"<w:styles xmlns:w="{W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal">{normal}</w:style><w:style w:type="paragraph" w:styleId="Clause"><w:name w:val="Clause"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Kept"><w:name w:val="Kept"/><w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style></w:styles>"#
    );
    let mut body = styled("Kept", "Kept paragraph.");
    body.push_str(&docx::para("This clause stays."));
    body.push_str(&styled("Clause", "The parties agree as follows."));
    body.push_str(&styled("Code", "x = 1;"));
    package(&styles, &body)
}

fn original() -> Vec<u8> {
    original_with(ORIGINAL_NORMAL)
}

/// The revision, with the paragraph defaults `defaults` and the Normal
/// `normal`: `Clause` and `Code` set less than in the original, `Note`
/// exists only here, `Kept` is gone.
fn revision(defaults: RevisionDefaults, normal: &str) -> Vec<u8> {
    let styles = format!(
        r#"<w:styles xmlns:w="{W_NS}">{}<w:style w:type="paragraph" w:default="1" w:styleId="Normal">{normal}</w:style><w:style w:type="paragraph" w:styleId="Clause"><w:name w:val="Clause"/><w:rPr><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style></w:styles>"#,
        defaults.xml()
    );
    let mut body = docx::para("This clause stays.");
    body.push_str(&styled("Clause", "The parties agree as follows."));
    body.push_str(&styled("Clause", "A clause the revision adds."));
    body.push_str(&styled("Note", "A note the revision adds."));
    body.push_str(&styled("Code", "x = 1;"));
    package(&styles, &body)
}

fn styled(style_id: &str, text: &str) -> String {
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="{style_id}"/></w:pPr><w:r><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        docx::esc(text)
    )
}

fn package(styles_xml: &str, body: &str) -> Vec<u8> {
    docx::docx_with(
        body,
        &[Part {
            name: "word/styles.xml",
            content_type: STYLES_CT,
            rel_type: STYLES_REL,
            xml: styles_xml,
        }],
    )
}

fn redline(original: &[u8], revised: &[u8], mode: CompareMode) -> Vec<u8> {
    compare_documents_with_settings(original, revised, &WmlComparerSettings::new(mode))
        .expect("the compare succeeds")
}

fn part(docx: &[u8], name: &str) -> String {
    docx::part_string(docx, name).unwrap_or_else(|| panic!("{name} is in the package"))
}

fn styles_root(docx: &[u8]) -> (Dom, NodeId) {
    let mut dom = Dom::new();
    let document = dom.parse_xdocument(&part(docx, "word/styles.xml"));
    let root = dom.root(document).expect("a w:styles element");
    (dom, root)
}

fn style_node(dom: &Dom, root: NodeId, style_id: &str) -> Option<NodeId> {
    dom.elements(root, Some(&W::name("style")))
        .into_iter()
        .find(|&s| dom.attribute(s, &W::style_id()) == Some(style_id))
}

/// The `w:spacing` a paragraph style declares for itself: its live
/// `w:pPr/w:spacing`. A `w:pPrChange` holds its own `w:pPr`, so this never
/// reads a change record.
fn own_spacing(dom: &Dom, style: NodeId) -> Option<NodeId> {
    dom.element(style, &W::p_pr())
        .and_then(|ppr| dom.element(ppr, &W::spacing_el()))
}

/// The `w:pPrDefault` spacing of the stylesheet.
fn default_spacing(dom: &Dom, root: NodeId) -> Option<NodeId> {
    dom.element(root, &W::name("docDefaults"))
        .and_then(|d| dom.element(d, &W::name("pPrDefault")))
        .and_then(|p| dom.element(p, &W::p_pr()))
        .and_then(|p| dom.element(p, &W::spacing_el()))
}

/// An attribute of an optional element.
fn attr(dom: &Dom, element: Option<NodeId>, local: &str) -> Option<String> {
    element.and_then(|e| dom.attribute(e, &W::name(local)).map(str::to_string))
}

/// The `w:pPrDefault` spacing attributes the stylesheet carries, as
/// `(after, line, lineRule)`; `None` where it carries none.
fn paragraph_defaults(docx: &[u8]) -> [Option<String>; 3] {
    let (dom, root) = styles_root(docx);
    ["after", "line", "lineRule"].map(|local| attr(&dom, default_spacing(&dom, root), local))
}

/// The size a run of no style reads with: the `w:sz` of the stylesheet's
/// `w:rPrDefault`, or the spec's 20.
fn default_size(docx: &[u8]) -> String {
    let (dom, root) = styles_root(docx);
    dom.element(root, &W::name("docDefaults"))
        .and_then(|d| dom.element(d, &W::name("rPrDefault")))
        .and_then(|r| dom.element(r, &W::r_pr()))
        .and_then(|r| dom.element(r, &W::name("sz")))
        .and_then(|sz| dom.attribute(sz, &W::val()).map(str::to_string))
        .unwrap_or_else(|| "20".to_string())
}

/// `(after, line)` the paragraph style `style_id` resolves to, read as the
/// bench's `effstyles.py` reads a stylesheet: the style's own
/// `w:pPr/w:spacing`, then that of each `w:basedOn` ancestor, then the
/// `w:pPrDefault` spacing; where a property is declared nowhere, the spec's
/// default (`after` 0, `line` 240). Change records are never read.
fn spacing(docx: &[u8], style_id: &str) -> (String, String) {
    let (dom, root) = styles_root(docx);
    let mut chain: Vec<NodeId> = Vec::new();
    let mut current = style_node(&dom, root, style_id);
    while let Some(style) = current {
        if chain.contains(&style) || chain.len() == 16 {
            break;
        }
        chain.push(style);
        current = dom
            .element(style, &W::name("basedOn"))
            .and_then(|based| dom.attribute(based, &W::val()))
            .and_then(|parent| style_node(&dom, root, parent));
    }
    let defaults = default_spacing(&dom, root);
    let mut resolved: Vec<String> = Vec::new();
    for (local, spec) in [("after", SPEC.0), ("line", SPEC.1)] {
        resolved.push(
            chain
                .iter()
                .find_map(|&style| attr(&dom, own_spacing(&dom, style), local))
                .or_else(|| attr(&dom, defaults, local))
                .unwrap_or_else(|| spec.to_string()),
        );
    }
    (resolved[0].clone(), resolved[1].clone())
}

/// Every `(style, after, line)` resolves so in the package's stylesheet.
fn assert_resolves(docx: &[u8], expected: &[(&str, &str, &str)]) {
    for (style_id, after, line) in expected {
        assert_eq!(
            spacing(docx, style_id),
            (after.to_string(), line.to_string()),
            "{style_id} in word/styles.xml:\n{}",
            part(docx, "word/styles.xml")
        );
    }
}

/// The text of the main document's `w:t` elements, in order.
fn body_text(docx: &[u8]) -> String {
    let mut dom = Dom::new();
    let document = dom.parse_xdocument(&part(docx, "word/document.xml"));
    let root = dom.root(document).expect("a w:document element");
    let mut out = String::new();
    for n in dom.descendants(root, Some(&W::name("t"))) {
        out.push_str(&dom.value(n));
    }
    out
}

/// Accept All reads as the revised document and Reject All as the original.
fn assert_accept_and_reject(redline: &[u8], original: &[u8], revised: &[u8]) {
    let accepted = accept_revisions(redline).expect("accept every revision");
    let rejected = reject_revisions(redline).expect("reject every revision");
    assert_eq!(body_text(&accepted), body_text(revised), "Accept All");
    assert_eq!(body_text(&rejected), body_text(original), "Reject All");
}

/// The original's paragraph defaults, which the redline keeps under `word`.
const ORIGINAL_DEFAULTS: [Option<&str>; 3] = [Some("200"), Some("276"), Some("auto")];

/// What the revision defines: `Clause` and `Note` set no spacing of their
/// own and `Code` sets `after` only, so all three take the template's line.
fn revision_styles() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("Normal", TEMPLATE.0, TEMPLATE.1),
        ("Clause", TEMPLATE.0, TEMPLATE.1),
        ("Note", TEMPLATE.0, TEMPLATE.1),
        ("Code", "0", TEMPLATE.1),
    ]
}

/// `Kept` is the original's alone and sets all of its spacing.
const KEPT: (&str, &str, &str) = ("Kept", "120", "240");

#[test]
fn revision_without_doc_defaults_under_word_mode() {
    let original = original();
    let revised = revision(RevisionDefaults::None, STRUCTURED_NORMAL);
    let out = redline(&original, &revised, CompareMode::Word);
    let defaults = paragraph_defaults(&out);
    assert_eq!(
        defaults,
        ORIGINAL_DEFAULTS.map(|v| v.map(str::to_string)),
        "the redline keeps the original's paragraph defaults:\n{}",
        part(&out, "word/styles.xml")
    );
    let mut expected = revision_styles();
    expected.push(KEPT);
    assert_resolves(&out, &expected);
    assert_accept_and_reject(&out, &original, &revised);
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn revision_without_doc_defaults_under_word_windows_mode() {
    let original = original();
    let revised = revision(RevisionDefaults::None, STRUCTURED_NORMAL);
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let mut expected = revision_styles();
    expected.push(KEPT);
    assert_resolves(&out, &expected);
    assert_accept_and_reject(&out, &original, &revised);
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn revision_doc_defaults_without_ppr_default_under_word_mode() {
    let original = original();
    let revised = revision(RevisionDefaults::WithoutPprDefault, STRUCTURED_NORMAL);
    let out = redline(&original, &revised, CompareMode::Word);
    let defaults = paragraph_defaults(&out);
    assert_eq!(
        defaults,
        ORIGINAL_DEFAULTS.map(|v| v.map(str::to_string)),
        "the redline keeps the original's paragraph defaults:\n{}",
        part(&out, "word/styles.xml")
    );
    let mut expected = revision_styles();
    expected.push(KEPT);
    assert_resolves(&out, &expected);
    assert_accept_and_reject(&out, &original, &revised);
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn revision_doc_defaults_without_ppr_default_under_word_windows_mode() {
    let original = original();
    let revised = revision(RevisionDefaults::WithoutPprDefault, STRUCTURED_NORMAL);
    let out = redline(&original, &revised, CompareMode::WordWindows);
    // The redline ships the revision's w:docDefaults, with Word's template
    // spacing where the revision has no w:pPrDefault, and keeps the
    // revision's run defaults.
    let defaults = paragraph_defaults(&out);
    assert_eq!(
        defaults,
        [
            Some(TEMPLATE.0.into()),
            Some(TEMPLATE.1.into()),
            Some("auto".into())
        ],
        "the revision's docDefaults with the template spacing:\n{}",
        part(&out, "word/styles.xml")
    );
    assert_eq!(
        default_size(&out),
        "20",
        "the revision's run defaults stay:\n{}",
        part(&out, "word/styles.xml")
    );
    let mut expected = revision_styles();
    expected.push(KEPT);
    assert_resolves(&out, &expected);
    assert_accept_and_reject(&out, &original, &revised);
    crate::common::validity::assert_word_valid_package(&out);
}

/// A present `w:pPrDefault` is the document's own: an empty one is not
/// filled, and a property declared nowhere stays the spec's default
/// (Windows Word 2024 on 1d137d70ee, 60dfd517a9, 9be7e36de4 and ef7218d9e8
/// against the revision 2773adf157, whose `w:pPrDefault` is empty).
#[test]
fn an_empty_ppr_default_is_the_documents_own_and_is_not_filled() {
    let original = original();
    let revised = revision(RevisionDefaults::EmptyPprDefault, STRUCTURED_NORMAL);
    for mode in [CompareMode::Word, CompareMode::WordWindows] {
        let out = redline(&original, &revised, mode);
        // Under `word` the original's defaults stay; under `word-windows`
        // the revision's empty w:pPrDefault does, with no spacing in it.
        let expected_defaults = match mode {
            CompareMode::WordWindows => [None, None, None],
            _ => ORIGINAL_DEFAULTS.map(|v| v.map(str::to_string)),
        };
        let defaults = paragraph_defaults(&out);
        assert_eq!(
            defaults,
            expected_defaults,
            "{mode:?}: word/styles.xml:\n{}",
            part(&out, "word/styles.xml")
        );
        let mut expected: Vec<(&str, &str, &str)> = [
            ("Normal", SPEC.0, SPEC.1),
            ("Clause", SPEC.0, SPEC.1),
            ("Note", SPEC.0, SPEC.1),
            ("Code", SPEC.0, SPEC.1),
        ]
        .to_vec();
        expected.push(KEPT);
        assert_resolves(&out, &expected);
        assert_accept_and_reject(&out, &original, &revised);
        crate::common::validity::assert_word_valid_package(&out);
    }
}

/// An original without `word/styles.xml`: its paragraphs carry no style.
fn original_without_styles() -> Vec<u8> {
    let body = format!(
        "{}{}",
        docx::para("This clause stays."),
        docx::para("The parties agree as follows.")
    );
    docx::docx(&body)
}

/// The original that has no styles part takes Word's own defaults in their
/// place, run defaults included (37ce636fd7 × d48eb7902f and c4ee483519 ×
/// d0423646cd on Mac Word 16), and the revision's styles still resolve as
/// the revision's do (`factory_scaffold_bake_b_styles`).
#[test]
fn revision_without_ppr_default_under_an_original_without_styles() {
    let original = original_without_styles();
    for defaults in [RevisionDefaults::None, RevisionDefaults::WithoutPprDefault] {
        let revised = revision(defaults, STRUCTURED_NORMAL);
        for mode in [CompareMode::Word, CompareMode::WordWindows] {
            let out = redline(&original, &revised, mode);
            let shipped = paragraph_defaults(&out);
            assert_eq!(
                shipped,
                [
                    Some(TEMPLATE.0.into()),
                    Some(TEMPLATE.1.into()),
                    Some("auto".into())
                ],
                "{defaults:?} under {mode:?}: word/styles.xml:\n{}",
                part(&out, "word/styles.xml")
            );
            assert_resolves(&out, &revision_styles());
            assert_accept_and_reject(&out, &original, &revised);
            crate::common::validity::assert_word_valid_package(&out);
        }
    }
}

/// Word leaves a Normal bare on both sides alone: it reads the redline's
/// own `w:docDefaults`, whatever the revision's Normal would resolve to
/// (Mac Word 16 on 203c24d1e7, 2e7f1e6637, 5ad6e6d44f and 5d185fb0dd
/// against the revision 1424386e9b, read as no `w:pPrDefault` at all is).
#[test]
fn word_mode_leaves_a_normal_bare_on_both_sides_alone() {
    let original = original_with(BARE_NORMAL);
    let revised = revision(RevisionDefaults::None, BARE_NORMAL);
    let out = redline(&original, &revised, CompareMode::Word);
    let (dom, root) = styles_root(&out);
    let normal = style_node(&dom, root, "Normal").expect("Normal in the redline");
    assert!(
        own_spacing(&dom, normal).is_none(),
        "Normal stays bare:\n{}",
        part(&out, "word/styles.xml")
    );
    assert_resolves(&out, &[("Normal", "200", "276")]);
    // The revision's other styles still take the template spacing.
    assert_resolves(
        &out,
        &[
            ("Clause", TEMPLATE.0, TEMPLATE.1),
            ("Note", TEMPLATE.0, TEMPLATE.1),
            ("Code", "0", TEMPLATE.1),
            KEPT,
        ],
    );
    assert_accept_and_reject(&out, &original, &revised);
    crate::common::validity::assert_word_valid_package(&out);
}
