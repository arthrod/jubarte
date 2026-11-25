<!--
SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC

SPDX-License-Identifier: Apache-2.0
-->

# Word metrics (#98)

This folder holds the evidence for the card's line and page metrics (#61): small documents and the PDFs Microsoft Word made of them. Each paragraph starts with a label (`S03`, `L-arial-11-auto150`, …), so its place on Word's page can be read back.

| file | what it is |
|---|---|
| `make.py` | writes `docx/` from `template.docx` (Calibri 11pt, compatibility mode 15) |
| `docx/` | the fixtures |
| `word/*_byword.pdf` | Word's PDFs of them (Word for Mac 16, through neurotic_docx_bench's `word_pdf.py`) |
| `ytable.py` | every text line of a PDF with its page and box, in points (`pdftotext -bbox-layout`) |
| `summary.py` | each labelled paragraph's page, top, gap from the one before, and line pitch |
| `word/summary.txt` | `summary.py` over all of Word's PDFs |

Rebuild the fixtures with `python3 make.py`, and the PDFs from the bench root with `uv run python scripts/word_pdf.py -s …/word-metrics/docx -o …/word-metrics/word --no-one-osascript`.

## What Word does

Word's own noise is 0.24pt: identical paragraph pairs sit 14.40pt or 14.64pt apart. Some multi-line pitches spread by 0.48pt. No criterion may be tighter than that.

**Spacing between paragraphs** (`spacing`, `autospacing15`, `autospacing14`):

- The gap is the larger of the first paragraph's space after and the second's space before, not their sum (S02→S03, S08→S09, S12→S13).
- Contextual spacing between paragraphs of one style drops both (S10→S11).
- Auto spacing is 14pt before and after, and it also takes the larger of the two. Compatibility modes 14 and 15 give the same positions.

**Empty paragraphs** (`emptymarks`) are one line in their mark's size:

- a 6pt mark is 7.9pt;
- a 20pt mark is 26.3pt;
- a bare `<w:p/>` also takes the default 8pt after.

**Line pitch** in points, top to top (`lines-*`, two lines or more each). `auto` rules are multiples of single spacing, `exact` and `atLeast` are in points.

| family | size | ×1.00 | ×1.08 | ×1.50 | ×2.00 | exact 18 | at least 20 | at least 8 |
|---|---|---|---|---|---|---|---|---|
| Calibri | 10 | 12.24 | 13.08 | 18.36 | 24.48 | 18.00 | 20.04 | 12.24 |
| Calibri | 11 | 13.44 | 14.40 | 20.16 | 26.88 | 18.00 | 19.92 | 13.44 |
| Calibri | 12 | 14.64 | 15.84 | 22.08 | 29.28 | 18.00 | 19.92 | 14.64 |
| Calibri | 14 | 17.04 | 18.48 | 25.68 | 34.08 | 18.00 | 19.92 | 17.04 |
| Arial | 10 | 11.52 | 12.48 | 17.28 | 23.04 | 18.00 | 19.92 | 11.52 |
| Arial | 11 | 12.72 | 13.68 | 18.96 | 25.20 | 18.00 | 19.92 | 12.72 |
| Arial | 12 | 13.68 | 14.88 | 20.64 | 27.60 | 18.00 | 20.16 | 13.92 |
| Arial | 14 | 16.08 | 17.28 | 24.12 | 32.16 | 18.00 | 19.92 | 16.08 |
| Times New Roman | 10 | 11.52 | 12.36 | 17.28 | 23.04 | 18.00 | 20.04 | 11.52 |
| Times New Roman | 11 | 12.72 | 13.68 | 18.96 | 25.20 | 18.00 | 19.92 | 12.72 |
| Times New Roman | 12 | 13.92 | 14.88 | 20.64 | 27.60 | 18.00 | 20.16 | 13.92 |
| Times New Roman | 14 | 16.08 | 17.28 | 24.24 | 32.16 | 18.00 | 19.92 | 16.08 |
| Courier New | 10 | 11.28 | 12.24 | 17.04 | 22.56 | 18.00 | 20.04 | 11.28 |
| Courier New | 11 | 12.48 | 13.44 | 18.72 | 24.96 | 18.00 | 20.04 | 12.48 |
| Courier New | 12 | 13.68 | 14.64 | 20.40 | 27.12 | 18.00 | 19.92 | 13.68 |
| Courier New | 14 | 15.84 | 17.04 | 23.76 | 31.68 | 18.00 | 20.04 | 15.84 |

**Single spacing is the font's hhea height** (ascent + descent + line gap) × size (`which_table.py`). Every pitch in the ×1.00 column is a multiple of 0.24pt, Word's PDF grid, and the nearest multiple to the hhea height. For example, Calibri 11pt is 1.2207 × 11 = 13.43, drawn at 13.44. The OS/2 typo heights are ignored; none of these faces sets USE_TYPO_METRICS. For these four faces, win + hhea line gap gives the same height, so they cannot tell that rule apart from hhea. Multiples scale the single height, and exact and at-least rules are in points.

**Tables** (`table`): an exact 30pt row is 30.00pt, and an at-least 40pt row is 40.56pt. An at-least 8pt row is its text's height.

**Over-tall lines** (`overtall`): a 700pt exact line, or a 700pt glyph, takes a page of its own, and the text after it starts the next page.

**Space before at a page top** (`pagetop`, 36pt before each):

- It is dropped after an automatic break (P01) and after `pageBreakBefore` (P02).
- It is **kept** after a next-page section break (P07, 108.05 = 72.05 + 36).
- Text after a `w:br type="page"` starts the next page at its top (P05).

`breaks` and `mixed` are in `word/summary.txt`: Word's breaks around hyphens, dashes and URLs, and mixed sizes on one line.

## Page counts

`baseline.tsv` gives Word's page count and the card's for each of the 114 sweep documents. The sweep documents themselves are not here: many are third-party.

| sweep | exact | within ±1 | mean error (pages) |
|---|---|---|---|
| `out96`: Source Serif on the 29px grid | 69 | 90 | 1.25 |
| `out110`: the document's fonts (#99, #110), still on the grid | 70 | 92 | 1.07 |

One document is worse after #99: b097, Word 6 pages, the card 6 then 5. Narrower text on the unchanged 29px grid moves its breaks. Task 4 of #61 replaces the grid.
