@echo off
setlocal enabledelayedexpansion

REM ================================================================
REM Yatayat - Start All Services (Windows)
REM Kills existing processes and runs on ports:
REM   - Frontend:      3000
REM   - Backend (Sim): 8766
REM   - Pothole:       5001
REM   - Tier 1:        8767
REM   - Tier 2:        8768
REM   - CCTV:          8785
REM ================================================================

set FRONTEND_PORT=3000
set BACKEND_PORT=8766
set POTHOLE_PORT=5001
set TIER1_PORT=8767
set TIER2_PORT=8768
set CCTV_PORT=8785

echo ================================================================
echo   Yatayat - Starting All Services
echo ================================================================
echo.

REM [1/9] Kill existing processes on all ports
echo [1/9] Cleaning up existing processes...

for %%P in (%FRONTEND_PORT% %BACKEND_PORT% %POTHOLE_PORT% %TIER1_PORT% %TIER2_PORT% %CCTV_PORT%) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| find ":%%P" ^| find "LISTENING" 2^>nul') do (
        echo    Killing process on port %%P - PID: %%a...
        taskkill /f /pid %%a >nul 2>&1
    )
)

REM Kill any existing ngrok
taskkill /f /im ngrok.exe >nul 2>&1

timeout /t 2 /nobreak >nul

REM [2/9] Start Pothole Detection Backend
echo.
echo [2/9] Starting Pothole Detection Backend (Port %POTHOLE_PORT%)...
start "Pothole Backend" cmd /k "cd /d %~dp0pothole_backend && python pothole_server.py"

REM [3/9] Start Enhanced Simulation Backend
echo.
echo [3/9] Starting Enhanced Simulation Backend (Port %BACKEND_PORT%)...
if exist "%~dp0simulation_backend\enhanced_sim_server.py" (
    start "Simulation Backend" cmd /k "cd /d %~dp0simulation_backend && python enhanced_sim_server.py"
) else (
    start "Simulation Backend" cmd /k "cd /d %~dp0simulation_backend && python sim_server.py"
)

REM [4/9] Start Tier 1 Metro Simulation
echo.
echo [4/9] Starting Tier 1 Metro Simulation (Port %TIER1_PORT%)...
if exist "%~dp0simulation_tier1\sim_server_tier1.py" (
    start "Tier 1 Backend" cmd /k "cd /d %~dp0simulation_tier1 && python sim_server_tier1.py"
) else (
    echo    Warning: sim_server_tier1.py not found
)

REM [5/9] Start Tier 2 District Simulation
echo.
echo [5/9] Starting Tier 2 District Simulation (Port %TIER2_PORT%)...
if exist "%~dp0simulation_tier2\sim_server_tier2.py" (
    start "Tier 2 Backend" cmd /k "cd /d %~dp0simulation_tier2 && python sim_server_tier2.py"
) else (
    echo    Warning: sim_server_tier2.py not found
)

REM [6/9] Start CCTV Monitoring Server
echo.
echo [6/9] Starting CCTV Monitoring Server (Port %CCTV_PORT%)...
if exist "%~dp0cctv_backend\cctv_server.py" (
    start "CCTV Backend" cmd /k "cd /d %~dp0cctv_backend && python cctv_server.py"
) else (
    echo    Warning: cctv_server.py not found
)

REM [7/9] Start Telegram Bots
echo.
echo [7/9] Starting Telegram Bots...
if exist "%~dp0telegram_bot\telegram_alert_bot.py" (
    start "Telegram Alert Bot" cmd /k "cd /d %~dp0telegram_bot && python telegram_alert_bot.py"
    echo    Alert Bot started
) else (
    echo    Warning: telegram_alert_bot.py not found
)

if exist "%~dp0telegram_bot\telegram_login_bot.py" (
    start "Telegram Login Bot" cmd /k "cd /d %~dp0telegram_bot && python telegram_login_bot.py"
    echo    Login Bot started
) else (
    echo    Warning: telegram_login_bot.py not found
)

if exist "%~dp0telegram_bot\telegram_employee_bot.py" (
    start "Telegram Employee Bot" cmd /k "cd /d %~dp0telegram_bot && python telegram_employee_bot.py"
    echo    Employee Bot started
) else (
    echo    Note: telegram_employee_bot.py not configured (optional)
)

REM Wait for backends to initialize
timeout /t 3 /nobreak >nul

REM [8/9] Start Frontend
echo.
echo [8/9] Starting Vite Frontend (Port %FRONTEND_PORT%)...
start "Vite Frontend" cmd /k "cd /d %~dp0 && npm run dev -- --port %FRONTEND_PORT%"

REM Wait for frontend to start
timeout /t 3 /nobreak >nul

REM [9/9] Start ngrok tunnel for mobile access
echo.
echo [9/9] Starting ngrok tunnel for mobile access...
where ngrok >nul 2>&1
if %errorlevel%==0 (
    start "ngrok Tunnel" cmd /k "ngrok http %FRONTEND_PORT%"
    echo    ngrok tunnel started - check the ngrok window for the public URL
) else (
    echo    Warning: ngrok not found in PATH.
    echo    Install from https://ngrok.com/download and add to PATH
)

echo.
echo ================================================================
echo   All Yatayat services started!
echo ================================================================
echo.
echo   LOCAL ACCESS:
echo      Frontend:      http://localhost:%FRONTEND_PORT%
echo.
echo   BACKEND SERVICES:
echo      Simulation:    http://localhost:%BACKEND_PORT%
echo      Pothole:       http://localhost:%POTHOLE_PORT%
echo      Tier 1:        http://localhost:%TIER1_PORT%
echo      Tier 2:        http://localhost:%TIER2_PORT%
echo      CCTV:          http://localhost:%CCTV_PORT%
echo.
echo   BOTS:
echo      Alert Bot:     Running (Check Window)
echo      Login Bot:     Running (Check Window)
echo      Employee Bot:  Running (Check Window)
echo.
echo   Services are running in separate windows.
echo   Close those windows to stop individual services.
echo ================================================================
echo.
pause
