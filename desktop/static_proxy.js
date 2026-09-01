/**
 * Tiny static file server + /api reverse proxy (Node stdlib only).
 * Used in the packaged desktop app to host Vite build output without Vite itself.
 *
 * Env:
 *   STATIC_ROOT  directory of built assets
 *   PORT         listen port
 *   API_TARGET   e.g. http://127.0.0.1:8001  (optional)
 *   SPA_FALLBACK 1 to serve index.html for unknown GET paths
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.resolve(process.env.STATIC_ROOT || process.cwd());
const PORT = Number(process.env.PORT || 4173);
const API_TARGET = (process.env.API_TARGET || "").replace(/\/$/, "");
const SPA = process.env.SPA_FALLBACK === "1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, headers) {
  res.writeHead(status, {
    "Content-Security-Policy":
      "frame-ancestors 'self' http://127.0.0.1:3000 http://localhost:3000",
    ...headers,
  });
  res.end(body);
}

function proxyApi(req, res) {
  const target = new URL(req.url, API_TARGET);
  const opts = {
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    method: req.method,
    headers: { ...req.headers, host: target.host },
  };
  const upstream = http.request(opts, (up) => {
    const headers = { ...up.headers };
    headers["content-security-policy"] =
      "frame-ancestors 'self' http://127.0.0.1:3000 http://localhost:3000";
    res.writeHead(up.statusCode || 502, headers);
    up.pipe(res);
  });
  upstream.on("error", (err) => {
    send(res, 502, JSON.stringify({ detail: err.message }), {
      "Content-Type": "application/json",
    });
  });
  req.pipe(upstream);
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const rel = decoded.replace(/^\/+/, "");
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root)) return null;
  return full;
}

function serveStatic(req, res) {
  let filePath = safeJoin(ROOT, req.url || "/");
  if (!filePath) {
    send(res, 400, "Bad path", { "Content-Type": "text/plain" });
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath) && SPA) {
    filePath = path.join(ROOT, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    send(res, 404, "Not found", { "Content-Type": "text/plain" });
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  send(res, 200, body, {
    "Content-Type": MIME[ext] || "application/octet-stream",
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || "/";
  if (API_TARGET && (urlPath === "/api" || urlPath.startsWith("/api/"))) {
    proxyApi(req, res);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed", { "Content-Type": "text/plain" });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`static_proxy ${ROOT} on http://127.0.0.1:${PORT} api=${API_TARGET || "off"}`);
});
