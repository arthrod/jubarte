// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The card's picture fetches (#95): one at a time, cached, a failure kept.
import { describe, expect, it } from "vitest";
import { createPictureLoader } from "./pictures.js";

const image = (data, mime = "image/png") => ({
  content: [{ type: "image", data, mimeType: mime }],
});

describe("createPictureLoader", () => {
  it("asks docx_image for the picture and returns a data: URL", async () => {
    const calls = [];
    const load = createPictureLoader(async (req) => (calls.push(req), image("QUJD")));
    const url = await load({ path: "a.docx", view: "tracked", sha256: "s", id: "image1" });
    expect(url).toBe("data:image/png;base64,QUJD");
    expect(calls).toEqual([
      { name: "docx_image", arguments: { path: "a.docx", id: "image1", view: "tracked" } },
    ]);
  });

  it("runs one fetch at a time", async () => {
    let open = 0,
      most = 0;
    const load = createPictureLoader(async () => {
      most = Math.max(most, ++open);
      await new Promise((r) => setTimeout(r, 5));
      open--;
      return image("QQ==");
    });
    await Promise.all(
      ["image1", "image2", "image3"].map((id) =>
        load({ path: "a", view: "tracked", sha256: "s", id }),
      ),
    );
    expect(most).toBe(1);
  });

  it("asks once per document, view and picture", async () => {
    let n = 0;
    const load = createPictureLoader(async () => (n++, image("QQ==")));
    const pic = { path: "a", view: "tracked", sha256: "s", id: "image1" };
    await load(pic);
    await load({ ...pic });
    expect(n).toBe(1);
    await load({ ...pic, sha256: "t" });
    await load({ ...pic, view: "accepted" });
    expect(n).toBe(3);
  });

  it("returns null when the call fails, errors or sends no image, and does not ask again", async () => {
    let n = 0;
    const results = [
      Promise.reject(new Error("down")),
      { isError: true, content: [] },
      { content: [{ type: "text", text: "x" }] },
    ];
    const load = createPictureLoader(async () => results[n++]);
    for (const id of ["a", "b", "c"])
      expect(await load({ path: "p", view: "tracked", sha256: "s", id })).toBeNull();
    expect(await load({ path: "p", view: "tracked", sha256: "s", id: "a" })).toBeNull();
    expect(n).toBe(3);
  });

  it("refuses a mime type the server did not say is an image", async () => {
    const load = createPictureLoader(async () => image("PHN2Zz4=", "text/html"));
    expect(await load({ path: "p", view: "tracked", sha256: "s", id: "image1" })).toBeNull();
  });
});
