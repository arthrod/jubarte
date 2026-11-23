#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0
#
# Mini release: a small release (a fix or two) of the whole jubarte family,
# cut down from scripts/release.sh to what the tag itself needs. Every file
# that names the engine's version carries the SAME version, before the bump
# and after it; the run stops on the first file that does not.
#
#   scripts/mini-release.sh 0.19.1 --summary "…"
#     --summary "…"   required → the one note every channel gets:
#                     `> **Summary.** …` under ## [0.19.1] in CHANGELOG.md,
#                     [package.metadata.release-notes] in Cargo.toml and
#                     jubarte-python/Cargo.toml, releaseNotes in
#                     jubarte-wasm/npm/package.json, the `# release-notes`
#                     comment in jubarte-python/pyproject.toml, and the
#                     annotated tag's body (release.yml leads the GitHub
#                     release notes with it)
#     --dry-run       bump, write the notes and run the gates; commit, tag
#                     and push nothing
#     --yes           skip the type-the-tag confirmation
#     --skip-gates    skip fmt, clippy and the test run (a rerun after they
#                     passed)
#   scripts/mini-release.sh --check
#                     only list every version-bearing file and fail unless
#                     all name one version; touches nothing
#
# What it does, in order:
#   0. preflight — bash, the tools, on main, in sync with origin/main, a
#      clean tree, no tag v$VER yet, $VER above the last release, and the
#      tree on ONE version before anything moves
#   1. version sync — the files scripts/release.sh step 1 moves, with the
#      same commands: bump-version.mjs (Cargo.toml, its "=" pins, the README
#      badge, gemini-extension.json), jubarte-python/Cargo.toml, the
#      jubarte-redlines shim and its jubarte-docx pins, jubarte-wasm and
#      jubarte-rust-inproc, both npm package.json files, the four
#      Cargo.lock files, and the library READMEs (scripts/library_readmes.py)
#   2. one version — every file of step 1 names $VER and no other version
#   3. changelog — what sits under ## [Unreleased] becomes ## [$VER] - today
#      with the summary on top and a link in the footer (an existing dated
#      section keeps its text and gets the summary); an empty section stops
#      the run: release.yml publishes that section as the release notes
#   4. notes — the summary into the four registry channels above
#   5. gates — cargo fmt --check, clippy -D warnings, cargo nextest run
#      (sequential cargo, AGENTS.md)
#   6. commit `chore(release): v$VER`, annotated tag `jubarte v$VER` whose
#      body is the summary, then — after typing the tag — push main
#      (scripts/push_main.sh) and the tag. release.yml then builds the
#      binaries and wheels, creates the GitHub release and publishes
#      crates.io, npm and PyPI through OIDC trusted publishing.
#
# Not done here — use scripts/release.sh when any of them matters: the
# release_info/ benchmark evidence, the app gate and the app/website step,
# the bump-kind and semver gate, the security gate, the API snapshot, the
# publish dry-runs, the WASM typings commit, and waiting for and verifying
# the registries. A crate crates.io has never seen cannot be published by
# release.yml (no trusted publisher yet): release.sh --local-publish-crates.
set -euo pipefail
# Match with `grep … >/dev/null`, never `grep -q`, after a pipe (release.sh,
# pipefail and SIGPIPE).
cd "$(dirname "$0")/.."

