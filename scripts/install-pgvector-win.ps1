# Requires Administrator. Copies pgvector bundle into PostgreSQL 17.
$ErrorActionPreference = 'Stop'
$pg = 'C:\Program Files\PostgreSQL\17'
$src = Join-Path $PSScriptRoot 'vendor\pgvector-pg17'
if (-not (Test-Path (Join-Path $src 'lib\vector.dll'))) {
    Write-Error "Missing pgvector bundle under scripts\vendor\pgvector-pg17"
}
Stop-Service postgresql-x64-17 -Force
Copy-Item (Join-Path $src 'lib\vector.dll') (Join-Path $pg 'lib\') -Force
Copy-Item (Join-Path $src 'share\extension\*') (Join-Path $pg 'share\extension\') -Force
$destInc = Join-Path $pg 'include\server\extension\vector'
New-Item -ItemType Directory -Force -Path $destInc | Out-Null
Copy-Item (Join-Path $src 'include\server\extension\vector\*') $destInc -Force
Start-Service postgresql-x64-17
Write-Host 'pgvector files installed.'