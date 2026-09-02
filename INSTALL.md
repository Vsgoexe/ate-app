# VERILUMEN ATE Intelligence — Installation Guide

## Requirements

- Windows 10 or 11 (64-bit)
- ~2 GB free disk space for install
- Internet not required after install

---

## Step 1 — Get the installer

Friends: download the installer from GitHub Releases (do not clone this repo):

**https://github.com/Vsgoexe/ate-app/releases**

File name: `Verilumen-ATE-Intelligence-Setup-1.0.3.exe`

Developers building locally will also find it at:

```
desktop\dist\Verilumen-ATE-Intelligence-Setup-1.0.3.exe
```

---

## Step 2 — Run the installer

1. Double-click `Verilumen-ATE-Intelligence-Setup-1.0.3.exe`
2. If Windows SmartScreen appears (“Windows protected your PC”), click **More info** → **Run anyway** (app is not code-signed)
3. Choose install location (default suggestion: `C:\VERILUMEN`)
4. Finish the wizard and launch **VERILUMEN ATE Intelligence**

---

## Step 3 — Installed app location

After install, the app is typically here:

```
%LOCALAPPDATA%\Programs\VERILUMEN ATE Intelligence\
```

Example:

```
C:\Users\<YourName>\AppData\Local\Programs\VERILUMEN ATE Intelligence\
```

Shortcuts are created on the **Desktop** and **Start Menu**.

---

## Step 4 — Open the dashboard

There is no login. The app opens the local dashboard automatically. Nothing is sent to the internet.

---

## Step 5 — Try the demo agents

From the dashboard, click any agent card. Demo data loads automatically.

| Agent     | What it does           |
|-----------|------------------------|
| SHMOO     | ML shmoo analysis      |
| Test Time | Test time optimization |
| Retest    | Retest reduction       |
| DTL       | Defect trend analysis  |

---

## Rebuild the installer (developers)

From the project root:

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

Output installer:

```
desktop\dist\Verilumen-ATE-Intelligence-Setup-1.0.3.exe
```

---

## Troubleshooting

| Issue                      | Fix                                                              |
|----------------------------|------------------------------------------------------------------|
| SmartScreen blocks install | Click **More info** → **Run anyway**                             |
| Want to stop setup         | Click **Cancel** on any wizard page (confirms, then exits)       |
| App won’t start            | Close all VERILUMEN windows, then reopen from Start Menu         |
| Demo data missing          | Fully quit and restart the app                                   |
| Old build folders          | Use `desktop\dist\` only; `dist-new` and `dist-fresh` are leftovers |

---

## Uninstall

**Settings → Apps → Installed apps** → search **VERILUMEN ATE Intelligence** → **Uninstall**