usage() { sed -n '/^# Mini release/,/^set -euo pipefail$/p' "$0" | sed '$d' >&2; }
say() { printf '\n\033[1m== %s\033[0m\n' "$*" >&2; }
step() { printf '   ✓ %s\n' "$*" >&2; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- every place the engine's version is written, and what it says ----------
# One line per place: `<version>\t<file: what>`. A new version-bearing file
# goes here, and in the sync of step 1.
version_report() {
  python3 - <<'PY'
import json, pathlib, re

out = []
def add(version, where):
    out.append((version, where))

def toml_version(path, key="version"):
    text = pathlib.Path(path).read_text()
    m = re.search(r'^\[(?:package|workspace\.package|project)\][^\[]*?^version\s*=\s*"([^"]+)"', text, re.M | re.S)
    return m.group(1) if m else None

root = pathlib.Path("Cargo.toml").read_text()
add(toml_version("Cargo.toml"), "Cargo.toml: [package] version")
for name, v in re.findall(r'^(jubarte[\w-]*)\s*=\s*\{[^}]*version\s*=\s*"=([^"]+)"', root, re.M):
    add(v, f"Cargo.toml: {name} = pin")
for crate in sorted(pathlib.Path("crates").glob("*/Cargo.toml")):
    text = crate.read_text()
    if not re.search(r"^version\.workspace\s*=\s*true", text, re.M):
        add(toml_version(crate), f"{crate}: version (not version.workspace)")
for f in ["jubarte-python/Cargo.toml", "jubarte-wasm/Cargo.toml",
          "jubarte-rust-inproc/Cargo.toml", "jubarte-python/compat/pyproject.toml"]:
    add(toml_version(f), f"{f}: version")
compat = pathlib.Path("jubarte-python/compat/pyproject.toml").read_text()
for extra, v in re.findall(r'jubarte-docx(\[mcp\])?==([0-9][^"]*)"', compat):
    add(v, f"jubarte-python/compat/pyproject.toml: jubarte-docx{extra}== pin")
for f in ["jubarte-wasm/npm/package.json", "jubarte-wasm/cli/package.json", "gemini-extension.json"]:
    add(json.loads(pathlib.Path(f).read_text())["version"], f"{f}: version")
cli = json.loads(pathlib.Path("jubarte-wasm/cli/package.json").read_text())
add(cli.get("dependencies", {}).get("jubarte-wasm", "").lstrip("^~="), "jubarte-wasm/cli/package.json: jubarte-wasm dependency")
for v in re.findall(r"badge\.socket\.dev/cargo/package/jubarte/([0-9][0-9A-Za-z.+-]*)", pathlib.Path("README.md").read_text()):
    add(v, "README.md: Socket badge")
members = {"jubarte", "jubarte-docx", "jubarte-wasm", "jubarte-rust-inproc"} | {
    p.parent.name for p in pathlib.Path("crates").glob("*/Cargo.toml")}
for lock in ["Cargo.lock", "jubarte-python/Cargo.lock", "jubarte-wasm/Cargo.lock", "jubarte-rust-inproc/Cargo.lock"]:
    p = pathlib.Path(lock)
    if not p.exists():
        continue
    for name, v in re.findall(r'^\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"\n(?!source)', p.read_text(), re.M):
        if name in members or name.startswith("jubarte"):
            add(v, f"{lock}: {name}")
readmes = ["README.crates.md", "jubarte-python/README.md", "jubarte-wasm/npm/README.md",
           "jubarte-wasm/cli/README.md"] + [str(p) for p in sorted(pathlib.Path("crates").glob("*/README.md"))]
for f in readmes:
    p = pathlib.Path(f)
    if p.exists():
        m = re.search(r"Generated by scripts/library_readmes\.py from \S+ for v([0-9][^ ]*) ", p.read_text())
        if m:
            add(m.group(1), f"{f}: generated for")
for v, w in out:
    print(f"{v or '?'}\t{w}")
PY
}

# Fail unless every place names one version — $1 when given.
one_version() {
  local want=${1:-} report versions
  report=$(version_report) || die "cannot read the version-bearing files"
  versions=$(printf '%s\n' "$report" | cut -f1 | sort -u)
  if [ -n "$want" ]; then
    if [ "$versions" != "$want" ]; then
      printf '%s\n' "$report" | awk -F'\t' -v w="$want" '$1 != w { print "        " $1 "  " $2 }' >&2
      die "these files are not on $want (above) — every file carries the same version"
    fi
  elif [ "$(printf '%s\n' "$versions" | wc -l | tr -d ' ')" != 1 ]; then
    printf '%s\n' "$report" | sort | sed 's/^/        /' >&2
    die "the tree names more than one version (above) — bring every file to one version first"
  fi
  printf '%s\n' "$versions"
}

# --- arguments ----------------------------------------------------------------
VER="" SUMMARY="" DRY_RUN=0 YES=0 SKIP_GATES=0 CHECK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --summary) [ $# -ge 2 ] || die "--summary takes the note"; SUMMARY=$2; shift 2 ;;
    --summary=*) SUMMARY=${1#*=}; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes) YES=1; shift ;;
    --skip-gates) SKIP_GATES=1; shift ;;
    --check) CHECK=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) usage; die "unknown flag $1" ;;
    *) [ -z "$VER" ] || die "one version only (got $VER and $1)"; VER=$1; shift ;;
  esac
