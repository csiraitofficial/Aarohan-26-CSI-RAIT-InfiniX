@echo off
echo ==========================================
echo Starting Yatayat Login Bot (OTP Delivery)
echo ==========================================

echo Installing dependencies...
pip install aiohttp >nul 2>&1

echo Starting Login Bot...
python telegram_bot/telegram_login_bot.py
pause
