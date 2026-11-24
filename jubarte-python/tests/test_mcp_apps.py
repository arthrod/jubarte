# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0

"""jubarte-mcp as an MCP App: the document card resource, docx_view and
the app-only docx_preview it reads documents through."""

from __future__ import annotations

import os
import time
from importlib import resources
from io import BytesIO
from pathlib import Path
from typing import Any
from zipfile import ZipFile, ZipInfo

import pytest

pytest.importorskip("mcp")
import anyio
from jubarte import _native
from jubarte import mcp_server as server
from jubarte.mcp_server import UI_MIME, UI_URI, build_server
from mcp import Client
from test_document import W, make_document

MODEL_ONLY = {"docx_edit", "docx_render", "docx_compare", "docx_accept", "docx_reject"}
CARDS = {"docx_text", "docx_compare", "docx_edit", "docx_view"}


def session(root: Path, go: Any) -> Any:
    async def run() -> Any:
        async with Client(build_server(root=root)) as client:
            return await go(client)

    return anyio.run(run)


def call(root: Path, *calls: tuple[str, dict[str, Any]]) -> list[Any]:
    return session(root, lambda c: _all(c, calls))


async def _all(client: Any, calls: Any) -> list[Any]:
    return [await client.call_tool(name, args) for name, args in calls]


def tools(root: Path) -> dict[str, Any]:
    async def go(client: Any) -> Any:
        return {t.name: t for t in (await client.list_tools()).tools}

    return session(root, go)


def ui_meta(tool: Any) -> dict[str, Any]:
    return (tool.meta or {}).get("ui", {})


def package(body: str, notes: dict[str, str] | None = None) -> bytes:
    """A minimal package whose body is `body` (inner XML of w:body)."""
    overrides = '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    parts = {
        "[Content_Types].xml": (
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            f"{overrides}</Types>"
        ),
        "_rels/.rels": (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            "</Relationships>"
        ),
        "word/document.xml": f'<w:document xmlns:w="{W}"><w:body>{body}<w:sectPr/></w:body></w:document>',
    }
    parts.update(notes or {})
    data = BytesIO()
    with ZipFile(data, "w") as zf:
        for path, content in parts.items():
            zf.writestr(ZipInfo(path), content)
    return data.getvalue()


# A move as Word writes it: named range marks around each side.
MOVE = (
    '<w:p><w:moveFromRangeStart w:id="1" w:author="A" w:date="2026-01-01T00:00:00Z" w:name="move1"/>'
    '<w:moveFrom w:id="7" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:t>Moved clause.</w:t></w:r></w:moveFrom>'
    '<w:moveFromRangeEnd w:id="1"/></w:p>'
    "<w:p><w:r><w:t>Middle.</w:t></w:r></w:p>"
    '<w:p><w:moveToRangeStart w:id="2" w:author="A" w:date="2026-01-01T00:00:00Z" w:name="move1"/>'
    '<w:moveTo w:id="8" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:t>Moved clause.</w:t></w:r></w:moveTo>'
    '<w:moveToRangeEnd w:id="2"/></w:p>'
)


def write_pair(root: Path) -> None:
    (root / "a.docx").write_bytes(make_document("The fee is ten."))
    (root / "b.docx").write_bytes(make_document("The fee is twelve."))


# -- the resource ---------------------------------------------------------


def test_the_card_is_a_resource_read_as_an_mcp_app(tmp_path: Path) -> None:
    async def go(client: Any) -> Any:
        listed = (await client.list_resources()).resources
        read = await client.read_resource(UI_URI)
        return listed, read

    listed, read = session(tmp_path, go)
    assert UI_URI == "ui://jubarte/document.html"
    assert any(str(r.uri) == UI_URI and r.mime_type == UI_MIME for r in listed)
    (item,) = read.contents
    assert str(item.uri) == UI_URI
    assert item.mime_type == UI_MIME == "text/html;profile=mcp-app"
    assert item.text.startswith("<!doctype html>"), item.text[:80]
    assert "Apache-2.0" in item.text[:2048]
    # The host builds the iframe's CSP from the content item, not the listing.
    meta = (item.meta or {}).get("ui", {})
    assert meta.get("prefersBorder") is True
    assert meta.get("csp") == {}


