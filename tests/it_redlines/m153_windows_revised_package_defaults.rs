// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! #153 — `--mode word-windows` builds its result on the revised package, as
//! Windows Word 2024's Compare does: the redline carries the revised
//! document's theme, its `w:docDefaults` and its layout settings (tab stops,
//! hyphenation, `w:characterSpacingControl`, `w:themeFontLang`, `w:compat`).
//! A setting the revised document lacks removes the original's; `w:compat`
//! alone is written, at compatibility mode 12, when the revised document has
//! none. `--mode word` keeps the redline Mac Word 16 gives, which is built on
//! the original package.

use jubarte::comparer::{CompareMode, WmlComparerSettings};
use jubarte::document_comparer::compare_documents_with_settings;
use jubarte::namespaces::W;
use jubarte::settings::SETTINGS_ORDER;
use jubarte::xmllinq::{Dom, NodeId, XName};

use crate::common::docx::{self, Part, W_NS};

const STYLES_REL: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const SETTINGS_REL: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings";
const THEME_REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
const M_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const A_NS: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";
const COMPAT_URI: &str = "http://schemas.microsoft.com/office/word";
const SETTINGS_CT: &str =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml";
const STYLES: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
const THEME: &str = "application/vnd.openxmlformats-officedocument.theme+xml";
const MC_NS: &str = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const W14_NS: &str = "http://schemas.microsoft.com/office/word/2010/wordml";
const IMAGE_REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const PACKAGE_RELS_NS: &str = "http://schemas.openxmlformats.org/package/2006/relationships";
const RELATIONSHIPS_CT: &str = "application/vnd.openxmlformats-package.relationships+xml";

const RSIDS: &str =
    r#"<w:rsids><w:rsidRoot w:val="00A1B2C3"/><w:rsid w:val="00A1B2C3"/></w:rsids>"#;
const MATH_PR: &str = r#"<m:mathPr><m:mathFont m:val="Cambria Math"/></m:mathPr>"#;

/// The package chrome a document is built on: its theme (the part's name
/// and XML), its stylesheet and its settings, each when it has one.
struct Chrome {
    theme: Option<(&'static str, String)>,
    styles: Option<String>,
    settings: Option<String>,
}

/// A document whose body is `body`, with the package chrome `chrome`.
fn package(body: &str, chrome: &Chrome) -> Vec<u8> {
    let mut extras: Vec<Part> = Vec::new();
    if let Some((name, xml)) = &chrome.theme {
        extras.push(Part {
            name,
            content_type: THEME,
            rel_type: THEME_REL,
            xml,
        });
    }
    if let Some(xml) = &chrome.styles {
        extras.push(Part {
            name: "word/styles.xml",
            content_type: STYLES,
            rel_type: STYLES_REL,
            xml,
        });
    }
    if let Some(xml) = &chrome.settings {
        extras.push(Part {
            name: "word/settings.xml",
            content_type: SETTINGS_CT,
            rel_type: SETTINGS_REL,
            xml,
        });
    }
    docx::docx_with(body, &extras)
}

/// A theme named `name` whose major and minor Latin faces are `major` and
/// `minor`.
fn theme(name: &str, major: &str, minor: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="{A_NS}" name="{name}"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="{major}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="{minor}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>"#
    )
}

/// A stylesheet whose `w:docDefaults` set a run size of `size` half-points
/// and `after` twips after a paragraph; without `w:docDefaults` when
/// `defaults` is `None`.
fn styles(defaults: Option<(u32, u32)>) -> String {
    let defaults = match defaults {
        Some((size, after)) => format!(
            r#"<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="{after}" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>"#
        ),
        None => String::new(),
    };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="{W_NS}">{defaults}<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>"#
    )
}

/// A settings part whose children are `children`.
fn settings(children: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="{W_NS}" xmlns:m="{M_NS}">{children}</w:settings>"#
    )
}

/// `w:compat` at compatibility mode `mode`, with the `extra` compat
/// settings after it.
fn compat(mode: u32, extra: &str) -> String {
    format!(
        r#"<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="{COMPAT_URI}" w:val="{mode}"/>{extra}</w:compat>"#
    )
}

/// The original document's settings: a tab stop, the character spacing
/// control, compatibility mode 15 and revision ids.
fn original_settings() -> String {
    settings(&format!(
        r#"<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>{}{RSIDS}"#,
        compat(15, "")
    ))
}

/// The revised document's settings: every layout setting the redline takes
/// from the revision, each different from the original's.
fn revised_settings() -> String {
    settings(&format!(
        r#"<w:zoom w:percent="100"/><w:defaultTabStop w:val="360"/><w:autoHyphenation/><w:consecutiveHyphenLimit w:val="2"/><w:hyphenationZone w:val="357"/><w:doNotHyphenateCaps/><w:characterSpacingControl w:val="compressPunctuation"/>{}{RSIDS}<w:themeFontLang w:val="en-GB" w:eastAsia="en-GB" w:bidi="ar-SA"/>"#,
        compat(
            14,
            r#"<w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>"#
        )
    ))
}

/// The redline of `original` against `revised` in `mode`.
fn redline(original: &[u8], revised: &[u8], mode: CompareMode) -> Vec<u8> {
    compare_documents_with_settings(original, revised, &WmlComparerSettings::new(mode))
        .expect("the compare succeeds")
}

/// One XML part of a package, as text.
fn part(docx: &[u8], name: &str) -> String {
    docx::part_string(docx, name).unwrap_or_else(|| panic!("{name} is in the package"))
}

/// `xml` parsed, with its root element.
fn parse(xml: &str) -> (Dom, NodeId) {
    let mut dom = Dom::new();
    let document = dom.parse_xdocument(xml);
    let root = dom.root(document).expect("a root element");
    (dom, root)
}

/// The first `w:local` child of `node`.
fn child(dom: &Dom, node: NodeId, local: &str) -> Option<NodeId> {
    named(dom, node, W::URI, local)
}

/// The first child of `node` named `local` in `namespace`.
fn named(dom: &Dom, node: NodeId, namespace: &str, local: &str) -> Option<NodeId> {
    dom.element(node, &XName::get(local, namespace))
}

/// An attribute of `node`, `""` when it is not there.
fn attr<'a>(dom: &'a Dom, node: NodeId, namespace: &str, local: &str) -> &'a str {
    dom.attribute(node, &XName::get(local, namespace))
        .unwrap_or("")
}

