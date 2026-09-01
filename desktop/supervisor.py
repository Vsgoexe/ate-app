"""
VERILUMEN desktop supervisor.

Starts local dashboard + four agent backends on 127.0.0.1.
Packaged Electron sets VERILUMEN_PACKAGED=1, VERILUMEN_ROOT, VERILUMEN_PYTHON, VERILUMEN_NODE.
Unpackaged (dev) behaves like run_suite.py: npm/python from PATH.
"""
from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

processes: list[subprocess.Popen] = []

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


def packaged() -> bool:
    return os.environ.get("VERILUMEN_PACKAGED", "").strip() == "1"


def root() -> str:
    env = os.environ.get("VERILUMEN_ROOT", "").strip()
    if env:
        return os.path.abspath(env)
    here = os.path.dirname(os.path.abspath(__file__))
    suite = os.path.join(here, "suite")
    if os.path.isdir(os.path.join(suite, "tools")):
        return suite
    return os.path.dirname(here)


def py() -> str:
    return os.environ.get("VERILUMEN_PYTHON") or os.environ.get("PYTHON") or sys.executable


def node() -> str:
    return os.environ.get("VERILUMEN_NODE") or os.environ.get("NODE") or (
        "node.exe" if sys.platform == "win32" else "node"
    )


def npm() -> str:
    return os.environ.get("VERILUMEN_NPM") or ("npm.cmd" if sys.platform == "win32" else "npm")


def static_proxy() -> str:
    env = os.environ.get("VERILUMEN_STATIC_PROXY", "").strip()
    if env:
        return env
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "static_proxy.js")


def popen(args: list[str], cwd: str, env: dict | None = None, shell: bool = False) -> subprocess.Popen:
    merged = {**os.environ, **(env or {})}
    merged.setdefault("PYTHON", py())
    merged.setdefault("PYTHONIOENCODING", "utf-8")
    log_dir = os.environ.get("TEMP") or os.environ.get("TMP") or cwd
    label = "".join(ch if ch.isalnum() else "-" for ch in os.path.basename(cwd))[:32]
    log_path = os.path.join(log_dir, f"verilumen-{label}-{len(processes)}.log")
    logf = open(log_path, "a", encoding="utf-8")
    logf.write(f"\n--- {time.strftime('%Y-%m-%d %H:%M:%S')} cwd={cwd} args={args}\n")
    logf.flush()
    kwargs: dict = {
        "cwd": cwd,
        "env": merged,
        "stdout": logf,
        "stderr": logf,
        "shell": shell,
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = CREATE_NO_WINDOW
    proc = subprocess.Popen(args, **kwargs)
    processes.append(proc)
    return proc


def port_service_name(port: int) -> str | None:
    """Return FastAPI `service` field if something is already bound, else None."""
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as r:
            import json
            data = json.loads(r.read().decode("utf-8", "ignore"))
            if isinstance(data, dict):
                return str(data.get("service") or data.get("status") or "unknown")
    except Exception:
        return None
    return None


def uvicorn_args(import_path: str, port: int, src: str, factory: bool = False) -> list[str]:
    """Launch uvicorn with `src` injected into sys.path.

    The embedded Python ships a ._pth file, which makes it ignore PYTHONPATH, so the
    import root has to be added in-process rather than through the environment.
    """
    bootstrap = (
        "import sys, uvicorn; "
        f"sys.path.insert(0, {src!r}); "
        f"uvicorn.run({import_path!r}, factory={factory!r}, host='127.0.0.1', port={port})"
    )
    return [py(), "-c", bootstrap]


def wait_for_port(port: int, host: str = "127.0.0.1", timeout: float = 60) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.4)
    return False


