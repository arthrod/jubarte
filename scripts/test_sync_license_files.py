#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0

"""scripts/sync_license_files.py keeps one LICENSE and one NOTICE in every
package, writes the packages' THIRD_PARTY_NOTICES.md, and refuses a file
adapted from another project that no notice beside it covers.

Each case builds a small repository in a temporary directory: one crate
with a ported file and its notice, the renderer's two font licences, and the
other package folders.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from sync_license_files import table_cells, ui_for_bundle

SCRIPT = Path(__file__).resolve().parent / "sync_license_files.py"

JANDIRA = "// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC\n"
PORTED = JANDIRA + "// SPDX-FileCopyrightText: 2020 Upstream Author\n//\n// SPDX-License-Identifier: Apache-2.0 AND MIT\n"
OWN = JANDIRA + "//\n// SPDX-License-Identifier: Apache-2.0\n"
MIT = (
    "Copyright (c) 2020 Upstream Author\n\n"
    "Permission is hereby granted, free of charge, to any person obtaining a copy\n"
    "of this software.\n"
)
NOTICE_FILE = (
    "# Third-party notices\n\n"
    "jubarte-x ports [upstream](https://example.org/upstream); see [the license](LICENSE).\n\n"
    "| Files | From | Licence |\n| --- | --- | --- |\n| `src/port.rs` | upstream | MIT |\n\n"
    "## upstream\n\n```text\n" + MIT + "```\n"
)
MANIFEST = '[package]\nname = "jubarte-x"\ninclude = ["/src/**", "/LICENSE", "/NOTICE", "/THIRD_PARTY_NOTICES.md"]\n'


class UiForBundle(unittest.TestCase):
    """Pure notice transformation checks; no repository or filesystem needed."""

    def test_pipe_escaping_respects_backslash_parity(self) -> None:
        self.assertEqual(table_cells(r"| a\\| b\|c |"), ["", "a\\\\", r"b\|c", ""])
        self.assertEqual(table_cells(r"| a\\\|b |"), ["", r"a\\\|b", ""])

    def test_headers_alignment_multiple_paths_and_fenced_text(self) -> None:
        text = (
            "# Third-party notices\n\n"
            "| Files | Comes from | Licence |\n| :--- | ---: | :---: |\n"
            "| `src/a.js`<br>`src/b.js` | Example | MIT |\n\n"
            "```text\n| licence text, not a table\n```\n"
        )
        result = ui_for_bundle(text)
        self.assertIn("| Files | Comes from | Licence |\n| :--- | ---: | :---: |", result)
        self.assertIn("Source: `jubarte-mcp-ui/src/a.js`<br>`jubarte-mcp-ui/src/b.js`", result)
        self.assertIn("```text\n| licence text, not a table\n```", result)

    def test_escaped_pipes_remain_inside_cells(self) -> None:
        row = r"| `src/a\|b.js` | Example\| upstream | MIT (`licenses/A\|B.txt`) |"
        self.assertIn(
            r"| `ui/document.html` | Example\| upstream<br>Source: `jubarte-mcp-ui/src/a\|b.js` | "
            r"MIT (source: `jubarte-mcp-ui/licenses/A\|B.txt`; licence text embedded in `ui/document.html`) |",
            ui_for_bundle(row),
        )

    def test_unrecognised_rows_fail_loudly(self) -> None:
        for row in (
            "| `src/a.js` | Example | MIT | extra |",
            "| `src/a.js` | MIT |",
            "| src/a.js | Example | MIT |",
            "| `src/a.js` | Example | MIT",
            "| `src/a.js` | | MIT |",
            "| Unknown | Header | Shape |",
            "| Files | Comes from | Licence |\n`src/a.js` | Example | MIT |",
        ):
            with self.subTest(row=row):
                with self.assertRaisesRegex(ValueError, "Unrecognised UI notice table row"):
                    ui_for_bundle(row)


class SyncLicenseFiles(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="sync_license_files_")).resolve()
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.write("LICENSE", "Apache License, Version 2.0\n")
        self.write("NOTICE", "Jubarte\nCopyright 2026 Jandira Technologies, LLC\n")
        self.write("crates/jubarte-render/assets/fonts/LICENSE-Carlito", "Carlito: SIL OPEN FONT LICENSE\n")
        self.write("crates/jubarte-render/assets/fonts/LICENSE-Liberation", "Liberation: SIL OPEN FONT LICENSE\n")
        self.write("crates/jubarte-x/Cargo.toml", MANIFEST)
        self.write("crates/jubarte-x/src/lib.rs", OWN + "pub mod port;\n")
        self.write("crates/jubarte-x/src/port.rs", PORTED + "pub fn f() {}\n")
        self.write("crates/jubarte-x/THIRD_PARTY_NOTICES.md", NOTICE_FILE)
        self.write(
            "jubarte-mcp-ui/THIRD_PARTY_NOTICES.md", NOTICE_FILE.replace("2020 Upstream Author", "2021 UI Author")
        )
        self.write("jubarte-mcp-ui/src/port.rs", PORTED.replace("2020 Upstream Author", "2021 UI Author"))
        for folder in ("jubarte-python/compat", "jubarte-python/python/jubarte", "jubarte-wasm/npm", "jubarte-wasm/cli"):
            (self.root / folder).mkdir(parents=True)
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stderr)

    def write(self, rel: str, text: str) -> None:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def run_script(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root), *args], capture_output=True, text=True, timeout=60
        )

    def refused(self, message: str) -> None:
        r = self.run_script("--check")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn(message, r.stderr)

    def test_a_sound_tree_passes_and_every_package_has_its_files(self) -> None:
        r = self.run_script("--check")
        self.assertEqual(r.returncode, 0, r.stderr)
        for folder in ("crates/jubarte-x", "jubarte-python", "jubarte-python/compat", "jubarte-wasm/npm", "jubarte-wasm/cli"):
            for name in ("LICENSE", "NOTICE"):
                self.assertEqual((self.root / folder / name).read_bytes(), (self.root / name).read_bytes())
        for folder in ("jubarte-python", "jubarte-python/compat", "jubarte-wasm/cli"):
            self.assertFalse((self.root / folder / "THIRD_PARTY_NOTICES.md").exists(), folder)
        # the wheel installs the Python one with the package; npm packs its root
        for folder in ("jubarte-python/python/jubarte", "jubarte-wasm/npm"):
            bundle = (self.root / folder / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")
            self.assertIn("## jubarte-x", bundle)
            self.assertIn("Copyright (c) 2020 Upstream Author", bundle)
            self.assertIn("Carlito: SIL OPEN FONT LICENSE", bundle)
            self.assertIn("Liberation: SIL OPEN FONT LICENSE", bundle)

    def test_the_package_notice_unlinks_repository_paths_and_writes_a_shared_notice_once(self) -> None:
        self.write("crates/jubarte-y/Cargo.toml", MANIFEST.replace("jubarte-x", "jubarte-y"))
        self.write("crates/jubarte-y/src/port.rs", PORTED)
        self.write("crates/jubarte-y/THIRD_PARTY_NOTICES.md", NOTICE_FILE.replace("jubarte-x", "jubarte-y"))
        self.assertEqual(self.run_script().returncode, 0)
        bundle = (self.root / "jubarte-python/python/jubarte/THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")
        self.assertEqual(bundle.count("Copyright (c) 2020 Upstream Author"), 1)
        self.assertIn("The same notice as under jubarte-x, above.", bundle)
        self.assertIn("see the license.", bundle)  # a repository path is no link in a package
        self.assertIn("[upstream](https://example.org/upstream)", bundle)
        self.assertIn("### upstream", bundle)  # a crate's headings sit under its own

    def test_an_adapted_file_its_notice_does_not_list_is_refused(self) -> None:
        self.write("crates/jubarte-x/src/other.rs", PORTED)
        self.refused("crates/jubarte-x/src/other.rs is under Apache-2.0 AND MIT, and crates/jubarte-x/THIRD_PARTY_NOTICES.md does not list it")

    def test_ui_bundle_names_package_carrier_and_embedded_licence_text(self) -> None:
        """K94: the wheel notice distinguishes carriers from repository sources."""
        self.write("jubarte-mcp-ui/src/port.rs", OWN)
        self.write("jubarte-mcp-ui/src/fonts/page/example.woff2", "font fixture")
        self.write("jubarte-mcp-ui/licenses/LICENSE-example.txt", "OFL fixture")
        self.write(
            "jubarte-mcp-ui/THIRD_PARTY_NOTICES.md",
            (
                "# Third-party notices\n\n"
                "| Files | Comes from | Licence |\n| --- | --- | --- |\n"
                "| `src/fonts/page/*.woff2` | Example font | OFL-1.1 (`licenses/LICENSE-example.txt`) |\n"
            ),
        )
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        notice = (self.root / "jubarte-python/python/jubarte/THIRD_PARTY_NOTICES.md").read_text()
        self.assertIn("| `ui/document.html` |", notice)
        self.assertIn("Source: `jubarte-mcp-ui/src/fonts/page/*.woff2`", notice)
        self.assertIn("licence text embedded in `ui/document.html`", notice)
        self.assertIn("source: `jubarte-mcp-ui/licenses/LICENSE-example.txt`", notice)
        self.assertNotIn("| `src/fonts/", notice)

    def test_an_adapted_file_with_no_notice_up_its_path_is_refused(self) -> None:
        self.write("tools/port.py", "# SPDX-FileCopyrightText: 2020 Upstream Author\n# SPDX-License-Identifier: MIT\n")
        self.refused("tools/port.py is under MIT, and no THIRD_PARTY_NOTICES.md up its path lists it")

    def test_a_listed_path_that_matches_nothing_is_refused(self) -> None:
        self.write("crates/jubarte-x/THIRD_PARTY_NOTICES.md", NOTICE_FILE.replace("`src/port.rs`", "`src/port.rs`<br>`src/gone.rs`"))
        self.refused("lists `src/gone.rs`, which matches no file")

    def test_a_notice_without_a_files_table_is_refused(self) -> None:
        self.write("crates/jubarte-x/THIRD_PARTY_NOTICES.md", "# Third-party notices\n\n" + MIT)
        self.refused("has no `Files` table")

    def test_a_copyright_holder_the_notice_leaves_out_is_refused(self) -> None:
        self.write("crates/jubarte-x/THIRD_PARTY_NOTICES.md", NOTICE_FILE.replace("2020 Upstream Author", "Upstream"))
        self.refused("does not name '2020 Upstream Author', a copyright holder of crates/jubarte-x/src/port.rs")

    def test_an_mit_file_needs_the_mit_licence_text(self) -> None:
        self.write("crates/jubarte-x/THIRD_PARTY_NOTICES.md", NOTICE_FILE.replace("Permission is hereby granted", "Permitted"))
        self.refused("which is under MIT, without the MIT License's text")

    def test_a_listed_file_that_is_jandiras_alone_is_refused(self) -> None:
        self.write("crates/jubarte-x/THIRD_PARTY_NOTICES.md", NOTICE_FILE.replace("`src/port.rs`", "`src/*.rs`"))
        self.refused("lists crates/jubarte-x/src/lib.rs, whose header claims Apache-2.0 and Jandira alone")

    def test_a_folder_pattern_covers_the_files_under_it(self) -> None:
        self.write("tests/THIRD_PARTY_NOTICES.md", NOTICE_FILE.replace("`src/port.rs`", "`fixtures/up/`"))
        self.write("tests/fixtures/up/a.rs", PORTED)
        self.write("tests/fixtures/up/deep/b.docx", "binary\n")
        r = self.run_script("--check")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_a_crate_must_ship_its_notice(self) -> None:
        self.write("crates/jubarte-x/Cargo.toml", MANIFEST.replace(', "/THIRD_PARTY_NOTICES.md"', ""))
        self.refused("crates/jubarte-x/Cargo.toml does not include /THIRD_PARTY_NOTICES.md")

    def test_a_stale_copy_is_refused_and_rewritten(self) -> None:
        self.write("NOTICE", "Jubarte\nCopyright 2027 Jandira Technologies, LLC\n")
        self.refused("crates/jubarte-x/NOTICE differs from NOTICE")
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(self.run_script("--check").returncode, 0)

    def test_a_stale_package_notice_is_refused(self) -> None:
        self.write("crates/jubarte-x/THIRD_PARTY_NOTICES.md", NOTICE_FILE + "\nA new line.\n")
        self.refused("jubarte-python/python/jubarte/THIRD_PARTY_NOTICES.md differs from the crates' notices")

    def test_a_tag_after_code_on_its_line_is_no_header(self) -> None:
        # a header's tag opens its comment line; one in a string, or in a
        # comment after code, describes something else
        self.write(
            "crates/jubarte-x/src/strings.rs",
            'const H: &str = "// SPDX-License-Identifier: MIT\\n";\nlet x = 1; /* SPDX-License-Identifier: MIT */\n',
        )
        self.write("scripts/gen.py", 'HEADER = "# SPDX-FileCopyrightText: 2020 Upstream Author\\n# SPDX-License-Identifier: MIT"\n')
        r = self.run_script("--check")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_an_ignored_file_is_not_read(self) -> None:
        self.write(".gitignore", ".scratch/\n")
        self.write(".scratch/port.rs", PORTED)
        r = self.run_script("--check")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_a_missing_root_file_is_named(self) -> None:
        (self.root / "crates/jubarte-render/assets/fonts/LICENSE-Liberation").unlink()
        self.refused("crates/jubarte-render/assets/fonts/LICENSE-Liberation is missing")


if __name__ == "__main__":
    unittest.main()