done

if [ "$CHECK" = 1 ]; then
  version_report | sed 's/^/   /' >&2
  v=$(one_version)
  step "every version-bearing file is on $v"
  exit 0
fi

[ -n "$VER" ] || { usage; die "the version is required: scripts/mini-release.sh X.Y.Z --summary \"…\""; }
[[ "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "$VER is not X.Y.Z (a pre-release goes through scripts/release.sh)"
[ -n "$SUMMARY" ] || die "--summary is required: one sentence every channel gets"
case "$SUMMARY" in *$'\n'*) die "--summary is one line" ;; esac
TAG="v$VER"

# =============================================================================
say "0. Preflight"
# =============================================================================
for t in cargo git gh python3 npm; do
  command -v "$t" >/dev/null || die "$t is not on PATH"
done
command -v bun >/dev/null || command -v node >/dev/null || die "bun or node is needed (bump-version.mjs)"
cargo nextest --version >/dev/null 2>&1 || [ "$SKIP_GATES" = 1 ] \
  || die "cargo-nextest is missing: cargo install --locked cargo-nextest"
step "tools"

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "release from main (now on $(git rev-parse --abbrev-ref HEAD))"
git fetch -q origin main --tags || die "git fetch origin failed"
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
  || die "main is not origin/main — pull or push first (git status -sb)"
[ -z "$(git status --porcelain --untracked-files=no)" ] \
  || die "the tree has uncommitted changes (git status) — commit or stash them"
step "on main, in sync with origin/main, clean"

git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "$TAG already exists"
PREV=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)
if [ -n "$PREV" ]; then
  newest=$(printf '%s\n%s\n' "${PREV#v}" "$VER" | sort -V | tail -1)
  [ "$newest" = "$VER" ] && [ "${PREV#v}" != "$VER" ] || die "$VER is not above the last release $PREV"
fi
step "$TAG is new (last release ${PREV:-none})"

CUR=$(one_version)
step "the tree is on one version: $CUR"

# =============================================================================
say "1. Version sync → $VER"
# =============================================================================
if command -v bun >/dev/null; then
  JUBARTE_RELEASE_SH=1 bun scripts/bump-version.mjs "$VER"
else
  JUBARTE_RELEASE_SH=1 node scripts/bump-version.mjs "$VER"
fi
for f in jubarte-python/Cargo.toml jubarte-wasm/Cargo.toml jubarte-rust-inproc/Cargo.toml; do
  sed -i.bak -E "s/^version = \"[0-9]+\.[0-9]+\.[0-9]+\"$/version = \"$VER\"/" "$f" && rm "$f.bak"
done
sed -i.bak -E -e "s/^version = \"[0-9]+\.[0-9]+\.[0-9]+\"$/version = \"$VER\"/" \
  -e "s/(jubarte-docx(\[mcp\])?)==[0-9]+\.[0-9]+\.[0-9]+\"/\1==$VER\"/g" \
  jubarte-python/compat/pyproject.toml && rm jubarte-python/compat/pyproject.toml.bak
(cd jubarte-wasm/npm && npm pkg set "version=$VER" >/dev/null)
(cd jubarte-wasm/cli && npm pkg set "version=$VER" "dependencies.jubarte-wasm=^$VER" >/dev/null)
step "manifests → $VER"
for d in . jubarte-python jubarte-wasm jubarte-rust-inproc; do
  (cd "$d" && cargo update --offline -q -p jubarte-redlines)
done
step "Cargo.lock ×4 refreshed"
python3 scripts/library_readmes.py --version "$VER" >/dev/null \
  || die "library READMEs: a public API name is undocumented (see above); add it to the fragment"
step "library READMEs cut for $TAG"

