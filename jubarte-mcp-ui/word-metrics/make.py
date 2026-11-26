# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0
"""Writes the #98 fixtures: small documents whose Word PDFs fix the card's
line and page metrics (#61). Each paragraph starts with a label so the y
table (ytable.py) can find it.

    python3 jubarte-mcp-ui/word-metrics/make.py   # writes docx/*.docx

template.docx is a plain Word document (Calibri 11pt, compat 15).
"""

import re
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "docx"
LOREM = (
    "The quick brown fox jumps over the lazy dog while the clerk files the agreement, "
    "the schedule and every exhibit the parties signed on the closing date. "
)


def run(text, rpr=""):
    space = ' xml:space="preserve"' if text != text.strip() else ""
    return f"<w:r>{'<w:rPr>' + rpr + '</w:rPr>' if rpr else ''}<w:t{space}>{text}</w:t></w:r>"


def para(label, ppr="", text="", rpr="", runs=None):
    body = runs if runs is not None else run(f"{label} {text}".strip(), rpr)
    return f"<w:p>{'<w:pPr>' + ppr + '</w:pPr>' if ppr else ''}{body}</w:p>"


def sp(before=None, after=None, line=None, rule=None, extra=""):
    attrs = "".join(
        f' w:{k}="{v}"'
        for k, v in (("before", before), ("after", after), ("line", line), ("lineRule", rule))
        if v is not None
    )
    return f"<w:spacing{attrs}{extra}/>"


FONTS = {
    "calibri": "Calibri",
    "arial": "Arial",
    "times": "Times New Roman",
    "courier": "Courier New",
}


def fonts(name):
    return f'<w:rFonts w:ascii="{name}" w:hAnsi="{name}" w:cs="{name}"/>'


