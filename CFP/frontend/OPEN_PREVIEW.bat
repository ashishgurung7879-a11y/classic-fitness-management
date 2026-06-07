@echo off
title Classic Fitness Park - Frontend Preview
color 0C
echo.
echo  ========================================
echo   CLASSIC FITNESS PARK - Frontend Preview
echo  ========================================
echo.

pushd "%~dp0"

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
  echo  Build failed.
  pause
  popd
  exit /b 1
)

echo  [2] Starting preview on port 4173...
start "CFP Frontend Preview" cmd /c npm run preview
timeout /t 3 /nobreak >nul

echo  [3] Opening browser...
start "" "http://localhost:4173"

echo.
echo  Preview URL: http://localhost:4173
echo.

popd
exit /b 0