# =============================================================================
say "2. One version"
# =============================================================================
one_version "$VER" >/dev/null
step "every version-bearing file is on $VER, none on another"

# =============================================================================
say "3. Changelog"
# =============================================================================
TODAY=$(date -u +%Y-%m-%d)
if grep -E "^## \[$VER\] - [0-9]{4}-[0-9]{2}-[0-9]{2}" CHANGELOG.md >/dev/null; then
  step "## [$VER] already written; the summary goes on top of it"
else
  # Everything under ## [Unreleased] moves into the new section.
  VER="$VER" TODAY="$TODAY" awk '
    !done && $0 == "## [Unreleased]" { print; print ""; print "## [" ENVIRON["VER"] "] - " ENVIRON["TODAY"]; done = 1; next }
    { print }
  ' CHANGELOG.md > .changelog.tmp && mv .changelog.tmp CHANGELOG.md
  grep -E "^## \[$VER\] - $TODAY" CHANGELOG.md >/dev/null \
    || die "CHANGELOG.md has no '## [Unreleased]' heading to cut ## [$VER] from"
fi
VER="$VER" TXT="$SUMMARY" awk '
  BEGIN { st = 0 }
  st == 0 && index($0, "## [" ENVIRON["VER"] "] - ") == 1 { print; st = 1; next }
  st == 1 || st == 2 {
    if ($0 ~ /^[[:space:]]*$/) next
    if (st == 1 && $0 ~ /^> \*\*Summary\.\*\*/) { st = 2; next }
    if (st == 2 && $0 ~ /^>/) next
    printf "\n> **Summary.** %s\n\n", ENVIRON["TXT"]; print; st = 9; next
  }
  { print }
  END { if (st == 1 || st == 2) printf "\n> **Summary.** %s\n", ENVIRON["TXT"] }
' CHANGELOG.md > .changelog.tmp && mv .changelog.tmp CHANGELOG.md
# The section must say more than the summary: release.yml publishes it.
body=$(awk -v h="## [$VER] - " 'index($0, h) == 1 { on = 1; next } on && /^## \[/ { exit } on' CHANGELOG.md \
  | grep -vE '^[[:space:]]*$|^> \*\*Summary\.\*\*' || true)
[ -n "$body" ] || die "## [$VER] holds only the summary — list the changes under ## [Unreleased] (### Fixed …) and rerun"
grep -F "[$VER]: https://github.com/jandira-tech/jubarte/releases/tag/$TAG" CHANGELOG.md >/dev/null || {
  VER="$VER" TAG="$TAG" awk '
    !done && /^\[[0-9]+\.[0-9]+\.[0-9]+\]: https:/ {
      print "[" ENVIRON["VER"] "]: https://github.com/jandira-tech/jubarte/releases/tag/" ENVIRON["TAG"]; done = 1
    }
    { print }
  ' CHANGELOG.md > .changelog.tmp && mv .changelog.tmp CHANGELOG.md
}
step "CHANGELOG.md ## [$VER] dated, summarized, linked"