/// The `w:val` of `node`, `""` when it is not there.
fn val(dom: &Dom, node: Option<NodeId>) -> &str {
    node.map_or("", |n| attr(dom, n, W::URI, "val"))
}

/// The theme's name, its major Latin face and its minor Latin face.
fn theme_fonts(xml: &str) -> (String, String, String) {
    let (dom, root) = parse(xml);
    let fonts = ["themeElements", "fontScheme"]
        .into_iter()
        .try_fold(root, |node, local| named(&dom, node, A_NS, local));
    let face = |font: &str| {
        fonts
            .and_then(|scheme| named(&dom, scheme, A_NS, font))
            .and_then(|font| named(&dom, font, A_NS, "latin"))
            .map_or_else(String::new, |latin| {
                attr(&dom, latin, "", "typeface").to_string()
            })
    };
    (
        attr(&dom, root, "", "name").to_string(),
        face("majorFont"),
        face("minorFont"),
    )
}

/// The run size and the spacing after a paragraph that the stylesheet's
/// `w:docDefaults` set.
fn doc_defaults(xml: &str) -> (String, String) {
    let (dom, root) = parse(xml);
    let defaults = child(&dom, root, "docDefaults");
    let size = defaults
        .and_then(|d| child(&dom, d, "rPrDefault"))
        .and_then(|d| child(&dom, d, "rPr"))
        .and_then(|r| child(&dom, r, "sz"));
    let after = defaults
        .and_then(|d| child(&dom, d, "pPrDefault"))
        .and_then(|d| child(&dom, d, "pPr"))
        .and_then(|p| child(&dom, p, "spacing"))
        .map(|s| attr(&dom, s, W::URI, "after").to_string());
    (val(&dom, size).to_string(), after.unwrap_or_default())
}

/// The `w:compatSetting` children of the `w:settings` `root`'s first
/// `w:compat`, as (name, uri, val); `None` when there is no `w:compat`.
fn compat_settings(dom: &Dom, root: NodeId) -> Option<Vec<(&str, &str, &str)>> {
    let compat = child(dom, root, "compat")?;
    Some(
        dom.elements(compat, Some(&W::name("compatSetting")))
            .into_iter()
            .map(|s| {
                (
                    attr(dom, s, W::URI, "name"),
                    attr(dom, s, W::URI, "uri"),
                    attr(dom, s, W::URI, "val"),
                )
            })
            .collect(),
    )
}

/// The local names of the `w:settings` children, in order.
fn settings_children(xml: &str) -> Vec<String> {
    let (dom, root) = parse(xml);
    dom.elements(root, None)
        .into_iter()
        .map(|c| {
            dom.name(c)
                .map_or_else(String::new, |n| n.local_name().to_string())
        })
        .collect()
}

/// Whether `node` is an `mc:AlternateContent`.
fn is_alternate_content(dom: &Dom, node: NodeId) -> bool {
    dom.name(node).is_some_and(|name| {
        name.namespace_name() == MC_NS && name.local_name() == "AlternateContent"
    })
}

/// The ranks in the `CT_Settings` sequence that a `w:settings` child stands
/// for, in order: its own; for an `mc:AlternateContent`, of every child its
/// branches hold. None for a child the sequence does not name.
fn settings_ranks(dom: &Dom, node: NodeId) -> Vec<usize> {
    let rank = |node: NodeId| {
        dom.name(node).and_then(|name| {
            SETTINGS_ORDER
                .iter()
                .position(|&(ns, local)| name.namespace_name() == ns && name.local_name() == local)
        })
    };
    if !is_alternate_content(dom, node) {
        return rank(node).into_iter().collect();
    }
    dom.elements(node, None)
        .into_iter()
        .flat_map(|branch| dom.elements(branch, None))
        .flat_map(|held| settings_ranks(dom, held))
        .collect()
}

/// The `w:settings` children follow the `CT_Settings` sequence, whichever
/// branch of an `mc:AlternateContent` the consumer takes: each child stands
/// where the ranks it holds put it, and each branch is in order on its own.
fn assert_settings_in_schema_order(xml: &str, label: &str) {
    let (dom, root) = parse(xml);
    let children: Vec<(String, Vec<usize>)> = dom
        .elements(root, None)
        .into_iter()
        .map(|c| {
            (
                dom.name(c)
                    .map_or_else(String::new, |n| n.local_name().to_string()),
                settings_ranks(&dom, c),
            )
        })
        .collect();
    let placed: Vec<(&String, usize, usize)> = children
        .iter()
        .filter_map(|(name, ranks)| {
            let (first, rest) = ranks.split_first()?;
            Some((name, *first, *rest.last().unwrap_or(first)))
        })
        .collect();
    assert!(
        placed.windows(2).all(|pair| pair[0].2 <= pair[1].1),
        "{label}: w:settings children out of CT_Settings order: {children:?}"
    );
    for child in dom.elements(root, None) {
        if !is_alternate_content(&dom, child) {
            continue;
        }
        for branch in dom.elements(child, None) {
            let ranks: Vec<usize> = dom
                .elements(branch, None)
                .into_iter()
                .flat_map(|held| settings_ranks(&dom, held))
                .collect();
            assert!(
                ranks.is_sorted(),
                "{label}: a branch of mc:AlternateContent is out of CT_Settings order: {ranks:?}"
            );
        }
    }
}

/// An `mc:AlternateContent` whose `mc:Choice` (it requires `w14`) holds
/// `choice` and whose `mc:Fallback` holds `fallback`: one place in a
/// sequence whose content depends on the consumer.
fn alternate(choice: &str, fallback: &str) -> String {
    format!(
        r#"<mc:AlternateContent xmlns:mc="{MC_NS}" xmlns:w14="{W14_NS}"><mc:Choice Requires="w14">{choice}</mc:Choice><mc:Fallback>{fallback}</mc:Fallback></mc:AlternateContent>"#
    )
}

/// A `w:settings` child as these tests compare it: a bare element by its
/// local name, or an `mc:AlternateContent` by the local names each of its
/// branches holds.
#[derive(Clone, Debug, PartialEq)]
enum Shape {
    Bare(String),
    Wrapped(Vec<Vec<String>>),
}

