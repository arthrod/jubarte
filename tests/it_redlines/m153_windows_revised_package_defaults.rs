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

/// The `w:settings` children follow the `CT_Settings` sequence.
fn assert_settings_in_schema_order(xml: &str, label: &str) {
    let (dom, root) = parse(xml);
    let children: Vec<(String, usize)> = dom
        .elements(root, None)
        .into_iter()
        .filter_map(|c| {
            let name = dom.name(c)?;
            let local = name.local_name().to_string();
            let rank = SETTINGS_ORDER.iter().position(|&(ns, local)| {
                name.namespace_name() == ns && name.local_name() == local
            })?;
            Some((local, rank))
        })
        .collect();
    assert!(
        children.iter().map(|(_, rank)| *rank).is_sorted(),
        "{label}: w:settings children out of CT_Settings order: {children:?}"
    );
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
