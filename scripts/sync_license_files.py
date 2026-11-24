#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0

"""sync_license_files.py [--check]: one LICENSE, and each notice beside what it covers.

The repository has one licence file, the root `LICENSE` (Apache-2.0), and
one `NOTICE`, Jandira's. A registry packs only what is inside a package's
folder, so every published folder carries a copy of both: each workspace
crate, the Python bindings and their compatibility shim, and the two npm
packages. Edit the root files only; this script copies them.

What comes from another project is noted beside it, in a
`THIRD_PARTY_NOTICES.md`: a crate's at the crate's root, where it ships with
the crate; the tests' in `tests/`; the installable fonts' in
`assets/fonts/extra/`. Each holds a table whose first column, `Files`, names
what it covers, relative to its folder: `*` matches within a path, and a
trailing `/` takes a whole folder. The Python package and the npm library
carry the whole engine, compiled, and the fonts the renderer embeds, so this
script writes a `THIRD_PARTY_NOTICES.md` into each: every crate's notices and
those fonts' licence texts. The npm library's sits at its root. The Python
one sits in the `jubarte` package folder, which maturin puts in the wheel
whole: `project.license-files` cannot name it, because an explicit list
replaces the automatic `LICENSE` and `NOTICE`, and maturin 1.16 refuses to
add those two by name to an sdist where the root package already put them.

`--check` changes nothing and fails when
- a copy, or a notice this script writes, is missing or stale;
- a file whose SPDX header names a licence other than Apache-2.0, or a
  copyright holder other than Jandira, is not listed by the nearest
  `THIRD_PARTY_NOTICES.md` up its path;
- a notice lists a path that matches no file, or a file whose header claims
  Apache-2.0 and Jandira alone;
- a notice leaves out a copyright holder that the header of a file it lists
  names, or the MIT License's text when such a file is under MIT;
- a crate's notice is missing from its `Cargo.toml` `include`, so the crate
  would ship without it.

The files are git's: tracked ones, and new ones git does not ignore.
"""

from __future__ import annotations

import argparse
import fnmatch
import re
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ("LICENSE", "NOTICE")
NOTICES = "THIRD_PARTY_NOTICES.md"
# Where the packages that carry the compiled engine and the renderer's
# fonts take their notices from: the wheel installs the Python one with
# the `jubarte` package.
BUNDLES = ("jubarte-python/python/jubarte", "jubarte-wasm/npm")
# The licence texts of the fonts the renderer embeds.
FONT_LICENSES = (
    "crates/jubarte-render/assets/fonts/LICENSE-Carlito",
    "crates/jubarte-render/assets/fonts/LICENSE-Liberation",
)
JANDIRA = "Jandira Technologies, LLC"
MIT_TEXT = "Permission is hereby granted, free of charge"
# An SPDX header line: a comment marker, or none inside an HTML comment, then
# the tag. A tag in a string literal follows a quote or code, and is not one.
TAG = re.compile(
    r"^[ \t]*(?:(?://[/!]?|#|\*|--|;)[ \t]*)?SPDX-(License-Identifier|FileCopyrightText):"
    r"[ \t]*(.*?)[ \t]*(?:-->|\*/)?[ \t]*$",
    re.M,
)
EXPRESSION = re.compile(r"[A-Za-z0-9.+()\- ]+")
CODE = re.compile(r"`([^`]+)`")
# A relative Markdown link: it names a file of the source repository.
LOCAL_LINK = re.compile(r"\[([^\]]+)\]\((?![a-z]+:)[^)]*\)")
FENCE = re.compile(r"^```text\n.*?^```$", re.M | re.S)
BUNDLE_HEAD = """\
# Third-party notices

<!-- Written by scripts/sync_license_files.py from each crate's THIRD_PARTY_NOTICES.md and the renderer's font licences. Edit those, not this file. -->

This package carries the jubarte engine, compiled from its crates, and the
fonts its renderer embeds. jubarte is licensed under the Apache License 2.0
(see `LICENSE`). Parts of the engine are adapted from other projects, and
the fonts keep their own licence. Each crate's notices follow, with paths
relative to the crate in the source repository, and then the fonts' licence
texts."""