def test_the_card_ships_inside_the_package() -> None:
    html = resources.files("jubarte").joinpath("ui/document.html").read_text(encoding="utf-8")
    assert html.startswith("<!doctype html>")
    assert len(html.encode()) < 3 * 1024 * 1024
    # Nothing in it is fetched: no absolute or protocol-relative asset URLs.
    for needle in (
        'src="http',
        "src='http",
        'href="http',
        "url(http",
        "url(//",
        'src="//',
        "url('/fonts",
        "url(/fonts",
    ):
        assert needle not in html, needle


# -- tool metadata --------------------------------------------------------


def test_the_document_tools_open_the_card(tmp_path: Path) -> None:
    listed = tools(tmp_path)
    for name in CARDS:
        assert ui_meta(listed[name]).get("resourceUri") == UI_URI, name


def test_a_view_cannot_call_the_tools_that_write(tmp_path: Path) -> None:
    listed = tools(tmp_path)
    for name in MODEL_ONLY:
        assert ui_meta(listed[name]).get("visibility") == ["model"], name
    assert ui_meta(listed["docx_preview"]).get("visibility") == ["app"]


def test_docx_view_is_an_antigravity_side_panel_and_page(tmp_path: Path) -> None:
    view = tools(tmp_path)["docx_view"]
    assert view.annotations and view.annotations.read_only_hint
    entry = (view.meta or {}).get("com.google.antigravity/ui", {})
    assert set(entry.get("entrypoints", [])) == {"aux_pane", "global"}
    assert entry.get("title") == "Jubarte"
    preview = tools(tmp_path)["docx_preview"]
    assert preview.annotations and preview.annotations.read_only_hint
    assert "docx_text" in (preview.description or ""), "a model that sees it is sent to docx_text"


# -- docx_preview ---------------------------------------------------------


def test_preview_carries_the_readers_markdown_and_the_change_counts(tmp_path: Path) -> None:
    write_pair(tmp_path)
    compared, changes, preview = call(
        tmp_path,
        (
            "docx_compare",
            {
                "original": "a.docx",
                "modified": "b.docx",
                "out": "r.docx",
                "author": "T",
                "date": "2026-01-01T00:00:00Z",
            },
        ),
        ("docx_changes", {"path": "r.docx"}),
        ("docx_preview", {"path": "r.docx"}),
    )
    assert not compared.is_error and not preview.is_error, preview
    s = preview.structured_content
    data = (tmp_path / "r.docx").read_bytes()
    # Exactly what jubarte-app hands its reader.
    assert s["markdown"] == _native.read_view(data, page_markers=False)[0]
    assert "{++" in s["markdown"] and "{--" in s["markdown"]
    assert s["name"] == "r.docx" and s["path"] == "r.docx"
    assert s["sha256"] == _native.source_sha256(data)
    kinds = [c["kind"] for c in changes.structured_content["result"]]
    want_ins = sum(k in ("insertion", "replacement") for k in kinds)
    want_del = sum(k in ("deletion", "replacement") for k in kinds)
    assert s["counts"]["inserted"] == want_ins > 0
    assert s["counts"]["deleted"] == want_del > 0
    # A model or a host without the card still gets words.
    assert preview.content[0].type == "text" and "r.docx" in preview.content[0].text


def test_preview_maps_moves_by_story_as_the_desk_does(tmp_path: Path) -> None:
    (tmp_path / "m.docx").write_bytes(package(MOVE))
    (preview,) = call(tmp_path, ("docx_preview", {"path": "m.docx"}))
    assert not preview.is_error, preview
    s = preview.structured_content
    assert s["revision_kinds"] == {"body:rev:7": "movedel", "body:rev:8": "moveins"}
    assert s["counts"]["moved"] == 1


