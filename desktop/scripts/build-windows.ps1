# VERILUMEN Windows installer build
# Produces desktop/dist/Verilumen-ATE-Intelligence-Setup-*.exe
# Requires: Node.js + internet on the BUILD machine (end users stay offline).
$ErrorActionPreference = "Stop"

$DesktopRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent $DesktopRoot

# Staging lives on a short path: PyTorch ships license folders ~220 chars deep,
# which blows past Windows' 260-char MAX_PATH if we stage inside the repo.
$BuildRoot = if ($env:VL_BUILD_ROOT) { $env:VL_BUILD_ROOT } else { "C:\vlb" }
$Stage = Join-Path $BuildRoot "stage"
$Runtimes = Join-Path $BuildRoot "rt"
$PythonDir = Join-Path $Stage "python"
$NodeDir = Join-Path $Stage "node"
$SuiteDir = Join-Path $Stage "suite"

# electron-builder resolves extraResources paths relative to the project dir and cannot
# take an absolute source, so expose the short staging root as desktop/stage via a junction.
$StageLink = Join-Path $DesktopRoot "stage"

$PythonVer = "3.11.9"
$NodeVer = "20.18.3"

Write-Host "Build staging root: $BuildRoot"
if ($BuildRoot.Length -gt 20) {
  Write-Warning "Staging root is long ($($BuildRoot.Length) chars); PyTorch may exceed MAX_PATH. Set VL_BUILD_ROOT to something shorter like C:\vlb."
}

function Ensure-Dir($path) {
  New-Item -ItemType Directory -Force -Path $path | Out-Null
}

# PowerShell does not abort on a native command's non-zero exit, so check explicitly.
function Invoke-Native($label, [scriptblock]$block) {
  & $block
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed with exit code $LASTEXITCODE"
  }
}

function Download-File($url, $dest) {
  if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 1000)) {
    Write-Host "cached $dest"
    return
  }
  Write-Host "GET $url"
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

function Prune-PythonBundle($pythonDir) {
  Write-Host "==> Prune Python bundle (MAX_PATH-safe install)"
  Get-ChildItem $pythonDir -Recurse -Directory -Filter "licenses" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\.dist-info\\licenses$" } |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

  Get-ChildItem $pythonDir -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

  foreach ($drop in @("Lib\site-packages\torch\share", "Lib\site-packages\torch\include")) {
    $p = Join-Path $pythonDir $drop
    if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
  }

  $installBase = "C:\VERILUMEN\resources\python"
  $tooLong = @(Get-ChildItem $pythonDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { ($installBase.Length + $_.FullName.Substring($pythonDir.Length).Length) -gt 250 })
  if ($tooLong.Count -gt 0) {
    throw "Python bundle still has $($tooLong.Count) paths over MAX_PATH at install time."
  }
}

Write-Host "==> Fonts"
& (Join-Path $PSScriptRoot "download-fonts.ps1")

Write-Host "==> npm install (frontends)"
function Npm-Install($dir) {
  if (-not (Test-Path (Join-Path $dir "package.json"))) { return }
  Push-Location $dir
  try {
    if (-not (Test-Path "node_modules")) {
      Invoke-Native "npm install ($dir)" { npm install }
    }
  } finally {
    Pop-Location
  }
}

Npm-Install (Join-Path $RepoRoot "tools\ate_frontend")
Npm-Install (Join-Path $RepoRoot "tools\test_time_opt")
Npm-Install (Join-Path $RepoRoot "tools\test_time_opt\client")
Npm-Install (Join-Path $RepoRoot "tools\dtl\frontend")
Npm-Install (Join-Path $RepoRoot "tools\retest_reduction\frontend")
Npm-Install $DesktopRoot

Write-Host "==> Build Next.js dashboard (offline + standalone)"
$ate = Join-Path $RepoRoot "tools\ate_frontend"
Push-Location $ate
try {
  $env:ELECTRON_BUILD = "1"
  $env:VERILUMEN_OFFLINE = "1"
  $env:NEXT_PUBLIC_OFFLINE = "1"
  $env:NEXT_PUBLIC_API_BASE_URL = "/api"
  $env:NEXT_PUBLIC_WS_URL = "ws://127.0.0.1:8000/ws/test-floor"
  $env:NEXT_PUBLIC_KPI_M_BIST_SHMOO_URL = "http://127.0.0.1:5000"
  $env:NEXT_PUBLIC_KPI_TEST_TIME_URL = "http://127.0.0.1:8787"
  $env:NEXT_PUBLIC_KPI_RETEST_URL = "http://127.0.0.1:5175"
  $env:NEXT_PUBLIC_KPI_DTL_URL = "http://127.0.0.1:5174/three-month"
  Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
  Invoke-Native "next build" { npm run build }
} finally {
  Pop-Location
}

Write-Host "==> Build Vite agent UIs"
function Build-Vite($dir, $label) {
  Push-Location $dir
  try {
    Invoke-Native $label { npm run build }
  } finally {
    Pop-Location
  }
}
Build-Vite (Join-Path $RepoRoot "tools\test_time_opt") "test_time_opt build"
Build-Vite (Join-Path $RepoRoot "tools\dtl\frontend") "dtl frontend build"
Build-Vite (Join-Path $RepoRoot "tools\retest_reduction\frontend") "retest frontend build"

