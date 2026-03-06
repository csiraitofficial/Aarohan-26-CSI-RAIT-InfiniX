import asyncio
import aiohttp
import json
import os
from typing import Dict

# ============================================================================
# Configuration (TO BE UPDATED BY USER)
# ============================================================================
# 1. Create a bot via @BotFather on Telegram
# 2. Get the API Token and paste it here
TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE"
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CHATS_FILE = os.path.join(SCRIPT_DIR, "login_registered_chats.json")

# Mapping of phone number (10 digits) -> chat_id (int)
registered_users: Dict[str, int] = {}

def load_registered_users():
    global registered_users
    try:
        if os.path.exists(CHATS_FILE):
            with open(CHATS_FILE, 'r') as f:
                data = json.load(f)
                if isinstance(data, list):
                    # Migration from old list format to new dict format
                    # We'll keep them as None keys or just clear them since we need phone numbers now
                    registered_users = {}
                else:
                    registered_users = data
            print(f"LOADED {len(registered_users)} registered users")
    except Exception as e:
        print(f"ERROR: Could not load users: {e}")

def save_registered_users():
    try:
        with open(CHATS_FILE, 'w') as f:
            json.dump(registered_users, f)
    except Exception as e:
        print(f"ERROR: Could not save users: {e}")

async def send_telegram_message(chat_id: int, text: str, reply_markup: dict = None):
    url = f"{TELEGRAM_API}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as resp:
            return await resp.json()

async def handle_start(chat_id: int, username: str):
    welcome = (
        f"🔐 <b>Welcome to Yatayat Login!</b>\n\n"
        f"Hi {username or 'there'}! To receive OTPs, please click the button below to share your contact with us."
    )
    # Request contact button
    reply_markup = {
        "keyboard": [[{"text": "📱 Share Phone Number", "request_contact": True}]],
        "resize_keyboard": True,
        "one_time_keyboard": True
    }
    await send_telegram_message(chat_id, welcome, reply_markup)
    print(f"Sent contact request to: {chat_id}")

async def handle_contact(chat_id: int, phone_number: str, first_name: str):
    # Clean phone number: keep only last 10 digits
    clean_phone = "".join(filter(str.isdigit, phone_number))[-10:]
    
    registered_users[clean_phone] = chat_id
    save_registered_users()
    
    confirmation = (
        f"✅ <b>Registration Successful!</b>\n\n"
        f"Thank you, {first_name}! Your phone number (<b>{clean_phone}</b>) is now linked to this Telegram account.\n"
        f"You will receive OTPs here when you log in to the Yatayat platform."
    )
    # Remove the keyboard
    reply_markup = {"remove_keyboard": True}
    await send_telegram_message(chat_id, confirmation, reply_markup)
    print(f"User registered: {clean_phone} -> {chat_id}")

async def bot_polling_loop():
    print("Yatayat Login Bot Started!")
    print("Listening for /start command...")
    offset = 0
    while True:
        try:
            url = f"{TELEGRAM_API}/getUpdates"
            params = {"offset": offset, "timeout": 30}
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as resp:
                    result = await resp.json()
                    for update in result.get("result", []):
                        offset = update["update_id"] + 1
                        message = update.get("message", {})
                        
                        chat_id = message.get("chat", {}).get("id")
                        if not chat_id:
                            continue
                            
                        # Handle Contact
                        if "contact" in message:
                            contact = message["contact"]
                            # Security check: only register if the contact matches the user
                            if contact.get("user_id") == message.get("from", {}).get("id"):
                                await handle_contact(chat_id, contact.get("phone_number"), contact.get("first_name"))
                            else:
                                await send_telegram_message(chat_id, "⚠️ Please share YOUR OWN contact from the button provided.")
                            continue

                        # Handle Text commands
                        text = message.get("text", "").strip().lower()
                        username = message.get("from", {}).get("first_name", "")
                        
                        if text == "/start":
                            await handle_start(chat_id, username)
                            
        except Exception as e:
            print(f"ERROR: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    if TELEGRAM_BOT_TOKEN == "YOUR_NEW_BOT_TOKEN_HERE":
        print("ERROR: Please provide a valid TELEGRAM_BOT_TOKEN.")
        print("INFO: Create a bot via @BotFather on Telegram to get one.")
    else:
        load_registered_users()
        asyncio.run(bot_polling_loop())
