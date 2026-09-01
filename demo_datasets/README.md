# Demo datasets (presentation preload)

Bundled files used when opening an agent from the main dashboard (`?demo=1`).
Upload controls in each agent still work — a new upload replaces the demo session.

| Folder | Agent | Files |
|--------|-------|-------|
| `shmoo/` | SHMOO ML | `Normal_Shmoo_Dataset_500.csv` |
| `test_time/` | Test Time Opt | `pre test/*.stil`, `post process/LOT_1_Center/*.log` |
| `retest/` | Retest AI | 200-event pre-retest XLSX + 119-event validation XLSX |
| `retest/cache/` | (baked at build) | `demo_response.json` — instant demo API response |
| `dtl/` | Dynamic Test Limits | `dtl_input_2026_01/02/03.zip` |
| `dtl/cache/` | (baked at build) | Pre-computed analysis sandbox + `session_meta.json` |

Set `VERILUMEN_DEMO_DATASETS` to this directory (desktop supervisor does this automatically).

Bake caches locally (optional, before installer build):

```powershell
python desktop/scripts/bake_demo_cache.py --demo-root demo_datasets --dtl-project tools/dtl
```
