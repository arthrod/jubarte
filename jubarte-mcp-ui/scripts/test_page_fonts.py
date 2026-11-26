# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0
"""Integration checks of generated font files using fontTools' own font models."""

import io
import re

import pytest
from fontTools import subset
from fontTools.ttLib import TTFont

import page_fonts


@pytest.mark.parametrize("source,target,family,style", list(page_fonts.faces()))
def test_build_preserves_source_supported_advertised_characters(source, target, family, style, tmp_path):
    """K90: every source-supported character advertised by fonts.js survives."""
    css = (page_fonts.ROOT / "jubarte-mcp-ui/src/fonts.js").read_text()
    ranges = re.findall(r'const LATIN(?:_EXT)? =\s*"([^"]+)"', css)
    assert len(ranges) == 2
    advertised = set(subset.parse_unicodes(",".join(ranges)))
    with TTFont(source) as original:
        expected = advertised & original.getBestCmap().keys()
    assert 0x2C60 in expected
    generated = tmp_path / target.name
    page_fonts.build(source, generated, family, style)
    for path in (generated, target):
        with TTFont(path) as font:
            missing = expected - font.getBestCmap().keys()
        assert not missing, f"{path.name}: missing {[f'U+{cp:04X}' for cp in sorted(missing)]}"


@pytest.mark.parametrize("complete_source", [False, True], ids=["original-cmap", "complete-cmap"])
def test_check_rejects_missing_requested_cmap_entry(tmp_path, complete_source):
    """K93: deleting a cmap entry must fail even if all remaining advances match."""
    source, target, family, style = next(page_fonts.faces())
    requested = set(subset.parse_unicodes(page_fonts.UNICODES))
    with TTFont(source) as original:
        if complete_source:
            # Simulate an upstream face advertising every requested code point.
            glyph = original.getBestCmap()[0xE9]
            for table in original["cmap"].tables:
                if table.isUnicode():
                    for cp in requested:
                        table.cmap.setdefault(cp, glyph)
            assert requested <= original.getBestCmap().keys()
        # Build the absent-from-source control explicitly, regardless of the face.
        assert 0x41 in requested and 0x41 in original.getBestCmap()
        for table in original["cmap"].tables:
            if table.isUnicode():
                table.cmap.pop(0x41, None)
        assert 0x41 not in original.getBestCmap()
        source = tmp_path / "source.ttf"
        original.save(source)
    generated = tmp_path / target.name
    page_fonts.build(source, generated, family, style)
    assert page_fonts.check(source, generated) == []
    with TTFont(generated) as font:
        # The checker must accept a requested code point absent from the source.
        assert 0x41 not in font.getBestCmap()
        assert 0xE9 in font.getBestCmap()
        for table in font["cmap"].tables:
            if table.isUnicode():
                table.cmap.pop(0xE9, None)
        damaged = io.BytesIO()
        font.save(damaged)
    damaged.seek(0)
    assert "missing U+00E9" in page_fonts.check(source, damaged)
