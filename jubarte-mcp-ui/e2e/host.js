// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The host page: renders one tool call's card the way an MCP Apps chat host
// does. Query: ?tool=NAME&args=JSON&theme=light|dark&height=PX (a fixed
// container height; without it the card grows to its content, 800px at most).
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

const q = new URLSearchParams(location.search);
const tool = q.get("tool") ?? "docx_view";
const args = JSON.parse(q.get("args") ?? "{}");
const theme = q.get("theme") === "dark" ? "dark" : "light";
const fixed = q.get("height") ? Number(q.get("height")) : null;
const MAX = 800;

const record = (window.__host = {
  events: [],
  opened: [],
  refused: [],
  initialized: false,
  resultSent: false,
});
const log = (kind, detail) => record.events.push({ kind, detail, at: performance.now() });

document.body.classList.toggle("dark", theme === "dark");
document.getElementById("call").textContent = `${tool} ${JSON.stringify(args)}`;

const config = await (await fetch("/api/config")).json();
const visibility = Object.fromEntries(
  config.tools.map((t) => [t.name, t._meta?.ui?.visibility ?? ["model", "app"]]),
);
const call = async (name, a, authorization) => {
  const res = await fetch("/api/call", {
    method: "POST",
    headers: { "x-jubarte-session": config.token },
    body: JSON.stringify({ name, arguments: a, authorization }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const frame = document.getElementById("card");
if (fixed) frame.style.height = `${fixed}px`;
let context = {
  theme,
  displayMode: "inline",
  platform: "web",
  containerDimensions: fixed ? { height: fixed } : { maxHeight: MAX },
  toolInfo: { tool: config.tools.find((t) => t.name === tool) },
};
const bridge = new AppBridge(
  null,
  { name: "jubarte-e2e-host", version: "0" },
  { serverTools: {}, openLinks: {}, logging: {} },
  { hostContext: context },
);

bridge.oncalltool = async (params) => {
  log("calltool", params.name);
  // A view may call only the tools the server lets it see (SEP-1865).
  if (!(visibility[params.name] ?? []).includes("app")) {
    record.refused.push(params.name);
    return {
      isError: true,
      content: [{ type: "text", text: `${params.name} is not visible to apps` }],
    };
  }
  return call(params.name, params.arguments ?? {});
};
bridge.onopenlink = async ({ url }) => {
  record.opened.push(url);
  return {};
};
bridge.onsizechange = ({ height }) => {
  log("size", height);
  if (!fixed && height) frame.style.height = `${Math.min(MAX, Math.ceil(height))}px`;
};
bridge.onloggingmessage = (m) => log("log", m);
bridge.onsandboxready = () => {
  log("sandbox-ready");
  bridge.sendSandboxResourceReady({ html: config.card.text, csp: config.card.meta?.ui?.csp });
};
bridge.oninitialized = async () => {
  record.initialized = true;
  log("initialized");
  await bridge.sendToolInput({ arguments: args });
  const result = await call(tool, args, q.get("authorization"));
  record.toolResult = result;
  await bridge.sendToolResult(result);
  record.resultSent = true;
  log("result-sent", result.isError ? "error" : "ok");
};
window.__setTheme = (next) => {
  document.body.classList.toggle("dark", next === "dark");
  context = { ...context, theme: next };
  bridge.setHostContext(context);
};

await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
frame.src = `${config.sandboxUrl}?host=${encodeURIComponent(location.origin)}`;
