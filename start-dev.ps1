# TestVantage — start dev server (run in PowerShell)
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: Install Node.js from https://nodejs.org" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path node_modules)) {
  Write-Host "Installing dependencies..."
  npm install
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "Starting http://127.0.0.1:5173/question-bank" -ForegroundColor Green
Write-Host "Keep this window open. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

npm run dev
