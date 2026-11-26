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
/// the paragraph). Its property history moves onto that last mark, and so do
/// its own live properties: attributes and bare children in a `w:pPrChange`,
/// the mark's `w:rPr` in a `w:rPrChange` inside the mark's `w:rPr`, each
/// record speaking with the carrier's own insertion. Reject All restores the
/// closing paragraph's properties and formatting; Accept All reads the
/// revision without them. Windows Word 2024 only (`--mode word-windows`);
/// the caller gates the platform.
pub fn windows_replaced_region_tail(
    dom: &mut Dom,
    root: NodeId,
    closing_attributes: &[(XName, String)],
    package_ids: Option<&mut crate::revision_processor::RevisionIds>,
) {
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
    // A section break is a barrier, as it is for the paragraph reorder: the
    // moved run would carry its section's end behind the deleted region,
    // and the last moved mark, losing its insertion, would leave Reject All
    // a section break the original never had (the review of #160).
    if run.iter().any(|&p| para_ends_a_section(dom, p)) {
        return;
    }
    let last_run = *run.last().expect("the run is not empty");
    // The closing paragraph's own properties: its `w:pPr` attributes, the
    // bare properties, and the paragraph mark's `w:rPr`. Word records a
    // paragraph's properties in a `w:pPrChange` and its mark's in a
    // `w:rPrChange` inside that mark's `w:rPr`; Reject All restores both and
    // Accept All drops both with the revision (the third review of #160:
    // the attributes and the mark's run properties used to go away with the
    // paragraph).
    let closing_ppr = dom.element(final_pilcrow, &W::p_pr());
    let mut attributes: Vec<(XName, String)> = closing_ppr
        .map(|ppr| dom.attributes(ppr))
        .unwrap_or_default();
    // A rebuild of the properties copied the children, not the attributes:
    // the caller took them from the original closing paragraph before the
    // pipeline ran.
    for (name, value) in closing_attributes {
        if !attributes.iter().any(|(held, _)| held == name) {
            attributes.push((name.clone(), value.clone()));
        }
    }
    let old_mark: Vec<NodeId> = closing_ppr
        .and_then(|ppr| dom.element(ppr, &W::r_pr()))
        .map(|rpr| dom.elements(rpr, None))
        .unwrap_or_default();
    let history = closing_ppr.and_then(|ppr| dom.element(ppr, &W::p_pr_change()));
    let own: Vec<NodeId> = match (history, closing_ppr) {
        (None, Some(ppr)) => dom
            .elements(ppr, None)
            .into_iter()
            .filter(|&c| {
                !dom.name_is(c, &W::r_pr())
                    && !dom.name_is(c, &W::sect_pr())
                    && !dom.name_is(c, &W::p_pr_change())
            })
            .collect(),
        _ => Vec::new(),
    };
    // The carrier's mark says what it says without its insertion. Where that
    // is not what the closing mark said, its `w:rPrChange` records the
    // original.
    let live_mark: Vec<NodeId> = dom
        .element(last_run, &W::p_pr())
        .and_then(|ppr| dom.element(ppr, &W::r_pr()))
        .map(|rpr| dom.elements(rpr, None))
        .unwrap_or_default();
    let mark_differs =
        formatting_signature(dom, &old_mark) != formatting_signature(dom, &live_mark);
    // The carrier's insertion on its mark speaks for both records. Without
    // it the move cannot preserve the source, and nothing moves (the second
    // review of #160).
    let attribution = if own.is_empty() && !mark_differs {
        None
    } else {
        let Some(attribution) = mark_insertion(dom, last_run) else {
            return;
        };
        Some(attribution)
    };
    let mut local;
    let mut ids: Option<&mut crate::revision_processor::RevisionIds> = if attribution.is_some() {
        Some(match package_ids {
            Some(ids) => ids,
            None => {
                let mut used = std::collections::HashSet::new();
                dom.for_each_descendant_element(root, None, |element| {
                    if let Some(id) = dom
                        .attribute(element, &W::id())
                        .and_then(|id| id.parse::<u64>().ok())
                    {
                        used.insert(id);
                    }
                });
                local = crate::revision_processor::RevisionIds::from_used(used);
                &mut local
            }
        })
    } else {
        None
    };
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
    // The closing paragraph's property history moves with its final mark,
    // where one records it: the moved run's last paragraph stands for that
    // paragraph once Reject All reads it (the review of #160: the history
    // used to go away with the paragraph, and Reject All lost the original's
    // closing formatting). A history holding no such record is empty.
    if let Some(history) = history {
        dom.remove(history);
    }
    // Where the pipeline left the closing paragraph's properties live, the
    // record is theirs: attributes and bare children. A record the pipeline
    // already wrote keeps its old properties but takes the closing
    // paragraph's attributes, so Reject All restores them as well.
    if let Some(history) = history
        && let Some(inner) = dom.element(history, &W::p_pr())
    {
        for (name, value) in &attributes {
            if dom.attribute(inner, name).is_none() {
                dom.set_attribute_value(inner, name, Some(value));
            }
        }
    }
    let record = if let Some(history) = history {
        Some(history)
    } else if !own.is_empty() {
        let (author, date) = attribution.clone().expect("a record has an attribution");
        let id = ids.as_mut().expect("a record has an allocator").allocate();
        let change = dom.new_element(W::p_pr_change());
        dom.set_attribute_value(change, &W::id(), Some(&id.to_string()));
        dom.set_attribute_value(change, &W::author(), Some(&author));
        if let Some(date) = &date {
            dom.set_attribute_value(change, &W::date(), Some(date));
        }
        let recorded = dom.new_element(W::p_pr());
        for (name, value) in &attributes {
            dom.set_attribute_value(recorded, name, Some(value));
        }
        for child in own {
            dom.remove(child);
            dom.add(recorded, child);
        }
        dom.add(change, recorded);
        Some(change)
    } else {
        None
    };
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
    // The closing mark's run properties, where the carrier's differ: Word
    // writes the difference as a `w:rPrChange` inside the carrier's mark
    // `w:rPr`, so Reject All reads the closing mark's own formatting and
    // Accept All the revision's.
    if mark_differs && attribution.is_some() {
        let ppr = match dom.element(last_run, &W::p_pr()) {
            Some(ppr) => ppr,
            None => {
                let ppr = dom.new_element(W::p_pr());
                dom.add_first(last_run, ppr);
                ppr
            }
        };
        if let Some(mark) = dom.element(ppr, &W::r_pr())
            && dom.element(mark, &W::r_pr_change()).is_some()
        {
            // A mark that already records a change keeps it.
        } else {
            let (author, date) = attribution.clone().expect("a record has an attribution");
            let id = ids.as_mut().expect("a record has an allocator").allocate();
            let change = dom.new_element(W::r_pr_change());
            dom.set_attribute_value(change, &W::id(), Some(&id.to_string()));
            dom.set_attribute_value(change, &W::author(), Some(&author));
            if let Some(date) = &date {
                dom.set_attribute_value(change, &W::date(), Some(date));
            }
            let recorded = dom.new_element(W::r_pr());
            for &child in &old_mark {
                if ["ins", "del", "moveFrom", "moveTo", "rPrChange"]
                    .iter()
                    .any(|k| dom.name_is(child, &W::name(k)))
                {
                    continue;
                }
                let copy = dom.clone_subtree(child);
                dom.add(recorded, copy);
            }
            dom.add(change, recorded);
            let mark = match dom.element(ppr, &W::r_pr()) {
                Some(mark) => mark,
                None => {
                    let mark = dom.new_element(W::r_pr());
                    match [W::sect_pr(), W::p_pr_change()]
                        .iter()
                        .find_map(|name| dom.element(ppr, name))
                    {
                        Some(next) => dom.add_before_self(next, mark),
                        None => dom.add(ppr, mark),
                    }
                    mark
                }
            };
            dom.add(mark, change);
        }
    }
    if let Some(history) = record {
        // The paragraph's own history, if any, recorded one Reject All
        // removed with its inserted mark; the closing paragraph's stands.
        let ppr = match dom.element(last_run, &W::p_pr()) {
            Some(ppr) => ppr,
            None => {
                let ppr = dom.new_element(W::p_pr());
                dom.add_first(last_run, ppr);
                ppr
            }
        };
        if let Some(existing) = dom.element(ppr, &W::p_pr_change()) {
            dom.remove(existing);
        }
        dom.add(ppr, history);
    }
}

