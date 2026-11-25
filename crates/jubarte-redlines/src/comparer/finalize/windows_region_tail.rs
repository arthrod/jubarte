// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! #154 — Windows Word 2024 writes a replaced region's trailing insertion
//! after the deleted region, behind the deleted tables and paragraphs that
//! follow it, and the story's final pilcrow stands on that inserted
//! paragraph. The paragraph-level restream stops at a table (a barrier the
//! word stream cannot cross), so the insertion lands before it; Mac Word 16
//! keeps it there, and the passes of the Mac ladder with it.
//!
//! The original's closing paragraph may hold deletions of its own. They open
//! that inserted paragraph: the final mark still pairs over it, and Reject
//! All still restores them.
//!
//! Public entry point: [`windows_replaced_region_tail`].

use crate::namespaces::W;
use crate::xmllinq::{Dom, NodeId, XName};

/// Move every wholly inserted paragraph run that a deleted region follows to
/// the end of that region — behind its deleted tables and paragraphs — and
/// pair the story's final marks: the original's closing paragraph goes away
/// and the moved run's last paragraph mark loses its insertion, so it
/// closes the story under both accept and reject.
///
/// A run qualifies only inside a replaced region: the paragraph before it
/// holds a deletion, the deleted blocks after it reach the story's last
/// paragraph, that last paragraph is the original's closing one (see
/// [`pairs_the_final_marks`]), and at least one deleted table or deleted
/// paragraph sits between the run and it. Empty, the closing paragraph goes
/// away as it is. Holding only what the revision deletes, those deletions
/// open the moved run's last paragraph, ahead of its insertion, where
/// Reject All restores them (the review of #160: they used to go away with
/// the paragraph). Windows Word 2024 only (`--mode word-windows`); the
/// caller gates the platform.
pub fn windows_replaced_region_tail(dom: &mut Dom, root: NodeId) {
    let Some(body) = dom.element(root, &W::body()) else {
        return;
    };
    let kids: Vec<NodeId> = dom
        .elements(body, None)
        .into_iter()
        .filter(|&k| !dom.name_is(k, &W::sect_pr()))
        .collect();
    let Some(&final_pilcrow) = kids.last() else {
        return;
    };
    if !dom.name_is(final_pilcrow, &W::p()) || !pairs_the_final_marks(dom, final_pilcrow) {
        return;
    }
    // The deleted region: blocks with no live text, each holding a deletion.
    let mut d = kids.len() - 1;
    while d > 0 && deleted_block(dom, kids[d - 1]) {
        d -= 1;
    }
    // The trailing insertion must sit between a deletion and that region.
    if d == 0 || d == kids.len() - 1 {
        return;
    }
    let mut r = d;
    while r > 0 && whole_inserted(dom, kids[r - 1]) {
        r -= 1;
    }
    if r == d || r == 0 || !carries_deletion(dom, kids[r - 1]) {
        return;
    }
    let run: Vec<NodeId> = kids[r..d].to_vec();
    let last_run = *run.last().expect("the run is not empty");
    for &p in &run {
        dom.remove(p);
        dom.add_before_self(final_pilcrow, p);
    }
    // The closing paragraph's deletions open the moved run's last paragraph:
    // in a replaced pair the deletion comes first (#2550).
    let opens = dom
        .elements(last_run, None)
        .into_iter()
        .find(|&c| !dom.name_is(c, &W::p_pr()));
    for child in dom.elements(final_pilcrow, None) {
        if dom.name_is(child, &W::p_pr()) {
            continue;
        }
        dom.remove(child);
        if let Some(anchor) = opens {
            dom.add_before_self(anchor, child);
        } else {
            dom.add(last_run, child);
        }
    }
    dom.remove(final_pilcrow);
    // The moved run's last mark closes the story now: its insertion would
    // have Reject All join the tail away and leave the story with no
    // pilcrow, so it reads as the original's final mark instead.
    if let Some(ppr) = dom.element(last_run, &W::p_pr())
        && let Some(rpr) = dom.element(ppr, &W::r_pr())
        && let Some(ins) = dom.element(rpr, &W::ins())
    {
        dom.remove(ins);
        if dom.elements(rpr, None).is_empty() {
            dom.remove(rpr);
        }
        if dom.elements(ppr, None).is_empty() {
            dom.remove(ppr);
        }
    }
}

/// The text accepting the revisions reads: any non-blank `w:t` under `node`.
fn live_text(dom: &Dom, node: NodeId) -> bool {
    dom.descendants(node, Some(&W::t()))
        .into_iter()
        .any(|t| !dom.value(t).trim().is_empty())
}

