# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0

"""jubarte-mcp as an MCP App: the document card resource, docx_view and
the app-only docx_preview it reads documents through."""

from __future__ import annotations

import os
import re
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
    # Each notes part is a story only through its relationship, as in Word.
    rels = []
    for i, (path, content) in enumerate((notes or {}).items()):
        kind = "footnotes" if "<w:footnotes" in content else "endnotes"
        target = path.removeprefix("word/")
        rels.append(
            f'<Relationship Id="rN{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}" Target="{target}"/>'
        )
        parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace(
            "</Types>",
            f'<Override PartName="/{path}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.{kind}+xml"/></Types>',
        )
        parts[path] = content
    if rels:
        parts["word/_rels/document.xml.rels"] = (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(rels)
            + "</Relationships>"
        )
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


def test_move_kinds_decode_character_references_in_the_id() -> None:
    # #41: w:id="&#55;" is id 7 to every XML reader, the engine included.
    body = MOVE.replace('w:id="7"', 'w:id="&#55;"').replace('w:id="8"', 'w:id="&#x38;"')
    assert body != MOVE
    kinds = server.move_kinds(package(body))
    assert kinds == {"body:rev:7": "movedel", "body:rev:8": "moveins"}
    assert server.move_kinds(package(MOVE.replace('w:id="7"', 'w:id="&amp;7"'))).get("body:rev:&7") == "movedel"


def test_move_kinds_find_the_main_part_past_a_commented_relationship() -> None:
    # #51: a relationship inside an XML comment names no part.
    import zipfile
    from io import BytesIO

    source = BytesIO(package(MOVE))
    out = BytesIO()
    with zipfile.ZipFile(source) as old, zipfile.ZipFile(out, "w") as new:
        for item in old.infolist():
            data = old.read(item)
            if item.filename == "_rels/.rels":
                text = data.decode()
                decoy = (
                    '<!-- <Relationship Id="x" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
                    'relationships/officeDocument" Target="decoy.xml"/> -->'
                )
                at = text.index("<Relationship ")
                data = (text[:at] + decoy + text[at:]).encode()
            new.writestr(item, data)
    assert b"decoy.xml" in out.getvalue()
    assert server.move_kinds(out.getvalue()) == {"body:rev:7": "movedel", "body:rev:8": "moveins"}


def test_move_kinds_read_attributes_as_xml_does() -> None:
    # #52: a quoted ">" does not end the tag, and text that only looks like
    # an id inside another attribute's value is no id.
    body = MOVE.replace('<w:moveFrom w:id="7" w:author="A"', '<w:moveFrom w:author="A > B" w:id="7"').replace(
        '<w:moveTo w:id="8" w:author="A"', '<w:moveTo w:author="A > B" w:id="8"'
    )
    assert body.count("A > B") == 2
    assert server.move_kinds(package(body)) == {"body:rev:7": "movedel", "body:rev:8": "moveins"}
    decoy = MOVE.replace('<w:moveFrom w:id="7" w:author="A"', '<w:moveFrom w:author="x w:id=\'9\'" w:id="7"')
    assert "w:id='9'" in decoy
    assert server.move_kinds(package(decoy)) == {"body:rev:7": "movedel", "body:rev:8": "moveins"}


def test_move_kinds_decode_the_main_part_target() -> None:
    # #52: Target="word/doc&amp;ument.xml" names the part word/doc&ument.xml.
    import zipfile
    from io import BytesIO

    out = BytesIO()
    with zipfile.ZipFile(BytesIO(package(MOVE))) as old, zipfile.ZipFile(out, "w") as new:
        for item in old.infolist():
            data = old.read(item)
            name = item.filename
            if name == "_rels/.rels":
                data = data.replace(b'Target="word/document.xml"', b'Target="word/doc&amp;ument.xml"')
            elif name == "[Content_Types].xml":
                data = data.replace(b'PartName="/word/document.xml"', b'PartName="/word/doc&amp;ument.xml"')
            elif name == "word/document.xml":
                name = "word/doc&ument.xml"
            new.writestr(name, data)
    assert server.move_kinds(out.getvalue()) == {"body:rev:7": "movedel", "body:rev:8": "moveins"}


