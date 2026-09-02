# Hot-deploy demo preload fixes into an installed VERILUMEN desktop app.
# Close the app completely before running. Restart the app after deploy.
$ErrorActionPreference = "Stop"

$DesktopRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent $DesktopRoot
$InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\VERILUMEN ATE Intelligence"
$SuiteDir = Join-Path $InstallRoot "resources\suite"

if (-not (Test-Path $SuiteDir)) {
  throw "Installed suite not found at: $SuiteDir`nInstall VERILUMEN ATE Intelligence first, or set InstallRoot manually."
}

Write-Host "==> Stop running VERILUMEN (required to replace locked frontend files)"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "*VERILUMEN ATE Intelligence*" } |
  ForEach-Object {
    Write-Host "  taskkill /PID $($_.Id) /T /F"
    & taskkill.exe /PID $_.Id /T /F *>$null
  }
$ErrorActionPreference = $prevEap
Start-Sleep -Seconds 3

Write-Host "==> Deploy demo_datasets"
$demoSrc = Join-Path $RepoRoot "demo_datasets"
$demoDst = Join-Path $SuiteDir "demo_datasets"
if (-not (Test-Path $demoSrc)) { throw "Missing repo demo_datasets: $demoSrc" }
& robocopy $demoSrc $demoDst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy demo_datasets failed: $LASTEXITCODE" }

Write-Host "==> Deploy supervisor + agent backends"
$copyPairs = @(
  @{ Src = Join-Path $DesktopRoot "supervisor.py"; Dst = Join-Path $InstallRoot "resources\supervisor.py" },
  @{ Src = Join-Path $RepoRoot "tools\shmoo_ml\src\app.py"; Dst = Join-Path $SuiteDir "tools\shmoo_ml\src\app.py" },
  @{ Src = Join-Path $RepoRoot "tools\shmoo_ml\src\templates\index.html"; Dst = Join-Path $SuiteDir "tools\shmoo_ml\src\templates\index.html" },
  @{ Src = Join-Path $RepoRoot "tools\retest_reduction\retest_ai\api\routes.py"; Dst = Join-Path $SuiteDir "tools\retest_reduction\retest_ai\api\routes.py" },
  @{ Src = Join-Path $RepoRoot "tools\retest_reduction\retest_ai\demo_cache.py"; Dst = Join-Path $SuiteDir "tools\retest_reduction\retest_ai\demo_cache.py" },
  @{ Src = Join-Path $RepoRoot "tools\dtl\src\dtl_agent\api\routes\analysis.py"; Dst = Join-Path $SuiteDir "tools\dtl\src\dtl_agent\api\routes\analysis.py" },
  @{ Src = Join-Path $RepoRoot "tools\dtl\src\dtl_agent\api\demo_cache.py"; Dst = Join-Path $SuiteDir "tools\dtl\src\dtl_agent\api\demo_cache.py" },
  @{ Src = Join-Path $RepoRoot "tools\test_time_opt\server\index.js"; Dst = Join-Path $SuiteDir "tools\test_time_opt\server\index.js" }
)
foreach ($pair in $copyPairs) {
  if (-not (Test-Path $pair.Src)) { throw "Missing source file: $($pair.Src)" }
  $parent = Split-Path -Parent $pair.Dst
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Copy-Item -Force $pair.Src $pair.Dst
  Write-Host "  $($pair.Dst)"
}

Write-Host "==> Deploy agent frontends (dist)"
$frontendPairs = @(
  @{ Src = Join-Path $RepoRoot "tools\retest_reduction\frontend\dist"; Dst = Join-Path $SuiteDir "tools\retest_reduction\frontend\dist" },
  @{ Src = Join-Path $RepoRoot "tools\dtl\frontend\dist"; Dst = Join-Path $SuiteDir "tools\dtl\frontend\dist" },
  @{ Src = Join-Path $RepoRoot "tools\test_time_opt\client\dist"; Dst = Join-Path $SuiteDir "tools\test_time_opt\client\dist" }
)
foreach ($pair in $frontendPairs) {
  if (-not (Test-Path $pair.Src)) {
    throw "Missing built frontend: $($pair.Src)`nRun npm run build in that frontend first."
  }
  if (Test-Path $pair.Dst) {
    Remove-Item $pair.Dst -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $pair.Dst | Out-Null
  & robocopy $pair.Src $pair.Dst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy $($pair.Src) failed: $LASTEXITCODE" }
  Write-Host "  $($pair.Dst)"
}

function Find-ServerJs($root) {
  $direct = Join-Path $root "server.js"
  if (Test-Path $direct) { return $direct }
  Get-ChildItem $root -Recurse -Filter "server.js" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}

$ate = Join-Path $RepoRoot "tools\ate_frontend"
$standaloneSrc = Join-Path $ate ".next\standalone"
if (Test-Path $standaloneSrc) {
  Write-Host "==> Deploy Next.js dashboard (standalone)"
  $standaloneDst = Join-Path $SuiteDir "tools\ate_frontend\.next\standalone"
  if (Test-Path $standaloneDst) { Remove-Item $standaloneDst -Recurse -Force }
  & robocopy $standaloneSrc $standaloneDst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy dashboard standalone failed: $LASTEXITCODE" }
  $serverJsDst = Find-ServerJs $standaloneDst
  if ($serverJsDst) {
    $standaloneAppDir = Split-Path -Parent $serverJsDst
    $staticSrc = Join-Path $ate ".next\static"
    $staticDst = Join-Path $standaloneAppDir ".next\static"
    if (Test-Path $staticSrc) {
      if (Test-Path $staticDst) { Remove-Item $staticDst -Recurse -Force }
      & robocopy $staticSrc $staticDst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    }
    $publicSrc = Join-Path $ate "public"
    $publicDst = Join-Path $standaloneAppDir "public"
    if (Test-Path $publicSrc) {
      if (Test-Path $publicDst) { Remove-Item $publicDst -Recurse -Force }
      & robocopy $publicSrc $publicDst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    }
    Write-Host "  $standaloneDst"
  }
} else {
  Write-Warning "Skip dashboard deploy: run 'npm run build' in tools/ate_frontend with ELECTRON_BUILD=1 first."
}

Write-Host "Deploy complete. Restarting VERILUMEN ATE Intelligence..."
& (Join-Path $PSScriptRoot "restart-verilumen.ps1")
