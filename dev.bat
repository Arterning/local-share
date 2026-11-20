@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

set "LOCALSHARE_PORT=8080"
go -C api run ./cmd/server -dir ..\dist
set "RESULT=%ERRORLEVEL%"

popd
exit /b %RESULT%
