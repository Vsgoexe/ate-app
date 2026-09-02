# VERILUMEN ATE Intelligence

Unified Semiconductor ATE & ML Analytics Suite.

## Install on a Windows laptop

Do **not** clone this repo to run the app. Download the installer from **[Releases](https://github.com/Vsgoexe/ate-app/releases)**:

1. Download `Verilumen-ATE-Intelligence-Setup-1.0.3.exe`
2. Double-click it. If Windows SmartScreen appears, choose **More info → Run anyway**
3. Finish the wizard and open **VERILUMEN ATE Intelligence** from the Desktop or Start Menu
4. The dashboard opens locally — no login, no cloud API

Full steps: [INSTALL.md](INSTALL.md)

## Structure
- `tools/shmoo_ml`: M-BIST Shmoo ML Optimization
- `tools/test_time_opt`: ATE Test Time & Vector Memory Optimization
- `tools/ate_frontend`: ATE Dashboard & Analytics
- `dashboard/`: Unified local launcher & UI

## Branching
- `main`: Stable production releases
- `dev`: Integration branch
- `feature/<tool_name>`: Individual feature development