def test_move_kinds_skip_processing_instructions() -> None:
    # #53: a processing instruction's data is no element.
    body = (
        '<?probe <w:moveTo w:id="7">?><w:p><w:ins w:id="7" w:author="A"><w:r><w:t>INSERTED</w:t></w:r></w:ins></w:p>'
    )
    assert server.move_kinds(package(body)) == {}


def test_move_kinds_ignore_an_element_of_another_namespace() -> None:
    # #55: <x:moveTo> in an ignorable namespace is no WordprocessingML move.
    body = '<w:p><w:ins w:id="7" w:author="A"><w:r><w:t>REAL</w:t></w:r></w:ins><x:moveTo x:id="7"/></w:p>'
    import zipfile
    from io import BytesIO

    out = BytesIO()
    with zipfile.ZipFile(BytesIO(package(body))) as old, zipfile.ZipFile(out, "w") as new:
        for item in old.infolist():
            data = old.read(item)
            if item.filename == "word/document.xml":
                data = data.replace(
                    b"<w:document ",
                    b'<w:document xmlns:x="urn:example" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" ',
                )
                assert b"urn:example" in data
            new.writestr(item, data)
    assert server.move_kinds(out.getvalue()) == {}


def test_move_kinds_read_notes_wherever_the_relationship_puts_them() -> None:
    # #55: a footnotes part need not be word/footnotes.xml.
    notes = {
        "word/notes-custom.xml": f'<w:footnotes xmlns:w="{W}"><w:footnote w:id="1"><w:p><w:moveTo w:id="7" w:author="A"><w:r><w:t>NOTE</w:t></w:r></w:moveTo></w:p></w:footnote></w:footnotes>'
    }
    body = '<w:p><w:r><w:t>BODY</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>'
    assert server.move_kinds(package(body, notes)) == {"notes-custom:rev:7": "moveins"}


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


