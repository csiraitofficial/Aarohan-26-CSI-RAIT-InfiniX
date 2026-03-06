import asyncio
import aiohttp
import json
import os
import time
from typing import Dict, Set

# ============================================================================
# Configuration (USER MUST UPDATE TOKEN)
# ============================================================================
employee_bot_token = "YOUR_EMPLOYEE_BOT_TOKEN_HERE"  # <--- REPLACE THIS
telegram_api = f"https://api.telegram.org/bot{employee_bot_token}"

# Backend API URL
backend_url = "http://localhost:8766/api"

# Paths
script_dir = os.path.dirname(os.path.abspath(__file__))
chats_file = os.path.join(script_dir, "login_registered_chats.json")

# State
registered_users: Dict[str, int] = {}
notified_assignments: Set[str] = set()

def load_registered_users():
    global registered_users
    try:
        if os.path.exists(chats_file):
            with open(chats_file, 'r') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    registered_users = data
                    print(f"LOADED {len(registered_users)} registered users")
    except Exception as e:
        print(f"ERROR: Could not load users: {e}")

async def send_telegram_message(chat_id: int, text: str):
    url = f"{telegram_api}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                return await resp.json()
    except Exception as e:
        print(f"Failed to send message: {e}")

async def check_assignments():
    """Poll backend for new assignments for all registered users."""
    for phone, chat_id in registered_users.items():
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{backend_url}/assignments/{phone}") as resp:
                    if resp.status == 200:
                        assignment = await resp.json()
                        if assignment:
                            aid = assignment.get("id")
                            if aid not in notified_assignments:
                                # New Assignment Found!
                                msg = (
                                    f"🚨 <b>NEW ASSIGNMENT</b>\n\n"
                                    f"<b>Task:</b> {assignment.get('message')}\n"
                                    f"<b>Location:</b> {assignment.get('location')}\n\n"
                                    f"Reply with /complete when done."
                                )
                                await send_telegram_message(chat_id, msg)
                                notified_assignments.add(aid)
                                print(f"Notified {phone} of assignment {aid}")
        except Exception as e:
            print(f"Error checking assignments for {phone}: {e}")

async def handle_complete(chat_id: int, phone: str):
    """Mark current assignment as complete."""
    try:
        # 1. Get current assignment ID
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{backend_url}/assignments/{phone}") as resp:
                assignment = await resp.json() if resp.status == 200 else None
                
        if not assignment:
            await send_telegram_message(chat_id, "✅ You have no pending assignments.")
            return

        aid = assignment.get("id")
        
        # 2. Mark as complete
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{backend_url}/assignments/{aid}/complete") as resp:
                if resp.status == 200:
                    await send_telegram_message(chat_id, "🎉 <b>Task Completed!</b> Great work.")
                else:
                    await send_telegram_message(chat_id, "⚠️ Failed to update status on server.")

    except Exception as e:
        await send_telegram_message(chat_id, f"⚠️ Error: {e}")

async def handle_status(chat_id: int, phone: str):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{backend_url}/assignments/{phone}") as resp:
                assignment = await resp.json() if resp.status == 200 else None
        
        if assignment:
             msg = (
                f"📋 <b>Current Status: BUSY</b>\n\n"
                f"<b>Task:</b> {assignment.get('message')}\n"
                f"<b>Location:</b> {assignment.get('location')}"
            )
             await send_telegram_message(chat_id, msg)
        else:
            await send_telegram_message(chat_id, "🟢 <b>Status: IDLE</b>\nNo active assignments.")

    except Exception as e:
        await send_telegram_message(chat_id, "⚠️ Could not check status.")

async def bot_polling_loop():
    print("Employee Bot Started!")
    offset = 0
    
    # Validation
    if "YOUR_EMPLOYEE_BOT_TOKEN_HERE" in employee_bot_token:
        print("CRITICAL WARNING: Token not set. Please edit the script with your new Bot Token.")
        return

    while True:
        # 1. Check for incoming Telegram commands
        try:
            url = f"{telegram_api}/getUpdates"
            params = {"offset": offset, "timeout": 5} # Short timeout to allow interleaving with assignment checks
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as resp:
                    result = await resp.json()
                    for update in result.get("result", []):
                        offset = update["update_id"] + 1
                        message = update.get("message", {})
                        chat_id = message.get("chat", {}).get("id")
                        text = message.get("text", "").strip().lower()
                        
                        # Identify user by chat_id
                        phone = next((p for p, cid in registered_users.items() if cid == chat_id), None)
                        
                        if not phone:
                            if chat_id:
                                await send_telegram_message(chat_id, "⚠️ You are not registered. Please use the Login Bot first.")
                            continue

                        if text == "/status":
                            await handle_status(chat_id, phone)
                        elif text == "/complete":
                            await handle_complete(chat_id, phone)
                            
        except Exception as e:
            print(f"Polling Error: {e}")
            await asyncio.sleep(2)

        # 2. Check for new assignments (Push Notification Logic)
        await check_assignments()
        
        # throttle slightly
        await asyncio.sleep(1)

if __name__ == "__main__":
    load_registered_users()
    asyncio.run(bot_polling_loop())
