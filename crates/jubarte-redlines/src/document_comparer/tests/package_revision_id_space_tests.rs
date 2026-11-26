// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! The package-wide revision-id space (#160, fourth review): the pass that
//! numbers the stories in one space must count every carrier the validator
//! counts ([`crate::validate_dom::has_unique_revision_id`]) — including the
//! `customXml*Range` markers and `tblPrExChange` the story comparer never
//! mints, which a copied part can still carry in.

use super::*;
use crate::opc::PartFs;

/// A package with a header and a stylesheet (the compare corpus fixture).
const PACKAGE: &[u8] =
    include_bytes!("../../../../../tests/fixtures/redline-inpi/modified-new.docx");

const W_NS: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/// The fixture with its main document and first header replaced by `body`
/// and `header` (its own relationships are kept).
fn package_with(body: &str, header: &str) -> PartFs {
    let mut pkg = PartFs::open(PACKAGE).expect("the fixture opens");
    let document = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W_NS}"><w:body>{body}</w:body></w:document>"#
    );
    let header = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="{W_NS}">{header}</w:hdr>"#
    );
    pkg.set_part("word/document.xml", document.into_bytes());
    pkg.set_part("word/header1.xml", header.into_bytes());
    pkg
}

/// Every `(part, local name, id)` the package-wide carrier set holds in the
/// package's revision-bearing parts.
fn carrier_ids(pkg: &PartFs) -> Vec<(String, String, String)> {
    let mut out = Vec::new();
    for (part, _) in crate::revision_processor::revision_bearing_parts(pkg) {
        let Some(xml) = pkg.part_string(&part) else {
            continue;
        };
        let mut dom = Dom::new();
        let doc = dom.parse_xdocument(&xml);
        let Some(root) = dom.root(doc) else {
            continue;
        };
        for node in dom.descendants(root, None) {
            let Some(name) = dom.name(node) else {
                continue;
            };
            if crate::validate_dom::has_unique_revision_id(&name)
                && let Some(id) = dom.attribute(node, &W::id())
            {
                out.push((part.clone(), name.local_name().to_string(), id.to_string()));
            }
        }
    }
    out
}

/// Assert no id repeats across the package, allowing only a range's start
/// and end in one part to share theirs.
fn assert_unique_across_package(pkg: &PartFs) {
    let ids = carrier_ids(pkg);
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
            && holders
                .iter()
                .any(|(_, local)| local.ends_with("RangeStart"))
            && holders.iter().any(|(_, local)| local.ends_with("RangeEnd"));
        assert!(paired, "w:id {id} repeats across the package: {holders:?}");
    }
}

/// The story comparer mints only `w:ins`/`w:del`/`*PrChange` ids, but a
/// copied part can carry a `customXmlInsRange` pair. Its id is a revision id
/// too (the validator's set), so when it collides with the main document's
/// the header is renumbered, and the pair keeps one id.
#[test]
fn custom_xml_range_ids_are_in_the_package_space_and_stay_paired() {
    let mut pkg = package_with(
        r#"<w:p><w:ins w:id="1" w:author="A" w:date="2020-01-01T00:00:00Z"><w:r><w:t>new</w:t></w:r></w:ins></w:p>"#,
        r#"<w:p><w:customXmlInsRangeStart w:id="1"/><w:r><w:t>kept</w:t></w:r><w:customXmlInsRangeEnd w:id="1"/></w:p>"#,
    );
    super::number_revision_ids_across_package(&mut pkg);

    let header = pkg.part_string("word/header1.xml").expect("the header");
    let mut dom = Dom::new();
    let doc = dom.parse_xdocument(&header);
    let root = dom.root(doc).expect("a root");
    let start = dom
        .descendants(root, Some(&W::name("customXmlInsRangeStart")))
        .first()
        .copied()
        .expect("the range start survives");
    let end = dom
        .descendants(root, Some(&W::name("customXmlInsRangeEnd")))
        .first()
        .copied()
        .expect("the range end survives");
    let start_id = dom.attribute(start, &W::id()).map(str::to_string);
    let end_id = dom.attribute(end, &W::id()).map(str::to_string);
    assert_eq!(start_id, end_id, "the range's start and end keep one id");
    assert_ne!(
        start_id.as_deref(),
        Some("1"),
        "the header's range id was renumbered off the main document's id 1"
    );
    assert_unique_across_package(&pkg);
}
