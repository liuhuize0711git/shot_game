@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 goto noPython

echo ============================================
echo   STEEL YARD local server
echo   http://localhost:8080/index.html
echo   Close this window to stop the server.
echo ============================================
start "" "http://localhost:8080/index.html"
python -m http.server 8080
goto :eof

:noPython
echo Python not found, opening index.html directly...
start "" "%~dp0index.html"