/// The local names of the elements `names`, as bare `w:settings` children.
fn bare(names: &[&str]) -> Vec<Shape> {
    names
        .iter()
        .map(|name| Shape::Bare((*name).to_string()))
        .collect()
}

/// An `mc:AlternateContent` holding `branches`, each by its elements' local
/// names.
fn wrapped(branches: &[&[&str]]) -> Shape {
    Shape::Wrapped(
        branches
            .iter()
            .map(|branch| branch.iter().map(|name| (*name).to_string()).collect())
            .collect(),
    )
}

/// The `w:settings` children of `xml`, in order.
fn shapes(xml: &str) -> Vec<Shape> {
    let (dom, root) = parse(xml);
    dom.elements(root, None)
        .into_iter()
        .map(|child| {
            if !is_alternate_content(&dom, child) {
                return Shape::Bare(
                    dom.name(child)
                        .map_or_else(String::new, |n| n.local_name().to_string()),
                );
            }
            Shape::Wrapped(
                dom.elements(child, None)
                    .into_iter()
                    .map(|branch| {
                        dom.elements(branch, None)
                            .into_iter()
                            .map(|held| {
                                dom.name(held)
                                    .map_or_else(String::new, |n| n.local_name().to_string())
                            })
                            .collect()
                    })
                    .collect(),
            )
        })
        .collect()
}

/// The compatibility modes the `w:settings` `xml` holds, in document order,
/// wherever its `w:compat` elements are.
fn compat_modes(xml: &str) -> Vec<String> {
    let (dom, root) = parse(xml);
    dom.descendants(root, Some(&W::name("compatSetting")))
        .into_iter()
        .filter(|&s| attr(&dom, s, W::URI, "name") == "compatibilityMode")
        .map(|s| attr(&dom, s, W::URI, "val").to_string())
        .collect()
}

#[test]
fn word_windows_takes_the_theme_doc_defaults_and_layout_settings_from_the_revised_document() {
    let original = package(
        &docx::para("Alpha beta gamma"),
        &Chrome {
            theme: Some((
                "word/theme/theme1.xml",
                theme("Theme A", "Georgia", "Arial"),
            )),
            styles: Some(styles(Some((22, 160)))),
            settings: Some(original_settings()),
        },
    );
    let revised = package(
        &docx::para("Alpha delta gamma"),
        &Chrome {
            theme: Some((
                "word/theme/theme1.xml",
                theme("Theme B", "Cambria", "Calibri"),
            )),
            styles: Some(styles(Some((32, 0)))),
            settings: Some(revised_settings()),
        },
    );

    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        theme_fonts(&part(&out, "word/theme/theme1.xml")),
        (
            "Theme B".to_string(),
            "Cambria".to_string(),
            "Calibri".to_string()
        ),
        "the redline ships the revised theme"
    );
    assert_eq!(
        doc_defaults(&part(&out, "word/styles.xml")),
        ("32".to_string(), "0".to_string()),
        "the redline's docDefaults are the revised document's"
    );
    let settings_xml = part(&out, "word/settings.xml");
    let (dom, root) = parse(&settings_xml);
    assert_eq!(val(&dom, child(&dom, root, "defaultTabStop")), "360");
    assert_eq!(val(&dom, child(&dom, root, "hyphenationZone")), "357");
    assert!(child(&dom, root, "autoHyphenation").is_some());
    assert_eq!(val(&dom, child(&dom, root, "consecutiveHyphenLimit")), "2");
    assert!(child(&dom, root, "doNotHyphenateCaps").is_some());
    assert_eq!(
        val(&dom, child(&dom, root, "characterSpacingControl")),
        "compressPunctuation"
    );
    assert_eq!(val(&dom, child(&dom, root, "themeFontLang")), "en-GB");
    assert_eq!(
        dom.elements(root, Some(&W::name("compat"))).len(),
        1,
        "one w:compat, the revised document's in the original's place"
    );
    assert_eq!(
        compat_settings(&dom, root),
        Some(vec![
            ("compatibilityMode", COMPAT_URI, "14"),
            (
                "overrideTableStyleFontSizeAndJustification",
                COMPAT_URI,
                "1"
            ),
        ]),
        "the whole revised w:compat replaces the original's"
    );
    assert_settings_in_schema_order(&settings_xml, "word-windows");
    crate::common::validity::assert_word_valid_package(&out);

    // `word`: Mac Word 16's redline is built on the original package.
    let out = redline(&original, &revised, CompareMode::Word);
    assert_eq!(
        theme_fonts(&part(&out, "word/theme/theme1.xml")),
        (
            "Theme A".to_string(),
            "Georgia".to_string(),
            "Arial".to_string()
        )
    );
    assert_eq!(
        doc_defaults(&part(&out, "word/styles.xml")),
        ("22".to_string(), "160".to_string())
    );
    let (dom, root) = parse(&part(&out, "word/settings.xml"));
    assert_eq!(val(&dom, child(&dom, root, "defaultTabStop")), "720");
    for absent in [
        "hyphenationZone",
        "autoHyphenation",
        "consecutiveHyphenLimit",
        "doNotHyphenateCaps",
        "themeFontLang",
    ] {
        assert!(
            child(&dom, root, absent).is_none(),
            "`word` does not take the revised {absent}"
        );
    }
    assert_eq!(
        val(&dom, child(&dom, root, "characterSpacingControl")),
        "doNotCompress"
    );
    assert_eq!(
        compat_settings(&dom, root),
        Some(vec![("compatibilityMode", COMPAT_URI, "15")])
    );
}

