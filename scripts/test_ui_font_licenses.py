# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
# SPDX-License-Identifier: Apache-2.0

"""Integration: compare shipped licences with the actual WOFF2 name tables.

Run with uv run --with fonttools --with brotli --with pytest pytest this_file.
fontTools' TTFont and NameRecord.toUnicode decode the font's own metadata.
"""

from pathlib import Path

import pytest
from fontTools.ttLib import TTFont

UI = Path(__file__).resolve().parents[1] / "jubarte-mcp-ui"
FONTS = sorted((UI / "src/fonts").glob("source-serif-4-*.woff2"))


def test_source_serif_fonts_are_present():
    assert FONTS, "The bundled Source Serif 4 fonts must be checked"


@pytest.mark.parametrize("font_path", FONTS, ids=lambda path: path.name)
def test_source_serif_copyright_matches_every_bundled_font(font_path):
    copyright_line = (UI / "licenses/LICENSE-source-serif-4.txt").read_text(encoding="utf-8").splitlines()[0]
    with TTFont(font_path) as font:
        copyrights = {record.toUnicode() for record in font["name"].names if record.nameID == 0}
    assert copyrights == {copyright_line}
