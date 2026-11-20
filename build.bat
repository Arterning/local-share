@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

where node >nul 2>nul
if errorlevel 1 goto missing_tools
where pnpm >nul 2>nul
if errorlevel 1 goto missing_tools
where go >nul 2>nul
if errorlevel 1 goto missing_tools

echo [1/4] Building frontend...
call pnpm --dir web build
if errorlevel 1 goto failed
if not exist "web\dist\index.html" goto failed

echo [2/4] Copying frontend to api\internal\server\dist...
rem Both paths are fixed build directories under this script's directory.
rem /MIR removes stale frontend assets only from api\internal\server\dist.
robocopy "web\dist" "api\internal\server\dist" /MIR /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
if errorlevel 8 goto failed

echo [3/4] Building dist\localshare.exe...
if not exist "dist" (
    mkdir "dist"
    if errorlevel 1 goto failed
)
go -C api build -trimpath -o "..\dist\localshare.exe" ./cmd/server
if errorlevel 1 goto failed

echo [4/4] Building dist\localshare-desktop.exe...
go -C api build -trimpath -tags desktop,production -ldflags "-H windowsgui" -o "..\dist\localshare-desktop.exe" ./cmd/desktop
if errorlevel 1 goto failed

echo.
echo Build complete:
echo   "%CD%\dist\localshare.exe"
echo   "%CD%\dist\localshare-desktop.exe"
popd
exit /b 0

:missing_tools
echo ERROR: Install Node.js, pnpm and Go, and add them to PATH.
goto failed

:failed
echo ERROR: Build failed. Check the output above.
popd
exit /b 1
