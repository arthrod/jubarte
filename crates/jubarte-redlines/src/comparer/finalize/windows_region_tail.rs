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
//! Public entry points: [`windows_replaced_region_tail`] and
//! [`windows_deleted_final_paragraph_opens_replacement`].

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

/// #171 — Windows Word 2024 opens the first inserted paragraph of a
/// replaced tail with the original's last paragraph. Behind a paragraph
/// both documents keep, the original's final paragraph is deleted and the
/// revision replaces it with a run of inserted blocks that closes on an
/// empty paragraph. Word pairs the two final marks, so the deleted
/// paragraph stands on that mark as the body's last block, which is where
/// Mac Word 16 leaves it. Windows Word writes its deletion at the head of
/// the revision's first inserted paragraph, before that paragraph's own
/// insertion, and leaves the paired mark as the story's empty closing
/// paragraph (file_77 × file_78: `¶+ [-Ouch.-]{+eigenpal/docx-editor+}` …
/// `¶. `). The whole-replacement shortcut's Windows order
/// (`whole_replacement_deletions_first`) writes the same atoms that way;
/// the full LCS leaves the deleted paragraph at the end, where
/// [`splice_trailing_short_pure_dels_midstream`] lifts it mid-stream, and
/// with it the revision's closing paragraph once the redline is accepted.
///
/// Narrow: the body's last block is a paragraph deleted in full on an
/// unrevised mark — no insertion or move in it, a `w:del` holding its
/// every run — and the blocks before it end with a run of wholly inserted
/// blocks that opens on a paragraph, with no deleted block ahead of it. A
/// tail of several deleted paragraphs is left alone: #165 keeps that block
/// together, and its test pins the Windows order there, although Windows
/// Word's reference for file_145 × file_146 opens its first inserted
/// paragraph with the original's last paragraph just as here. Windows Word
/// 2024 only (`--mode word-windows`); the caller gates the platform.
pub fn windows_deleted_final_paragraph_opens_replacement(dom: &mut Dom, root: NodeId) {
    let Some(body) = dom.element(root, &W::body()) else {
        return;
    };
    let kids: Vec<NodeId> = dom
        .elements(body, None)
        .into_iter()
        .filter(|&k| !dom.name_is(k, &W::sect_pr()))
        .collect();
    let Some((&last, before)) = kids.split_last() else {
        return;
    };
    if !deleted_in_full_on_unrevised_mark(dom, last) {
        return;
    }
    // The revision's run, back to the last block that is not inserted.
    let mut start = before.len();
    while start > 0 && inserted_block(dom, before[start - 1]) {
        start -= 1;
    }
    let Some(&head) = before.get(start) else {
        return;
    };
    if !dom.name_is(head, &W::p()) {
        return;
    }
    // A deleted block ahead of the run: a tail of several deleted
    // paragraphs, which stays as #165 leaves it.
    if start > 0 && deleted_block(dom, before[start - 1]) {
        return;
    }
    let words: Vec<NodeId> = dom
        .elements(last, None)
        .into_iter()
        .filter(|&c| !dom.name_is(c, &W::p_pr()))
        .collect();
    let anchor = dom.element(head, &W::p_pr());
    for word in words.into_iter().rev() {
        dom.remove(word);
        match anchor {
            Some(ppr) => dom.add_after_self(ppr, word),
            None => dom.add_first(head, word),
        }
    }
}

/// A paragraph deleted in full on an unrevised mark: a `w:del` child holds
/// its every run (a range or proofing marker aside, nothing else), it holds
/// no insertion or move, and its mark carries no revision. A paragraph-level
/// section break stays where it stands.
fn deleted_in_full_on_unrevised_mark(dom: &Dom, p: NodeId) -> bool {
    if !dom.name_is(p, &W::p()) {
        return false;
    }
    if let Some(ppr) = dom.element(p, &W::p_pr()) {
        if dom.element(ppr, &W::sect_pr()).is_some() {
            return false;
        }
        let mark_revised = dom.element(ppr, &W::r_pr()).is_some_and(|rpr| {
            [W::ins(), W::del(), W::move_from(), W::move_to()]
                .iter()
                .any(|rev| dom.element(rpr, rev).is_some())
        });
        if mark_revised {
            return false;
        }
    }
    if [W::ins(), W::move_from(), W::move_to()]
        .iter()
        .any(|rev| !dom.descendants(p, Some(rev)).is_empty())
    {
        return false;
    }
    let mut holds_runs = false;
    let deleted = dom.elements(p, None).into_iter().all(|child| {
        if dom.name_is(child, &W::p_pr())
            || crate::comparer::final_marks::is_inert_body_marker(dom, child)
        {
            return true;
        }
        if !dom.name_is(child, &W::del()) {
            return false;
        }
        holds_runs |= !dom.descendants(child, Some(&W::r())).is_empty();
        true
    });
    deleted && holds_runs
}

