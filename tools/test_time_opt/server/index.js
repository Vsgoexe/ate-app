const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const ROOT = path.resolve(__dirname, "..");
const WORKER = path.join(ROOT, "ate_live_worker.py");
const DEFAULT_STIL = path.join(
  process.env.USERPROFILE || "",
  "Downloads",
  "Production_SCAN_stuck_at_1000pat.stil"
);

function resolveUploadDir() {
  const tmp = process.env.TEMP || process.env.TMP || os.tmpdir();
  const dir = path.join(tmp, "verilumen-tto-uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const UPLOAD_DIR = resolveUploadDir();

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 512 * 1024 * 1024, files: 5000 },
});

const LOG_DIR = path.join(UPLOAD_DIR, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

/** @type {Map<string, import('child_process').ChildProcess>} */
const jobs = new Map();

const app = express();
app.use(cors());
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' http://127.0.0.1:3000 http://localhost:3000"
  );
  res.removeHeader("X-Frame-Options");
  next();
});
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    defaultStilExists: fs.existsSync(DEFAULT_STIL),
  });
});

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  if (process.env.VERILUMEN_PYTHON) return process.env.VERILUMEN_PYTHON;
  // Packaged layout: resources/suite/tools/test_time_opt → resources/python/python.exe
  const bundled = path.join(ROOT, "..", "..", "..", "python", "python.exe");
  if (fs.existsSync(bundled)) return bundled;
  return "python";
}

function demoDatasetsRoot() {
  const env = process.env.VERILUMEN_DEMO_DATASETS;
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    path.join(ROOT, "..", "..", "demo_datasets"),
    path.join(ROOT, "..", "..", "..", "demo_datasets"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function demoStilPath() {
  const root = demoDatasetsRoot();
  if (!root) return null;
  const stil = path.join(
    root,
    "test_time",
    "pre test",
    "Production_SCAN_stuck_at_1000pat.stil"
  );
  return fs.existsSync(stil) ? stil : null;
}

function demoLogsDir() {
  const root = demoDatasetsRoot();
  if (!root) return null;
  const dir = path.join(root, "test_time", "post process", "LOT_1_Center");
  return fs.existsSync(dir) ? dir : null;
}

function runWorker(stilPath, _opts, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const jobId = crypto.randomUUID();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  if (!fs.existsSync(stilPath)) {
    send({ type: "error", message: `STIL not found: ${stilPath}` });
    res.end();
    return;
  }

  const args = [
    WORKER,
    "--stil",
    stilPath,
    "--dropout",
    "0",
    "--budget-mb",
    "0",
    "--min-frac",
    "0.2",
    "--max-frac",
    "0.6",
    "--bits-per-pin",
    "2",
    "--period-ns",
    "100",
    "--max-patterns",
    "0",
    "--refresh-every",
    "25",
  ];

  send({ type: "job", jobId });
  send({ type: "status", message: "Starting simulation worker…" });

  const child = spawn(resolvePython(), args, {
    cwd: ROOT,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  jobs.set(jobId, child);

  let closed = false;
  const endOnce = () => {
    if (closed) return;
    closed = true;
    jobs.delete(jobId);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };

  res.on("close", () => {
    if (!child.killed) child.kill();
    jobs.delete(jobId);
  });

  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        send(JSON.parse(line));
      } catch {
        send({ type: "log", message: line });
      }
    }
  });

  let stderrBuf = "";
  child.stderr.on("data", (chunk) => {
    const msg = chunk.toString("utf8").trim();
    if (msg) {
      stderrBuf = `${stderrBuf}${msg}\n`.slice(-4000);
      send({ type: "log", message: msg });
    }
  });

  child.on("error", (err) => {
    send({ type: "error", message: err.message });
    endOnce();
  });

  child.on("close", (code) => {
    if (code !== 0 && code !== null) {
      const detail = stderrBuf.trim();
      send({
        type: "error",
        message: detail
          ? `Worker exited with code ${code}: ${detail.split("\n").slice(-3).join(" ")}`
          : `Worker exited with code ${code}`,
      });
    }
    endOnce();
  });
}

app.post("/api/seed", (req, res) => {
  const { jobId, pattern_id, auto } = req.body || {};
  if (!jobId) {
    res.status(400).json({ error: "jobId required" });
    return;
  }
  const child = jobs.get(jobId);
  if (!child || !child.stdin || child.killed) {
    res.status(404).json({ error: "Job not waiting for seed (expired or done)" });
    return;
  }
  const payload = auto
    ? { auto: true, pattern_id: pattern_id ?? 0 }
    : { pattern_id: Number(pattern_id) };
  try {
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    res.json({ ok: true, ...payload });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/simulate", upload.single("stil"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Upload a STIL file" });
    return;
  }

  const dest = path.join(
    UPLOAD_DIR,
    `${Date.now()}_${req.file.originalname || "upload.stil"}`
  );
  fs.renameSync(req.file.path, dest);

  runWorker(dest, {}, res);
});

app.get("/api/simulate-default", (_req, res) => {
  runWorker(DEFAULT_STIL, {}, res);
});

