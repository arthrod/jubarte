// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";

// Node streams exercise the transport. Replace only process and listener creation.
const state = vi.hoisted(() => ({}));
vi.mock("node:child_process", () => ({ spawn: (...args) => state.spawn(...args) }));
vi.mock("node:http", () => ({ createServer: () => state.server() }));
vi.mock("vite", () => ({
  createServer: async (options) => {
    const server = state.server();
    const vite = {
      httpServer: server,
      middlewares: {
        use: (fn) => {
          state.route = fn;
        },
      },
      listen: async () => {},
      close: async () => {
        server.closed = true;
      },
    };
    for (const plugin of options.plugins) plugin.configureServer?.(vite);
    return vite;
  },
}));
import { startHarness } from "../e2e/harness.mjs";

beforeEach(() => {
  state.calls = [];
  state.failure = null;
  state.server = () => ({
    closed: false,
    listen(_port, _host, done) {
      done();
    },
    address: () => ({ port: 8765 }),
    close(done) {
      this.closed = true;
      done();
    },
  });
  state.spawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
      child.killed = true;
    };
    child.stdin = new Writable({
      write(chunk, _encoding, done) {
        const msg = JSON.parse(chunk.toString());
        if (msg.id) {
          state.calls.push(msg);
          const result =
            msg.method === "tools/list"
              ? {
                  tools: [
                    { name: "docx_view", annotations: { readOnlyHint: true } },
                    {
                      name: "docx_reject",
                      annotations: { readOnlyHint: false },
                      _meta: { ui: { visibility: ["model"] } },
                    },
                    {
                      name: "docx_accept",
                      annotations: { readOnlyHint: false },
                      _meta: { ui: { visibility: ["model"] } },
                    },
                  ],
                }
              : msg.method === "resources/read"
                ? { contents: [{ text: "<html></html>" }] }
                : {};
          child.stdout.write(
            JSON.stringify({
              id: msg.id,
              ...(state.failure === msg.method
                ? { error: { code: -1, message: "fixture failure" } }
                : { result }),
            }) + "\n",
          );
        }
        done();
      },
    });
    state.child = child;
    return child;
  };
});
async function request(path, { headers = {}, payload = "", method = "POST" } = {}) {
  const req = new EventEmitter();
  Object.assign(req, { url: path, headers: { host: "127.0.0.1:8765", ...headers }, method });
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(value) {
      this.body = value;
    },
  };
  const handling = state.route(req, res, () => {});
  req.emit("data", payload);
  expect(() => req.emit("end")).not.toThrow();
  await handling;
  return res;
}
async function config() {
  return JSON.parse((await request("/api/config", { method: "GET" })).body);
}
const payload = (name) => JSON.stringify({ name, arguments: { path: "a.docx", overwrite: true } });

it("K63 refuses a cross-origin simple POST before dispatch", async () => {
  const h = await startHarness({ root: "." });
  try {
    const res = await request("/api/call", {
      headers: { origin: "https://evil.example", "content-type": "text/plain" },
      payload: payload("docx_accept"),
    });
    expect(res.statusCode).toBe(403);
    expect(state.calls.filter((c) => c.method === "tools/call")).toEqual([]);
  } finally {
    await h.close();
  }
});
it("K71 refuses URL-driven writes but permits previews and authorized one-use writes", async () => {
  const h = await startHarness({ root: "." });
  try {
    const { token } = await config();
    const headers = { origin: "http://127.0.0.1:8765", "x-jubarte-session": token };
    expect(
      (await request("/api/call", { headers, payload: payload("docx_accept") })).statusCode,
    ).toBe(403);
    expect(state.calls.filter((c) => c.method === "tools/call")).toEqual([]);
    expect(
      (await request("/api/call", { headers, payload: payload("docx_view") })).statusCode,
    ).toBe(200);
    const authorization = h.authorizeCall("docx_accept", { path: "a.docx", overwrite: true });
    const authorized = JSON.stringify({ ...JSON.parse(payload("docx_accept")), authorization });
    expect((await request("/api/call", { headers, payload: authorized })).statusCode).toBe(200);
    expect((await request("/api/call", { headers, payload: authorized })).statusCode).toBe(403);
  } finally {
    await h.close();
  }
});
it("K62 closes the child when resource startup fails", async () => {
  state.failure = "resources/read";
  await expect(startHarness({ root: "." })).rejects.toThrow("fixture failure");
  expect(state.child.killed).toBe(true);
});
it("K68 returns 400 for malformed JSON and serves the following request", async () => {
  const h = await startHarness({ root: "." });
  try {
    const { token } = await config();
    const headers = { origin: "http://127.0.0.1:8765", "x-jubarte-session": token };
    expect((await request("/api/call", { headers, payload: "{" })).statusCode).toBe(400);
    expect(
      (await request("/api/call", { headers, payload: payload("docx_view") })).statusCode,
    ).toBe(200);
  } finally {
    await h.close();
  }
});
it("K83 rejects initialization on a spawn error", async () => {
  const spawn = state.spawn;
  state.spawn = () => {
    const child = spawn();
    child.stdin = new PassThrough();
    return child;
  };
  const starting = startHarness({ root: ".", mcp: "/missing/jubarte-mcp" });
  expect(state.child.listenerCount("error")).toBeGreaterThan(0);
  const rejected = expect(starting).rejects.toThrow("ENOENT");
  state.child.emit("error", new Error("spawn ENOENT"));
  await rejected;
  expect(state.child.killed).toBe(true);
});

it("K63 requires the session credential and exact Host even for same-origin previews", async () => {
  const h = await startHarness({ root: "." });
  try {
    const { token } = await config();
    const origin = "http://127.0.0.1:8765";
    for (const headers of [
      { origin },
      { origin, "x-jubarte-session": "wrong" },
      { origin, "x-jubarte-session": token, host: "evil.example:8765" },
    ])
      expect(
        (await request("/api/call", { headers, payload: payload("docx_view") })).statusCode,
      ).toBe(403);
    expect(state.calls.filter((c) => c.method === "tools/call")).toEqual([]);
  } finally {
    await h.close();
  }
});
it("K71 binds authorization to exact tool and arguments", async () => {
  const h = await startHarness({ root: "." });
  try {
    const { token } = await config();
    const headers = { origin: "http://127.0.0.1:8765", "x-jubarte-session": token };
    const authorization = h.authorizeCall("docx_accept", { path: "a.docx", overwrite: false });
    for (const call of [
      { name: "docx_accept", arguments: { path: "a.docx", overwrite: true } },
      { name: "docx_reject", arguments: { path: "a.docx", overwrite: false } },
    ])
      expect(
        (
          await request("/api/call", {
            headers,
            payload: JSON.stringify({ ...call, authorization }),
          })
        ).statusCode,
      ).toBe(403);
    expect(state.calls.filter((c) => c.method === "tools/call")).toEqual([]);
  } finally {
    await h.close();
  }
});
