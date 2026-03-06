import json
import os
import sys
import urllib.request
import urllib.error

# Path to bot config
sys.path.append(os.path.join(os.getcwd(), "telegram_bot"))
try:
    from telegram_alert_bot import TELEGRAM_BOT_TOKEN, CHATS_FILE
except ImportError:
    print("❌ Could not import telegram_alert_bot. Check paths.")
    sys.exit(1)

def check_bot_token():
    print(f"[*] Checking Token: {TELEGRAM_BOT_TOKEN[:10]}...")
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getMe"
    try:
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
            if data.get("ok"):
                print(f"[OK] Bot Authorized: @{data['result']['username']}")
                return True
            else:
                print(f"[!] Token Valid but API error: {data}")
                return False
    except urllib.error.HTTPError as e:
        print(f"[X] HTTP Error (Token likely invalid): {e.code} {e.reason}")
        return False
    except Exception as e:
        print(f"[X] Connection Error: {e}")
        return False

def check_chats_file():
    print(f"\n[*] Checking Chats File: {CHATS_FILE}")
    if not os.path.exists(CHATS_FILE):
        print("[X] File not found!")
        return []
    
    try:
        with open(CHATS_FILE, 'r') as f:
            chats = json.load(f)
            print(f"[OK] Found {len(chats)} registered chats: {chats}")
            return chats
    except Exception as e:
        print(f"[X] Error reading file: {e}")
        return []

def send_test_message(chat_id):
    print(f"[*] Sending test to {chat_id}...")
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": "**Diagnostic Test**\n\nThe alert system is verifying connectivity."
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            print("[OK] Sent successfully!")
            return True
    except Exception as e:
        print(f"[X] Failed to send: {e}")
        return False

if __name__ == "__main__":
    print("=== Telegram Bot Diagnostic ===")
    if check_bot_token():
        chats = check_chats_file()
        if chats:
            print("\n[*] Attempting broadcast...")
            for chat in chats:
                send_test_message(chat)
        else:
            print("\n[!] No chats to test. Search for the bot in Telegram and send /start")
    print("===============================")
