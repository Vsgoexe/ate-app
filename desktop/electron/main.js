const { app, BrowserWindow, dialog } = require("electron");
const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const net = require("net");
const path = require("path");

let supervisor = null;
let quitting = false;
let mainWindow = null;

const SERVICE_PORTS = [3000, 5000, 8000, 8001, 8002, 5174, 5175, 8787];

function waitForPort(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`));
          return;
        }
        setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(4000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(attempt, 400);
    };
    attempt();
  });
}

function freeServicePorts() {
  if (process.platform !== "win32") return;
  const script = [
    `$ports = @(${SERVICE_PORTS.join(",")})`,
    "foreach ($port in $ports) {",
    "  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |",
    "    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }",
    "}",
  ].join(" ");
  try {
    execSync(`powershell.exe -NoProfile -Command "${script}"`, {
      windowsHide: true,
      timeout: 20000,
    });
  } catch {
    /* ignore */
  }
}

function resourcesDir() {
  if (app.isPackaged) return process.resourcesPath;
  return path.join(__dirname, "..");
}

function repoRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, "suite");
  return path.join(__dirname, "..", "..");
}

function pythonBin() {
  const bundled = path.join(resourcesDir(), "python", "python.exe");
  if (fs.existsSync(bundled)) return bundled;
  return process.platform === "win32" ? "python" : "python3";
}

function nodeBin() {
  const bundled = path.join(resourcesDir(), "node", "node.exe");
  if (fs.existsSync(bundled)) return bundled;
  return "node";
}

function supervisorPath() {
  const packaged = path.join(resourcesDir(), "supervisor.py");
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, "..", "supervisor.py");
}

function staticProxyPath() {
  const packaged = path.join(resourcesDir(), "static_proxy.js");
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, "..", "static_proxy.js");
}

function bundledResourceRoot() {
  return path.resolve(resourcesDir()).toLowerCase();
}

function killStaleBundledProcesses() {
  if (process.platform !== "win32") return;
  const root = bundledResourceRoot().replace(/'/g, "''");
  const script = [
    `$root = '${root}'`,
    "Get-CimInstance Win32_Process -Filter \"Name='python.exe' OR Name='node.exe'\" |",
    "Where-Object { $_.ExecutablePath -and ($_.ExecutablePath.ToLower().StartsWith($root)) } |",
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join(" ");
  try {
    execSync(`powershell.exe -NoProfile -Command "${script}"`, {
      windowsHide: true,
      timeout: 15000,
    });
  } catch {
    /* ignore */
  }
}

function killSupervisor() {
  if (!supervisor || supervisor.killed) return;
  const proc = supervisor;
  supervisor = null;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${proc.pid} /T /F`, { windowsHide: true, timeout: 10000 });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    /* ignore */
  }
}

function killLocalServices() {
  killSupervisor();
  killStaleBundledProcesses();
  freeServicePorts();
}

function loadingHtml(message) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"/><title>VERILUMEN</title>
<style>
  html,body{margin:0;height:100%;background:#05080e;color:#eef3f8;font-family:Segoe UI,sans-serif;}
  .wrap{display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;}
  h1{font-size:18px;letter-spacing:.18em;text-transform:uppercase;margin:0;color:#6bc1f2;}
  p{margin:0;color:#8b9bb0;font-size:13px;}
</style></head>
<body><div class="wrap">
  <h1>VERILUMEN ATE Intelligence</h1>
  <p>${message}</p>
</div></body></html>`)}`;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#05080e",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: "VERILUMEN ATE Intelligence",
  });
  mainWindow = win;

  await win.loadURL(loadingHtml("Starting local services…"));

  // Clear orphaned services from a prior crash and free ports this suite owns.
  killStaleBundledProcesses();
  freeServicePorts();

  const env = {
    ...process.env,
    VERILUMEN_PACKAGED: app.isPackaged ? "1" : "0",
    VERILUMEN_ROOT: repoRoot(),
    VERILUMEN_PYTHON: pythonBin(),
    VERILUMEN_NODE: nodeBin(),
    VERILUMEN_STATIC_PROXY: staticProxyPath(),
    VERILUMEN_PARENT_PID: String(process.pid),
    PYTHON: pythonBin(),
    PYTHONIOENCODING: "utf-8",
    // Without this, Python block-buffers its piped stdout and the log stays empty.
    PYTHONUNBUFFERED: "1",
  };

  const logPath = path.join(app.getPath("userData"), "supervisor.log");
  // spawn() only accepts a stdio stream once its fd exists, so open it synchronously.
  const logFd = fs.openSync(logPath, "a");
  fs.writeSync(logFd, `\n--- ${new Date().toISOString()} packaged=${app.isPackaged} ---\n`);

  supervisor = spawn(pythonBin(), [supervisorPath()], {
    cwd: resourcesDir(),
    env,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });

  supervisor.on("error", (err) => {
    fs.writeSync(logFd, `spawn failed: ${err.stack || err}\n`);
    if (!quitting && !win.isDestroyed()) {
      win.loadURL(loadingHtml(`Could not start local services: ${String(err.message || err)}`));
    }
  });

  supervisor.on("exit", (code) => {
    if (!quitting && !win.isDestroyed()) {
      win.loadURL(loadingHtml(`Local services stopped (code ${code ?? "?"}). Close the app and launch again.`));
    }
  });

  await waitForPort(3000, 180000);
  try {
    await waitForHttp("http://127.0.0.1:8000/api/dashboard/summary", 120000);
  } catch (err) {
    fs.writeSync(logFd, `ate_backend not ready: ${String(err)}\n`);
  }
  await win.loadURL("http://127.0.0.1:3000");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await createWindow();
    } catch (err) {
      const message = String((err && err.stack) || err);
      try {
        fs.appendFileSync(
          path.join(app.getPath("userData"), "supervisor.log"),
          `startup failed: ${message}\n`
        );
      } catch {
        /* ignore */
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        await mainWindow.loadURL(loadingHtml(`Startup failed: ${message}`));
      } else {
        dialog.showErrorBox("VERILUMEN ATE Intelligence", message);
        app.quit();
      }
    }
  });
}

app.on("before-quit", () => {
  quitting = true;
  killLocalServices();
});

app.on("window-all-closed", () => {
  quitting = true;
  killLocalServices();
  app.quit();
});
