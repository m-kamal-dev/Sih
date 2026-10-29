@echo off
rem Double-click to start EvidenceGraph. Builds if needed, then opens the browser.
cd /d "%~dp0"
node scripts\start.mjs %*
if errorlevel 1 pause
