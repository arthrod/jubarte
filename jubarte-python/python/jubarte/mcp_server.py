# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0

"""``jubarte-mcp``: the Document facade as MCP tools over stdio.

Every path argument must resolve under ``--root`` (default: the current
directory); outputs are files under it, and their paths are returned, never
their bytes. No tool replaces an existing file unless ``overwrite`` is true.
Install with ``pip install 'jubarte-docx[mcp]'`` or run with
``uvx --from 'jubarte-docx[mcp]' jubarte-mcp --root .``.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import stat
import sys
from collections.abc import Generator, Sequence
from dataclasses import asdict
from datetime import datetime, timezone
from importlib import resources
from pathlib import Path
from typing import Any, Literal

try:
    from mcp.server import MCPServer
    from mcp.server.mcpserver.exceptions import ToolError
    from mcp.types import CallToolResult, TextContent, ToolAnnotations
except ImportError as exc:  # pragma: no cover - exercised only without the extra
    raise ImportError("jubarte-mcp needs the MCP SDK: pip install 'jubarte-docx[mcp]'") from exc

from ._native import JubarteError, __version__
from .document import Document, EditPlanError, capabilities
from .models import CompareOptions

INSTRUCTIONS = (
    "jubarte reads and edits Word .docx files under the server root. "
    "Read first: docx_text gives the agent view: Markdown with a <!-- pN --> "
    "id line before each paragraph, revisions and comments with their ids. "
    "Edit with docx_edit: a JSON plan of exact, anchored operations; it writes "
    "a clean copy and a Word redline under out_dir and refuses the whole plan "
    "if any anchor fails. Check results with docx_render (PNG pages) and "
    "docx_changes. Every path must be under the server root; outputs never "
    "replace existing files unless overwrite is true.\n\n"
    "Other tools: docx_inspect (paragraph ids, styles, limitations), "
    "docx_compare (two files into a tracked-changes redline), docx_accept and "
    "docx_reject (resolve tracked changes by id, author or kind), "
    "docx_capabilities (what this build supports), docx_validate, "
    "docx_comments and docx_audit (available when the engine build has them). "
    "docx_view shows a document, or lists the root's documents, in hosts that "
    "draw MCP Apps."
)

_READ = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
_WRITE = ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
_RESOLVE_ACTIONS = frozenset({"accept", "reject"})
_PLAN_LIMIT = 1024 * 1024

# The MCP Apps card (SEP-1865): one self-contained HTML file built by
# jubarte-mcp-ui into this package. Hosts that draw MCP Apps show it for the
# tools whose `_meta.ui.resourceUri` names it; others ignore the metadata and
# read the tools' text as before.
UI_URI = "ui://jubarte/document.html"
UI_MIME = "text/html;profile=mcp-app"
_CARD = {"ui": {"resourceUri": UI_URI}}
# Tools that write: a view never calls them, only the model (#5, R1).
_MODEL_ONLY = {"ui": {"visibility": ["model"]}}
_CARD_MODEL_ONLY = {"ui": {"resourceUri": UI_URI, "visibility": ["model"]}}
# docx_preview is the card's own read; hosts hide it from the model.
_APP_ONLY = {"ui": {"visibility": ["app"]}}
# Antigravity also offers docx_view as a side-panel tab and a full page; a
# manual launch passes `{}`, which lists the root's documents.
_VIEW_META = {
    "ui": {"resourceUri": UI_URI},
    "com.google.antigravity/ui": {"entrypoints": ["aux_pane", "global"], "title": "Jubarte"},
}
# The serialized UTF-8 JSON of one preview; hosts persist tool results of a
# few MiB at most.
_PREVIEW_LIMIT = 2 * 1024 * 1024
# A picture's reference definition as the engine writes it. The card draws a
# picture as a chip whose tooltip is this address, so it is sent its type and
# size, not its bytes (a document's pictures can pass the limit alone).
_IMAGE_DEFINITION = re.compile(r"^(\[[^\]\n]+\]: )<data:([\w.+-]+/[\w.+-]+);base64,([A-Za-z0-9+/=]*)>", re.M)
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")


def _image_stand_ins(markdown: str) -> str:
    """`[image1]: <data:image/png;base64,…>` as `[image1]: <image/png, 412 KB>`.

    Only a definition outside fenced code: inside one the shape is the
    document's text, and the card draws it as written (#31).
    """

    def stand_in(found: re.Match[str]) -> str:
        payload = found.group(3)
        size = len(payload) * 3 // 4 - payload[-2:].count("=")
        return f"{found.group(1)}<{found.group(2)}, {round(size / 1024)} KB>"

    out: list[str] = []
    fence: str | None = None
    # Lines end at \n only, as the Markdown reader reads them; str.splitlines would
    # also end one at U+2028, U+2029 or U+0085 inside a code line (#91).
    for line in re.split(r"(?<=\n)", markdown):
        opener = _FENCE.match(line.rstrip("\r\n"))
        if fence is None:
            if opener and not (opener.group(1)[0] == "`" and "`" in opener.group(2)):
                fence = opener.group(1)
            else:
                line = _IMAGE_DEFINITION.sub(stand_in, line)
        elif (
            opener
            and opener.group(1)[0] == fence[0]
            and len(opener.group(1)) >= len(fence)
            and not opener.group(2).strip()
        ):
            fence = None
        out.append(line)
    return "".join(out)


# docx_view's listing: files returned, directory entries visited, depth.
_LIST_FILES = 200
_LIST_VISITS = 5000
_LIST_DEPTH = 6
_LIST_SKIP = frozenset({".scratch", "node_modules", "target", "__pycache__"})


def resolve_action(action: str) -> str:
    """The only document methods ``docx_accept`` and ``docx_reject`` may call."""
    if action not in _RESOLVE_ACTIONS:
        raise ToolError(f"invalid action {action!r}")
    return action


def _plain(value: Any) -> Any:
    """Dataclasses, tuples and lists as JSON-ready values."""
    if hasattr(value, "__dataclass_fields__"):
        return {k: v for k, v in asdict(value).items() if not k.startswith("_")}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    return value


def revision_kinds(changes: Sequence[Any]) -> dict[str, str]:
    """`{story}:rev:{w:id}` to `moveins`/`movedel` for every moved run the
    engine reports, in every story: the map jubarte-app's desk gives its
    reader, which renders moves as plain ins/del without it. The engine
    reads the package as XML does (comments, processing instructions,
    namespaces, entities) and finds each story through its relationship
    (#55), so this map is the engine's, not a scan of the text."""
    kinds: dict[str, str] = {}
    for change in changes:
        if change.kind != "move" or change.move_side not in ("from", "to"):
            continue
        kind = "moveins" if change.move_side == "to" else "movedel"
        for ident in _canonical_ids(change.id):
            kinds[ident] = kind
    return kinds


def move_kinds(docx: bytes) -> dict[str, str]:
    """`revision_kinds` of a package's changes."""
    return revision_kinds(Document(docx).changes())


def _canonical_ids(ident: str) -> list[str]:
    """The reader's `{story}:rev:{w:id}` keys for an engine change id:
    `r7` and `r7+8` in the body, `footnotes.r3` in a story, a long id
    `notes-custom:rev:7` as it is."""
    if ":rev:" in ident:
        return [ident]
    story = _story(ident)
    short = ident.rsplit(".", 1)[-1] if "." in ident else ident
    return [f"{story}:rev:{wid}" for wid in short.removeprefix("r").split("+")]


def _story(ident: str) -> str:
    """The story a change id names: `footnotes.r7` and `header1.r3` by
    their stem, a long id `header.a:rev:4` by what comes before `:rev:`,
    a bare `r7` the body."""
    if ":rev:" in ident:
        return ident.rsplit(":rev:", 1)[0]
    return ident.rsplit(".", 1)[0] if "." in ident else "body"


def change_counts(changes: Sequence[Any]) -> dict[str, int]:
    """The desk's four chips from docx_changes: a replacement is one
    insertion and one deletion; both sides of a move count once."""
    counts = {"inserted": 0, "deleted": 0, "moved": 0, "formatted": 0}
    moves: set[str] = set()
    for change in changes:
        kind = change.kind
        if kind in ("insertion", "replacement"):
            counts["inserted"] += 1
        if kind in ("deletion", "replacement"):
            counts["deleted"] += 1
        if kind == "formatting":
            counts["formatted"] += 1
        if kind == "move":
            # Word names moves per story: a body move1 and a footnote move1
            # are two moves. A change id carries its story (`footnotes.r7`).
            moves.add(f"{_story(change.id)}\0{change.move_name}" if change.move_name else change.id)
    counts["moved"] = len(moves)
    return counts


# Whether a folder can be opened below another by descriptor, refusing links.
_FD_WALK = os.open in os.supports_dir_fd and os.scandir in os.supports_fd and hasattr(os, "O_NOFOLLOW")


def _open_below(top: int, rel: str) -> int | None:
    """A descriptor for `rel` under the folder `top`, opened one component
    at a time without following a link; None when any step fails."""
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    current = os.dup(top)
    for part in rel.split("/") if rel else []:
        try:
            child = os.open(part, flags, dir_fd=current)
        except OSError:
            os.close(current)
            return None
        os.close(current)
        current = child
    return current


@contextlib.contextmanager
def _scan(root: Path, top: int | None, rel: str) -> Generator[Any]:
    """os.scandir of folder `rel`: by descriptor where the platform allows,
    otherwise by path after checking the folder's real path is inside root.
    The folder's descriptor stays open while its entries are read (their
    stat goes through it) and is closed on exit: os.scandir works on a
    duplicate and never closes it."""
    if top is None:
        folder = root / rel
        real = folder.resolve()
        if real != root and root not in real.parents:
            raise NotADirectoryError(rel)
        with os.scandir(folder) as it:
            yield it
        return
    fd = _open_below(top, rel)
    if fd is None:
        raise NotADirectoryError(rel)
    try:
        with os.scandir(fd) as it:
            yield it
    finally:
        os.close(fd)


def list_documents(root: Path) -> tuple[list[dict[str, Any]], bool]:
    """The .docx files under root, sorted, within the listing's budgets.

    root is opened once, refusing a link, and every folder below it is
    reopened from that descriptor one component at a time with
    O_NOFOLLOW, so a folder swapped for a link after it was listed stays
    shut and the walk cannot leave root. Entries are counted as they are
    read, so a wide folder is read only up to the budget. File links are
    skipped; unreadable folders are passed over. Where folders cannot be
    opened by descriptor (Windows), each folder's real path is checked
    against root just before it is read."""
    files: list[dict[str, Any]] = []
    visits = 0
    truncated = False
    top: int | None = None
    if _FD_WALK:
        try:
            top = os.open(root, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | os.O_NOFOLLOW)
        except OSError:
            return files, False
    try:
        pending: list[tuple[str, int]] = [("", 0)]
        while pending:
            rel, depth = pending.pop(0)
            entries: list[Any] = []
            spent = False
            try:
                with _scan(root, top, rel) as it:
                    for entry in it:
                        visits += 1
                        if visits > _LIST_VISITS:
                            spent = True
                            break
                        try:
                            entries.append((entry.name, entry.stat(follow_symlinks=False)))
                        except OSError:
                            # Gone (or unreadable) since the folder was read: skip it alone.
                            continue
            except OSError:
                continue
            subfolders: list[tuple[str, int]] = []
            for name, st in sorted(entries, key=lambda e: e[0]):
                if name.startswith((".", "~$")) or name in _LIST_SKIP:
                    continue
                path = f"{rel}/{name}" if rel else name
                if stat.S_ISDIR(st.st_mode):
                    if depth + 1 < _LIST_DEPTH:
                        subfolders.append((path, depth + 1))
                    else:
                        truncated = True
                elif stat.S_ISREG(st.st_mode) and name.lower().endswith(".docx"):
                    if len(files) >= _LIST_FILES:
                        files.sort(key=lambda f: f["path"])
                        return files, True
                    files.append(
                        {
                            "path": path,
                            "size": st.st_size,
                            "modified": datetime.fromtimestamp(st.st_mtime, timezone.utc).strftime(
                                "%Y-%m-%dT%H:%M:%SZ"
                            ),
                        }
                    )
            if spent:
                # What the folder gave before the budget ran out is listed; no more.
                truncated = True
                break
            pending[:0] = subfolders
    finally:
        if top is not None:
            os.close(top)
    files.sort(key=lambda f: f["path"])
    return files, truncated


def _card_html() -> str:
    """The built card; a source checkout that never ran the UI build says so."""
    try:
        return resources.files("jubarte").joinpath("ui/document.html").read_text(encoding="utf-8")
    except FileNotFoundError:  # pragma: no cover - the wheel always ships it
        return "<!doctype html><title>Jubarte</title><p>The document card was not built (jubarte-mcp-ui).</p>"


def build_server(*, root: Path) -> MCPServer:
    """An MCP server whose tools only touch files under ``root``."""
    root = Path(root).expanduser().resolve()
    from . import _native

    authority = _native._OutputRoot(str(root))
    mcp = MCPServer("jubarte", instructions=INSTRUCTIONS, version=__version__)

    def contained(path: str) -> Path:
        # resolve() follows symlinks, so a link pointing out of root is refused.
        p = (root / Path(path).expanduser()).resolve()
        if not p.is_relative_to(root):
            raise ToolError("path is outside root directory")
        # Keep the lexical path for capability-relative operations; resolving
        # is only an early diagnostic, never the authorization for actual I/O.
        # The lexical path must lie under root too: an outside link that
        # resolves inside it has no root-relative name to open.
        lexical = root / Path(path).expanduser()
        if not lexical.is_relative_to(root):
            raise ToolError("path is outside root directory")
        return lexical

    def load(path: str) -> Document:
        p = contained(path)
        try:
            return Document(authority.read(p.relative_to(root).as_posix()), p.name)
        except OSError as e:
            # The OS's own wording (strerror) is not repeated: errors name
            # neither the server's files nor its OS (#2355).
            raise ToolError(f"cannot read file {path}") from e

    def fresh(path: Path, overwrite: bool) -> Path:
        # An output may itself be a symlink (dangling ones report exists() False);
        # resolve it so a write can never follow a link out of root.
        target = path.resolve()
        if not target.is_relative_to(root):
            raise ToolError("path is outside root directory")
        if path.exists() and not overwrite:
            raise ToolError("file exists; pass overwrite=true to replace it")
        return path

    def publish(files: list[tuple[Path, bytes | str]], overwrite: bool) -> None:
        try:
            authority.publish(
                [
                    (path.relative_to(root).as_posix(), data.encode("utf-8") if isinstance(data, str) else data)
                    for path, data in files
                ],
                overwrite,
            )
        except (OSError, ValueError) as e:
            raise ToolError("outside root or unsafe/unwritable output") from e

    def write(path: Path, data: bytes | str, overwrite: bool) -> str:
        publish([(path, data)], overwrite)
        return str(path)

    def engine(call: Any) -> Any:
        """Run an engine call, turning its errors into messages the model sees."""
        try:
            return call()
        except EditPlanError:
            raise  # docx_edit reports it with its code and outcomes
        except (JubarteError, ValueError, TypeError, OSError) as e:
            raise ToolError(str(e)) from e

    def missing(feature: str) -> ToolError:
        return ToolError(f"this engine build lacks {feature}; upgrade jubarte-docx")

    @mcp.tool(annotations=_READ)
    def docx_capabilities() -> dict[str, Any]:
        """What this engine build can do: operations, edit kinds, limits, runtime."""
        return capabilities()

    @mcp.tool(annotations=_READ, meta=_CARD)
    def docx_text(path: str) -> str:
        """The agent view `jubarte read` prints: a header (sha256, counts, page
        setup), then Markdown with a <!-- pN --> id line before each paragraph
        and every revision (r12) and comment (c5) with its id.

        Those ids are the coordinates an edit plan uses (`p12` as written).
        Read before you edit. Warnings follow the view, one per line.
        """
        from . import _native

        doc = load(path)
        markdown, warnings = engine(lambda: _native.read_view(doc.to_bytes(), source=Path(path).name))
        return markdown + "".join(f"warning: {w}\n" for w in warnings)

    @mcp.tool(annotations=_READ)
    def docx_inspect(path: str) -> dict[str, Any]:
        """The engine snapshot: summary, paragraphs with ids, styles, runs and limitations, stories."""
        doc = load(path)
        return json.loads(engine(doc.inspect_json))

    @mcp.tool(annotations=_WRITE, meta=_CARD_MODEL_ONLY)
    def docx_edit(
        path: str,
        plan: dict[str, Any],
        out_dir: str,
        pdf: bool = False,
        png_dpi: float | None = None,
        overwrite: bool = False,
    ) -> dict[str, Any]:
        """Apply an edit plan to path; write clean.docx, redline.docx, patch.diff and report.json under out_dir.

        plan is {"schema_version": 1, "author": ..., "operations": [...]}; each
        operation names a paragraph id from docx_text and exact text. The whole
        plan is refused, with nothing written, if any operation cannot resolve;
        the error carries the engine code and every operation's outcome. With
        pdf or png_dpi the redline is also rendered to redline.pdf and
        redline-page-NN.png. Existing files are kept unless overwrite is true.
        """
        # The plan's real size: escaped JSON would count a CJK character
        # as six bytes and refuse plans far under the limit.
        if len(json.dumps(plan, ensure_ascii=False).encode()) > _PLAN_LIMIT:
            raise ToolError("Edit plan exceeds 1MB limit")
        doc = load(path)
        out = contained(out_dir)
        try:
            result = engine(lambda: doc.edit(plan))
        except EditPlanError as e:
            raise ToolError(
                json.dumps(
                    {
                        "code": e.code,
                        "operation": e.operation,
                        "message": e.message,
                        "outcomes": _plain(e.outcomes),
                    }
                )
            ) from e
        names = ["clean.docx", "redline.docx", "patch.diff", "report.json"]
        rendered = None
        if pdf or png_dpi:
            rendered = engine(lambda: result.redline.render(pdf=pdf, png_dpi=png_dpi))
            if rendered.pdf is not None:
                names.append("redline.pdf")
            names += [f"redline-page-{i:02d}.png" for i in range(1, len(rendered.pngs) + 1)]
        for name in names:  # check every output before writing any
            fresh(out / name, overwrite)
        report = json.loads(result.report._json) if result.report._json else _plain(result.report)
        files: list[tuple[Path, bytes | str]] = [
            (out / "clean.docx", result.clean.to_bytes()),
            (out / "redline.docx", result.redline.to_bytes()),
            (out / "patch.diff", str(result.diff)),
            (out / "report.json", json.dumps(report, indent=2)),
        ]
        written: dict[str, Any] = {
            "clean": str(out / "clean.docx"),
            "redline": str(out / "redline.docx"),
            "patch": str(out / "patch.diff"),
            "report_path": str(out / "report.json"),
            "report": report,
            "pages": [],
        }
        if rendered is not None:
            if rendered.pdf is not None:
                files.append((out / "redline.pdf", rendered.pdf))
                written["pdf"] = str(out / "redline.pdf")
            for i, png in enumerate(rendered.pngs, start=1):
                page = out / f"redline-page-{i:02d}.png"
                files.append((page, png))
                written["pages"].append(str(page))
        publish(files, overwrite)
        return written

    @mcp.tool(annotations=_WRITE, meta=_MODEL_ONLY)
    def docx_render(
        path: str,
        out_dir: str,
        dpi: float = 96,
        pages: list[int] | None = None,
        pdf: bool = False,
        overwrite: bool = False,
    ) -> dict[str, Any]:
        """Render path to page-NN.png files (and render.pdf when pdf is true) under out_dir.

        pages selects 1-based pages to write (default all). Returns the file
        paths, the page count and the text painted on each page.
        """
        doc = load(path)
        out = contained(out_dir)
        rendered = engine(lambda: doc.render(pdf=pdf, png_dpi=dpi))
        wanted = [(i, png) for i, png in enumerate(rendered.pngs, start=1) if pages is None or i in pages]
        targets = [out / f"page-{i:02d}.png" for i, _ in wanted]
        if rendered.pdf is not None:
            targets.append(out / "render.pdf")
        for target in targets:
            fresh(target, overwrite)
        files = [(out / f"page-{i:02d}.png", png) for i, png in wanted]
        result: dict[str, Any] = {
            "page_count": rendered.report.page_count,
            "pages": [str(path) for path, _ in files],
            "text": [p.text for p in rendered.report.pages],
            "fonts": _plain(rendered.report.fonts),
        }
        if rendered.pdf is not None:
            files.append((out / "render.pdf", rendered.pdf))
            result["pdf"] = str(out / "render.pdf")
        publish(files, overwrite)
        return result

    @mcp.tool(annotations=_WRITE, meta=_CARD_MODEL_ONLY)
    def docx_compare(
        original: str,
        modified: str,
        out: str,
        author: str,
        date: str | None = None,
        overwrite: bool = False,
    ) -> dict[str, Any]:
        """Compare original with modified into a tracked-changes redline written to out.

        author signs every change; date is an ISO-8601 timestamp with an offset
        (default: now, UTC, as the CLI). Returns out and the change list.
        """
        a, b = load(original), load(modified)
        target = fresh(contained(out), overwrite)
        when = date if date is not None else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        options = engine(lambda: CompareOptions(date=when))
        redline = engine(lambda: a.compare(b, author=author, options=options))
        return {"out": write(target, redline.to_bytes(), overwrite), "changes": _plain(engine(redline.changes))}

    @mcp.tool(annotations=_READ)
    def docx_changes(path: str) -> list[dict[str, Any]]:
        """Every tracked change in path, with the id docx_accept and docx_reject select by."""
        doc = load(path)
        return _plain(engine(doc.changes))

    def resolve(
        action: str,
        path: str,
        out: str,
        ids: Sequence[str] | None,
        authors: Sequence[str] | None,
        kinds: Sequence[str] | None,
        overwrite: bool,
    ) -> dict[str, Any]:
        doc = load(path)
        target = fresh(contained(out), overwrite)
        method = getattr(doc, resolve_action(action))
        result = engine(lambda: method(ids=ids, authors=authors, kinds=kinds))
        return {"out": write(target, result.to_bytes(), overwrite), "remaining": len(engine(result.changes))}

    @mcp.tool(annotations=_WRITE, meta=_MODEL_ONLY)
    def docx_accept(
        path: str,
        out: str,
        ids: list[str] | None = None,
        authors: list[str] | None = None,
        kinds: list[str] | None = None,
        overwrite: bool = False,
    ) -> dict[str, Any]:
        """Accept tracked changes in path and write the result to out.

        With no selection every change is accepted. ids (from docx_changes),
        authors and kinds (insertion, deletion, move, formatting) select the
        changes matching every list given; the rest stay tracked.
        """
        return resolve("accept", path, out, ids, authors, kinds, overwrite)

    @mcp.tool(annotations=_WRITE, meta=_MODEL_ONLY)
    def docx_reject(
        path: str,
        out: str,
        ids: list[str] | None = None,
        authors: list[str] | None = None,
        kinds: list[str] | None = None,
        overwrite: bool = False,
    ) -> dict[str, Any]:
        """Reject tracked changes in path and write the result to out (selection as docx_accept)."""
        return resolve("reject", path, out, ids, authors, kinds, overwrite)

    @mcp.tool(annotations=_READ)
    def docx_validate(
        path: str, original: str | None = None, author: str | None = None, rules: list[str] | None = None
    ) -> list[dict[str, Any]]:
        """Findings in one shape (code, set, severity, part, location, ref, message, word_fatal, repairable; ref is the short id the CLI prints for location). By default the Word-validity set: what would make Word refuse or repair path. With original and author, also the edits set: every edit against original must be a tracked change by author. rules picks sets (word, edits, a11y, style, structure) or audit codes."""
        doc = load(path)
        base = load(original) if original is not None else None
        if not hasattr(Document, "validate"):
            raise missing("validate")
        if (base is None) != (author is None):
            raise ToolError("original and author go together")
        if not rules:
            findings = list(engine(doc.validate))
            if base is not None and author is not None:
                findings.extend(engine(lambda: doc.audit_tracked(base, author=author)))
            return _plain(findings)
        from . import _native

        jsonl, _text, _failed = engine(
            lambda: _native.validate_run(
                doc.to_bytes(), rules=rules, original=None if base is None else base.to_bytes(), author=author
            )
        )
        return [json.loads(line) for line in jsonl.splitlines()]

    @mcp.tool(annotations=_READ)
    def docx_comments(path: str) -> list[dict[str, Any]]:
        """Comment records in path: id, author, date, anchor and text."""
        doc = load(path)
        if not hasattr(Document, "comments"):
            raise missing("comments")
        return _plain(engine(doc.comments))

    @mcp.tool(annotations=_READ)
    def docx_audit(path: str, rules: list[str] | None = None) -> list[dict[str, Any]]:
        """Accessibility, style and structure findings for path, each with its paragraph id; rules names rule sets (a11y, style, structure) or codes (default: every rule)."""
        doc = load(path)
        if not hasattr(Document, "audit"):
            raise missing("audit")
        return _plain(engine(lambda: doc.audit(rules=rules)))

    # -- the MCP Apps card ------------------------------------------------

    @mcp.resource(
        UI_URI,
        name="jubarte-document",
        title="Jubarte document",
        description="The document card: paginated pages with tracked changes, the Tracked/Original/Accepted views and discussions.",
        mime_type=UI_MIME,
        meta={"ui": {"csp": {}, "prefersBorder": True}},
    )
    def document_card() -> str:
        return _card_html()

    def relative(p: Path) -> str:
        return p.relative_to(root).as_posix()

    @mcp.tool(annotations=_READ, meta=_VIEW_META)
    def docx_view(path: str | None = None) -> CallToolResult:
        """Show a .docx file as pages, with its tracked changes and comments, in hosts that draw MCP Apps.

        With no path, list the .docx files under the root (at most 200) so the
        user can pick one. Hosts without MCP Apps get the same as text; read
        a document's content with docx_text.
        """
        if path is None or path == "":
            files, truncated = list_documents(root)
            lines = [f["path"] for f in files]
            more = " (more files exist; name one with path)" if truncated else ""
            text = (
                f"{len(files)} .docx files under the root{more}:\n" + "\n".join(lines)
                if files
                # A spent budget is not proof of absence (#64).
                else "The search stopped before it found a .docx file (too many entries under the root); "
                "name a file with path."
                if truncated
                else "No .docx files under the root."
            )
            return CallToolResult(
                content=[TextContent(type="text", text=text)],
                structured_content={"files": files, "truncated": truncated},
            )
        doc = load(path)
        p = contained(path)
        changes = engine(doc.changes)
        counts = change_counts(changes)
        summary = ", ".join(f"{n} {k}" for k, n in counts.items() if n) or "no tracked changes"
        return CallToolResult(
            content=[TextContent(type="text", text=f"Showing {relative(p)}: {summary}. Read it with docx_text.")],
            structured_content={"path": relative(p)},
        )

    @mcp.tool(annotations=_READ, meta=_APP_ONLY)
    def docx_preview(path: str, view: Literal["tracked", "accepted", "original"] = "tracked") -> CallToolResult:
        """The document card's own read (hidden from the model in MCP Apps hosts): Markdown for the paginated reader, move kinds and change counts; `view` accepted or original is the engine's own accept or reject of every change. A model should call docx_text instead."""
        from . import _native

        doc = load(path)
        p = contained(path)
        data = doc.to_bytes()
        track = {"tracked": None, "accepted": "accept", "original": "reject"}[view]
        markdown, warnings = engine(lambda: _native.read_view(data, track_changes=track, page_markers=False))
        markdown = _image_stand_ins(markdown)
        changes = engine(doc.changes)
        preview = {
            "path": relative(p),
            "name": p.name,
            "sha256": engine(lambda: _native.source_sha256(data)),
            "view": view,
            "markdown": markdown,
            "warnings": list(warnings),
            "revision_kinds": revision_kinds(changes) if view == "tracked" else {},
            "counts": change_counts(changes),
        }
        if len(json.dumps(preview, ensure_ascii=False).encode()) > _PREVIEW_LIMIT:
            raise ToolError(f"{p.name} is too large to preview; read it with docx_text")
        c = preview["counts"]
        text = f"{p.name}: {c['inserted']} inserted, {c['deleted']} deleted, {c['moved']} moved, {c['formatted']} formatted."
        return CallToolResult(content=[TextContent(type="text", text=text)], structured_content=preview)

    return mcp


def main(argv: list[str] | None = None) -> int:
    """Serve the tools over stdio until the client closes the stream."""
    parser = argparse.ArgumentParser(prog="jubarte-mcp", description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="directory every path must sit under")
    args = parser.parse_args(argv)
    root = args.root.expanduser().resolve()
    if not root.is_dir():
        parser.error(f"--root {args.root} is not a directory")
    build_server(root=root).run(transport="stdio")
    return 0


if __name__ == "__main__":
    sys.exit(main())