def package_dirs(root: Path) -> list[Path]:
    """Every folder a registry package is built from."""
    crates = sorted(p.parent for p in (root / "crates").glob("*/Cargo.toml"))
    return [
        *crates,
        root / "jubarte-python",
        root / "jubarte-python" / "compat",
        root / "jubarte-wasm" / "npm",
        root / "jubarte-wasm" / "cli",
    ]


def repo_files(root: Path) -> list[str]:
    """Tracked files, and new ones git does not ignore, that are on disk."""
    out = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        capture_output=True,
        check=True,
    ).stdout
    names = {p for p in out.decode("utf-8", "surrogateescape").split("\0") if p}
    return sorted(p for p in names if (root / p).is_file())


def header(path: Path) -> tuple[str | None, list[str]]:
    """The SPDX expression and copyright holders a file's header names: the
    tags in its first 4 KiB, up to the first licence tag."""
    try:
        with path.open("rb") as fh:
            top = fh.read(4096).decode("utf-8", "replace")
    except OSError:
        return None, []
    holders: list[str] = []
    for m in TAG.finditer(top):
        kind, value = m.groups()
        if kind == "FileCopyrightText":
            holders.append(value)
        elif EXPRESSION.fullmatch(value):
            return value.strip(), holders
    return None, []


def is_third_party(expression: str, holders: list[str]) -> bool:
    return expression != "Apache-2.0" or any(JANDIRA not in h for h in holders)


def listed_patterns(text: str) -> list[str]:
    """The patterns in the first column of the notice's `Files` tables."""
    patterns: list[str] = []
    in_table = False
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            in_table = False
            continue
        first = line.strip().strip("|").split("|")[0].strip()
        if first == "Files":
            in_table = True
        elif in_table and not set(first) <= set("-: "):
            patterns += CODE.findall(first)
    return patterns


def matches(pattern: str, folder: str, files: list[str]) -> list[str]:
    full = f"{folder}/{pattern}" if folder else pattern
    if pattern.endswith("/"):
        return [f for f in files if f.startswith(full)]
    return [f for f in files if fnmatch.fnmatchcase(f, full)]


def nearest(path: str, folders: set[str]) -> str | None:
    """The closest folder up the path that holds a notice."""
    parts = path.split("/")[:-1]
    while True:
        folder = "/".join(parts)
        if folder in folders:
            return folder
        if not parts:
            return None
        parts.pop()


def notice_problems(root: Path, files: list[str]) -> list[str]:
    problems: list[str] = []
    written = {f"{b}/{NOTICES}" for b in BUNDLES}
    notices: dict[str, tuple[str, str, set[str]]] = {}
    for rel in files:
        if Path(rel).name != NOTICES or rel in written:
            continue
        folder = rel.rpartition("/")[0]
        text = (root / rel).read_text(encoding="utf-8")
        covered: set[str] = set()
        patterns = listed_patterns(text)
        if not patterns:
            problems.append(f"{rel} has no `Files` table naming what it covers")
        for pattern in patterns:
            hits = matches(pattern, folder, files)
            if not hits:
                problems.append(f"{rel} lists `{pattern}`, which matches no file")
            covered.update(hits)
        notices[folder] = (rel, text, covered)

    headers: dict[str, tuple[str, list[str]]] = {}
    for rel in files:
        expression, holders = header(root / rel)
        if expression is None:
            continue
        headers[rel] = (expression, holders)
        if not is_third_party(expression, holders):
            continue
        folder = nearest(rel, set(notices))
        if folder is None:
            problems.append(f"{rel} is under {expression}, and no {NOTICES} up its path lists it")
            continue
        notice, text, covered = notices[folder]
        if rel not in covered:
            problems.append(f"{rel} is under {expression}, and {notice} does not list it")
            continue
        for holder in holders:
            if JANDIRA not in holder and holder not in text:
                problems.append(f"{notice} does not name {holder!r}, a copyright holder of {rel}")
        if re.search(r"\bMIT\b", expression) and MIT_TEXT not in text:
            problems.append(f"{notice} lists {rel}, which is under MIT, without the MIT License's text")

    for notice, _, covered in notices.values():
        for rel in sorted(covered):
            if rel in headers and not is_third_party(*headers[rel]):
                problems.append(f"{notice} lists {rel}, whose header claims Apache-2.0 and Jandira alone")
    for folder in sorted(notices):
        manifest = root / folder / "Cargo.toml"
        if folder.startswith("crates/") and manifest.is_file():
            include = tomllib.loads(manifest.read_text(encoding="utf-8")).get("package", {}).get("include", [])
            if f"/{NOTICES}" not in include:
                problems.append(f"{folder}/Cargo.toml does not include /{NOTICES}: the crate would ship without it")
    return problems


