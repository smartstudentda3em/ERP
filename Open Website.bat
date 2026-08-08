@echo off
title ERP Website
cd /d "%~dp0"

set DOCKER_DESKTOP_EXE=C:\Users\surface\AppData\Local\Programs\DockerDesktop\frontend\Docker Desktop.exe

echo Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo Starting Docker Desktop, please wait...
    if exist "%DOCKER_DESKTOP_EXE%" (
        start "" "%DOCKER_DESKTOP_EXE%"
    ) else (
        echo Could not find Docker Desktop.exe - please start it manually.
        pause
        exit /b 1
    )

    :waitdocker
    ping -n 4 127.0.0.1 >nul
    docker info >nul 2>&1
    if errorlevel 1 goto waitdocker
)

echo Docker is ready. Starting the app (this can take a minute the first time)...
docker compose up -d --build
if errorlevel 1 (
    echo Something went wrong starting the containers.
    pause
    exit /b 1
)

echo Waiting for the website to be ready...
:waitweb
ping -n 3 127.0.0.1 >nul
curl -s -o nul http://localhost:5173
if errorlevel 1 goto waitweb

start http://localhost:5173
