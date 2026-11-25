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
//! Public entry point: [`windows_replaced_region_tail`].

use crate::namespaces::W;
use crate::xmllinq::{Dom, NodeId};

/// Move every wholly inserted paragraph run that a deleted region follows to
/// the end of that region — behind its deleted tables and paragraphs — and
/// pair the story's final marks: the original's trailing empty paragraph
/// goes away and the moved run's last paragraph mark loses its insertion,
/// so it closes the story under both accept and reject.
///
/// A run qualifies only inside a replaced region: the paragraph before it
/// holds a deletion, the deleted blocks after it reach the story's last
/// paragraph, that last paragraph is empty, and at least one deleted table
/// or deleted paragraph sits between the run and it. Windows Word 2024
/// only (`--mode word-windows`); the caller gates the platform.
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
    if !dom.name_is(final_pilcrow, &W::p()) || live_text(dom, final_pilcrow) {
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
    runs.iter().all(|&r| run_covered(dom, r, p))
}

/// The first revision wrapper between the run and its paragraph is a
/// `w:ins`; an opposite wrapper, or none, first is not covered.
fn run_covered(dom: &Dom, r: NodeId, p: NodeId) -> bool {
    let mut cur = dom.parent(r);
    while let Some(node) = cur {
        if node == p {
            return false;
        }
        if dom.name_is(node, &W::del()) {
            return false;
        }
        if dom.name_is(node, &W::ins()) {
            return true;
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
}
