// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// An MCP Apps web host for testing the card end to end, as the spec lays one
// out: the real jubarte-mcp over stdio, a host page on one origin
// (127.0.0.1) and the sandbox proxy on another (localhost), which loads the
// view under the CSP a host builds from the resource's `_meta.ui.csp`.
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import consolePipe from "vite-plugin-console-pipe";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
export const DEFAULT_MCP = join(repo, "jubarte-python/.venv/bin/jubarte-mcp");

/**
 * The view's CSP for `_meta.ui.csp: {}`: the spec's construction from
 * metadata with no domains, and `connect-src 'none'` from its restrictive
 * default, so the stricter of the two everywhere.
 */
export function viewCsp(csp = {}) {
  const res = (csp.resourceDomains ?? []).join(" ");
  const connect = (csp.connectDomains ?? []).join(" ") || "'none'";
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline' ${res}`.trim(),
    `style-src 'self' 'unsafe-inline' ${res}`.trim(),
    `connect-src ${connect}`,
    `img-src 'self' data: ${res}`.trim(),
    `font-src 'self' ${res}`.trim(),
    `media-src 'self' data: ${res}`.trim(),
    `frame-src ${(csp.frameDomains ?? []).join(" ") || "'none'"}`,
    "object-src 'none'",
    `base-uri ${(csp.baseUriDomains ?? []).join(" ") || "'self'"}`,
  ].join("; ");
}

/** A newline-delimited JSON-RPC client for one stdio MCP server. */
function stdioClient(command, args) {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
  let next = 1;
  let buffer = "";
  let stderr = "";
  const pending = new Map();
  child.stderr.on("data", (d) => (stderr += d));
  child.stdout.on("data", (d) => {
    buffer += d;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const waiter = msg.id != null && pending.get(msg.id);
      if (!waiter) continue;
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      else waiter.resolve(msg.result);
    }
  });
  let failure;
  const fail = (error) => {
    failure = error;
    for (const w of pending.values()) w.reject(error);
    pending.clear();
  };
  child.on("error", fail);
  child.stdin.on("error", fail);
  child.on("exit", (code) => fail(new Error(`jubarte-mcp exited (${code}): ${stderr}`)));
  const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      if (failure) return reject(failure);
      const id = next++;
      pending.set(id, { resolve, reject });
      send({ jsonrpc: "2.0", id, method, params });
    });
  return {
    async initialize() {
      const result = await request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {
          extensions: {
            "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] },
          },
        },
        clientInfo: { name: "jubarte-mcp-ui-e2e", version: "0" },
      });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      return result;
    },
    request,
    stderr: () => stderr,
    close: () => child.kill(),
  };
}

function listen(server, host) {
  return new Promise((ok) => server.listen(0, host, () => ok(server.address().port)));
}

function body(req) {
  return new Promise((ok, fail) => {
    let data = "";
    req.on("data", (d) => (data += d));
    req.on("end", () => {
      try {
        ok(data ? JSON.parse(data) : {});
      } catch (error) {
        fail(error);
      }
    });
    req.on("error", fail);
  });
}

/** Starts jubarte-mcp on `root` and both origins; `close()` stops them all. */
export async function startHarness({ root, mcp = process.env.JUBARTE_MCP || DEFAULT_MCP } = {}) {
  const client = stdioClient(mcp, ["--root", root]);
  let sandbox;
  let vite;
  const close = async () => {
    try {
      await vite?.close();
    } finally {
      try {
        if (sandbox) await new Promise((ok) => sandbox.close(ok));
      } finally {
        client.close();
      }
    }
  };
  try {
    await client.initialize();
    const tools = (await client.request("tools/list", {})).tools;
    const [card] = (await client.request("resources/read", { uri: "ui://jubarte/document.html" }))
      .contents;
    const csp = viewCsp(card._meta?.ui?.csp ?? {});

    const sandboxHtml = readFileSync(join(here, "sandbox.html"), "utf8");
    sandbox = createHttpServer((req, res) => {
      if (!req.url.startsWith("/sandbox.html")) {
        res.writeHead(404).end();
        return;
      }
      // The proxy page carries the view's policy too; the view's srcdoc frame
      // inherits it, and the meta tag the proxy injects says it again.
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": csp.replace("frame-src 'none'", "frame-src 'self'"),
      });
      res.end(sandboxHtml.replace("__VIEW_CSP__", csp));
    });
    const sandboxPort = await listen(sandbox, "localhost");
    const sandboxUrl = `http://localhost:${sandboxPort}/sandbox.html`;

    const token = randomUUID();
    const authorizations = new Map();
    vite = await createViteServer({
      configFile: false,
      root: here,
      logLevel: "error",
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: false,
        hmr: false,
        cors: false,
        headers: {
          "Content-Security-Policy": "frame-ancestors 'none'",
          "Referrer-Policy": "no-referrer",
        },
      },
      plugins: [
        consolePipe(),
        {
          name: "jubarte-e2e-api",
          configureServer(server) {
            server.middlewares.use(async (req, res, nextMw) => {
              if (!req.url.startsWith("/api/")) return nextMw();
              try {
                let out;
                const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
                if (
                  req.headers.host !== new URL(origin).host ||
                  (req.headers.origin && req.headers.origin !== origin)
                ) {
                  res.statusCode = 403;
                  return res.end("Forbidden origin");
                }
                if (req.url === "/api/config" && req.method === "GET")
                  out = {
                    token,
                    sandboxUrl,
                    csp,
                    tools,
                    card: { text: card.text, meta: card._meta ?? {} },
                  };
                else if (req.url === "/api/call") {
                  if (
                    req.method !== "POST" ||
                    req.headers.origin !== origin ||
                    req.headers["x-jubarte-session"] !== token
                  ) {
                    res.statusCode = 403;
                    return res.end("Forbidden session");
                  }
                  const { name, arguments: args, authorization } = await body(req);
                  const tool = tools.find((t) => t.name === name);
                  const approved = authorizations.get(authorization);
                  const authorized =
                    approved &&
                    approved.name === name &&
                    isDeepStrictEqual(approved.arguments, args);
                  if (
                    !tool ||
                    (!authorized &&
                      (tool.annotations?.readOnlyHint !== true ||
                        !(tool._meta?.ui?.visibility ?? ["model", "app"]).includes("app")))
                  ) {
                    res.statusCode = 403;
                    return res.end("Tool requires trusted test authorization");
                  }
                  if (authorized) authorizations.delete(authorization);
                  out = await client.request("tools/call", { name, arguments: args });
                } else return nextMw();
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify(out));
              } catch (error) {
                res.statusCode = error instanceof SyntaxError ? 400 : 500;
                res.end(String(error?.message ?? error));
              }
            });
          },
        },
      ],
    });
    await vite.listen();
    const { port } = vite.httpServer.address();
    return {
      hostUrl: `http://127.0.0.1:${port}/host.html`,
      sandboxUrl,
      csp,
      tools,
      call: (name, args) => client.request("tools/call", { name, arguments: args }),
      stderr: client.stderr,
      authorizeCall(name, args) {
        const authorization = randomUUID();
        authorizations.set(authorization, { name, arguments: structuredClone(args) });
        return authorization;
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