Write-Host "==> Stage suite"
if (Test-Path $SuiteDir) { Remove-Item -Recurse -Force $SuiteDir }
Ensure-Dir $SuiteDir

& robocopy (Join-Path $RepoRoot "tools") (Join-Path $SuiteDir "tools") /E /NFL /NDL /NJH /NJS /nc /ns /np /XD node_modules .next dist venv .venv __pycache__ .git .turbo
# robocopy exit codes 0-7 are success
if ($LASTEXITCODE -ge 8) { throw "robocopy tools failed: $LASTEXITCODE" }
$global:LASTEXITCODE = 0

$demoSrc = Join-Path $RepoRoot "demo_datasets"
if (Test-Path $demoSrc) {
  Write-Host "==> Stage demo_datasets"
  & robocopy $demoSrc (Join-Path $SuiteDir "demo_datasets") /E /NFL /NDL /NJH /NJS /nc /ns /np
  if ($LASTEXITCODE -ge 8) { throw "robocopy demo_datasets failed: $LASTEXITCODE" }
  $global:LASTEXITCODE = 0
}

# Next standalone + static assets (static/public must sit next to server.js)
function Find-ServerJs($root) {
  if (-not (Test-Path $root)) { return $null }
  return Get-ChildItem $root -Recurse -Filter "server.js" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\node_modules\\" } |
    Sort-Object { $_.FullName.Length } |
    Select-Object -First 1
}

$serverJs = Find-ServerJs (Join-Path $ate ".next\standalone")
if (-not $serverJs) {
  throw "Next.js standalone output missing. Confirm ELECTRON_BUILD=1 next build succeeded."
}
# Copy the whole standalone tree
$standaloneDst = Join-Path $SuiteDir "tools\ate_frontend\.next\standalone"
Ensure-Dir $standaloneDst
& robocopy (Join-Path $ate ".next\standalone") $standaloneDst /E /NFL /NDL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) { throw "robocopy standalone failed" }
$global:LASTEXITCODE = 0

$serverJsDst = Find-ServerJs $standaloneDst
if (-not $serverJsDst) { throw "Staged standalone server.js not found under $standaloneDst" }
$standaloneAppDir = $serverJsDst.DirectoryName
$staticDst = Join-Path $standaloneAppDir ".next\static"
Ensure-Dir $staticDst
& robocopy (Join-Path $ate ".next\static") $staticDst /E /NFL /NDL /NJH /NJS /nc /ns /np
$global:LASTEXITCODE = 0

$publicDst = Join-Path $standaloneAppDir "public"
Ensure-Dir $publicDst
& robocopy (Join-Path $ate "public") $publicDst /E /NFL /NDL /NJH /NJS /nc /ns /np
$global:LASTEXITCODE = 0

Copy-Item (Join-Path $ate "ate_backend.py") (Join-Path $SuiteDir "tools\ate_frontend\ate_backend.py") -Force

# Agent UI builds
function Copy-Dist($from, $to) {
  if (-not (Test-Path $from)) { throw "Missing build output: $from" }
  Ensure-Dir $to
  & robocopy $from $to /E /NFL /NDL /NJH /NJS /nc /ns /np
  $global:LASTEXITCODE = 0
}
Copy-Dist (Join-Path $RepoRoot "tools\test_time_opt\client\dist") (Join-Path $SuiteDir "tools\test_time_opt\client\dist")
Copy-Dist (Join-Path $RepoRoot "tools\dtl\frontend\dist") (Join-Path $SuiteDir "tools\dtl\frontend\dist")
Copy-Dist (Join-Path $RepoRoot "tools\retest_reduction\frontend\dist") (Join-Path $SuiteDir "tools\retest_reduction\frontend\dist")

Write-Host "==> Production npm deps for Test Time Express"
Push-Location (Join-Path $SuiteDir "tools\test_time_opt")
try {
  Invoke-Native "npm install --omit=dev (test_time_opt)" { npm install --omit=dev }
} finally {
  Pop-Location
}