#[test]
fn a_setting_the_revised_document_lacks_is_removed_and_a_missing_compat_is_written() {
    let chrome = |theme_xml: &str, settings_xml: &str| Chrome {
        theme: Some(("word/theme/theme1.xml", theme_xml.to_string())),
        styles: Some(styles(Some((24, 80)))),
        settings: Some(settings_xml.to_string()),
    };
    // Everything the redline takes from the revision, on the original.
    let everything = settings(&format!(
        r#"<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:autoHyphenation/><w:consecutiveHyphenLimit w:val="2"/><w:hyphenationZone w:val="357"/><w:doNotHyphenateCaps/><w:characterSpacingControl w:val="doNotCompress"/>{}{RSIDS}<w:themeFontLang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>"#,
        compat(15, "")
    ));
    let original = package(
        &docx::para("Alpha beta gamma"),
        &chrome(&theme("Theme A", "Georgia", "Arial"), &everything),
    );
    // The revision has a settings part with none of them, and no w:compat.
    let revised = package(
        &docx::para("Alpha delta gamma"),
        &chrome(
            &theme("Theme B", "Cambria", "Calibri"),
            &settings(r#"<w:zoom w:percent="100"/>"#),
        ),
    );

    let out = redline(&original, &revised, CompareMode::WordWindows);
    let settings_xml = part(&out, "word/settings.xml");
    assert_eq!(
        settings_children(&settings_xml),
        ["zoom", "compat", "rsids"],
        "the original's layout settings leave with the revision's absence: {settings_xml}"
    );
    let (dom, root) = parse(&settings_xml);
    assert_eq!(
        compat_settings(&dom, root),
        Some(vec![("compatibilityMode", COMPAT_URI, "12")]),
        "w:compat is written at compatibility mode 12 when the revision has none"
    );
    assert_settings_in_schema_order(&settings_xml, "word-windows");
    crate::common::validity::assert_word_valid_package(&out);

    // `word`: the original's settings stay as they are.
    let out = redline(&original, &revised, CompareMode::Word);
    let settings_xml = part(&out, "word/settings.xml");
    assert_eq!(
        settings_children(&settings_xml),
        [
            "zoom",
            "defaultTabStop",
            "autoHyphenation",
            "consecutiveHyphenLimit",
            "hyphenationZone",
            "doNotHyphenateCaps",
            "characterSpacingControl",
            "compat",
            "rsids",
            "themeFontLang",
        ]
    );
    let (dom, root) = parse(&settings_xml);
    assert_eq!(val(&dom, child(&dom, root, "defaultTabStop")), "720");
    assert_eq!(
        compat_settings(&dom, root),
        Some(vec![("compatibilityMode", COMPAT_URI, "15")])
    );
}

#[test]
fn settings_the_original_lacks_are_inserted_where_the_schema_puts_them() {
    // The original has revision ids, math properties and a theme font
    // language after the place `w:compat` and the tab stop take, and no
    // `w:compat`.
    let original = package(
        &docx::para("Alpha beta gamma"),
        &Chrome {
            theme: Some((
                "word/theme/theme1.xml",
                theme("Theme A", "Georgia", "Arial"),
            )),
            styles: Some(styles(Some((24, 80)))),
            settings: Some(settings(&format!(
                r#"<w:zoom w:percent="100"/>{RSIDS}{MATH_PR}<w:themeFontLang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>"#
            ))),
        },
    );
    // The revision has the tab stop, the character spacing control and
    // `w:compat`, and no theme font language. Its colour scheme mapping is
    // not one of the settings the redline takes.
    let revised = package(
        &docx::para("Alpha delta gamma"),
        &Chrome {
            theme: Some((
                "word/theme/theme1.xml",
                theme("Theme B", "Cambria", "Calibri"),
            )),
            styles: Some(styles(Some((24, 80)))),
            settings: Some(settings(&format!(
                r#"<w:zoom w:percent="90"/><w:defaultTabStop w:val="567"/><w:characterSpacingControl w:val="compressPunctuation"/>{}{RSIDS}<w:clrSchemeMapping w:bg1="light1" w:t1="dark1" w:bg2="light2" w:t2="dark2" w:accent1="accent1" w:accent2="accent2" w:accent3="accent3" w:accent4="accent4" w:accent5="accent5" w:accent6="accent6" w:hyperlink="hlink" w:folHlink="folHlink"/>"#,
                compat(14, "")
            ))),
        },
    );

    let out = redline(&original, &revised, CompareMode::WordWindows);
    let settings_xml = part(&out, "word/settings.xml");
    assert_eq!(
        settings_children(&settings_xml),
        [
            "zoom",
            "defaultTabStop",
            "characterSpacingControl",
            "compat",
            "rsids",
            "mathPr",
        ],
        "the tab stop goes before w:autoHyphenation's place, w:compat before w:docVars"
    );
    let (dom, root) = parse(&settings_xml);
    assert_eq!(val(&dom, child(&dom, root, "defaultTabStop")), "567");
    assert_eq!(
        compat_settings(&dom, root),
        Some(vec![("compatibilityMode", COMPAT_URI, "14")])
    );
    assert_settings_in_schema_order(&settings_xml, "word-windows");
    crate::common::validity::assert_word_valid_package(&out);

    // A default `w:compat` is written in the same place.
    let original = package(
        &docx::para("Alpha beta gamma"),
        &Chrome {
            theme: None,
            styles: Some(styles(Some((24, 80)))),
            settings: Some(settings(&format!(
                r#"<w:zoom w:percent="100"/>{RSIDS}{MATH_PR}"#
            ))),
        },
    );
    let revised = package(
        &docx::para("Alpha delta gamma"),
        &Chrome {
            theme: None,
            styles: Some(styles(Some((24, 80)))),
            settings: Some(settings(r#"<w:zoom w:percent="100"/>"#)),
        },
    );
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let settings_xml = part(&out, "word/settings.xml");
    assert_eq!(
        settings_children(&settings_xml),
        ["zoom", "compat", "rsids", "mathPr"],
        "the default w:compat goes before the revision ids"
    );
    let (dom, root) = parse(&settings_xml);
    assert_eq!(
        compat_settings(&dom, root),
        Some(vec![("compatibilityMode", COMPAT_URI, "12")])
    );
    assert_settings_in_schema_order(&settings_xml, "word-windows");
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn the_revised_theme_is_followed_through_its_relationship() {
    let chrome = |name: &'static str, theme_xml: String| Chrome {
        theme: Some((name, theme_xml)),
        styles: Some(styles(Some((24, 80)))),
        settings: Some(original_settings()),
    };
    // Neither package keeps its theme at word/theme/theme1.xml.
    let original = package(
        &docx::para("Alpha beta gamma"),
        &chrome(
            "word/theme/theme-a.xml",
            theme("Theme A", "Georgia", "Arial"),
        ),
    );
    let revised = package(
        &docx::para("Alpha delta gamma"),
        &chrome(
            "word/theme/theme-b.xml",
            theme("Theme B", "Cambria", "Calibri"),
        ),
    );

    // The redline keeps the original package's part and relationship, and
    // the revised document's theme in it.
    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        theme_fonts(&part(&out, "word/theme/theme-a.xml")),
        (
            "Theme B".to_string(),
            "Cambria".to_string(),
            "Calibri".to_string()
        )
    );
    assert!(
        docx::part_string(&out, "word/theme/theme-b.xml").is_none(),
        "no second theme part comes along"
    );
    crate::common::validity::assert_word_valid_package(&out);

    let out = redline(&original, &revised, CompareMode::Word);
    assert_eq!(
        theme_fonts(&part(&out, "word/theme/theme-a.xml")),
        (
            "Theme A".to_string(),
            "Georgia".to_string(),
            "Arial".to_string()
        )
    );
}

/// An original without a theme: `word-windows` gives it the revision's,
/// `word` Word's default one.
#[test]
fn an_original_without_a_theme_takes_the_revised_one_in_word_windows() {
    let document = |theme_xml: Option<&str>, text: &str| {
        package(
            &docx::para(text),
            &Chrome {
                theme: theme_xml.map(|xml| ("word/theme/theme1.xml", xml.to_string())),
                settings: Some(original_settings()),
                styles: Some(styles(Some((24, 80)))),
            },
        )
    };
    let original = document(None, "Alpha beta gamma");
    let revised = document(
        Some(&theme("Theme B", "Cambria", "Calibri")),
        "Alpha delta gamma",
    );

    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        theme_fonts(&part(&out, "word/theme/theme1.xml")),
        (
            "Theme B".to_string(),
            "Cambria".to_string(),
            "Calibri".to_string()
        )
    );
    crate::common::validity::assert_word_valid_package(&out);

    let out = redline(&original, &revised, CompareMode::Word);
    assert_ne!(
        theme_fonts(&part(&out, "word/theme/theme1.xml")).0,
        "Theme B",
        "`word` never takes the revision's theme"
    );
}

#[test]
fn a_revision_without_a_theme_or_doc_defaults_leaves_the_originals_in_place() {
    let original = package(
        &docx::para("Alpha beta gamma"),
        &Chrome {
            theme: Some((
                "word/theme/theme1.xml",
                theme("Theme A", "Georgia", "Arial"),
            )),
            styles: Some(styles(Some((22, 160)))),
            settings: Some(original_settings()),
        },
    );
    let revised = package(
        &docx::para("Alpha delta gamma"),
        &Chrome {
            theme: None,
            styles: Some(styles(None)),
            settings: Some(revised_settings()),
        },
    );

    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        theme_fonts(&part(&out, "word/theme/theme1.xml")),
        (
            "Theme A".to_string(),
            "Georgia".to_string(),
            "Arial".to_string()
        ),
        "a theme is replaced, never removed"
    );
    assert_eq!(
        doc_defaults(&part(&out, "word/styles.xml")),
        ("22".to_string(), "160".to_string()),
        "docDefaults are replaced, never removed"
    );
    let (dom, root) = parse(&part(&out, "word/settings.xml"));
    assert_eq!(val(&dom, child(&dom, root, "defaultTabStop")), "360");
    crate::common::validity::assert_word_valid_package(&out);
}

