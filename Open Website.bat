@echo off
title ERP Website
cd /d "%~dp0frontend"
echo Starting the website, please wait...
npm run dev -- --open
