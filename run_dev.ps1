# Medical Image Reporting AI - PowerShell Launcher
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting Medical Image Reporting AI (Development Mode)   " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Start Backend
Write-Host "`n[1/2] Launching Backend on http://localhost:8000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$ScriptDir\backend'; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

# Start Frontend
Write-Host "[2/2] Launching Frontend on http://localhost:5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$ScriptDir\frontend'; npm run dev"

Write-Host "`nServices initiated:" -ForegroundColor Yellow
Write-Host " - Web Application: http://localhost:5173" -ForegroundColor White
Write-Host " - Interactive API Docs: http://localhost:8000/docs" -ForegroundColor White
