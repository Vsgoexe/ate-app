# Restart VERILUMEN ATE Intelligence so supervisor reloads updated backends/frontends.
$ErrorActionPreference = "Stop"

$InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\VERILUMEN ATE Intelligence"
$Exe = Join-Path $InstallRoot "VERILUMEN ATE Intelligence.exe"

if (-not (Test-Path $Exe)) {
  throw "App not found: $Exe"
}

Write-Host "Stopping VERILUMEN ATE Intelligence..."
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "*VERILUMEN ATE Intelligence*" } |
  ForEach-Object {
    Write-Host "  taskkill /PID $($_.Id) /T /F"
    & taskkill.exe /PID $_.Id /T /F *>$null
  }
$ErrorActionPreference = $prevEap

Start-Sleep -Seconds 2

Write-Host "Starting $Exe"
Start-Process -FilePath $Exe

Write-Host "Waiting for dashboard on :3000..."
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) {
      Write-Host "Dashboard ready."
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}

Write-Host "Checking DTL demo endpoint..."
Start-Sleep -Seconds 5
try {
  $demo = Invoke-WebRequest -Method POST -Uri "http://127.0.0.1:8001/api/v1/analysis/demo/load" -UseBasicParsing -TimeoutSec 30
  Write-Host "DTL demo/load: $($demo.StatusCode)"
} catch {
  Write-Warning "DTL demo/load not ready yet: $($_.Exception.Message)"
}
