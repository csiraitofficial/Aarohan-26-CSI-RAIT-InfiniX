@echo off
echo ==========================================
echo Starting Telegram Alert Bot
echo ==========================================

echo Installing dependencies...
pip install aiohttp >nul 2>&1

echo Starting Bot...
python telegram_bot/telegram_alert_bot.py
pause
