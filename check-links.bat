@echo off
rem Double-click to test all source links. Results appear in this window.
set PATH=%USERPROFILE%\node;%PATH%
cd /d "%~dp0"
node scripts\check-links.mjs
echo.
pause
