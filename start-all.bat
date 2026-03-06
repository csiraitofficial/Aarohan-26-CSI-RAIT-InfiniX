@echo off
setlocal enabledelayedexpansion

echo ================================================================
echo   Yatayat - Starting Essential Services
echo ================================================================

set FRONTEND_PORT=3000
set CCTV_PORT=8785

echo.
echo.
echo [1/4] Cleaning up existing processes...

for %%P in (%FRONTEND_PORT% %CCTV_PORT%) do (
    netstat -aon | find ":%%P" | find "LISTENING" > temp_p.txt
    for /f "tokens=5" %%a in (temp_p.txt) do (
        echo    Killing process on port %%P - PID: %%a...
        taskkill /f /pid %%a >nul 2>&1
    )
    del temp_p.txt >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo.
echo.
echo [2/3] Starting CCTV Monitoring Server (Port %CCTV_PORT%)...
cd cctv_backend
start "CCTV Backend" cmd /k "python cctv_server.py"
cd ..

echo.
echo.
echo [3/4] Starting Telegram Login Bot...
cd telegram_bot
start "Telegram Bot" cmd /k "python telegram_login_bot.py"
cd ..

echo.
echo.
echo [4/4] Starting Vite Frontend (Port %FRONTEND_PORT%)...
start "Vite Frontend" cmd /k "npm run dev -- --port %FRONTEND_PORT%"

echo.
echo ================================================================
echo   Essential Yatayat services started!
echo ================================================================
echo   Frontend:      http://localhost:%FRONTEND_PORT%
echo   CCTV:          http://localhost:%CCTV_PORT%
echo   Telegram Bot:  Join @YatayatLoginBot
echo.
echo   Services are running in separate windows.
echo   Close those windows to stop individual services.
echo.
pause