/// A block of the deleted region: a table whose rows are all deleted, or a
/// paragraph Accept All removes. It carries a deletion, its mark is
/// deleted, every run of it is deleted and nothing else in it survives: a
/// live page break, a drawing or a field reads as no `w:t`, and a mark that
/// survives leaves an empty paragraph behind. The tail stays ahead of both,
/// where Accept All reads it (the review of #160).
fn deleted_block(dom: &Dom, node: NodeId) -> bool {
    if dom.name_is(node, &W::tbl()) {
        return super::table_is_deleted(dom, node);
    }
    dom.name_is(node, &W::p())
        && carries_deletion(dom, node)
        && super::para_mark_revision(dom, node, &W::del())
        && dom
            .descendants(node, Some(&W::r()))
            .iter()
            .all(|&r| first_wrapper_is(dom, r, node, &W::del()))
        && dom
            .elements(node, None)
            .into_iter()
            .filter(|&c| !dom.name_is(c, &W::p_pr()))
            .all(|c| goes_with_the_deletion(dom, c))
}

/// Accept All removes `node` with its paragraph, or it carries no content:
/// a deletion or a move-from wrapper and whatever sits under one, a
/// hyperlink or a simple field whose every child does, a bookmark, a
/// comment anchor, a proofing or permission mark, or a deletion's own range
/// markers. Anything else — a run, an insertion, a content control, a
/// drawing — survives.
fn goes_with_the_deletion(dom: &Dom, node: NodeId) -> bool {
    let Some(name) = dom.name(node) else {
        return false;
    };
    if name.namespace_name() != W::URI {
        return false;
    }
    match name.local_name() {
        "del"
        | "moveFrom"
        | "bookmarkStart"
        | "bookmarkEnd"
        | "commentRangeStart"
        | "commentRangeEnd"
        | "proofErr"
        | "permStart"
        | "permEnd"
        | "moveFromRangeStart"
        | "moveFromRangeEnd"
        | "customXmlDelRangeStart"
        | "customXmlDelRangeEnd"
        | "customXmlMoveFromRangeStart"
        | "customXmlMoveFromRangeEnd" => true,
        "hyperlink" | "fldSimple" => dom
            .elements(node, None)
            .into_iter()
            .all(|c| goes_with_the_deletion(dom, c)),
        _ => false,
    }
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
    if para_ends_a_section(dom, node) {
        return false;
    }
    let mark = dom
        .element(node, &W::p_pr())
        .and_then(|p| dom.element(p, &W::r_pr()));
    if mark.is_some_and(|m| dom.element(m, &W::del()).is_some()) {
        return false;
    }
    dom.descendants(node, Some(&W::r()))
        .into_iter()
        .all(|run| first_wrapper_is(dom, run, node, &W::del()))
}