/// A wholly inserted block: a paragraph [`whole_inserted`] accepts, or a
/// table whose every row is inserted and that holds no deletion.
fn inserted_block(dom: &Dom, block: NodeId) -> bool {
    if dom.name_is(block, &W::tbl()) {
        return super::table_is_inserted(dom, block)
            && dom.descendants(block, Some(&W::del())).is_empty();
    }
    whole_inserted(dom, block)
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

    /// A paragraph both documents keep.
    fn kept(text: &str) -> String {
        format!(r#"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>"#)
    }

    /// The original's last paragraph on the paired final mark: every word
    /// deleted, the mark itself unrevised.
    fn final_deleted(text: &str) -> String {
        format!(
            r#"<w:p><w:del w:id="6" {BY}><w:r><w:delText>{text}</w:delText></w:r></w:del></w:p>"#
        )
    }

    /// A table the revision gained, its one row inserted.
    fn inserted_table() -> String {
        format!(
            r#"<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/></w:tblGrid><w:tr><w:trPr><w:ins w:id="7" {BY}/></w:trPr><w:tc>{}</w:tc></w:tr></w:tbl>"#,
            inserted("Fee")
        )
    }

    /// `body` serialized, after `pass` runs on it.
    fn run(body: &str, pass: impl Fn(&mut Dom, NodeId)) -> String {
        let xml = format!(
            r#"<w:document xmlns:w="{}"><w:body>{body}<w:sectPr/></w:body></w:document>"#,
            W::URI
        );
        let mut dom = Dom::new();
        let doc = dom.parse_xdocument(&xml);
        let root = dom.root(doc).unwrap();
        pass(&mut dom, root);
        dom.serialize_element(root)
    }

    /// Each block of the body as it reads, in order: a paragraph's
    /// deletions `[-…-]`, insertions `{+…+}` and kept text, then `¶` and
    /// its mark; `T` for a table.
    fn readings(serialized: &str) -> Vec<String> {
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
                for child in dom.elements(k, None) {
                    if dom.name_is(child, &W::p_pr()) {
                        continue;
                    }
                    let (open, close) = match dom.name(child) {
                        Some(n) if n == W::del() => ("[-", "-]"),
                        Some(n) if n == W::ins() => ("{+", "+}"),
                        _ => ("", ""),
                    };
                    line.push_str(open);
                    for t in dom.descendants(child, None) {
                        if dom.name_is(t, &W::t()) || dom.name_is(t, &W::del_text()) {
                            line.push_str(&dom.value(t));
                        }
                    }
                    line.push_str(close);
                }
                line.push('¶');
                line.push_str(
                    dom.element(k, &W::p_pr())
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
                        .unwrap_or("."),
                );
                line
            })
            .collect()
    }

    /// The body reads the same whether `pass` runs or not.
    fn unchanged(body: &str, pass: impl Fn(&mut Dom, NodeId)) {
        assert_eq!(readings(&run(body, |_, _| {})), readings(&run(body, pass)));
    }

    /// #171: the original's last paragraph, deleted in full on the paired
    /// final mark, opens the revision's first inserted paragraph, the
    /// deletion before the insertion; the paired mark closes the story,
    /// empty.
    #[test]
    fn the_originals_final_paragraph_opens_the_first_inserted_one() {
        let body = format!(
            "{}{}{}{}{}",
            kept("Title"),
            inserted("First"),
            inserted("Second"),
            inserted_table(),
            final_deleted("Ouch.")
        );
        let after = run(&body, windows_deleted_final_paragraph_opens_replacement);
        assert_eq!(
            readings(&after),
            ["Title¶.", "[-Ouch.-]{+First+}¶+", "{+Second+}¶+", "T", "¶."]
        );
    }

    /// The revision's own last paragraph keeps words on the paired mark
    /// (the two last paragraphs fused): there is no deleted final paragraph
    /// to move.
    #[test]
    fn a_last_paragraph_with_the_revisions_words_stays() {
        let body = format!(
            r#"{}{}<w:p><w:del w:id="6" {BY}><w:r><w:delText>Ouch.</w:delText></w:r></w:del><w:ins w:id="8" {BY}><w:r><w:t>Last</w:t></w:r></w:ins></w:p>"#,
            kept("Title"),
            inserted("Tail")
        );
        unchanged(&body, windows_deleted_final_paragraph_opens_replacement);
    }

    /// An empty closing paragraph has nothing deleted in it: it is the
    /// story's final pilcrow, already where it belongs.
    #[test]
    fn an_empty_final_paragraph_stays() {
        let body = format!("{}{}<w:p/>", kept("Title"), inserted("Tail"));
        unchanged(&body, windows_deleted_final_paragraph_opens_replacement);
    }

    /// A tail of several deleted paragraphs stays as it is (#165's shape),
    /// whether the deleted paragraphs stand ahead of the insertion or
    /// between it and the last one.
    #[test]
    fn deleted_paragraphs_beside_the_insertion_keep_the_tail() {
        for body in [
            format!(
                "{}{}{}{}",
                kept("Title"),
                deleted("Gone"),
                inserted("First"),
                final_deleted("Ouch.")
            ),
            format!(
                "{}{}{}{}",
                kept("Title"),
                inserted("First"),
                deleted("Gone"),
                final_deleted("Ouch.")
            ),
        ] {
            unchanged(&body, windows_deleted_final_paragraph_opens_replacement);
        }
    }

    /// A replacement that opens on a table gives the deleted paragraph no
    /// first inserted paragraph to open.
    #[test]
    fn a_replacement_that_opens_on_a_table_keeps_the_tail() {
        let body = format!(
            "{}{}{}{}",
            kept("Title"),
            inserted_table(),
            inserted("First"),
            final_deleted("Ouch.")
        );
        unchanged(&body, windows_deleted_final_paragraph_opens_replacement);
    }
}
