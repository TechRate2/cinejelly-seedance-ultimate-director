$ErrorActionPreference = "Stop"

Write-Host "CineJelly Windows setup"
Write-Host "-----------------------"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20+ is required. Install Node.js first, then rerun this script."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required. Install Node.js with npm, then rerun this script."
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue

if (-not $ffmpeg -or -not $ffprobe) {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Host "FFmpeg/FFprobe not found on PATH. Installing Gyan.FFmpeg through winget..."
    winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
  } else {
    Write-Warning "FFmpeg/FFprobe not found and winget is not available. Install FFmpeg manually or set CINEJELLY_FFMPEG_PATH/CINEJELLY_FFPROBE_PATH in .env."
  }
}

if (-not (Test-Path node_modules)) {
  Write-Host "Installing npm dependencies..."
  npm install
}

Write-Host "Creating or updating local .env..."
node scripts/setup-local-env.mjs

Write-Host "Running preflight..."
npm.cmd run preflight