#[test]
fn a_revision_without_a_settings_part_still_leaves_word_valid_settings() {
    let original = package(
        &docx::para("Alpha beta gamma"),
        &Chrome {
            theme: None,
            styles: Some(styles(Some((24, 80)))),
            settings: Some(settings(&format!(
                r#"<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/>{RSIDS}"#
            ))),
        },
    );
    let revised = package(
        &docx::para("Alpha delta gamma"),
        &Chrome {
            theme: None,
            styles: Some(styles(Some((24, 80)))),
            settings: None,
        },
    );

    let out = redline(&original, &revised, CompareMode::WordWindows);
    let settings_xml = part(&out, "word/settings.xml");
    assert_eq!(
        settings_children(&settings_xml),
        ["zoom", "compat", "rsids"]
    );
    assert_settings_in_schema_order(&settings_xml, "word-windows");
    crate::common::validity::assert_word_valid_package(&out);
}

const ZOOM: &str = r#"<w:zoom w:percent="100"/>"#;
/// Two settings the redline does not take from the revision, one on each
/// side of `w:compat` in the `CT_Settings` sequence.
const UPDATE_FIELDS: &str = "<w:updateFields/>";
const DOC_VARS: &str = "<w:docVars/>";
/// The revision's settings of the `mc:AlternateContent` cases: a theme font
/// language, and no `w:compat`.
const THEME_FONT_LANG: &str = r#"<w:themeFontLang w:val="fr-FR"/>"#;

/// A document of one paragraph whose only chrome is the settings part
/// `children`.
fn settings_document(text: &str, children: &str) -> Vec<u8> {
    package(
        &docx::para(text),
        &Chrome {
            theme: None,
            styles: None,
            settings: Some(settings(children)),
        },
    )
}