def kill_all() -> None:
    for p in processes:
        try:
            if sys.platform == "win32":
                subprocess.run(
                    ["taskkill", "/PID", str(p.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=CREATE_NO_WINDOW,
                )
            else:
                p.terminate()
        except Exception:
            pass


def cleanup(sig=None, frame=None) -> None:
    print("\nShutting down VERILUMEN services...")
    kill_all()
    sys.exit(0)


def parent_alive(pid: int) -> bool:
    if sys.platform != "win32":
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    result = subprocess.run(
        ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
        capture_output=True,
        text=True,
        creationflags=CREATE_NO_WINDOW,
    )
    return str(pid) in result.stdout


def demo_datasets_dir(repo: str) -> str | None:
    demo = os.path.join(repo, "demo_datasets")
    if os.path.isdir(demo):
        os.environ["VERILUMEN_DEMO_DATASETS"] = demo
        return demo
    return None


def demo_env(extra: dict | None = None) -> dict:
    """Child-process env with VERILUMEN_DEMO_DATASETS when the suite bundles demo data."""
    merged: dict = {**(extra or {})}
    demo = os.environ.get("VERILUMEN_DEMO_DATASETS", "").strip()
    if demo and os.path.isdir(demo):
        merged["VERILUMEN_DEMO_DATASETS"] = demo
    return merged


def warmup_demo_caches() -> None:
    """Pre-load Retest/DTL demo sessions in the background for faster first card click."""
    def _run() -> None:
        for port, path in (
            (8002, "/api/analysis/demo/load"),
            (8001, "/api/v1/analysis/demo/load"),
        ):
            if not wait_for_port(port, timeout=90):
                print(f"Demo warmup: port {port} not ready")
                continue
            try:
                req = urllib.request.Request(
                    f"http://127.0.0.1:{port}{path}",
                    data=b"",
                    method="POST",
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=300) as resp:
                    print(f"Demo warmup {path}: HTTP {resp.status}")
            except urllib.error.HTTPError as exc:
                print(f"Demo warmup {path}: HTTP {exc.code}")
            except Exception as exc:  # noqa: BLE001
                print(f"Demo warmup {path}: {exc}")

    threading.Thread(target=_run, name="verilumen-demo-warmup", daemon=True).start()


def start_dev(repo: str) -> None:
    shmoo = os.path.join(repo, "tools", "shmoo_ml")
    tto = os.path.join(repo, "tools", "test_time_opt")
    ate = os.path.join(repo, "tools", "ate_frontend")
    dtl = os.path.join(repo, "tools", "dtl")
    retest = os.path.join(repo, "tools", "retest_reduction")

    demo = demo_datasets_dir(repo)

    print("[1] SHMOO ML :5000")
    popen([py(), "run.py"], cwd=shmoo, env=demo_env())

    print("[2] Test Time Opt (npm run dev)")
    popen([npm(), "run", "dev"], cwd=tto, shell=(sys.platform == "win32"), env=demo_env())

    env_path = os.path.join(ate, ".env.local")
    with open(env_path, "w", encoding="utf-8") as f:
        f.write("NEXT_PUBLIC_API_BASE_URL=/api\n")
        f.write("NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws/test-floor\n")
        f.write("NEXT_PUBLIC_KPI_M_BIST_SHMOO_URL=http://127.0.0.1:5000\n")
        f.write("NEXT_PUBLIC_KPI_TEST_TIME_URL=http://127.0.0.1:5173\n")
        f.write("NEXT_PUBLIC_KPI_RETEST_URL=http://127.0.0.1:5175\n")
        f.write("NEXT_PUBLIC_KPI_DTL_URL=http://127.0.0.1:5174/three-month\n")
        f.write("NEXT_PUBLIC_OFFLINE=1\n")

    print("[3] ATE backend :8000")
    occupant = port_service_name(8000)
    if occupant and occupant != "ate_backend":
        print(
            f"WARNING: port 8000 is already serving '{occupant}'. "
            "The dashboard summary API will 404 until that process is stopped. "
            "Retest AI belongs on port 8002, not 8000."
        )
    popen([py(), "ate_backend.py"], cwd=ate)

    print("[4] Next.js dashboard :3000")
    popen([npm(), "run", "dev"], cwd=ate, shell=(sys.platform == "win32"))

    print("[5] DTL API :8001")
    dtl_env = demo_env({"PYTHONPATH": os.path.join(dtl, "src")})
    popen(
        [py(), "-m", "uvicorn", "dtl_agent.api.app:create_app", "--factory",
         "--host", "127.0.0.1", "--port", "8001"],
        cwd=dtl,
        env=dtl_env,
    )

    print("[6] DTL UI :5174")
    popen(
        [npm(), "run", "dev", "--", "--port", "5174", "--host", "127.0.0.1"],
        cwd=os.path.join(dtl, "frontend"),
        shell=(sys.platform == "win32"),
    )

    print("[7] Retest API :8002")
    popen(
        [py(), "-m", "uvicorn", "retest_ai.api.main:app", "--host", "127.0.0.1", "--port", "8002"],
        cwd=retest,
        env=demo_env({"PYTHONPATH": retest}),
    )

    print("[8] Retest UI :5175")
    popen(
        [npm(), "run", "dev", "--", "--port", "5175", "--host", "127.0.0.1"],
        cwd=os.path.join(retest, "frontend"),
        shell=(sys.platform == "win32"),
    )


def find_next_standalone(ate: str) -> str | None:
    standalone = os.path.join(ate, ".next", "standalone")
    if os.path.isfile(os.path.join(standalone, "server.js")):
        return standalone
    if not os.path.isdir(standalone):
        return None
    for dirpath, _, files in os.walk(standalone):
        if "server.js" in files:
            return dirpath
    return None


def start_packaged(repo: str) -> None:
    shmoo = os.path.join(repo, "tools", "shmoo_ml")
    tto = os.path.join(repo, "tools", "test_time_opt")
    ate = os.path.join(repo, "tools", "ate_frontend")
    dtl = os.path.join(repo, "tools", "dtl")
    retest = os.path.join(repo, "tools", "retest_reduction")
    proxy = static_proxy()

    demo = demo_datasets_dir(repo)
    if demo:
        print(f"Demo datasets: {demo}")

    print("[1] SHMOO ML :5000")
    popen([py(), "run.py"], cwd=shmoo, env=demo_env())

    print("[2] Test Time Express :8787")
    popen([node(), "server/index.js"], cwd=tto, env=demo_env({"PORT": "8787", "PYTHON": py()}))

    print("[3] ATE backend :8000")
    occupant = port_service_name(8000)
    if occupant and occupant != "ate_backend":
        print(
            f"WARNING: port 8000 is already serving '{occupant}'. "
            "The dashboard summary API will 404 until that process is stopped. "
            "Retest AI belongs on port 8002, not 8000."
        )
    popen([py(), "ate_backend.py"], cwd=ate)

    standalone = find_next_standalone(ate)
    if not standalone:
        raise SystemExit(f"Next.js standalone server.js not found under {ate}")
    print("[4] Next.js dashboard :3000")
    popen(
        [node(), "server.js"],
        cwd=standalone,
        env={"PORT": "3000", "HOSTNAME": "127.0.0.1", "VERILUMEN_OFFLINE": "1"},
    )

    print("[5] DTL API :8001")
    popen(
        uvicorn_args("dtl_agent.api.app:create_app", 8001, os.path.join(dtl, "src"), factory=True),
        cwd=dtl,
        env=demo_env({"DTL_PROJECT_ROOT": dtl}),
    )

    dtl_dist = os.path.join(dtl, "frontend", "dist")
    print("[6] DTL UI :5174")
    popen(
        [node(), proxy],
        cwd=dtl_dist,
        env={
            "STATIC_ROOT": dtl_dist,
            "PORT": "5174",
            "API_TARGET": "http://127.0.0.1:8001",
            "SPA_FALLBACK": "1",
        },
    )

    print("[7] Retest API :8002")
    popen(
        uvicorn_args("retest_ai.api.main:app", 8002, retest),
        cwd=retest,
        env=demo_env(),
    )

    retest_dist = os.path.join(retest, "frontend", "dist")
    print("[8] Retest UI :5175")
    popen(
        [node(), proxy],
        cwd=retest_dist,
        env={
            "STATIC_ROOT": retest_dist,
            "PORT": "5175",
            "API_TARGET": "http://127.0.0.1:8002",
            "SPA_FALLBACK": "1",
        },
    )


def main() -> None:
    signal.signal(signal.SIGINT, cleanup)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, cleanup)

    repo = root()
    print("=" * 60)
    print("  VERILUMEN ATE Intelligence — local supervisor")
    print(f"  root={repo}")
    print(f"  packaged={packaged()}")
    print("=" * 60)

    if packaged():
        start_packaged(repo)
    else:
        start_dev(repo)

    print("Waiting for dashboard on :3000 ...")
    if not wait_for_port(3000, timeout=120):
        print("WARNING: port 3000 did not open in time")
    else:
        print("Dashboard ready at http://127.0.0.1:3000")
        warmup_demo_caches()

    # Electron may die without running its quit handlers, which would orphan every
    # service we started, so shut down as soon as the parent disappears.
    parent_pid = 0
    try:
        parent_pid = int(os.environ.get("VERILUMEN_PARENT_PID", "0"))
    except ValueError:
        parent_pid = 0

    while True:
        time.sleep(2)
        if parent_pid and not parent_alive(parent_pid):
            print(f"Parent process {parent_pid} exited; stopping services.")
            cleanup()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        cleanup()