def test_move_kinds_read_every_story_and_ignore_range_marks() -> None:
    notes = {
        "word/footnotes.xml": f'<w:footnotes xmlns:w="{W}"><w:footnote w:id="1"><w:p><w:moveTo w:id="3"><w:r><w:t>x</w:t></w:r></w:moveTo></w:p></w:footnote></w:footnotes>',
        "word/endnotes.xml": f"<w:endnotes xmlns:w=\"{W}\"><w:endnote w:id='1'><w:p><w:moveFrom w:id='4'/></w:p></w:endnote></w:endnotes>",
    }
    body = MOVE + '<w:p><w:moveToRangeStart w:id="99" w:name="m"/><w:moveFromRangeEnd w:id="98"/></w:p>'
    kinds = server.move_kinds(package(body, notes))
    assert kinds == {
        "body:rev:7": "movedel",
        "body:rev:8": "moveins",
        "footnotes:rev:3": "moveins",
        "endnotes:rev:4": "movedel",
    }


def test_preview_refuses_a_path_outside_root_and_a_preview_too_big(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "root"
    root.mkdir()
    (tmp_path / "out.docx").write_bytes(make_document("x"))
    (root / "in.docx").write_bytes(make_document("long " * 200))
    (outside,) = call(root, ("docx_preview", {"path": "../out.docx"}))
    assert outside.is_error and "outside root" in outside.content[0].text
    monkeypatch.setattr(server, "_PREVIEW_LIMIT", 256)
    (big,) = call(root, ("docx_preview", {"path": "in.docx"}))
    assert big.is_error and "too large" in big.content[0].text


def test_preview_limit_counts_the_serialized_utf8_payload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "cjk.docx").write_bytes(make_document("契約" * 100))
    (ok,) = call(tmp_path, ("docx_preview", {"path": "cjk.docx"}))
    size = len(server.json.dumps(ok.structured_content, ensure_ascii=False).encode())
    monkeypatch.setattr(server, "_PREVIEW_LIMIT", size - 1)
    (refused,) = call(tmp_path, ("docx_preview", {"path": "cjk.docx"}))
    assert refused.is_error


# -- docx_view ------------------------------------------------------------


def test_view_with_a_path_names_the_document_for_the_card(tmp_path: Path) -> None:
    (tmp_path / "a.docx").write_bytes(make_document("The fee is ten."))
    shown, outside = call(tmp_path, ("docx_view", {"path": "a.docx"}), ("docx_view", {"path": "../a.docx"}))
    assert not shown.is_error
    assert shown.structured_content == {"path": "a.docx"}
    assert "a.docx" in shown.content[0].text
    assert outside.is_error and "outside root" in outside.content[0].text


def test_view_without_a_path_lists_the_roots_documents(tmp_path: Path) -> None:
    for rel in [
        "b.docx",
        "a.docx",
        "deep/c.docx",
        "deep/notes.txt",
        ".hidden/x.docx",
        ".scratch/y.docx",
        "node_modules/z.docx",
        "target/t.docx",
        "~$lock.docx",
    ]:
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_bytes(make_document("x"))
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    (outside / "o.docx").write_bytes(make_document("x"))
    os.symlink(outside, tmp_path / "linked", target_is_directory=True)
    os.symlink(outside / "o.docx", tmp_path / "file-link.docx")

    (listed,) = call(tmp_path, ("docx_view", {}))
    assert not listed.is_error
    s = listed.structured_content
    assert [f["path"] for f in s["files"]] == ["a.docx", "b.docx", "deep/c.docx"]
    assert s["truncated"] is False
    assert all(f["size"] > 0 for f in s["files"])
    assert "a.docx" in listed.content[0].text


def test_view_listing_is_bounded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    for i in range(5):
        (tmp_path / f"d{i}.docx").write_bytes(make_document("x"))
    monkeypatch.setattr(server, "_LIST_FILES", 3)
    (listed,) = call(tmp_path, ("docx_view", {}))
    s = listed.structured_content
    assert len(s["files"]) == 3 and s["truncated"] is True
    monkeypatch.setattr(server, "_LIST_FILES", 200)
    monkeypatch.setattr(server, "_LIST_VISITS", 2)
    (listed,) = call(tmp_path, ("docx_view", {}))
    assert listed.structured_content["truncated"] is True