/// The review's `order` probe and its neighbours. An `mc:AlternateContent` in
/// the original's settings counts as what its branches hold, so an inserted
/// child takes its place against it; one whose branches disagree about that
/// place takes the child in each branch. The wrappers hold settings the
/// redline keeps from the original: one it takes from the revision would be
/// replaced or removed there first.
#[test]
fn an_inserted_setting_takes_its_place_against_an_alternate_content() {
    let separator = |value: &str| format!(r#"<w:listSeparator w:val="{value}"/>"#);
    let cases: [(&str, String, Vec<Shape>, &[&str]); 3] = [
        (
            "both branches supply the later separator",
            alternate(&separator(","), &separator(";")),
            vec![
                Shape::Bare("compat".to_string()),
                Shape::Bare("themeFontLang".to_string()),
                wrapped(&[&["listSeparator"], &["listSeparator"]]),
            ],
            &["12"],
        ),
        (
            "a later child follows the wrapper",
            format!("{ZOOM}{}{}", alternate(RSIDS, RSIDS), separator(",")),
            [
                bare(&["zoom", "compat"]),
                vec![wrapped(&[&["rsids"], &["rsids"]])],
                bare(&["themeFontLang", "listSeparator"]),
            ]
            .concat(),
            &["12"],
        ),
        (
            "the wrapper straddles the place",
            format!(
                "{ZOOM}{}",
                alternate(&format!("{UPDATE_FIELDS}{DOC_VARS}"), UPDATE_FIELDS)
            ),
            [
                bare(&["zoom"]),
                vec![wrapped(&[
                    &["updateFields", "compat", "docVars"],
                    &["updateFields", "compat"],
                ])],
                bare(&["themeFontLang"]),
            ]
            .concat(),
            // One in each branch: whichever the consumer takes has it once.
            &["12", "12"],
        ),
    ];
    for (label, original_children, expected, modes) in &cases {
        let original = settings_document("One", original_children);
        let revised = settings_document("Two", THEME_FONT_LANG);

        let out = redline(&original, &revised, CompareMode::WordWindows);
        let settings_xml = part(&out, "word/settings.xml");
        assert_eq!(
            shapes(&settings_xml),
            expected.as_slice(),
            "{label}: {settings_xml}"
        );
        assert_eq!(
            compat_modes(&settings_xml),
            *modes,
            "{label}: the revision has no w:compat"
        );
        assert_settings_in_schema_order(&settings_xml, label);
        crate::common::validity::assert_word_valid_package(&out);

        // `word`: the original's settings stay as they are.
        let out = redline(&original, &revised, CompareMode::Word);
        assert_eq!(
            shapes(&part(&out, "word/settings.xml")),
            shapes(&settings(original_children)),
            "{label}: `word` leaves the settings alone"
        );
    }
}

/// A setting the original's settings hold inside an `mc:AlternateContent` is
/// the one replaced or removed, in each branch; a `w:compat` the revision
/// holds in one is the revision's, not the default one.
#[test]
fn a_setting_inside_an_alternate_content_is_replaced_or_removed_where_it_is() {
    let none: &[&str] = &[];
    let tab_stop = r#"<w:defaultTabStop w:val="720"/>"#;

    // The original's `w:compat` is wrapped; the revision's is bare.
    let original = settings_document(
        "One",
        &format!("{ZOOM}{}", alternate(&compat(15, ""), &compat(12, ""))),
    );
    let revised = settings_document("Two", &format!("{ZOOM}{}", compat(14, "")));
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let settings_xml = part(&out, "word/settings.xml");
    assert_eq!(
        shapes(&settings_xml),
        [bare(&["zoom"]), vec![wrapped(&[&["compat"], &["compat"]])],].concat(),
        "{settings_xml}"
    );
    assert_eq!(
        compat_modes(&settings_xml),
        ["14", "14"],
        "each branch holds the revised w:compat, and no second one is written"
    );
    assert_settings_in_schema_order(&settings_xml, "word-windows");
    crate::common::validity::assert_word_valid_package(&out);

    // The original's tab stop is wrapped; the revision has none.
    let original = settings_document("One", &format!("{ZOOM}{}", alternate(tab_stop, tab_stop)));
    let revised = settings_document("Two", ZOOM);
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let settings_xml = part(&out, "word/settings.xml");
    assert_eq!(
        shapes(&settings_xml),
        [
            bare(&["zoom"]),
            vec![wrapped(&[none, none]), Shape::Bare("compat".to_string())],
        ]
        .concat(),
        "{settings_xml}"
    );
    crate::common::validity::assert_word_valid_package(&out);

    // The revision's `w:compat` is wrapped; the original's is bare.
    let original = settings_document("One", &format!("{ZOOM}{}", compat(15, "")));
    let revised = settings_document(
        "Two",
        &format!("{ZOOM}{}", alternate(&compat(14, ""), &compat(12, ""))),
    );
    let out = redline(&original, &revised, CompareMode::WordWindows);
    let settings_xml = part(&out, "word/settings.xml");
    assert_eq!(
        shapes(&settings_xml),
        [bare(&["zoom"]), vec![Shape::Bare("compat".to_string())]].concat(),
        "{settings_xml}"
    );
    assert_eq!(
        compat_modes(&settings_xml),
        ["14"],
        "the revision's w:compat is taken, not the default one"
    );
    crate::common::validity::assert_word_valid_package(&out);

    // `word`: the original's `w:compat` stays.
    let out = redline(&original, &revised, CompareMode::Word);
    assert_eq!(
        compat_modes(&part(&out, "word/settings.xml")),
        ["15"],
        "`word` keeps the original's w:compat"
    );
}

/// The revision's settings and stylesheet are the ones its main document's
/// relationships name, wherever it keeps them.
#[test]
fn the_revised_settings_and_stylesheet_are_read_through_the_main_documents_relationships() {
    let original = package(
        &docx::para("Alpha beta gamma"),
        &Chrome {
            theme: None,
            styles: Some(styles(Some((22, 160)))),
            settings: Some(settings(r#"<w:defaultTabStop w:val="720"/>"#)),
        },
    );
    let revised = docx::docx_with(
        &docx::para("Alpha delta gamma"),
        &[
            docx::Part {
                name: "word/layout.xml",
                content_type: SETTINGS_CT,
                rel_type: SETTINGS_REL,
                xml: &settings(r#"<w:defaultTabStop w:val="360"/>"#),
            },
            docx::Part {
                name: "word/format.xml",
                content_type: STYLES,
                rel_type: STYLES_REL,
                xml: &styles(Some((36, 0))),
            },
        ],
    );

    let out = redline(&original, &revised, CompareMode::WordWindows);
    let settings_xml = part(&out, "word/settings.xml");
    assert_eq!(
        settings_children(&settings_xml),
        ["defaultTabStop", "compat"],
        "{settings_xml}"
    );
    assert_eq!(
        doc_defaults(&part(&out, "word/styles.xml")),
        ("36".to_string(), "0".to_string()),
        "the redline's docDefaults are the revised document's"
    );
    for name in ["word/layout.xml", "word/format.xml"] {
        assert!(
            docx::part_string(&out, name).is_none(),
            "{name} comes in under the output's own name"
        );
    }
    crate::common::validity::assert_word_valid_package(&out);

    // `word`: the original's stay.
    let out = redline(&original, &revised, CompareMode::Word);
    let (dom, root) = parse(&part(&out, "word/settings.xml"));
    assert_eq!(val(&dom, child(&dom, root, "defaultTabStop")), "720");
    assert_eq!(
        doc_defaults(&part(&out, "word/styles.xml")),
        ("22".to_string(), "160".to_string())
    );
}

/// A revision that keeps its settings and stylesheet at the conventional
/// names but relates neither is still read: the relationship names the part,
/// and the conventional name stands in when there is none.
#[test]
fn a_revision_that_relates_neither_part_is_read_at_the_conventional_names() {
    let original = package(
        &docx::para("Alpha beta gamma"),
        &Chrome {
            theme: None,
            styles: Some(styles(Some((22, 160)))),
            settings: Some(settings(r#"<w:defaultTabStop w:val="720"/>"#)),
        },
    );
    let revised = docx::docx_with(
        &docx::para("Alpha delta gamma"),
        &[
            docx::Part {
                name: "word/settings.xml",
                content_type: SETTINGS_CT,
                rel_type: "",
                xml: &settings(r#"<w:defaultTabStop w:val="360"/>"#),
            },
            docx::Part {
                name: "word/styles.xml",
                content_type: STYLES,
                rel_type: "",
                xml: &styles(Some((36, 0))),
            },
        ],
    );

    let out = redline(&original, &revised, CompareMode::WordWindows);
    let (dom, root) = parse(&part(&out, "word/settings.xml"));
    assert_eq!(val(&dom, child(&dom, root, "defaultTabStop")), "360");
    assert_eq!(
        doc_defaults(&part(&out, "word/styles.xml")),
        ("36".to_string(), "0".to_string())
    );
    crate::common::validity::assert_word_valid_package(&out);
}

/// A 1×1 PNG of the colour `rgb`, in a deflate block that stores its bytes
/// as they are.
fn png(rgb: [u8; 3]) -> Vec<u8> {
    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = u32::MAX;
        for &byte in bytes {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                crc = (crc >> 1) ^ (0xEDB8_8320 & (crc & 1).wrapping_neg());
            }
        }
        !crc
    }
    fn adler32(bytes: &[u8]) -> u32 {
        let (mut a, mut b) = (1u32, 0u32);
        for &byte in bytes {
            a = (a + u32::from(byte)) % 65_521;
            b = (b + a) % 65_521;
        }
        (b << 16) | a
    }
    fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut chunk = (data.len() as u32).to_be_bytes().to_vec();
        chunk.extend_from_slice(kind);
        chunk.extend_from_slice(data);
        chunk.extend_from_slice(&crc32(&chunk[4..]).to_be_bytes());
        chunk
    }
    // One scanline: no filter, then the pixel.
    let scanline = [0, rgb[0], rgb[1], rgb[2]];
    let zlib = [0x78, 0x01, 0x01, 0, 4, 0xFB, 0xFF]
        .into_iter()
        .chain(scanline)
        .chain(adler32(&scanline).to_be_bytes())
        .collect::<Vec<u8>>();
    let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
    png.extend(chunk(b"IHDR", &[0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]));
    png.extend(chunk(b"IDAT", &zlib));
    png.extend(chunk(b"IEND", &[]));
    png
}

/// The bytes of the ZIP entry `name` of `docx`.
fn entry(docx: &[u8], name: &str) -> Vec<u8> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(docx)).unwrap();
    let mut file = archive.by_name(name).unwrap();
    let mut bytes = Vec::new();
    std::io::Read::read_to_end(&mut file, &mut bytes).unwrap();
    bytes
}

/// The part a relationship `target` of a part in the folder `dir` names: a
/// relative one from `dir`, an absolute one (`/word/…`) from the package root.
fn resolve(dir: &str, target: &str) -> String {
    let mut path: Vec<&str> = if dir.is_empty() || target.starts_with('/') {
        Vec::new()
    } else {
        dir.split('/').collect()
    };
    for segment in target.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                path.pop();
            }
            _ => path.push(segment),
        }
    }
    path.join("/")
}