/// The story's final mark pairs over this paragraph, the original's closing
/// one: nothing of the revision's is in it. It holds no insertion, its mark
/// carries no revision, it carries no section properties, and every run in
/// it is deleted. Empty, or holding only deletions, it qualifies. A kept or
/// inserted run, a revised mark or a `w:sectPr` makes it a paragraph of its
/// own, which stays.
fn pairs_the_final_marks(dom: &Dom, node: NodeId) -> bool {
    if !dom.descendants(node, Some(&W::ins())).is_empty() {
        return false;
    }
    let ppr = dom.element(node, &W::p_pr());
    if ppr.is_some_and(|p| dom.element(p, &W::sect_pr()).is_some()) {
        return false;
    }
    let mark = ppr.and_then(|p| dom.element(p, &W::r_pr()));
    if mark.is_some_and(|m| dom.element(m, &W::del()).is_some()) {
        return false;
    }
    dom.descendants(node, Some(&W::r()))
        .into_iter()
        .all(|run| first_wrapper_is(dom, run, node, &W::del()))
}

/// A block of the deleted region: a table whose rows are all deleted, or a
/// paragraph that reads nothing accepted and carries a deletion.
fn deleted_block(dom: &Dom, node: NodeId) -> bool {
    if dom.name_is(node, &W::tbl()) {
        return super::table_is_deleted(dom, node);
    }
    dom.name_is(node, &W::p()) && !live_text(dom, node) && carries_deletion(dom, node)
}

/// A `w:del` anywhere under `node`: deleted runs, or the paragraph mark's.
fn carries_deletion(dom: &Dom, node: NodeId) -> bool {
    !dom.descendants(node, Some(&W::del())).is_empty()
}

/// A wholly inserted paragraph: an inserted mark and every run inserted.
fn whole_inserted(dom: &Dom, p: NodeId) -> bool {
    if !dom.name_is(p, &W::p()) {
        return false;
    }
    let mark = dom
        .element(p, &W::p_pr())
        .and_then(|ppr| dom.element(ppr, &W::r_pr()));
    let mark_has =
        |rev: &crate::xmllinq::XName| mark.is_some_and(|m| dom.element(m, rev).is_some());
    if !mark_has(&W::ins()) || mark_has(&W::del()) {
        return false;
    }
    let runs: Vec<NodeId> = dom.descendants(p, Some(&W::r()));
    if runs.is_empty() {
        return true;
    }
    runs.iter().all(|&r| first_wrapper_is(dom, r, p, &W::ins()))
}

/// The first revision wrapper between the run and its paragraph is `rev`;
/// the other wrapper, or none, first is not.
fn first_wrapper_is(dom: &Dom, r: NodeId, p: NodeId, rev: &XName) -> bool {
    let mut cur = dom.parent(r);
    while let Some(node) = cur {
        if node == p {
            return false;
        }
        if dom.name_is(node, &W::del()) || dom.name_is(node, &W::ins()) {
            return dom.name_is(node, rev);
        }
        cur = dom.parent(node);
    }
    false
}

#[cfg(test)]
#[cfg_attr(all(coverage_nightly, test), coverage(off))]
mod tests {
    use super::*;

    const BY: &str = r#"w:author="Editor" w:date="2026-01-01T00:00:00Z""#;

    fn inserted(text: &str) -> String {
        format!(
            r#"<w:p><w:pPr><w:rPr><w:ins w:id="1" {BY}/></w:rPr></w:pPr><w:ins w:id="2" {BY}><w:r><w:t>{text}</w:t></w:r></w:ins></w:p>"#
        )
    }

    fn deleted(text: &str) -> String {
        format!(
            r#"<w:p><w:pPr><w:rPr><w:del w:id="3" {BY}/></w:rPr></w:pPr><w:del w:id="4" {BY}><w:r><w:delText>{text}</w:delText></w:r></w:del></w:p>"#
        )
    }

    fn table(rows_deleted: bool) -> String {
        let row = if rows_deleted {
            format!(
                r#"<w:tr><w:trPr><w:del w:id="5" {BY}/></w:trPr><w:tc>{}</w:tc></w:tr>"#,
                deleted("Fee")
            )
        } else {
            r#"<w:tr><w:tc><w:p><w:r><w:t>Fee</w:t></w:r></w:p></w:tc></w:tr>"#.to_string()
        };
        format!("<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/></w:tblGrid>{row}</w:tbl>")
    }