def fixtures():
    z = sp(0, 0)
    yield (
        "spacing",
        "".join(
            [
                para("S00 none", z),
                para("S01 none", z),
                para("S02 after36", sp(0, 720)),
                para("S03 before36", sp(720, 0)),
                para("S04 after36", sp(0, 720)),
                para("S05 none", z),
                para("S06 none", z),
                para("S07 before36", sp(720, 0)),
                para("S08 after12", sp(0, 240)),
                para("S09 before24", sp(480, 0)),
                para("S10 ctx after18", sp(0, 360) + "<w:contextualSpacing/>"),
                para("S11 ctx before18", sp(360, 0) + "<w:contextualSpacing/>"),
                para("S12 noctx after18", sp(0, 360)),
                para("S13 noctx before18", sp(360, 0)),
                para("S14 default"),
                para("S15 default"),
            ]
        ),
        None,
    )
    auto = "".join(
        [para("U00 none", z)]
        + [para(f"U{i:02} auto", sp(extra=' w:beforeAutospacing="1" w:afterAutospacing="1"')) for i in range(1, 4)]
        + [para("U04 none", z)]
    )
    yield "autospacing15", auto, None
    yield "autospacing14", auto, "14"
    # Line rules: one long paragraph per rule, per family, so its line pitch shows.
    rules = [
        ("auto100", sp(0, 240, 240, "auto")),
        ("auto108", sp(0, 240, 259, "auto")),
        ("auto150", sp(0, 240, 360, "auto")),
        ("auto200", sp(0, 240, 480, "auto")),
        ("exact18", sp(0, 240, 360, "exact")),
        ("atleast20", sp(0, 240, 400, "atLeast")),
        ("atleast8", sp(0, 240, 160, "atLeast")),
    ]
    for key, family in FONTS.items():
        body = []
        for size in (20, 22, 24, 28):
            for name, ppr in rules:
                label = f"L-{key}-{size // 2}-{name}"
                body.append(para(label, ppr, LOREM * 2, fonts(family) + f'<w:sz w:val="{size}"/>'))
        yield f"lines-{key}", "".join(body), None
    yield (
        "mixed",
        "".join(
            [
                para("M00 plain", z, LOREM),
                para(
                    "M01",
                    z,
                    runs=run("M01 small ") + run("BIG", '<w:sz w:val="40"/>') + run(" small again " + LOREM),
                ),
                para("M02 plain", z, LOREM),
                para(
                    "M03", z, runs=run("M03 sup ") + run("x", '<w:vertAlign w:val="superscript"/>') + run(" " + LOREM)
                ),
            ]
        ),
        None,
    )
    yield (
        "emptymarks",
        "".join(
            [
                para("E00 text", z),
                f'<w:p><w:pPr>{z}<w:rPr><w:sz w:val="12"/></w:rPr></w:pPr></w:p>',
                para("E01 text", z),
                f"<w:p><w:pPr>{z}</w:pPr></w:p>",
                para("E02 text", z),
                f'<w:p><w:pPr>{z}<w:rPr><w:sz w:val="40"/></w:rPr></w:pPr></w:p>',
                para("E03 text", z),
                "<w:p/>",
                para("E04 text", z),
            ]
        ),
        None,
    )
    fill = "".join(para(f"F{i:02}", sp(0, 0), "filler line") for i in range(44))  # Word fits 44 on page 1
    yield (
        "pagetop",
        "".join(
            [
                fill,
                para("P01 auto break before36", sp(720, 0)),
                para("P02 pageBreakBefore before36", "<w:pageBreakBefore/>" + sp(720, 0)),
                para("P03 text", z),
                para(
                    "P04",
                    sp(720, 0),
                    runs=run("P04 before36 then break")
                    + '<w:r><w:br w:type="page"/></w:r>'
                    + run("P05 after the break"),
                ),
                para(
                    "P06 section ends",
                    z + '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="12240" w:h="15840"/>'
                    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>',
                ),
                para("P07 new section before36", sp(720, 0)),
            ]
        ),
        None,
    )

    def row(label, trpr):
        cell = f'<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>{para(label, z)}</w:tc>'
        return f"<w:tr><w:trPr>{trpr}</w:trPr>{cell}{cell.replace(label, label + 'b')}</w:tr>"

    grid = '<w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>'
    borders = "".join(
        f'<w:{s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        for s in ("top", "left", "bottom", "right", "insideH", "insideV")
    )
    yield (
        "table",
        "".join(
            [
                para("T00 before table", z),
                f'<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/><w:tblBorders>{borders}</w:tblBorders></w:tblPr>{grid}'
                + row("T01 auto", "")
                + row("T02 exact30", '<w:trHeight w:val="600" w:hRule="exact"/>')
                + row("T03 atleast40", '<w:trHeight w:val="800" w:hRule="atLeast"/>')
                + row("T04 atleast8", '<w:trHeight w:val="160" w:hRule="atLeast"/>')
                + "</w:tbl>",
                para("T05 after table", z),
            ]
        ),
        None,
    )
    yield (
        "breaks",
        "".join(
            [
                para(
                    "B00",
                    z,
                    "Hyphen-ated words-with-many-hyphens re-enter pre-existing co-operative non-trivial "
                    "self-evident long-standing well-known up-to-date state-of-the-art arrangements " * 2,
                ),
                para("B01", z, "Dashes\u2014em\u2014dashes\u2014between\u2014words and en\u2013dashes\u2013too " * 4),
                para(
                    "B02",
                    z,
                    "See https://example.com/a/very/long/path/that/keeps/going/and/going/without/any/spaces/at/all/index.html for details "
                    * 2,
                ),
                para(
                    "B03",
                    z,
                    "Punctuation, (brackets), \u201cquotes,\u201d semicolons; colons: and ellipses\u2026 end lines. "
                    * 5,
                ),
            ]
        ),
        None,
    )
    yield (
        "overtall",
        "".join(
            [
                para("O00 before", z),
                para("O01 exact 700pt", sp(0, 0, 14000, "exact")),
                para("O02 after", z),
                para("O03", z, runs=run("O03 ") + run("H", '<w:sz w:val="1400"/>')),
                para("O04 after", z),
            ]
        ),
        None,
    )


def main():
    template = HERE / "template.docx"
    OUT.mkdir(exist_ok=True)
    for name, body, compat in fixtures():
        with (
            zipfile.ZipFile(template) as zin,
            zipfile.ZipFile(OUT / f"{name}.docx", "w", zipfile.ZIP_DEFLATED) as zout,
        ):
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename == "word/document.xml":
                    s = data.decode()
                    a, b = s.index("<w:body>") + 8, s.index("<w:sectPr")
                    data = (s[:a] + body + s[b:]).encode()
                elif item.filename == "word/settings.xml" and compat:
                    s = data.decode()
                    data = re.sub(r'(w:name="compatibilityMode"[^>]*w:val=")\d+', rf"\g<1>{compat}", s).encode()
                zout.writestr(item, data)
        print(OUT / f"{name}.docx")


if __name__ == "__main__":
    main()
