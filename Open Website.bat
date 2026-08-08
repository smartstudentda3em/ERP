@echo off
title ERP Website
cd /d "%~dp0"

set DOCKER_DESKTOP_EXE=C:\Users\surface\AppData\Local\Programs\DockerDesktop\frontend\Docker Desktop.exe

echo Checking Docker...
docker info >nul 2>&1
if not errorlevel 1 goto dockerready

echo Starting Docker Desktop, please wait...
if not exist "%DOCKER_DESKTOP_EXE%" goto nodocker
start "" "%DOCKER_DESKTOP_EXE%"

set DOCKER_TRIES=0

:waitdocker
set /a DOCKER_TRIES=%DOCKER_TRIES%+1
if %DOCKER_TRIES% GTR 60 goto dockertimeout
ping -n 4 127.0.0.1 >nul
docker info >nul 2>&1
if errorlevel 1 (
    echo Still waiting for Docker Desktop... %DOCKER_TRIES%/60
    goto waitdocker
)
goto dockerready

:nodocker
echo Could not find Docker Desktop.exe - please start it manually, then re-run this file.
pause
exit /b 1

:dockertimeout
echo.
echo Docker Desktop is taking too long to start.
echo Please open Docker Desktop manually, wait for it to say Running, then re-run this file.
pause
exit /b 1

:dockerready
echo Docker is ready. Starting the app, this can take a minute the first time...
docker compose up -d --build
if errorlevel 1 (
    echo.
    echo Something went wrong starting the containers, see error above.
    pause
    exit /b 1
)

echo Waiting for the website to be ready...
set WEB_TRIES=0

:waitweb
set /a WEB_TRIES=%WEB_TRIES%+1
if %WEB_TRIES% GTR 40 goto webtimeout
ping -n 3 127.0.0.1 >nul
curl -s -o nul http://localhost:5173
if errorlevel 1 (
    echo Still waiting... %WEB_TRIES%/40
    goto waitweb
)
goto opensite

:webtimeout
echo.
echo The website did not respond after 2 minutes. Showing container status:
docker compose ps
echo.
echo Try running: docker compose logs backend
pause
exit /b 1

:opensite
echo.
echo Website is ready - opening in your browser.
start http://localhost:5173
ping -n 3 127.0.0.1 >nul