/// The paragraph carries its section's properties: a section ends with its
/// mark.
fn para_ends_a_section(dom: &Dom, node: NodeId) -> bool {
    dom.element(node, &W::p_pr())
        .is_some_and(|ppr| dom.element(ppr, &W::sect_pr()).is_some())
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

/// The attribution of `p`'s mark insertion — the author, and the date where
/// it carries one. [`whole_inserted`] guarantees the insertion, so a record
/// the tail pass writes speaks with the revision that moved the paragraph.
fn mark_insertion(dom: &Dom, p: NodeId) -> Option<(String, Option<String>)> {
    let ins = dom
        .element(p, &W::p_pr())
        .and_then(|ppr| dom.element(ppr, &W::r_pr()))
        .and_then(|rpr| dom.element(rpr, &W::ins()))?;
    Some((
        dom.attribute(ins, &W::author()).map(str::to_string)?,
        dom.attribute(ins, &W::date()).map(str::to_string),
    ))
}

/// One element and its descendants, canonicalized: name, attributes sorted
/// (the volatile `w:rsid*` left out, which Accept All and Reject All strip),
/// then element children in order.
fn canonical_element(dom: &Dom, node: NodeId) -> String {
    let name = dom.name(node).expect("an element");
    let mut out = format!("{{{}}}{}", name.namespace_name(), name.local_name());
    let mut attrs: Vec<String> = dom
        .attributes(node)
        .into_iter()
        .filter(|(name, _)| {
            !(name.namespace_name() == W::URI && name.local_name().starts_with("rsid"))
        })
        .map(|(name, value)| format!("{{{}}}{}={value}", name.namespace_name(), name.local_name()))
        .collect();
    attrs.sort();
    out.push('(');
    out.push_str(&attrs.join(" "));
    out.push(')');
    out.push('{');
    for child in dom.elements(node, None) {
        out.push_str(&canonical_element(dom, child));
    }
    out.push('}');
    out
}

/// What a mark's `w:rPr` children say to a reader: its formatting, without
/// the revision markers a mark carries or a record of an earlier change.
fn formatting_signature(dom: &Dom, nodes: &[NodeId]) -> String {
    let mut parts: Vec<String> = nodes
        .iter()
        .filter(|&&child| {
            !["ins", "del", "moveFrom", "moveTo", "rPrChange"]
                .iter()
                .any(|k| dom.name_is(child, &W::name(k)))
        })
        .map(|&child| canonical_element(dom, child))
        .collect();
    parts.sort();
    parts.join("")
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

    /// A document parsed, with its root element.
    fn document(xml: &str) -> (Dom, NodeId) {
        let mut dom = Dom::new();
        let doc = dom.parse_xdocument(xml);
        let root = dom.root(doc).unwrap();
        (dom, root)
    }

    /// `body` in a document, parsed, with its root element.
    fn parsed(body: &str) -> (Dom, NodeId) {
        document(&format!(
            r#"<w:document xmlns:w="{}"><w:body>{body}<w:sectPr/></w:body></w:document>"#,
            W::URI
        ))
    }

    /// `body` serialized, after the pass when `pass`.
    fn serialized(body: &str, pass: bool) -> String {
        let (mut dom, root) = parsed(body);
        if pass {
            windows_replaced_region_tail(&mut dom, root, &[], None);
        }
        dom.serialize_element(root)
    }

    /// The story's last paragraph of the document `xml`, once Accept All
    /// (`accept`) or Reject All read it.
    fn resolved_closing(xml: &str, accept: bool) -> (Dom, NodeId) {
        let (mut dom, root) = document(xml);
        let root = if accept {
            crate::revision_processor::accept_revisions_document(&mut dom, root)
        } else {
            crate::revision_processor::reject_revisions_document(&mut dom, root)
        };
        let body = dom.element(root, &W::body()).unwrap();
        let last = dom
            .elements(body, None)
            .into_iter()
            .rev()
            .find(|&k| dom.name_is(k, &W::p()))
            .expect("the story closes on a paragraph");
        (dom, last)
    }

    /// `w:after` of the paragraph's `w:spacing`, if any.
    fn spacing_after(dom: &Dom, p: NodeId) -> Option<String> {
        let spacing = dom
            .element(p, &W::p_pr())
            .and_then(|ppr| dom.element(ppr, &W::spacing_el()))?;
        dom.attribute(spacing, &W::name("after"))
            .map(str::to_string)
    }

    /// The story's last paragraph of `dom`, rooted at `root`.
    fn last_paragraph_from(dom: &Dom, root: NodeId) -> Option<NodeId> {
        let body = dom.element(root, &W::body())?;
        dom.elements(body, None)
            .into_iter()
            .rev()
            .find(|&k| dom.name_is(k, &W::p()))
    }

    /// A properties element, canonicalized: its qualified name, its
    /// attributes sorted (the volatile `w:rsid*` left out, which Reject All
    /// strips by contract), then its element children in order.
    fn canonical_properties(dom: &Dom, node: NodeId) -> String {
        let name = dom.name(node).expect("an element");
        let mut out = format!("{{{}}}{}", name.namespace_name(), name.local_name());
        let mut attrs: Vec<String> = dom
            .attributes(node)
            .into_iter()
            .filter(|(name, _)| {
                !(name.namespace_name() == W::URI && name.local_name().starts_with("rsid"))
            })
            .map(|(name, value)| {
                format!("{{{}}}{}={value}", name.namespace_name(), name.local_name())
            })
            .collect();
        attrs.sort();
        out.push('(');
        out.push_str(&attrs.join(" "));
        out.push(')');
        out.push('{');
        for child in dom.elements(node, None) {
            out.push_str(&canonical_properties(dom, child));
        }
        out.push('}');
        out
    }

    /// The text of the paragraph's `w:t` and `w:delText`, in order.
    fn text_of(dom: &Dom, p: NodeId) -> String {
        dom.descendants(p, None)
            .into_iter()
            .filter(|&n| dom.name_is(n, &W::t()) || dom.name_is(n, &W::del_text()))
            .map(|n| dom.value(n))
            .collect()
    }

    /// The `w:after` the paragraph's history records, if it carries one.
    fn history_spacing_after(dom: &Dom, history: NodeId) -> Option<String> {
        let old = dom.element(history, &W::p_pr())?;
        let spacing = dom.element(old, &W::spacing_el())?;
        dom.attribute(spacing, &W::name("after"))
            .map(str::to_string)
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
    /// empty paragraph: the region's tail moves as it does for `<w:p/>`, and
    /// the carrier records those properties exactly — the `w:pPr`
    /// attributes and bare children in a `w:pPrChange`, the mark's `w:rPr`
    /// in a `w:rPrChange` inside the carrier's mark `w:rPr`. Reject All
    /// restores the original's whole closing `w:pPr`, Accept All reads the
    /// revision's (the third review of #160: the attributes and the mark run
    /// properties used to go away with the paragraph).
    #[test]
    fn closing_paragraph_with_only_its_properties_keeps_them_exactly_on_reject() {
        let closing = r#"<w:p><w:pPr w:rsidR="00AA00AA"><w:pStyle w:val="Heading2"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr></w:pPr></w:p>"#;
        let before = format!(
            "{}{}{}{closing}",
            deleted("Gone"),
            inserted("Tail"),
            table(true)
        );
        let after = serialized(&before, true);
        assert_eq!(shapes(&after), ["Gone¶-", "T", "Tail¶."]);
        let (dom, last) = last_paragraph(&after);
        let ppr = dom
            .element(last, &W::p_pr())
            .expect("the carrier keeps a pPr");
        let recorded = dom
            .element(ppr, &W::p_pr_change())
            .and_then(|change| dom.element(change, &W::p_pr()))
            .expect("the carrier records the closing properties");
        assert_eq!(
            dom.attribute(recorded, &W::name("rsidR")),
            Some("00AA00AA"),
            "the record keeps the closing paragraph's attributes"
        );
        assert!(dom.element(recorded, &W::p_style()).is_some());
        assert!(dom.element(recorded, &W::jc_el()).is_some());
        let mark_change = dom
            .element(ppr, &W::r_pr())
            .and_then(|mark| dom.element(mark, &W::r_pr_change()))
            .and_then(|change| dom.element(change, &W::r_pr()))
            .expect("the carrier's mark records the closing mark's properties");
        let fonts = dom
            .element(mark_change, &W::name("rFonts"))
            .expect("the closing mark's rFonts are recorded");
        assert_eq!(dom.attribute(fonts, &W::name("ascii")), Some("Courier New"));
        let (original, original_root) = parsed(&before);
        let original_ppr = last_paragraph_from(&original, original_root)
            .and_then(|p| original.element(p, &W::p_pr()))
            .expect("the original closes on properties");
        let (rejected_dom, closing) = resolved_closing(&after, false);
        let rejected_ppr = rejected_dom
            .element(closing, &W::p_pr())
            .expect("Reject All keeps properties");
        assert_eq!(
            canonical_properties(&rejected_dom, rejected_ppr),
            canonical_properties(&original, original_ppr),
            "Reject All restores the original's whole closing w:pPr"
        );
        let (accepted_dom, closing) = resolved_closing(&after, true);
        if let Some(ppr) = accepted_dom.element(closing, &W::p_pr()) {
            for name in [
                W::p_style(),
                W::jc_el(),
                W::name("rFonts"),
                W::p_pr_change(),
                W::r_pr_change(),
            ] {
                assert!(
                    accepted_dom.element(ppr, &name).is_none(),
                    "Accept All drops {}",
                    name.local_name()
                );
            }
        }
    }

    /// `body` with the pass when `pass`, then Accept All (`accept`) or
    /// Reject All: what each paragraph reads, in order.
    fn resolved(body: &str, accept: bool, pass: bool) -> Vec<String> {
        let (mut dom, root) = parsed(body);
        if pass {
            windows_replaced_region_tail(&mut dom, root, &[], None);
        }
        let root = if accept {
            crate::revision_processor::accept_revisions_document(&mut dom, root)
        } else {
            crate::revision_processor::reject_revisions_document(&mut dom, root)
        };
        outlined(&dom.serialize_element(root))
    }

    /// The story's last paragraph of the document `xml`, parsed.
    fn last_paragraph(xml: &str) -> (Dom, NodeId) {
        let (dom, root) = document(xml);
        let body = dom.element(root, &W::body()).unwrap();
        let last = dom
            .elements(body, None)
            .into_iter()
            .rev()
            .find(|&k| dom.name_is(k, &W::p()))
            .expect("the story closes on a paragraph");
        (dom, last)
    }

    // ─── the review of #160 ─────────────────────────────────────────────

    /// The original's closing paragraph, with the history the pipeline
    /// writes before the tail pass (M92: the closing spacing the revision
    /// drops goes into a `w:pPrChange`).
    fn closing_with_history() -> String {
        format!(
            r#"<w:p><w:pPr><w:pPrChange w:id="7" {BY}><w:pPr><w:spacing w:after="720"/></w:pPr></w:pPrChange></w:pPr></w:p>"#
        )
    }

    /// The original's closing paragraph carries its formatting history. The
    /// moved run's last paragraph stands for that closing paragraph once its
    /// mark closes the story, so the history goes with the mark (the review
    /// of #160: it used to go away with the paragraph, and Reject All lost
    /// the original's closing spacing). A history of the moved paragraph's
    /// own gives way to it: accepted, it is dropped either way.
    #[test]
    fn closing_property_history_moves_to_the_surviving_carrier() {
        let own_history = format!(
            r#"<w:p><w:pPr><w:rPr><w:ins w:id="1" {BY}/></w:rPr><w:pPrChange w:id="9" {BY}><w:pPr><w:jc w:val="center"/></w:pPr></w:pPrChange></w:pPr><w:ins w:id="2" {BY}><w:r><w:t>Tail</w:t></w:r></w:ins></w:p>"#
        );
        for tail in [inserted("Tail"), own_history] {
            let before = format!(
                "{}{tail}{}{}",
                deleted("Gone"),
                table(true),
                closing_with_history()
            );
            let after = serialized(&before, true);
            assert_eq!(shapes(&after), ["Gone¶-", "T", "Tail¶."], "{tail}");
            let (dom, last) = last_paragraph(&after);
            let history = dom
                .element(last, &W::p_pr())
                .and_then(|ppr| dom.element(ppr, &W::p_pr_change()))
                .expect("the closing history survives on the carrier");
            assert_eq!(dom.attribute(history, &W::id()), Some("7"), "{tail}");
            assert_eq!(
                history_spacing_after(&dom, history).as_deref(),
                Some("720"),
                "{tail}"
            );
            // Reject All closes the original's way, Accept All the revision's.
            let (dom, closing) = resolved_closing(&after, false);
            assert_eq!(
                spacing_after(&dom, closing).as_deref(),
                Some("720"),
                "{tail}"
            );
            let (dom, closing) = resolved_closing(&after, true);
            assert_eq!(spacing_after(&dom, closing), None, "{tail}");
        }
    }

    /// A closing paragraph that holds deletions of its own beside its
    /// history: Reject All restores both, the deletions ahead of the tail
    /// (#2550's order) and the spacing with the final mark.
    #[test]
    fn closing_deletions_and_history_both_survive_on_the_carrier() {
        let closing = format!(
            r#"<w:p><w:pPr><w:pPrChange w:id="7" {BY}><w:pPr><w:spacing w:after="720"/></w:pPr></w:pPrChange></w:pPr><w:del w:id="4" {BY}><w:r><w:delText>Old close</w:delText></w:r></w:del></w:p>"#
        );
        let before = format!(
            "{}{}{}{closing}",
            deleted("Gone"),
            inserted("Tail"),
            table(true)
        );
        let after = serialized(&before, true);
        assert_eq!(
            outlined(&after),
            [
                "[-Gone-]¶-".to_string(),
                "T".to_string(),
                "[-Old close-]{+Tail+}¶.".to_string(),
            ]
        );
        let (dom, closing) = resolved_closing(&after, false);
        assert_eq!(text_of(&dom, closing), "Old close");
        assert_eq!(spacing_after(&dom, closing).as_deref(), Some("720"));
    }

    /// A paragraph behind the tail may read as no `w:t` and still hold what
    /// Accept All keeps: a page break, a tab, a line break, a drawing, a
    /// field, a space, an insertion with or without a break. None of them
    /// makes it a block of the deleted region: the tail stays ahead of it,
    /// where Accept All reads it (the review of #160: the tail moved behind
    /// a live page break). The same for a paragraph whose mark survives
    /// acceptance, which Accept All leaves behind, empty.
    #[test]
    fn live_payload_behind_the_tail_keeps_the_tail_ahead_of_it() {
        let payloads = [
            r#"<w:r><w:br w:type="page"/></w:r>"#.to_string(),
            "<w:r><w:tab/></w:r>".to_string(),
            "<w:r><w:br/></w:r>".to_string(),
            "<w:r><w:drawing/></w:r>".to_string(),
            r#"<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>"#.to_string(),
            r#"<w:r><w:t xml:space="preserve"> </w:t></w:r>"#.to_string(),
            format!(r#"<w:ins w:id="6" {BY}><w:r><w:t xml:space="preserve"> </w:t></w:r></w:ins>"#),
            format!(r#"<w:ins w:id="6" {BY}/>"#),
            format!(r#"<w:ins w:id="6" {BY}><w:r><w:br w:type="page"/></w:r></w:ins>"#),
        ];
        for payload in payloads {
            let mixed = format!(
                r#"<w:p><w:pPr><w:rPr><w:del w:id="3" {BY}/></w:rPr></w:pPr><w:del w:id="4" {BY}><w:r><w:delText>Old</w:delText></w:r></w:del>{payload}</w:p>"#
            );
            let before = format!(
                "{}{}{}{mixed}<w:p/>",
                deleted("Gone"),
                inserted("Tail"),
                table(true)
            );
            assert_eq!(
                serialized(&before, true),
                serialized(&before, false),
                "{payload}"
            );
        }
        let emptied = format!(
            r#"<w:p><w:del w:id="4" {BY}><w:r><w:delText>Old</w:delText></w:r></w:del></w:p>"#
        );
        let before = format!(
            "{}{}{}{emptied}<w:p/>",
            deleted("Gone"),
            inserted("Tail"),
            table(true)
        );
        assert_eq!(serialized(&before, true), serialized(&before, false));
    }

    /// The page break keeps its place behind the tail: Accept All reads the
    /// tail, then the break — the revised document's order — and Reject All
    /// the original, with or without the pass.
    #[test]
    fn accepted_order_keeps_the_tail_ahead_of_a_live_page_break() {
        let mixed = format!(
            r#"<w:p><w:pPr><w:rPr><w:del w:id="3" {BY}/></w:rPr></w:pPr><w:del w:id="4" {BY}><w:r><w:delText>Old</w:delText></w:r></w:del><w:r><w:br w:type="page"/></w:r></w:p>"#
        );
        let before = format!(
            "{}{}{}{mixed}<w:p/>",
            deleted("Gone"),
            inserted("Tail"),
            table(true)
        );
        assert_eq!(
            resolved(&before, true, true),
            ["Tail¶.".to_string(), "<BR>¶.".to_string()],
            "Accept All: the tail, then the break"
        );
        assert_eq!(
            resolved(&before, true, true),
            resolved(&before, true, false)
        );
        assert_eq!(
            resolved(&before, false, true),
            resolved(&before, false, false)
        );
    }

    /// A deleted paragraph that carries bookmarks is still a block of the
    /// region: the markers hold no content, and the tail moves behind it.
    #[test]
    fn deleted_paragraph_with_bookmarks_still_belongs_to_the_region() {
        let marked = format!(
            r#"<w:p><w:pPr><w:rPr><w:del w:id="3" {BY}/></w:rPr></w:pPr><w:bookmarkStart w:id="0" w:name="_GoBack"/><w:del w:id="4" {BY}><w:r><w:delText>Old</w:delText></w:r></w:del><w:bookmarkEnd w:id="0"/></w:p>"#
        );
        let before = format!(
            "{}{}{}{marked}<w:p/>",
            deleted("Gone"),
            inserted("Tail"),
            table(true)
        );
        assert_eq!(
            shapes(&serialized(&before, true)),
            ["Gone¶-", "T", "Old¶-", "Tail¶."]
        );
    }

    /// The tail carries a section break: last, or with a paragraph behind
    /// it. Moving the run would carry the section's end behind the deleted
    /// table, and the last moved mark, losing its insertion, would leave
    /// Reject All a section break the original never had (the review of
    /// #160). A section is a barrier: nothing moves.
    #[test]
    fn tail_carrying_a_section_break_keeps_everything() {
        let section = |text: &str| {
            format!(
                r#"<w:p><w:pPr><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr><w:rPr><w:ins w:id="1" {BY}/></w:rPr></w:pPr><w:ins w:id="2" {BY}><w:r><w:t>{text}</w:t></w:r></w:ins></w:p>"#
            )
        };
        for (lead, tail) in [
            (None, section("Tail")),
            (Some(section("Lead")), inserted("Tail")),
            (Some(inserted("Lead")), section("Tail")),
        ] {
            let lead = lead.unwrap_or_default();
            let before = format!("{}{lead}{tail}{}<w:p/>", deleted("Gone"), table(true));
            assert_eq!(
                serialized(&before, true),
                serialized(&before, false),
                "{tail}"
            );
        }
    }
}
