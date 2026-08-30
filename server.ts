/**
 * Plain Node HTTP server -- deployed as a GKE pod behind webmcp.getlulu.dev,
 * same pattern as every other small service in this org (demo-flights-mcp,
 * weather-mcp, etc.). Reuses the exact same tested logic from
 * functions/_lib/ that the original Cloudflare Pages Functions design used
 * -- those modules are framework-agnostic on purpose (no Cloudflare-specific
 * types), so this is a routing-layer swap only, no logic changes.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { LuluAds } from "lulu-ads";
import { createSponsoredSlotHandler } from "./functions/_lib/sponsored-slot.js";
import { getCurrentWeather } from "./functions/_lib/open-meteo.js";
import { runChat, type ChatMessage } from "./functions/_lib/chat.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_DIR = join(__dirname, "..", "public");
// GCE Ingress does not rewrite paths (see k8s/ads/ingress.yaml's other
// path-prefixed services), so in production this pod is addressed at
// ads.getlulu.dev/webmcp/* and every request arrives with that prefix
// still attached. Empty by default so local `node dist/server.js` testing
// (and this file's own earlier manual verification) behaves exactly as
// already confirmed working, with zero prefix logic in play.
const BASE_PATH = (process.env.BASE_PATH ?? "").replace(/\/+$/, ""); // no trailing slash

// Reads LULU_ADS_PUBLISHER_ID / LULU_ADS_API_KEY from env by default --
// same convention every other server in this org uses.
const ads = new LuluAds();
const handleSponsoredSlot = createSponsoredSlotHandler(ads);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(pathname: string, res: http.ServerResponse): Promise<void> {
  const relPath = pathname === "/" ? "/index.html" : pathname === "/demo" ? "/demo.html" : pathname;
  const fullPath = normalize(join(PUBLIC_DIR, relPath));
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    let data: Buffer | string = await readFile(fullPath);
    // A page's own relative asset/API references (trip.js, api/...) resolve
    // against the DOCUMENT's URL -- under a path prefix that only works if
    // the document was actually loaded from a trailing-slash URL
    // (ads.getlulu.dev/webmcp/, not .../webmcp). The redirect above already
    // guarantees that for direct navigation, but <base> makes every
    // relative reference correct unconditionally, belt-and-suspenders.
    // Applies to every top-level HTML entry point (index.html, demo.html),
    // not just the root page.
    if (BASE_PATH && (fullPath === join(PUBLIC_DIR, "index.html") || fullPath === join(PUBLIC_DIR, "demo.html"))) {
      data = data.toString("utf8").replace("<head>", `<head>\n<base href="${BASE_PATH}/">`);
    }
    res.writeHead(200, { "content-type": MIME[extname(fullPath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  // /health is checked by the k8s readiness/liveness probes directly at
  // the pod's own root, never through the ingress prefix -- never gate
  // this one behind BASE_PATH stripping.
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Everything below is addressed under BASE_PATH ("" locally, "/webmcp"
  // in production). Bare BASE_PATH with no trailing slash (e.g. a browser
  // navigating straight to ".../webmcp") gets a 301 to the slash form --
  // required for index.html's relative asset/API references, and the
  // <base> tag injected in serveStatic, to resolve correctly.
  if (BASE_PATH && url.pathname === BASE_PATH) {
    res.writeHead(301, { location: `${BASE_PATH}/${url.search}` });
    res.end();
    return;
  }
  if (BASE_PATH && !url.pathname.startsWith(BASE_PATH + "/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const routePath = BASE_PATH ? url.pathname.slice(BASE_PATH.length) : url.pathname;

  if (routePath === "/api/weather" && req.method === "GET") {
    const city = url.searchParams.get("city") ?? "";
    const result = await getCurrentWeather(city);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  if (routePath === "/api/lulu-ads/sponsored-slot" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let parsed: unknown = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        // malformed body -> handleSponsoredSlot already defaults to an empty context
      }
      const result = await handleSponsoredSlot(parsed);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    });
    return;
  }

  if (routePath === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let messages: ChatMessage[] = [];
      try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed?.messages)) messages = parsed.messages;
      } catch {
        // malformed body -> empty messages, runChat/generateText will just
        // reply conversationally with no history
      }
      try {
        const result = await runChat(messages);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error("[api/chat] runChat failed:", err);
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "chat backend failed" }));
      }
    });
    return;
  }

  if (req.method === "GET") {
    await serveStatic(routePath, res);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`webmcp server listening on :${PORT}`);
});
