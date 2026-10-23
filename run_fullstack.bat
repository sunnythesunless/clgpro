@echo off
TITLE Medical Image Reporter - Unified Fullstack Server
echo ============================================================
echo   Building and Serving Fullstack Application on Port 8000
echo ============================================================
echo.

cd /d "%~dp0frontend"
echo [1/2] Building React production bundle...
call npm run build

cd /d "%~dp0backend"
echo.
echo [2/2] Starting unified server on http://localhost:8000 ...
call venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000

pause