def test_view_listing_cut_short_before_any_document_says_so(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A spent budget is not proof of absence (#64)."""
    for i in range(5):
        (tmp_path / f"noise-{i}.txt").write_bytes(b"")
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "visible.docx").write_bytes(make_document("VISIBLE"))
    monkeypatch.setattr(server, "_LIST_VISITS", 3)
    (listed,) = call(tmp_path, ("docx_view", {}))
    assert listed.structured_content == {"files": [], "truncated": True}
    text = listed.content[0].text
    assert "No .docx files under the root." not in text
    assert "stopped" in text and "path" in text


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
    body = "<w:p><w:r><w:t>" + "<![CDATA[x]]>" * 200_000 + "<!-- c -->y</w:t></w:r></w:p>" + MOVE
    data = package(body)
    started = time.perf_counter()
    assert server.move_kinds(data) == {"body:rev:7": "movedel", "body:rev:8": "moveins"}
    assert time.perf_counter() - started < 2.0


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
    assert f"[image1]: <image/png, {kb} KB, 300x300 px>" in markdown, markdown
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


def test_image_stand_ins_split_lines_at_newlines_only() -> None:
    # #91: str.splitlines also ends a line at U+2028, U+2029 and U+0085, so a
    # fence looked closed inside a code line and its literal text was rewritten.
    from jubarte.mcp_server import _image_stand_ins

    for sep in ("\u2028", "\u2029", "\x85"):
        literal = "[image1]: <data:image/png;base64,QUJD>"
        code = f"```\nhello{sep}```{sep}{literal}\n```\n"
        assert _image_stand_ins(code) == code, repr(sep)
    outside = "[image1]: <data:image/png;base64,QUJD>\n"
    assert _image_stand_ins(outside) == "[image1]: <image/png, 0 KB>\n"


def test_preview_serves_the_engines_accepted_and_original_views(tmp_path: Path) -> None:
    # #40: the card's Accepted and Original are the engine's accept and
    # reject, not a client rebuild: a joined break, renumbered items.
    source = "1. First\n2. {--Deleted--}\n3. Third\n\nOne{--\n\n--}Two\n"
    docx = _native.markdown_to_docx(source)
    data = bytes(docx[0] if isinstance(docx, tuple) else docx)
    (tmp_path / "v.docx").write_bytes(data)
    tracked, accepted, original, bad = call(
        tmp_path,
        ("docx_preview", {"path": "v.docx"}),
        ("docx_preview", {"path": "v.docx", "view": "accepted"}),
        ("docx_preview", {"path": "v.docx", "view": "original"}),
        ("docx_preview", {"path": "v.docx", "view": "sideways"}),
    )
    assert tracked.structured_content["view"] == "tracked"
    assert tracked.structured_content["markdown"] == _native.read_view(data, page_markers=False)[0]
    for result, view, mode in ((accepted, "accepted", "accept"), (original, "original", "reject")):
        s = result.structured_content
        assert s["view"] == view
        assert s["markdown"] == _native.read_view(data, track_changes=mode, page_markers=False)[0]
        assert s["counts"] == tracked.structured_content["counts"]
    assert "2. Third" in accepted.structured_content["markdown"]
    assert "OneTwo" in accepted.structured_content["markdown"]
    assert "{--" not in original.structured_content["markdown"]
    assert bad.is_error


# -- docx_image: the card draws a picture from its bytes (#95) --------------


def _two_pictures(root: Path) -> tuple[bytes, bytes]:
    import base64

    first, second = _png(40), _png(60)
    uri = [f"data:image/png;base64,{base64.b64encode(p).decode()}" for p in (first, second)]
    docx = _native.markdown_to_docx(f"One ![a]({uri[0]}) two ![b]({uri[1]})\n")
    (root / "p.docx").write_bytes(bytes(docx[0] if isinstance(docx, tuple) else docx))
    return first, second


def test_docx_image_is_the_cards_own_tool(tmp_path: Path) -> None:
    tool = tools(tmp_path)["docx_image"]
    assert ui_meta(tool).get("visibility") == ["app"]
    assert tool.annotations.read_only_hint


def test_docx_image_returns_the_pictures_bytes_as_image_content(tmp_path: Path) -> None:
    import base64

    first, second = _two_pictures(tmp_path)
    preview, one, two = call(
        tmp_path,
        ("docx_preview", {"path": "p.docx"}),
        ("docx_image", {"path": "p.docx", "id": "image1"}),
        ("docx_image", {"path": "p.docx", "id": "image2"}),
    )
    # The ids the tool takes are the labels the preview's stand-ins carry.
    markdown = preview.structured_content["markdown"]
    assert "[image1]: <image/png," in markdown and "[image2]: <image/png," in markdown
    for result, want in ((one, first), (two, second)):
        assert not result.is_error, result.content[0].text
        (content,) = result.content
        assert content.type == "image" and content.mime_type == "image/png"
        assert base64.b64decode(content.data) == want
    # The same bytes as the package's media parts.
    with ZipFile(tmp_path / "p.docx") as zf:
        media = sorted(zf.read(n) for n in zf.namelist() if n.startswith("word/media/"))
    assert sorted([first, second]) == media


def test_docx_image_refuses_an_unknown_id_a_path_outside_and_a_picture_too_big(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "root"
    root.mkdir()
    _two_pictures(root)
    (tmp_path / "out.docx").write_bytes((root / "p.docx").read_bytes())
    unknown, outside = call(
        root,
        ("docx_image", {"path": "p.docx", "id": "image9"}),
        ("docx_image", {"path": "../out.docx", "id": "image1"}),
    )
    assert unknown.is_error and "image9" in unknown.content[0].text
    assert outside.is_error and "outside root" in outside.content[0].text
    monkeypatch.setattr(server, "_IMAGE_LIMIT", 1024)
    (big,) = call(root, ("docx_image", {"path": "p.docx", "id": "image2"}))
    assert big.is_error and "too large" in big.content[0].text


def test_docx_image_ignores_a_definition_inside_code(tmp_path: Path) -> None:
    # The shape inside a fence is the document's text, not a picture (#31).
    literal = "[image1]: <data:image/png;base64,QUJD>"
    docx = _native.markdown_to_docx(f"```\n{literal}\n```\n")
    (tmp_path / "c.docx").write_bytes(bytes(docx[0] if isinstance(docx, tuple) else docx))
    (result,) = call(tmp_path, ("docx_image", {"path": "c.docx", "id": "image1"}))
    assert result.is_error


def test_image_stand_ins_carry_the_rasters_pixel_size(tmp_path: Path) -> None:
    # #122: a picture the engine regenerates has no drawing comment; the card
    # sizes it from the raster (1 px per pixel), so the stand-in says the size.
    _two_pictures(tmp_path)
    (preview,) = call(tmp_path, ("docx_preview", {"path": "p.docx"}))
    markdown = preview.structured_content["markdown"]
    assert re.search(r"\[image1\]: <image/png, \d+ KB, 40x40 px>", markdown), markdown
    assert re.search(r"\[image2\]: <image/png, \d+ KB, 60x60 px>", markdown), markdown


def test_raster_size_reads_png_gif_bmp_and_jpeg_headers() -> None:
    import base64
    import struct

    from jubarte.mcp_server import _raster_size

    b64 = lambda raw: base64.b64encode(raw).decode()  # noqa: E731
    assert _raster_size("image/png", b64(_png(7))) == (7, 7)
    assert _raster_size("image/gif", b64(b"GIF89a" + struct.pack("<HH", 300, 20) + b"\x00" * 8)) == (300, 20)
    bmp = b"BM" + b"\x00" * 16 + struct.pack("<ii", 120, -45) + b"\x00" * 30
    assert _raster_size("image/bmp", b64(bmp)) == (120, 45)
    jpeg = (
        b"\xff\xd8"
        + b"\xff\xe0"
        + struct.pack(">H", 202)
        + b"J" * 200
        + b"\xff\xc0"
        + struct.pack(">HBHH", 17, 8, 90, 160)
        + b"\x00" * 12
    )
    assert _raster_size("image/jpeg", b64(jpeg)) == (160, 90)
    assert _raster_size("image/png", b64(b"not a png")) is None
    assert _raster_size("image/x-emf", b64(_png(7))) is None


def test_raster_size_skips_jpeg_fill_bytes_and_reads_core_bmp_headers() -> None:
    # #125: a marker may follow any number of 0xFF fill bytes (ITU T.81 B.1.1.2),
    # and an OS/2 core BMP (12-byte BITMAPCOREHEADER) holds 16-bit sizes.
    import base64
    import struct

    from jubarte.mcp_server import _raster_size

    b64 = lambda raw: base64.b64encode(raw).decode()  # noqa: E731
    sof = b"\xff\xc2" + struct.pack(">HBHH", 17, 8, 30, 40) + b"\x00" * 12
    app = b"\xff\xe0" + struct.pack(">H", 16) + b"J" * 14
    assert _raster_size("image/jpeg", b64(b"\xff\xd8\xff" + app + b"\xff\xff" + sof)) == (40, 30)
    core = b"BM" + struct.pack("<IHHI", 26, 0, 0, 26) + struct.pack("<IHHHH", 12, 40, 30, 1, 24)
    assert _raster_size("image/bmp", b64(core)) == (40, 30)


def test_docx_image_refuses_a_document_changed_since_its_preview(tmp_path: Path) -> None:
    # #122: the card caches a picture under the preview's sha256; bytes from a
    # changed file must not land under the old hash.
    _two_pictures(tmp_path)
    (preview,) = call(tmp_path, ("docx_preview", {"path": "p.docx"}))
    sha = preview.structured_content["sha256"]
    (same,) = call(tmp_path, ("docx_image", {"path": "p.docx", "id": "image1", "sha256": sha}))
    assert not same.is_error, same.content[0].text
    _two_pictures(tmp_path)  # new random pixels: a different file
    (stale,) = call(tmp_path, ("docx_image", {"path": "p.docx", "id": "image1", "sha256": sha}))
    assert stale.is_error and "changed" in stale.content[0].text
