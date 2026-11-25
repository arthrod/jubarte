// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The card's picture fetches (#95). A page asks for each picture when it is
// drawn; the asks run one at a time so a picture-heavy document does not
// flood the host, and each document, view and picture is asked once. The
// answer is a data: URL, which the spec's default img-src allows.

const IMAGE = /^image\/[\w.+-]+$/;

/** `call` is the host bridge's callServerTool. */
export function createPictureLoader(call) {
  const cache = new Map();
  let queue = Promise.resolve();
  return function load({ path, view, sha256, id }) {
    const key = `${sha256}\0${view}\0${id}`;
    if (!cache.has(key)) {
      const ask = queue.then(async () => {
        try {
          const res = await call({ name: "docx_image", arguments: { path, id, view } });
          const image = !res?.isError && res?.content?.find((c) => c.type === "image");
          return image && IMAGE.test(image.mimeType) && image.data
            ? `data:${image.mimeType};base64,${image.data}`
            : null;
        } catch {
          return null;
        }
      });
      queue = ask;
      cache.set(key, ask);
    }
    return cache.get(key);
  };
}
