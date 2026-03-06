@echo off
setlocal

echo ================================================================
echo   FlowMasters - Stopping All Services
echo ================================================================

rem Define all ports used
set PORTS=3000 5001 8766 8767 8768 8785

for %%P in (%PORTS%) do (
    netstat -aon | find ":%%P" | find "LISTENING" > temp_stop.txt
    for /f "tokens=5" %%a in (temp_stop.txt) do (
        echo    Killing process on port %%P - PID: %%a
        taskkill /f /pid %%a >nul 2>&1
    )
    del temp_stop.txt >nul 2>&1
)

echo.
echo ================================================================
echo   All targeted ports cleared.
echo ================================================================
pause