    /// `body` serialized, after the pass when `pass`.
    fn serialized(body: &str, pass: bool) -> String {
        let xml = format!(
            r#"<w:document xmlns:w="{}"><w:body>{body}<w:sectPr/></w:body></w:document>"#,
            W::URI
        );
        let mut dom = Dom::new();
        let doc = dom.parse_xdocument(&xml);
        let root = dom.root(doc).unwrap();
        if pass {
            windows_replaced_region_tail(&mut dom, root);
        }
        dom.serialize_element(root)
    }

    /// Each direct `w:p`/`w:tbl` child of the body, in order: its text and
    /// its mark (`+`/`-`/`.`), `T` for a table.
    fn shapes(serialized: &str) -> Vec<String> {
        let mut dom = Dom::new();
        let doc = dom.parse_xdocument(serialized);
        let root = dom.root(doc).unwrap();
        let body = dom.element(root, &W::body()).unwrap();
        dom.elements(body, None)
            .into_iter()
            .filter(|&k| !dom.name_is(k, &W::sect_pr()))
            .map(|k| {
                if dom.name_is(k, &W::tbl()) {
                    return "T".to_string();
                }
                let mut text = String::new();
                for name in [W::t(), W::del_text()] {
                    for t in dom.descendants(k, Some(&name)) {
                        text.push_str(&dom.value(t));
                    }
                }
                let mark = dom
                    .element(k, &W::p_pr())
                    .and_then(|ppr| dom.element(ppr, &W::r_pr()))
                    .map(|rpr| {
                        if dom.element(rpr, &W::ins()).is_some() {
                            "+"
                        } else if dom.element(rpr, &W::del()).is_some() {
                            "-"
                        } else {
                            "."
                        }
                    })
                    .unwrap_or(".");
                format!("{text}¶{mark}")
            })
            .collect()
    }

    /// [`shapes`] in document order, each part wrapped: a deleted one as
    /// `[-…-]`, an inserted one as `{+…+}`; `<TAB>` and `<BR>` stand for
    /// those breaks.
    fn outlined(serialized: &str) -> Vec<String> {
        let mut dom = Dom::new();
        let doc = dom.parse_xdocument(serialized);
        let root = dom.root(doc).unwrap();
        let body = dom.element(root, &W::body()).unwrap();
        dom.elements(body, None)
            .into_iter()
            .filter(|&k| !dom.name_is(k, &W::sect_pr()))
            .map(|k| {
                if dom.name_is(k, &W::tbl()) {
                    return "T".to_string();
                }
                let mut line = String::new();
                for node in dom.descendants(k, None) {
                    let chain: Vec<NodeId> = dom
                        .ancestors(node, None)
                        .into_iter()
                        .take_while(|&a| a != k)
                        .collect();
                    let under = |rev: &XName| chain.iter().any(|&a| dom.name_is(a, rev));
                    let part = if dom.name_is(node, &W::t()) || dom.name_is(node, &W::del_text()) {
                        dom.value(node)
                    } else if dom.name_is(node, &XName::get("tab", W::URI)) {
                        "<TAB>".to_string()
                    } else if dom.name_is(node, &XName::get("br", W::URI)) {
                        "<BR>".to_string()
                    } else {
                        continue;
                    };
                    if dom.name_is(node, &W::del_text()) || under(&W::del()) {
                        line.push_str(&format!("[-{part}-]"));
                    } else if under(&W::ins()) {
                        line.push_str(&format!("{{+{part}+}}"));
                    } else {
                        line.push_str(&part);
                    }
                }
                let mark = dom
                    .element(k, &W::p_pr())
                    .and_then(|ppr| dom.element(ppr, &W::r_pr()))
                    .map(|rpr| {
                        if dom.element(rpr, &W::ins()).is_some() {
                            '+'
                        } else if dom.element(rpr, &W::del()).is_some() {
                            '-'
                        } else {
                            '.'
                        }
                    })
                    .unwrap_or('.');
                line.push('¶');
                line.push(mark);
                line
            })
            .collect()
    }

    /// The region's tail moves behind the deleted table, the original's
    /// final empty paragraph goes away, and the moved mark closes the story.
    #[test]
    fn tail_moves_behind_the_deleted_table_and_closes_the_story() {
        let before = format!(
            "{}{}{}{}",
            deleted("Gone"),
            inserted("Tail"),
            table(true),
            "<w:p/>"
        );
        let after = serialized(&before, true);
        assert_eq!(shapes(&after), ["Gone¶-", "T", "Tail¶."]);
        // Not run: the tail stays before the table, the empty close stays.
        let untouched = serialized(&before, false);
        assert_eq!(shapes(&untouched), ["Gone¶-", "Tail¶+", "T", "¶."]);
    }

