@echo off
set "INSTALL_ROOT=%~dp0.."
"%INSTALL_ROOT%\runtime\node.exe" "%INSTALL_ROOT%\scripts\setup-kurspilot.js" %*
