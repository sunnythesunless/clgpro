@echo off
TITLE Medical Image Reporter - Development Launcher
echo ============================================================
echo   Starting Medical Image Reporting AI (Development Mode)
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/2] Launching FastAPI Backend on http://localhost:8000 ...
start "MedReporter Backend (FastAPI)" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo [2/2] Launching React Vite Frontend on http://localhost:5173 ...
start "MedReporter Frontend (Vite)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ============================================================
echo   Both services are starting!
echo   - Web Application: http://localhost:5173
echo   - Backend Swagger: http://localhost:8000/docs
echo ============================================================
echo.
pause
