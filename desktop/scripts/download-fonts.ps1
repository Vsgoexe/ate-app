# Download self-hosted Latin woff2 fonts so the dashboard does not call fonts.googleapis.com.
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fontsDir = Join-Path $repoRoot "tools\ate_frontend\public\fonts"
New-Item -ItemType Directory -Force -Path $fontsDir | Out-Null

$files = @{
  "ibm-plex-sans-400.woff2"   = "https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-sans@5.2.5/latin-400-normal.woff2"
  "ibm-plex-sans-500.woff2"   = "https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-sans@5.2.5/latin-500-normal.woff2"
  "ibm-plex-sans-600.woff2"   = "https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-sans@5.2.5/latin-600-normal.woff2"
  "jetbrains-mono-400.woff2"  = "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@5.2.5/latin-400-normal.woff2"
  "jetbrains-mono-500.woff2"  = "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@5.2.5/latin-500-normal.woff2"
  "jetbrains-mono-600.woff2"  = "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@5.2.5/latin-600-normal.woff2"
  "jetbrains-mono-700.woff2"  = "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@5.2.5/latin-700-normal.woff2"
  "space-grotesk-500.woff2"   = "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@5.2.5/latin-500-normal.woff2"
  "space-grotesk-600.woff2"   = "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@5.2.5/latin-600-normal.woff2"
  "space-grotesk-700.woff2"   = "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@5.2.5/latin-700-normal.woff2"
}

foreach ($name in $files.Keys) {
  $dest = Join-Path $fontsDir $name
  if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 1000)) {
    Write-Host "OK  $name"
    continue
  }
  Write-Host "GET $name"
  Invoke-WebRequest -Uri $files[$name] -OutFile $dest -UseBasicParsing
}

Write-Host "Fonts saved to $fontsDir"