    /// A live table after the insertion is not a deleted region: nothing
    /// moves, or the story would reorder around live content.
    #[test]
    fn live_table_after_the_tail_keeps_everything() {
        let before = format!("{}{}{}", deleted("Gone"), inserted("Tail"), table(false));
        assert_eq!(
            shapes(&serialized(&before, true)),
            ["Gone¶-", "Tail¶+", "T"]
        );
    }

    /// The paragraph before the tail must belong to the replaced region:
    /// an insertion there means the tail is an ordinary inserted run.
    #[test]
    fn tail_after_an_insertion_keeps_its_mark() {
        let before = format!(
            "{}{}{}{}",
            inserted("Lead"),
            inserted("Tail"),
            table(true),
            "<w:p/>"
        );
        let after = serialized(&before, true);
        assert_eq!(shapes(&after), ["Lead¶+", "Tail¶+", "T", "¶."]);
    }

    /// A story whose last paragraph is not empty has no final pilcrow to
    /// pair: the region keeps the tail where the stream left it.
    #[test]
    fn story_ending_on_text_keeps_the_tail() {
        let before = format!(
            "{}{}{}{}",
            deleted("Gone"),
            inserted("Tail"),
            table(true),
            inserted("Close")
        );
        let after = serialized(&before, true);
        assert_eq!(shapes(&after), ["Gone¶-", "Tail¶+", "T", "Close¶+"]);
    }

    /// The original's closing paragraph holds only what the revision
    /// deletes — three spaces, a tab, a line break, a sentence. The story's
    /// final marks still pair over it, and its deletions open the moved
    /// run's last paragraph ahead of the insertion (the review of #160:
    /// Reject All used to lose them).
    #[test]
    fn closing_paragraph_with_only_deletions_opens_the_moved_tail() {
        for (run, text) in [
            (r#"<w:delText xml:space="preserve">   </w:delText>"#, "   "),
            ("<w:tab/>", "<TAB>"),
            ("<w:br/>", "<BR>"),
            ("<w:delText>LTR text first.</w:delText>", "LTR text first."),
        ] {
            let closing = format!("<w:p><w:del w:id=\"4\" {BY}\"><w:r>{run}</w:r></w:del></w:p>");
            let before = format!(
                "{}{}{}{closing}",
                deleted("Gone"),
                inserted("Tail"),
                table(true)
            );
            assert_eq!(
                outlined(&serialized(&before, true)),
                [
                    "[-Gone-]¶-".to_string(),
                    "T".to_string(),
                    format!("[-{text}-]{{+Tail+}}¶."),
                ],
                "{closing}"
            );
        }
    }

    /// A closing paragraph that is the original's own — a kept run, an
    /// inserted run beside the deleted one, a revised mark — or one that
    /// carries section properties is no final mark to pair over: nothing
    /// moves or goes away.
    #[test]
    fn closing_paragraph_of_its_own_keeps_everything() {
        let mut closings: Vec<String> = [
            r#"<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>"#,
            "<w:p><w:pPr><w:sectPr/></w:pPr></w:p>",
        ]
        .iter()
        .map(|closing| closing.to_string())
        .collect();
        closings.extend([
            format!(
                "<w:p><w:del w:id=\"4\" {BY}\"><w:r><w:delText>Gone</w:delText></w:r></w:del><w:ins w:id=\"6\" {BY}\"><w:r><w:t>New</w:t></w:r></w:ins></w:p>"
            ),
            format!("<w:p><w:pPr><w:rPr><w:del w:id=\"4\" {BY}/></w:rPr></w:pPr></w:p>"),
            format!("<w:p><w:pPr><w:rPr><w:ins w:id=\"6\" {BY}/></w:rPr></w:pPr></w:p>"),
        ]);
        for closing in closings {
            let before = format!(
                "{}{}{}{closing}",
                deleted("Gone"),
                inserted("Tail"),
                table(true)
            );
            assert_eq!(
                serialized(&before, true),
                serialized(&before, false),
                "{closing}"
            );
        }
    }

    /// A closing paragraph that holds nothing but its properties is the
    /// empty paragraph: the region's tail moves as it does for `<w:p/>`.
    #[test]
    fn closing_paragraph_with_only_its_properties_is_empty() {
        let before = format!(
            "{}{}{}<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr></w:p>",
            deleted("Gone"),
            inserted("Tail"),
            table(true)
        );
        assert_eq!(
            shapes(&serialized(&before, true)),
            ["Gone¶-", "T", "Tail¶."]
        );
    }
}