/// A theme whose first fill is the picture its own relationship `rIdPic`
/// names, where [`theme`] has a scheme colour.
fn picture_theme(name: &str) -> String {
    theme(name, "Cambria", "Calibri")
        .replacen(
            "<a:theme ",
            &format!("<a:theme xmlns:r=\"{}\" ", docx::R_NS),
            1,
        )
        .replacen(
            r#"<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>"#,
            r#"<a:fillStyleLst><a:blipFill><a:blip r:embed="rIdPic"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>"#,
            1,
        )
}

/// A document whose theme, the part `theme_part`, is [`picture_theme`] `name`
/// showing the 1×1 PNG of `rgb` from its own `word/media/fill.png`.
fn picture_package(name: &str, rgb: [u8; 3], theme_part: &'static str) -> Vec<u8> {
    let theme_xml = picture_theme(name);
    let (dir, file) = theme_part.rsplit_once('/').unwrap();
    let rels_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="{PACKAGE_RELS_NS}"><Relationship Id="rIdPic" Type="{IMAGE_REL}" Target="../media/fill.png"/></Relationships>"#
    );
    let rels_part = format!("{dir}/_rels/{file}.rels");
    let docx = docx::docx_with(
        &docx::para("Shared body"),
        &[
            docx::Part {
                name: theme_part,
                content_type: THEME,
                rel_type: THEME_REL,
                xml: &theme_xml,
            },
            docx::Part {
                name: &rels_part,
                content_type: RELATIONSHIPS_CT,
                rel_type: "",
                xml: &rels_xml,
            },
            docx::Part {
                name: "word/media/fill.png",
                content_type: "image/png",
                rel_type: "",
                xml: "",
            },
        ],
    );
    docx::replace_entry(&docx, "word/media/fill.png", &png(rgb))
}

/// The `a:blip` of the theme part `theme_part`, in its DOM.
fn theme_blip(docx: &[u8], theme_part: &str) -> (Dom, NodeId) {
    let (dom, root) = parse(&part(docx, theme_part));
    let blip = dom
        .descendants(root, Some(&XName::get("blip", A_NS)))
        .first()
        .copied()
        .expect("the theme shows a picture");
    (dom, blip)
}

/// The ZIP entry names of `docx`, sorted.
fn entries(docx: &[u8]) -> Vec<String> {
    let archive = zip::ZipArchive::new(std::io::Cursor::new(docx)).unwrap();
    let mut names: Vec<String> = archive
        .file_names()
        .map(|name| name.expect("decode ZIP entry name").into_owned())
        .collect();
    names.sort();
    names
}