app.get("/api/demo/simulate", (_req, res) => {
  const stil = demoStilPath();
  if (!stil) {
    res.status(404).json({ error: "Demo STIL not found (set VERILUMEN_DEMO_DATASETS)" });
    return;
  }
  runWorker(stil, {}, res);
});

app.get("/api/demo/logs", (_req, res) => {
  const dir = demoLogsDir();
  if (!dir) {
    res.status(404).json({ error: "Demo log folder not found" });
    return;
  }
  const files = [];
  const walk = (base, relBase) => {
    for (const name of fs.readdirSync(base)) {
      const abs = path.join(base, name);
      const rel = relBase ? `${relBase}/${name}` : name;
      if (fs.statSync(abs).isDirectory()) walk(abs, rel);
      else files.push({ rel: rel.replace(/\\/g, "/"), name });
    }
  };
  walk(dir, "LOT_1_Center");
  res.json({ files });
});

app.get("/api/demo/logs/file", (req, res) => {
  const dir = demoLogsDir();
  const rel = String(req.query.rel || "").replace(/\\/g, "/");
  if (!dir || !rel || rel.includes("..")) {
    res.status(400).json({ error: "Invalid demo log path" });
    return;
  }
  const abs = path.join(dir, "..", rel);
  const normalized = path.normalize(abs);
  const allowedRoot = path.normalize(path.join(dir, ".."));
  if (!normalized.startsWith(allowedRoot) || !fs.existsSync(normalized)) {
    res.status(404).json({ error: "Demo log file not found" });
    return;
  }
  res.type("text/plain").send(fs.readFileSync(normalized, "utf8"));
});

/**
 * Upload multiple log folders (files with relative paths) and count
 * FAIL/PASS per pattern for Verilumen kept + discarded lists.
 *
 * multipart fields:
 *   logs[] — files
 *   relative_paths — JSON string array matching files order
 *   selected_ids — JSON array of kept pattern ids
 *   discarded_ids — JSON array of discarded pattern ids
 */
app.post("/api/analyze-fails", upload.array("logs", 5000), (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      res.status(400).json({ error: "Upload one or more log folders/files" });
      return;
    }

    let relativePaths = [];
    let selectedIds = [];
    let discardedIds = [];
    try {
      relativePaths = JSON.parse(req.body.relative_paths || "[]");
      selectedIds = JSON.parse(req.body.selected_ids || "[]");
      discardedIds = JSON.parse(req.body.discarded_ids || "[]");
    } catch {
      res.status(400).json({ error: "Invalid JSON in relative_paths / selected_ids / discarded_ids" });
      return;
    }

    if (!selectedIds.length && !discardedIds.length) {
      res.status(400).json({
        error: "Run a live simulation first so kept/discarded pattern lists are available",
      });
      return;
    }

    const batchId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const batchDir = path.join(LOG_DIR, batchId);
    fs.mkdirSync(batchDir, { recursive: true });

    const filePairs = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const rel =
        (relativePaths[i] && String(relativePaths[i])) ||
        f.originalname ||
        `file_${i}.log`;
      const safeRel = rel.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\./g, "_");
      const dest = path.join(batchDir, safeRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(f.path, dest);
      filePairs.push({ rel: safeRel, abs: dest });
    }

    const manifest = path.join(batchDir, "_manifest.json");
    fs.writeFileSync(
      manifest,
      JSON.stringify({ files: filePairs.map((p) => p.rel), selectedIds, discardedIds }),
      "utf8"
    );

    const py = resolvePython();
    const script = path.join(ROOT, "log_fail_analyzer.py");
    const args = [
      "-c",
      [
        "import json,sys",
        "from pathlib import Path",
        "from log_fail_analyzer import analyze_uploaded_files",
        "m=json.load(open(sys.argv[1],encoding='utf-8'))",
        "root=Path(sys.argv[2])",
        "pairs=[(r, root/r) for r in m['files']]",
        "out=analyze_uploaded_files(pairs,m['selectedIds'],m['discardedIds'])",
        "print(json.dumps(out))",
      ].join(";"),
      manifest,
      batchDir,
    ];

    const child = spawn(py, args, {
      cwd: ROOT,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      res.status(500).json({ error: err.message || String(err) });
    });
    child.on("close", (code) => {
      if (code !== 0) {
        res.status(500).json({
          error: stderr.trim() || `Analyzer exited with code ${code}`,
        });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim().split("\n").pop());
        res.json(result);
      } catch (err) {
        res.status(500).json({
          error: `Bad analyzer output: ${err.message}`,
          raw: stdout.slice(0, 2000),
        });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Production: serve built React UI from the same origin as the API.
// Visitors only get the compiled frontend — not your source tree.
const CLIENT_DIST = path.join(ROOT, "client", "dist");
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false }));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => {
      if (err) next();
    });
  });
}

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`ATE vector-memory app on http://0.0.0.0:${PORT}`);
  if (fs.existsSync(CLIENT_DIST)) {
    console.log(`Serving UI from ${CLIENT_DIST}`);
  } else {
    console.log("No client/dist yet — run: npm run build");
  }
});