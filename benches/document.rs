// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

//! Criterion benchmarks for the document operations beside compare: DOCX to
//! PDF rendering, listing and resolving tracked changes, and DOCX to
//! Markdown, each on real fixtures already in the repository.
//!
//! Run with `cargo bench --bench document`. Fixture I/O happens once, outside
//! the measured closures. Documents whose fixtures are absent (a published
//! crate does not package `tests/`) are skipped with a note.

use std::hint::black_box;
use std::path::Path;

use criterion::{Criterion, criterion_group, criterion_main};
use jubarte::changes::{ChangeFilter, accept_changes, list_changes, reject_changes};
use jubarte::convert::docx_to_pdf;
use jubarte::markdown::{MarkdownOptions, docx_to_markdown};

/// (bench id, document): a dense-edit short contract, a long multi-page
/// document, and a comment-heavy one.
const DOCUMENTS: &[(&str, &str)] = &[
    ("canonical", "tests/fixtures/redline/modified.docx"),
    (
        "long_document",
        "tests/corpus/broken_ones_two/sources/file_131.docx",
    ),
    (
        "comment_heavy",
        "tests/corpus/fresh_docx_fixtures_and_redlines/docx_lots_of_comments_addition_removal.docx",
    ),
];

/// (bench id, document with tracked changes): a Word-made table redline and
/// a comment-heavy redline.
const REDLINES: &[(&str, &str)] = &[
    (
        "tables_word_redline",
        "tests/corpus/batch_to_fix/pairs/02_table_bookmark_end_table_vmerge_colspan/word_redline.docx",
    ),
    (
        "comment_heavy_redline",
        "tests/corpus/fresh_docx_fixtures_and_redlines/docx_lots_of_comments_addition_redline.docx",
    ),
];

fn load(rel: &str) -> Option<Vec<u8>> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(rel);
    if !path.is_file() {
        eprintln!("skip: fixture not present ({rel})");
        return None;
    }
    Some(std::fs::read(&path).expect("read fixture"))
}

fn bench_render(c: &mut Criterion) {
    let mut group = c.benchmark_group("docx_to_pdf");
    for (id, rel) in DOCUMENTS {
        let Some(docx) = load(rel) else { continue };
        group.bench_function(*id, |bencher| {
            bencher.iter(|| black_box(docx_to_pdf(black_box(&docx)).expect("render")));
        });
    }
    group.finish();
}

fn bench_markdown(c: &mut Criterion) {
    let mut group = c.benchmark_group("docx_to_markdown");
    let options = MarkdownOptions::default();
    for (id, rel) in DOCUMENTS {
        let Some(docx) = load(rel) else { continue };
        group.bench_function(*id, |bencher| {
            bencher.iter(|| {
                black_box(docx_to_markdown(black_box(&docx), &options).expect("markdown"))
            });
        });
    }
    group.finish();
}

fn bench_changes(c: &mut Criterion) {
    let mut group = c.benchmark_group("changes");
    let all = ChangeFilter::default();
    for (id, rel) in REDLINES {
        let Some(docx) = load(rel) else { continue };
        group.bench_function(format!("list/{id}"), |bencher| {
            bencher.iter(|| black_box(list_changes(black_box(&docx)).expect("list")));
        });
        group.bench_function(format!("accept_all/{id}"), |bencher| {
            bencher.iter(|| black_box(accept_changes(black_box(&docx), &all).expect("accept")));
        });
        group.bench_function(format!("reject_all/{id}"), |bencher| {
            bencher.iter(|| black_box(reject_changes(black_box(&docx), &all).expect("reject")));
        });
    }
    group.finish();
}

criterion_group!(benches, bench_render, bench_markdown, bench_changes);
criterion_main!(benches);