/// The `word/media/` ZIP entries of `docx`, sorted.
fn media_entries(docx: &[u8]) -> Vec<String> {
    entries(docx)
        .into_iter()
        .filter(|name| name.starts_with("word/media/"))
        .collect()
}

/// The id the theme part `theme_part` names its first fill's picture by,
/// `""` when it names none.
fn theme_blip_id(docx: &[u8], theme_part: &str) -> String {
    let (dom, blip) = theme_blip(docx, theme_part);
    attr(&dom, blip, docx::R_NS, "embed").to_string()
}

/// The bytes of the picture the theme part `theme_part` shows as its first
/// fill, through the theme's own relationships.
fn theme_picture(docx: &[u8], theme_part: &str) -> Vec<u8> {
    let (dom, blip) = theme_blip(docx, theme_part);
    let id = attr(&dom, blip, docx::R_NS, "embed");
    assert!(!id.is_empty(), "{theme_part} shows no picture");
    let (dir, file) = theme_part.rsplit_once('/').unwrap();
    let (rels, rels_root) = parse(&part(docx, &format!("{dir}/_rels/{file}.rels")));
    let relationship = rels
        .elements(rels_root, None)
        .into_iter()
        .find(|&r| attr(&rels, r, "", "Id") == id)
        .unwrap_or_else(|| panic!("{theme_part} has no relationship {id}"));
    assert_eq!(attr(&rels, relationship, "", "Type"), IMAGE_REL);
    entry(docx, &resolve(dir, attr(&rels, relationship, "", "Target")))
}

/// The review's `theme-image` probe: both themes show a picture as `rIdPic`,
/// and each package's `word/media/fill.png` is a different colour. The
/// redline's theme is the revised theme, pictures included.
#[test]
fn the_revised_theme_brings_the_pictures_its_own_relationships_name() {
    let red = [0xFF, 0x00, 0x00];
    let blue = [0x00, 0x00, 0xFF];
    let original = picture_package("Theme A", red, "word/theme/theme1.xml");
    let revised = picture_package("Theme B", blue, "word/theme/theme1.xml");

    let out = redline(&original, &revised, CompareMode::WordWindows);
    let theme_xml = part(&out, "word/theme/theme1.xml");
    assert_eq!(theme_fonts(&theme_xml).0, "Theme B");
    assert_eq!(
        theme_picture(&out, "word/theme/theme1.xml"),
        png(blue),
        "the revised theme's fill resolves to the revised picture"
    );
    assert_eq!(
        entry(&out, "word/media/fill.png"),
        png(red),
        "the original's picture stays the original's"
    );
    crate::common::validity::assert_word_valid_package(&out);

    // `word`: the redline keeps the original's theme and its picture.
    let out = redline(&original, &revised, CompareMode::Word);
    assert_eq!(
        theme_fonts(&part(&out, "word/theme/theme1.xml")).0,
        "Theme A"
    );
    assert_eq!(theme_picture(&out, "word/theme/theme1.xml"), png(red));
}

#[test]
fn a_theme_picture_is_carried_from_wherever_the_revision_keeps_it() {
    let red = [0xFF, 0x00, 0x00];
    let blue = [0x00, 0x00, 0xFF];
    let original = picture_package("Theme A", red, "word/theme/theme1.xml");

    // The revision keeps its theme under another name, its picture too.
    let revised = picture_package("Theme B", blue, "word/theme/theme2.xml");
    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(theme_picture(&out, "word/theme/theme1.xml"), png(blue));
    assert!(
        docx::part_string(&out, "word/theme/theme2.xml").is_none(),
        "the revised theme comes in under the output's own name"
    );
    crate::common::validity::assert_word_valid_package(&out);

    // The same picture on both sides: the theme keeps naming it by the id
    // the output's own relationship resolves, and nothing is carried.
    let revised = picture_package("Theme B", red, "word/theme/theme2.xml");
    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        theme_fonts(&part(&out, "word/theme/theme1.xml")).0,
        "Theme B"
    );
    assert_eq!(
        theme_blip_id(&out, "word/theme/theme1.xml"),
        "rIdPic",
        "the output's own relationship names the picture"
    );
    assert_eq!(theme_picture(&out, "word/theme/theme1.xml"), png(red));
    assert_eq!(
        media_entries(&out),
        ["word/media/fill.png"],
        "nothing is carried for a picture that already resolves the same"
    );
}

/// The original's theme has no picture, the revision's has one: it is
/// carried onto the redline's theme. The general reconciliation pass already
/// did this before the theme's relationships were carried at adoption (an
/// unresolved id is its business); this keeps it so through that pass too.
#[test]
fn a_theme_picture_the_original_had_none_of_is_carried() {
    let blue = [0x00, 0x00, 0xFF];
    let plain = theme("Theme A", "Georgia", "Arial");
    let original = docx::docx_with(
        &docx::para("Shared body"),
        &[docx::Part {
            name: "word/theme/theme1.xml",
            content_type: THEME,
            rel_type: THEME_REL,
            xml: &plain,
        }],
    );
    let revised = picture_package("Theme B", blue, "word/theme/theme1.xml");

    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(theme_picture(&out, "word/theme/theme1.xml"), png(blue));
    crate::common::validity::assert_word_valid_package(&out);
}

/// The revision's theme names a picture its package does not have. The
/// redline shows no picture there: it does not borrow the original's, which
/// the same id resolves to in the output.
#[test]
fn a_picture_the_revision_cannot_resolve_is_not_shown_as_the_originals() {
    let red = [0xFF, 0x00, 0x00];
    let original = picture_package("Theme A", red, "word/theme/theme1.xml");
    let unreferenced = picture_theme("Theme B");
    let revised = docx::docx_with(
        &docx::para("Shared body"),
        &[docx::Part {
            name: "word/theme/theme1.xml",
            content_type: THEME,
            rel_type: THEME_REL,
            xml: &unreferenced,
        }],
    );

    let out = redline(&original, &revised, CompareMode::WordWindows);
    assert_eq!(
        theme_fonts(&part(&out, "word/theme/theme1.xml")).0,
        "Theme B"
    );
    assert_eq!(
        theme_blip_id(&out, "word/theme/theme1.xml"),
        "",
        "the reference goes, rather than resolving to the original's picture"
    );
    crate::common::validity::assert_word_valid_package(&out);
}
