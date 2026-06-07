@echo off
title Classic Fitness Park - Node Launcher
color 0C
echo.
echo  ========================================
echo   CLASSIC FITNESS PARK - Node Launcher
echo   Active stack: Node.js + MongoDB
echo  ========================================
echo.

pushd "%~dp0.."

if not exist "Backend\.env" (
  echo  Missing Backend\.env
  echo  Copy Backend\.env.example to Backend\.env first.
  echo.
  pause
  popd
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo  Node.js was not found in PATH.
  echo  Install Node.js and try again.
  echo.
  pause
  popd
  exit /b 1
)

echo  [1] Building frontend...
call npm run build
if errorlevel 1 (
  echo.
  echo  Frontend build failed.
  echo  Fix the build errors and try again.
  echo.
  pause
  popd
  exit /b 1
)

set "SERVER_RUNNING="
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5000" ^| find "LISTENING"') do (
  set "SERVER_RUNNING=1"
)

if not defined SERVER_RUNNING (
  echo  [2] Starting Node backend on port 5000...
  start "CFP Node API" /D "%cd%\Backend" cmd /c npm start
  timeout /t 2 /nobreak >nul
) else (
  echo  [2] Port 5000 is already in use. Reusing existing server.
)

echo  [3] Waiting for backend...
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(25); do { try { $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5000/api/health' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch { } Start-Sleep -Milliseconds 800 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo.
  echo  Backend did not become ready on http://localhost:5000
  echo  Check MongoDB, Backend\.env, or port 5000 conflicts.
  echo.
  pause
  popd
  exit /b 1
)

echo  [4] Opening browser...
start "" "http://localhost:5000"

echo.
echo  ========================================
echo   Website      : http://localhost:5000
echo   Member Portal: http://localhost:5000/member
echo   Admin Panel  : http://localhost:5000/admin
echo   Trainer Page : http://localhost:5000/trainer
echo  ========================================
echo.

popd
exit /b 0
