@echo off
chcp 65001 >nul
title WhatsApp ERP - Frontend Dev (Vite)

REM ============================================================
REM  واجهة WhatsApp ERP (React + Vite) موجودة في مجلد frontend
REM  بجوار هذا الملف داخل E:\ERP
REM ============================================================
cd /d "%~dp0frontend"

if not exist "package.json" (
    echo [ERROR] package.json not found in:
    echo   %cd%
    echo تأكد ان هذا الملف داخل E:\ERP بجوار مجلد frontend.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [تنبيه] node_modules غير موجود - تثبيت الحزم اولا ...
    call npm install
    echo.
)

echo ========================================
echo    WhatsApp ERP - Frontend Dev (Vite)
echo ========================================
echo Folder : %cd%
echo URL    : http://localhost:5174
echo.
echo ملاحظة: يعمل على المنفذ 5174 لتجنب التعارض مع نسخة Docker على 5173.
echo         نداءات /api تُمرَّر تلقائيا للـ backend على :3000 (proxy في vite.config).
echo         اترك هذه النافذة مفتوحة - اغلاقها يوقف الواجهة.
echo ----------------------------------------
echo.

REM فتح المتصفح تلقائيا بعد اقلاع Vite (خلفية نفس النافذة)
start /b cmd /c "ping -n 6 127.0.0.1 >nul & start http://localhost:5174"

REM Vite في المقدمة على منفذ ثابت 5174 (call ضرورية لان npm عبارة عن npm.cmd)
call npm run dev -- --port 5174 --strictPort

echo.
echo تم ايقاف Vite. اغلق النافذة.
pause