def for_bundle(text: str) -> str:
    """A crate's notice inside a package's: no title, headings a level down,
    and relative links as plain text (they name files of the repository)."""
    lines = text.strip("\n").splitlines()
    if lines and lines[0].startswith("# "):
        lines = lines[1:]
    out, fenced = [], False
    for line in lines:
        if line.startswith("```"):
            fenced = not fenced
        elif not fenced:
            line = LOCAL_LINK.sub(r"\1", "#" + line if line.startswith("#") else line)
        out.append(line)
    return "\n".join(out).strip("\n")


def bundle(root: Path) -> str:
    """The THIRD_PARTY_NOTICES.md of a package that carries the whole engine.
    A notice text that two crates quote is written out once."""
    parts = [BUNDLE_HEAD]
    seen: dict[str, str] = {}
    for notice in sorted((root / "crates").glob(f"*/{NOTICES}")):
        crate = notice.parent.name

        def once(m: re.Match[str], crate: str = crate) -> str:
            first = seen.setdefault(m.group(0), crate)
            return m.group(0) if first == crate else f"The same notice as under {first}, above."

        text = FENCE.sub(once, for_bundle(notice.read_text(encoding="utf-8")))
        parts.append(f"## {crate}\n\n{text}")
    parts.append("## The fonts' licences")
    for rel in FONT_LICENSES:
        body = (root / rel).read_text(encoding="utf-8").strip("\n")
        parts.append(f"### {Path(rel).name}\n\n```text\n{body}\n```")
    return "\n\n".join(parts) + "\n"


def copies(root: Path) -> list[tuple[Path, bytes, str]]:
    """Every (copy, wanted bytes, source) this script keeps current."""
    pairs = [(folder / name, (root / name).read_bytes(), name) for folder in package_dirs(root) for name in FILES]
    text = bundle(root).encode("utf-8")
    pairs += [(root / b / NOTICES, text, "the crates' notices") for b in BUNDLES]
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="change nothing; fail on a stale copy or notice")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    root = args.root.resolve()

    problems = [f"{name} is missing" for name in FILES if not (root / name).is_file()]
    problems += [f"{rel} is missing" for rel in FONT_LICENSES if not (root / rel).is_file()]
    written = 0
    if not problems:
        problems += notice_problems(root, repo_files(root))
        for copy, wanted, source in copies(root):
            if copy.is_file() and copy.read_bytes() == wanted:
                continue
            if args.check:
                state = f"differs from {source}" if copy.exists() else "is missing"
                problems.append(f"{copy.relative_to(root)} {state}")
            else:
                copy.write_bytes(wanted)
                written += 1
    for problem in problems:
        print(f"sync_license_files: {problem}", file=sys.stderr)
    if problems:
        if args.check:
            print("sync_license_files: run scripts/sync_license_files.py, fix the rest, and commit", file=sys.stderr)
        return 1
    print(f"sync_license_files: {written} files written" if written else "sync_license_files: every copy is current")
    return 0


if __name__ == "__main__":
    sys.exit(main())