# =============================================================================
say "4. Notes"
# =============================================================================
toml_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
# [package.metadata.release-notes] "$VER" = "…" (release.sh's toml_release_note).
toml_release_note() {
  local f=$1 esc
  esc=$(toml_escape "$2")
  if grep -F '[package.metadata.release-notes]' "$f" >/dev/null; then
    VER_ESC="$VER" TXT_ESC="$esc" awk '
      BEGIN { key = "\"" ENVIRON["VER_ESC"] "\""; line = key " = \"" ENVIRON["TXT_ESC"] "\"" }
      $0 == "[package.metadata.release-notes]" { intable = 1; print; next }
      intable && index($0, "[") == 1 { if (!wrote) { print line; wrote = 1 } intable = 0; print; next }
      intable && index($0, key " =") == 1 { if (!wrote) { print line; wrote = 1 } next }
      { print }
      END { if (intable && !wrote) print line }
    ' "$f" > "$f.tmp"
  else
    VER_ESC="$VER" TXT_ESC="$esc" awk '
      BEGIN { line = "\"" ENVIRON["VER_ESC"] "\" = \"" ENVIRON["TXT_ESC"] "\"" }
      $0 == "[package]" { inpkg = 1; print; next }
      inpkg && index($0, "[") == 1 { print ""; print "[package.metadata.release-notes]"; print line; print ""; inpkg = 0 }
      { print }
    ' "$f" > "$f.tmp"
  fi
  mv "$f.tmp" "$f"
}
toml_release_note Cargo.toml "$SUMMARY"
toml_release_note jubarte-python/Cargo.toml "$SUMMARY"
VER="$VER" TXT="$SUMMARY" node -e '
  const fs = require("fs");
  const f = "jubarte-wasm/npm/package.json";
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  (j.releaseNotes ||= {})[process.env.VER] = process.env.TXT;
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
'
if grep -E "^# release-notes v$VER " jubarte-python/pyproject.toml >/dev/null; then
  VER="$VER" TXT="$SUMMARY" awk '
    index($0, "# release-notes v" ENVIRON["VER"] " ") == 1 { print "# release-notes v" ENVIRON["VER"] " — " ENVIRON["TXT"]; next }
    { print }
  ' jubarte-python/pyproject.toml > .rel.tmp && mv .rel.tmp jubarte-python/pyproject.toml
else
  VER="$VER" TXT="$SUMMARY" awk '
    !done && /^description = "/ { print; print "# release-notes v" ENVIRON["VER"] " — " ENVIRON["TXT"]; done = 1; next }
    { print }
  ' jubarte-python/pyproject.toml > .rel.tmp && mv .rel.tmp jubarte-python/pyproject.toml
fi
for f in Cargo.toml jubarte-python/Cargo.toml; do
  grep -F "\"$VER\" = \"$(toml_escape "$SUMMARY")\"" "$f" >/dev/null || die "the release note failed to land in $f"
done
grep -F "# release-notes v$VER — $SUMMARY" jubarte-python/pyproject.toml >/dev/null \
  || die "the release note failed to land in jubarte-python/pyproject.toml"
step "summary in Cargo.toml, jubarte-python/{Cargo,pyproject}.toml, jubarte-wasm/npm/package.json"
# Writing the notes must not have moved a version.
one_version "$VER" >/dev/null

# =============================================================================
if [ "$SKIP_GATES" = 0 ]; then
  say "5. Gates (sequential cargo, per AGENTS.md)"
  cargo fmt --all --check
  cargo clippy --workspace --all-targets -- -D warnings
  cargo nextest run
  step "fmt, clippy -D warnings, nextest"
else
  say "5. Gates skipped (--skip-gates)"
fi

if [ "$DRY_RUN" = 1 ]; then
  say "Dry run: nothing committed, tagged or pushed"
  git status --short >&2
  printf '\nReset with: git checkout -- . && git clean -n (review before -f)\n' >&2
  exit 0
fi

# =============================================================================
say "6. Commit, tag, push"
# =============================================================================
git add -u
git add -- README.crates.md crates/*/README.md jubarte-python/README.md \
  jubarte-wasm/npm/README.md jubarte-wasm/cli/README.md 2>/dev/null || true
git commit -q -m "chore(release): $TAG" -m "$SUMMARY"
git tag -a "$TAG" -m "jubarte $TAG" -m "$SUMMARY"
step "commit $(git rev-parse --short HEAD) and annotated tag $TAG"

if [ "$YES" = 0 ]; then
  printf '\nPoint of no return: pushing main and %s starts release.yml, which publishes\ncrates.io, npm and PyPI. Type %s to continue: ' "$TAG" "$TAG" >&2
  read -r answer
  [ "$answer" = "$TAG" ] || die "not confirmed — the commit and tag stay local (git tag -d $TAG; git reset --hard HEAD~1 to undo)"
fi
# shellcheck source=scripts/push_main.sh
. scripts/push_main.sh
push_main "release/$TAG" "chore(release): $TAG" "$SUMMARY"
git push origin "$TAG"
step "main and $TAG pushed — release.yml builds and publishes"
printf '\nFollow it: gh run list -R jandira-tech/jubarte --workflow release.yml --branch %s\n' "$TAG" >&2