def test_view_listing_does_not_follow_a_folder_swapped_for_a_link(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """#12: a folder replaced by a link between its lstat and its scan stays shut."""
    root = tmp_path / "root"
    (root / "sub").mkdir(parents=True)
    (root / "sub" / "inside.docx").write_bytes(make_document("x"))
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "private.docx").write_bytes(make_document("x"))

    def swap(target: Any) -> None:
        if str(target).endswith("sub") and not (root / "sub").is_symlink():
            (root / "sub" / "inside.docx").unlink()
            (root / "sub").rmdir()
            os.symlink(outside, root / "sub", target_is_directory=True)

    real_scandir, real_open = os.scandir, os.open

    def scandir(target: Any = ".") -> Any:
        swap(target)
        return real_scandir(target)

    def opener(target: Any, *args: Any, **kwargs: Any) -> int:
        swap(target)
        return real_open(target, *args, **kwargs)

    monkeypatch.setattr(os, "scandir", scandir)
    monkeypatch.setattr(os, "open", opener)
    files, _ = server.list_documents(root.resolve())
    assert [f["path"] for f in files] == []


def test_view_listing_does_not_read_past_its_entry_budget(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """#13: a wide folder is read only as far as the budget, not read whole and sorted."""
    for i in range(50):
        (tmp_path / f"f{i:02}.txt").write_text("x")
    seen = 0
    real_scandir = os.scandir

    class Counting:
        def __init__(self, it: Any) -> None:
            self.it = it

        def __enter__(self) -> Any:
            return self

        def __exit__(self, *exc: Any) -> None:
            self.it.close()

        def __iter__(self) -> Any:
            nonlocal seen
            for entry in self.it:
                seen += 1
                yield entry

    monkeypatch.setattr(os, "scandir", lambda target=".": Counting(real_scandir(target)))
    monkeypatch.setattr(server, "_LIST_VISITS", 5)
    _, truncated = server.list_documents(tmp_path.resolve())
    assert truncated is True
    assert seen <= 6


def test_moves_in_two_stories_with_one_name_count_twice() -> None:
    """#14: Word names moves per story; a body move1 and a footnote move1 are two moves."""

    class Change:
        def __init__(self, ident: str, name: str) -> None:
            self.kind, self.id, self.move_name = "move", ident, name
            self.story = ident.split(".")[0] if "." in ident else "body"

    changes = [
        Change("r7", "move1"),
        Change("r8", "move1"),
        Change("footnotes.r7", "move1"),
        Change("footnotes.r8", "move1"),
    ]
    assert server.change_counts(changes)["moved"] == 2


def test_move_kinds_ignore_moves_inside_xml_comments() -> None:
    """#15: a commented-out w:moveTo does not reclassify a real move."""
    body = MOVE + '<!-- <w:moveTo w:id="7"/> -->'
    kinds = server.move_kinds(package(body))
    assert kinds == {"body:rev:7": "movedel", "body:rev:8": "moveins"}
    # One pass: many unclosed openers cost a linear scan, not a quadratic one.
    assert server._without_comments("a<!--b" + "<!--" * 200_000) == "a"
    assert server._without_comments("x<!--c-->y<!--d-->z") == "xyz"


def _open_fds() -> int:
    return len(os.listdir("/dev/fd"))


@pytest.mark.skipif(not server._FD_WALK or not os.path.isdir("/dev/fd"), reason="descriptor walk only")
def test_view_listing_closes_every_folder_it_opens(tmp_path: Path) -> None:
    """#23: os.scandir(fd) duplicates fd; the walk must close its own."""
    (tmp_path / "a" / "b").mkdir(parents=True)
    (tmp_path / "a" / "x.docx").write_bytes(b"")
    (tmp_path / "a" / "b" / "y.docx").write_bytes(b"")
    server.list_documents(tmp_path.resolve())
    before = _open_fds()
    for _ in range(20):
        files, _ = server.list_documents(tmp_path.resolve())
    assert [f["path"] for f in files] == ["a/b/y.docx", "a/x.docx"]
    assert _open_fds() == before


def test_view_listing_survives_an_entry_that_vanishes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """#23: one entry deleted mid-walk does not drop its folder."""
    for name in ("a.docx", "gone.docx", "z.docx"):
        (tmp_path / name).write_bytes(b"")
    real_scandir = os.scandir

    class Vanishing:
        def __init__(self, entry: Any) -> None:
            self.entry, self.name = entry, entry.name

        def stat(self, *, follow_symlinks: bool = True) -> Any:
            if self.name == "gone.docx":
                raise FileNotFoundError(self.name)
            return self.entry.stat(follow_symlinks=follow_symlinks)

    class Listing:
        def __init__(self, it: Any) -> None:
            self.it = it

        def __enter__(self) -> Any:
            return self

        def __exit__(self, *exc: Any) -> None:
            self.it.close()

        def __iter__(self) -> Any:
            return (Vanishing(e) for e in self.it)

    monkeypatch.setattr(os, "scandir", lambda target=".": Listing(real_scandir(target)))
    files, truncated = server.list_documents(tmp_path.resolve())
    assert [f["path"] for f in files] == ["a.docx", "z.docx"]
    assert truncated is False


def test_view_listing_keeps_what_it_read_before_the_budget(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """#23: the entries read before the visit budget ran out are listed."""
    for i in range(5):
        (tmp_path / f"d{i}.docx").write_bytes(b"")
    monkeypatch.setattr(server, "_LIST_VISITS", 3)
    files, truncated = server.list_documents(tmp_path.resolve())
    assert truncated is True
    assert len(files) == 3
    assert [f["path"] for f in files] == sorted(f["path"] for f in files)


def test_a_long_change_id_names_its_story() -> None:
    """#23: `footnotes:rev:007` is a footnote change, not a body one."""

    class Change:
        def __init__(self, ident: str, name: str) -> None:
            self.kind, self.id, self.move_name = "move", ident, name

    changes = [
        Change("r7", "move1"),
        Change("footnotes:rev:007", "move1"),
        Change("header.a:rev:4", "move1"),
        Change("header.a:rev:5", "move1"),
    ]
    assert server.change_counts(changes)["moved"] == 3


def test_move_kinds_ignore_moves_inside_cdata() -> None:
    """#23: a w:moveTo written inside a CDATA section is text, not a move."""
    body = MOVE + '<w:r><w:t><![CDATA[<w:moveTo w:id="7"/>]]></w:t></w:r>'
    assert server.move_kinds(package(body)) == {"body:rev:7": "movedel", "body:rev:8": "moveins"}


# -- what does not change -------------------------------------------------


def test_docx_text_still_returns_the_agent_view_alone(tmp_path: Path) -> None:
    data = make_document("The fee is ten.")
    (tmp_path / "a.docx").write_bytes(data)
    (text,) = call(tmp_path, ("docx_text", {"path": "a.docx"}))
    markdown, warnings = _native.read_view(data, source="a.docx")
    assert [c.text for c in text.content] == [markdown + "".join(f"warning: {w}\n" for w in warnings)]


def test_a_stdio_client_reads_the_card_and_its_metadata(tmp_path: Path) -> None:
    """The console entry point, as a host spawns it: resources/read over stdio."""
    import json
    import subprocess
    import sys
    import threading

    messages = [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {"extensions": {"io.modelcontextprotocol/ui": {"mimeTypes": [UI_MIME]}}},
                "clientInfo": {"name": "t", "version": "0"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "resources/read", "params": {"uri": UI_URI}},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/list"},
    ]
    proc = subprocess.Popen(
        [sys.executable, "-m", "jubarte.mcp_server", "--root", str(tmp_path)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    assert proc.stdin is not None and proc.stdout is not None and proc.stderr is not None
    watchdog = threading.Timer(60, proc.kill)
    watchdog.start()
    replies: dict[int, Any] = {}
    try:
        proc.stdin.write("".join(json.dumps(m) + "\n" for m in messages))
        proc.stdin.flush()
        for line in proc.stdout:
            reply = json.loads(line) if line.strip() else {}
            if "id" in reply:
                replies[reply["id"]] = reply
            # The server answers concurrently: tools/list can overtake the read.
            if {2, 3} <= replies.keys():
                break
        proc.stdin.close()
        stderr = proc.stderr.read()
        proc.wait(timeout=60)
    finally:
        watchdog.cancel()
        if proc.poll() is None:
            proc.kill()
    assert 2 in replies and 3 in replies, stderr
    (item,) = replies[2]["result"]["contents"]
    assert item["uri"] == UI_URI and item["mimeType"] == UI_MIME
    assert item["text"].startswith("<!doctype html>")
    assert item["_meta"]["ui"] == {"csp": {}, "prefersBorder": True}
    listed = {t["name"]: t for t in replies[3]["result"]["tools"]}
    assert listed["docx_compare"]["_meta"]["ui"] == {"resourceUri": UI_URI, "visibility": ["model"]}
    assert listed["docx_preview"]["_meta"]["ui"] == {"visibility": ["app"]}
    assert "Traceback" not in stderr


def test_hidden_sections_are_stripped_in_linear_time() -> None:
    """#25: 200,000 CDATA sections (2.6 MB) took minutes when each pass
    searched the rest of the part again for both openers."""
    xml = "<w:t>" + "<![CDATA[x]]>" * 200_000 + "<!-- c -->y</w:t>"
    started = time.perf_counter()
    assert server._without_comments(xml) == "<w:t>y</w:t>"
    assert time.perf_counter() - started < 2.0
    assert server._without_comments("a<!-- <![CDATA[ -->b<![CDATA[ <!-- ]]>c") == "abc"
    assert server._without_comments("a<![CDATA[open") == "a"


def _png(side: int) -> bytes:
    """A solid `side`-pixel square PNG, its pixels incompressible enough to weigh."""
    import os
    import struct
    import zlib

    raw = b"".join(b"\x00" + os.urandom(3 * side) for _ in range(side))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", side, side, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def test_preview_sends_an_images_type_and_size_not_its_bytes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # The card draws a picture as a chip whose tooltip is its address; the
    # bytes the engine inlines (5 MB of b106's 5.3) only made a document with
    # pictures too large to preview.
    import base64

    picture = _png(300)
    uri = "data:image/png;base64," + base64.b64encode(picture).decode()
    docx = _native.markdown_to_docx(f"Before ![logo]({uri}) after\n")
    (tmp_path / "p.docx").write_bytes(bytes(docx[0] if isinstance(docx, tuple) else docx))
    monkeypatch.setattr(server, "_PREVIEW_LIMIT", 64 * 1024)
    (preview,) = call(tmp_path, ("docx_preview", {"path": "p.docx"}))
    assert not preview.is_error, preview.content[0].text
    markdown = preview.structured_content["markdown"]
    assert "base64" not in markdown
    kb = round(len(picture) / 1024)
    assert f"[image1]: <image/png, {kb} KB>" in markdown, markdown
    assert "Before ![logo][image1] after" in markdown


def test_image_stand_ins_leave_code_blocks_as_written(tmp_path: Path) -> None:
    # codex #31: a code block holding a picture definition's shape is text.
    literal = "[image1]: <data:image/png;base64,AAAA>"
    docx = _native.markdown_to_docx(f"```\n{literal}\n```\n\n~~~~\n{literal}\n~~~~\n")
    (tmp_path / "c.docx").write_bytes(bytes(docx[0] if isinstance(docx, tuple) else docx))
    (preview,) = call(tmp_path, ("docx_preview", {"path": "c.docx"}))
    data = (tmp_path / "c.docx").read_bytes()
    view = _native.read_view(data, page_markers=False)[0]
    assert view.count(literal) == 2, view
    assert preview.structured_content["markdown"] == view
