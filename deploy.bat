@echo off
rem Double-click this file to update the live site. It finds Node in your user folder.
set PATH=%USERPROFILE%\node;%PATH%
cd /d "%~dp0"
call npm install
if errorlevel 1 goto failed
call npm run deploy
if errorlevel 1 goto failed
echo.
echo Done. The site is updated.
pause
exit /b 0
:failed
echo.
echo Something went wrong. Take a photo of this window and send it.
pause