$pythonExe = Join-Path $PythonDir "python.exe"
$torchMarker = Join-Path $PythonDir "Lib\site-packages\torch\__init__.py"
$reusePython = $env:VL_REUSE_PYTHON -eq "1" -and (Test-Path $pythonExe) -and (Test-Path $torchMarker)
if ($reusePython) {
  Write-Host "==> Reusing staged Python at $PythonDir (VL_REUSE_PYTHON=1)"
} else {

Write-Host "==> Portable Python $PythonVer (staging at $PythonDir)"
Ensure-Dir $Runtimes
$pyZip = Join-Path $Runtimes "python-$PythonVer-embed-amd64.zip"
Download-File "https://www.python.org/ftp/python/$PythonVer/python-$PythonVer-embed-amd64.zip" $pyZip
if (Test-Path $PythonDir) { Remove-Item -Recurse -Force $PythonDir }
Ensure-Dir $PythonDir
Expand-Archive -Path $pyZip -DestinationPath $PythonDir -Force

$pth = Get-ChildItem $PythonDir -Filter "python*._pth" | Select-Object -First 1
if (-not $pth) { throw "python._pth not found" }
@"
python311.zip
.
Lib\site-packages
import site
"@ | Set-Content -Path $pth.FullName -Encoding ascii

$getPip = Join-Path $Runtimes "get-pip.py"
Download-File "https://bootstrap.pypa.io/get-pip.py" $getPip
Invoke-Native "get-pip" { & $pythonExe $getPip --no-warn-script-location }

Write-Host "==> pip install CPU torch + desktop requirements"
Invoke-Native "torch install" {
  & $pythonExe -m pip install --no-warn-script-location "torch" --index-url "https://download.pytorch.org/whl/cpu"
}
Invoke-Native "requirements-desktop install" {
  & $pythonExe -m pip install --no-warn-script-location -r (Join-Path $DesktopRoot "requirements-desktop.txt")
}

}

Prune-PythonBundle $PythonDir

if (Test-Path (Join-Path $SuiteDir "demo_datasets")) {
  Write-Host "==> Bake demo caches (retest + dtl)"
  $bakeScript = Join-Path $DesktopRoot "scripts\bake_demo_cache.py"
  $demoStage = Join-Path $SuiteDir "demo_datasets"
  $dtlStage = Join-Path $SuiteDir "tools\dtl"
  Invoke-Native "bake_demo_cache" {
    & $pythonExe $bakeScript --demo-root $demoStage --dtl-project $dtlStage
  }
}

Write-Host "==> Portable Node $NodeVer"
$nodeZip = Join-Path $Runtimes "node-v$NodeVer-win-x64.zip"
Download-File "https://nodejs.org/dist/v$NodeVer/node-v$NodeVer-win-x64.zip" $nodeZip
$nodeExtract = Join-Path $Runtimes "node-extract"
if (Test-Path $nodeExtract) { Remove-Item -Recurse -Force $nodeExtract }
Ensure-Dir $nodeExtract
Expand-Archive -Path $nodeZip -DestinationPath $nodeExtract -Force
$nodeInner = Get-ChildItem $nodeExtract -Directory | Select-Object -First 1
if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
Ensure-Dir $NodeDir
Copy-Item (Join-Path $nodeInner.FullName "node.exe") (Join-Path $NodeDir "node.exe") -Force

Write-Host "==> Link $StageLink -> $Stage"
if (Test-Path $StageLink) {
  $existing = Get-Item $StageLink -Force
  if ($existing.LinkType) {
    cmd /c "rmdir `"$StageLink`"" | Out-Null
  } else {
    Remove-Item -Recurse -Force $StageLink
  }
}
Invoke-Native "stage junction" { cmd /c "mklink /J `"$StageLink`" `"$Stage`"" }
foreach ($required in @("python\python.exe", "node\node.exe", "suite")) {
  $probe = Join-Path $StageLink $required
  if (-not (Test-Path $probe)) { throw "Staged payload missing through junction: $probe" }
}

$OutDir = if ($env:VL_OUT_DIR) { $env:VL_OUT_DIR } else { "dist" }

Write-Host "==> electron-builder NSIS (output: $OutDir)"
Push-Location $DesktopRoot
try {
  Invoke-Native "electron-builder" {
    npx electron-builder --win nsis --config electron-builder.yml --config.directories.output=$OutDir
  }
} finally {
  Pop-Location
}

$packedResources = Join-Path $DesktopRoot "$OutDir\win-unpacked\resources"
foreach ($required in @("python\python.exe", "node\node.exe", "suite")) {
  $probe = Join-Path $packedResources $required
  if (-not (Test-Path $probe)) { throw "electron-builder skipped a payload: $probe is missing" }
}

$pythonExe = Join-Path $packedResources "python\python.exe"
Write-Host "==> Verify bundled Python imports"
Invoke-Native "bundled python imports" {
  & $pythonExe -c "import flask, fastapi, uvicorn, torch, lightgbm, xgboost; print('OK')"
}

Write-Host "Installer output: $(Join-Path $DesktopRoot $OutDir)"
$installer = Get-ChildItem (Join-Path $DesktopRoot $OutDir) -Filter "Verilumen-ATE-Intelligence-Setup-*.exe" |
  Where-Object { $_.Name -notlike "*.__uninstaller.exe" } |
  Sort-Object Length -Descending |
  Select-Object -First 1
if (-not $installer -or $installer.Length -lt 100MB) {
  throw "Installer missing or too small ($($installer.Length) bytes). Expected ~500MB payload."
}
Write-Host "  $($installer.FullName) ($([math]::Round($installer.Length/1MB, 1)) MB)"

# Always publish the canonical installer under desktop\dist for users/docs.
if ($OutDir -ne "dist") {
  $canonicalDist = Join-Path $DesktopRoot "dist"
  Ensure-Dir $canonicalDist
  Copy-Item $installer.FullName (Join-Path $canonicalDist $installer.Name) -Force
  Write-Host "Published canonical installer: $(Join-Path $canonicalDist $installer.Name)"
}
