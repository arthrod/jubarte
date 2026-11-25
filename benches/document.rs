// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! Criterion benchmarks for the workflows that follow a redline: listing,
//! accepting and rejecting tracked changes, validating the package, reading
//! it as Markdown, and rendering it to PDF.
//!
//! Run with `cargo bench --bench document`. The inputs are documents checked
//! into `tests/`; a case whose fixture is absent (a published crate packs no
//! `tests/`) is skipped with a note.

use std::hint::black_box;
use std::path::Path;
use std::sync::OnceLock;

use criterion::{Criterion, criterion_group, criterion_main};
use jubarte::changes::{self, ChangeFilter};
use jubarte::convert::{PdfOptions, RevisionStyle, docx_to_pdf_with};
use jubarte::document_comparer::compare_documents;
use jubarte::markdown::{MarkdownOptions, docx_to_markdown};
use jubarte::validate::validate;

/// The inputs: the canonical pair's redline, built by `compare_documents`,
/// and a Word redline dense with comments.
const COMMENT_HEAVY_REDLINE: &str =
    "tests/corpus/fresh_docx_fixtures_and_redlines/docx_lots_of_comments_addition_redline.docx";
const CANONICAL: (&str, &str) = (
    "tests/fixtures/redline/original.docx",
    "tests/fixtures/redline/modified.docx",
);

fn read(root: &Path, rel: &str) -> Option<Vec<u8>> {
    let path = root.join(rel);
    if path.is_file() {
        Some(std::fs::read(&path).expect("read fixture"))
    } else {
        eprintln!("skip: fixture not present ({rel})");
        None
    }
}

/// Documents with tracked changes, read (and compared) once, outside every
/// measured closure.
fn redlines() -> &'static [(&'static str, Vec<u8>)] {
    static DOCS: OnceLock<Vec<(&'static str, Vec<u8>)>> = OnceLock::new();
    DOCS.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        let mut docs = Vec::new();
        if let (Some(a), Some(b)) = (read(root, CANONICAL.0), read(root, CANONICAL.1)) {
            let redline = compare_documents(&a, &b, "Bench").expect("compare");
            docs.push(("canonical_redline", redline));
        }
        if let Some(doc) = read(root, COMMENT_HEAVY_REDLINE) {
            docs.push(("comment_heavy_redline", doc));
        }
        docs
    })
}

fn bench_changes(c: &mut Criterion) {
    let docs = redlines();
    let filter = ChangeFilter::default();
    let mut group = c.benchmark_group("changes");
    for (id, doc) in docs {
        group.bench_function(format!("list/{id}"), |b| {
            b.iter(|| black_box(changes::list_changes(black_box(doc)).expect("list")));
        });
        group.bench_function(format!("accept_all/{id}"), |b| {
            b.iter(|| black_box(changes::accept_changes(black_box(doc), &filter).expect("accept")));
        });
        group.bench_function(format!("reject_all/{id}"), |b| {
            b.iter(|| black_box(changes::reject_changes(black_box(doc), &filter).expect("reject")));
        });
    }
    group.finish();
}

fn bench_validate(c: &mut Criterion) {
    let docs = redlines();
    let mut group = c.benchmark_group("validate");
    for (id, doc) in docs {
        group.bench_function(*id, |b| {
            b.iter(|| black_box(validate(black_box(doc)).expect("validate")));
        });
    }
    group.finish();
}

fn bench_markdown(c: &mut Criterion) {
    let docs = redlines();
    let options = MarkdownOptions::default();
    let mut group = c.benchmark_group("docx_to_markdown");
    for (id, doc) in docs {
        group.bench_function(*id, |b| {
            b.iter(|| black_box(docx_to_markdown(black_box(doc), &options).expect("markdown")));
        });
    }
    group.finish();
}

fn bench_pdf(c: &mut Criterion) {
    let docs = redlines();
    let mut group = c.benchmark_group("docx_to_pdf");
    group.sample_size(10);
    for (id, doc) in docs {
        for (style, revisions) in [
            ("conventional", RevisionStyle::Conventional),
            ("word", RevisionStyle::Word),
        ] {
            let options = PdfOptions {
                revisions,
                ..PdfOptions::default()
            };
            group.bench_function(format!("{style}/{id}"), |b| {
                b.iter(|| black_box(docx_to_pdf_with(black_box(doc), options).expect("pdf")));
            });
        }
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_changes,
    bench_validate,
    bench_markdown,
    bench_pdf
);
criterion_main!(benches);
