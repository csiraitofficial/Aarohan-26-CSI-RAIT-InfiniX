#!/usr/bin/env python3
"""
FlowMasters Telegram Alert Bot

Features:
- Sends alerts when emergency/accident/rally scenarios trigger
- Receives route queries from users ("route S3 to S18")
- Returns optimized paths avoiding blocked signals
- Uses Gemini API for natural language message curation

Usage:
    python telegram_alert_bot.py
"""

import asyncio
import aiohttp
import json
import re
from datetime import datetime
from typing import Dict, List, Optional, Set
from collections import deque

# ============================================================================
# Configuration
# ============================================================================

TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE"
GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# File to persist registered chat IDs
import os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CHATS_FILE = os.path.join(SCRIPT_DIR, "registered_chats.json")

# Registered chat IDs (will be populated when users /start the bot)
registered_users: Set[int] = set()

def load_registered_users():
    """Load chat IDs from file."""
    global registered_users
    try:
        if os.path.exists(CHATS_FILE):
            with open(CHATS_FILE, 'r') as f:
                registered_users = set(json.load(f))
            print(f"📂 Loaded {len(registered_users)} registered users")
    except Exception as e:
        print(f"⚠️ Could not load users: {e}")

def save_registered_users():
    """Save chat IDs to file."""
    try:
        with open(CHATS_FILE, 'w') as f:
            json.dump(list(registered_users), f)
    except Exception as e:
        print(f"⚠️ Could not save users: {e}")

# Current scenario state (updated by simulation backend)
current_scenario: Dict = {
    "type": None,  # "emergency", "accident", "rally"
    "blocked_signals": [],
    "green_corridor": [],
    "diversion_routes": [],
    "path": [],
    "start_time": None
}

# Network graph for pathfinding (will be loaded from tier JSON)
network_graph: Dict[str, List[str]] = {}


# ============================================================================
# Network Graph & Pathfinding
# ============================================================================

def build_network_graph(json_path: str = "simulation_tier1/tier1.json"):
    """Build adjacency graph from tier JSON for pathfinding."""
    global network_graph
    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
        
        network_graph = {}
        for signal in data.get("signals", []):
            signal_id = signal.get("signal_id", "")
            neighbors = signal.get("neighbors", [])
            network_graph[signal_id] = neighbors
        
        print(f"✅ Loaded network with {len(network_graph)} signals")
    except Exception as e:
        print(f"⚠️ Could not load network: {e}")
        # Fallback: create sample graph
        for i in range(1, 36):
            network_graph[f"S{i}"] = []


def find_shortest_path(start: str, end: str, blocked: List[str] = None) -> List[str]:
    """BFS shortest path avoiding blocked signals."""
    if blocked is None:
        blocked = []
    
    blocked_set = set(blocked)
    
    if start not in network_graph or end not in network_graph:
        return []
    
    if start == end:
        return [start]
    
    queue = deque([(start, [start])])
    visited = {start}
    
    while queue:
        current, path = queue.popleft()
        
        for neighbor in network_graph.get(current, []):
            if neighbor in visited or neighbor in blocked_set:
                continue
            
            new_path = path + [neighbor]
            
            if neighbor == end:
                return new_path
            
            visited.add(neighbor)
            queue.append((neighbor, new_path))
    
    return []  # No path found


# ============================================================================
# Telegram API Functions
# ============================================================================

async def send_telegram_message(chat_id: int, text: str, parse_mode: str = "HTML"):
    """Send a message to a Telegram chat."""
    url = f"{TELEGRAM_API}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as resp:
            result = await resp.json()
            if not result.get("ok"):
                print(f"⚠️ Telegram error: {result}")
            return result


async def broadcast_alert(message: str):
    """Send alert to all registered users."""
    for chat_id in registered_users:
        await send_telegram_message(chat_id, message)
    print(f"📢 Broadcast sent to {len(registered_users)} users")


async def get_updates(offset: int = 0) -> List[Dict]:
    """Get new messages from Telegram."""
    url = f"{TELEGRAM_API}/getUpdates"
    params = {"offset": offset, "timeout": 30}
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            result = await resp.json()
            return result.get("result", [])


# ============================================================================
# Gemini API for Message Curation
# ============================================================================

async def curate_message_with_gemini(context: Dict) -> str:
    """Use Gemini to generate a friendly, informative message."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    prompt = f"""You are assisting a traffic management system. Generate a short, friendly notification message.

Context:
- Scenario type: {context.get('type', 'unknown')}
- Blocked signals: {context.get('blocked_signals', [])}
- Path: {context.get('path', [])}
- Duration estimate: {context.get('duration', '~15 minutes')}

Requirements:
- Use emojis appropriately
- Keep it under 10 lines
- Include key information clearly
- Mention users can reply with "route S1 to S20" format for directions

Generate the notification message only, no extra explanation."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                result = await resp.json()
                text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return text.strip()
    except Exception as e:
        print(f"⚠️ Gemini API error: {e}")
        return None


async def curate_route_response(start: str, end: str, path: List[str], blocked: List[str]) -> str:
    """Use Gemini to generate a friendly route response."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    if not path:
        prompt = f"""Generate a short, friendly message saying:
- No route available from {start} to {end}
- The signals {blocked} are currently blocked
- Suggest waiting or trying alternative destinations
Use emojis, keep under 5 lines."""
    else:
        prompt = f"""Generate a short, friendly route guidance message:
- From: {start}
- To: {end}  
- Best path: {' → '.join(path)}
- Number of signals: {len(path)}
- This route avoids blocked signals: {blocked}
Use emojis for navigation, keep under 8 lines."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                result = await resp.json()
                text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return text.strip()
    except Exception as e:
        print(f"⚠️ Gemini API error: {e}")
        return None


# ============================================================================
# Message Handlers
# ============================================================================

async def handle_start(chat_id: int, username: str):
    """Handle /start command - register user."""
    registered_users.add(chat_id)
    save_registered_users()  # Persist to file for backend to read
    
    welcome = f"""🚦 <b>Welcome to FlowMasters Traffic Alert!</b>

Hi {username or 'there'}! 👋

You'll receive alerts when:
🚑 Emergency vehicles need green corridor
🔥 Accidents block junctions
🚶 Rallies/processions affect traffic

<b>Commands:</b>
• <code>route S1 to S20</code> - Get best path
• <code>status</code> - Current traffic situation
• <code>help</code> - Show commands

You're now registered for alerts! ✅"""
    
    await send_telegram_message(chat_id, welcome)
    print(f"✅ User registered: {chat_id} ({username})")


async def handle_route_query(chat_id: int, text: str):
    """Handle route query like 'route S3 to S18'."""
    # Parse the query
    match = re.search(r'(?:route|from)?\s*([sS]\d+)\s*(?:to|->|→)\s*([sS]\d+)', text, re.IGNORECASE)
    
    if not match:
        await send_telegram_message(chat_id, 
            "❓ I didn't understand. Try:\n<code>route S3 to S18</code>")
        return
    
    start = match.group(1).upper()
    end = match.group(2).upper()
    
    # Get blocked signals from current scenario
    blocked = current_scenario.get("blocked_signals", []) + current_scenario.get("green_corridor", [])
    
    # Find path
    path = find_shortest_path(start, end, blocked)
    
    # Curate response with Gemini
    response = await curate_route_response(start, end, path, blocked)
    
    if not response:
        # Fallback message
        if path:
            response = f"""🗺️ <b>Route Found!</b>

📍 From: <b>{start}</b> → To: <b>{end}</b>
✅ Path: <code>{' → '.join(path)}</code>
📏 Signals: {len(path)}

{'⚠️ Avoiding: ' + ', '.join(blocked) if blocked else '✅ No current blocks'}"""
        else:
            response = f"""❌ <b>No Route Available</b>

📍 From: {start} → To: {end}
🚧 Blocked: {', '.join(blocked) if blocked else 'None'}

The destination may be unreachable due to current blocks."""
    
    await send_telegram_message(chat_id, response)


async def handle_status(chat_id: int):
    """Handle status query."""
    if not current_scenario.get("type"):
        await send_telegram_message(chat_id, 
            "✅ <b>All Clear!</b>\n\nNo active incidents. Traffic flowing normally.")
        return
    
    scenario = current_scenario
    status = f"""📊 <b>Current Traffic Status</b>

🚨 Active: <b>{scenario['type'].upper()}</b>
🚧 Blocked: {', '.join(scenario.get('blocked_signals', [])) or 'None'}
🟢 Corridor: {', '.join(scenario.get('green_corridor', [])) or 'None'}
🔀 Diversions: {', '.join(scenario.get('diversion_routes', [])) or 'None'}

Reply <code>route S1 to S20</code> for directions."""
    
    await send_telegram_message(chat_id, status)


async def handle_message(update: Dict):
    """Process incoming Telegram message."""
    message = update.get("message", {})
    chat_id = message.get("chat", {}).get("id")
    text = message.get("text", "").strip().lower()
    username = message.get("from", {}).get("first_name", "")
    
    if not chat_id or not text:
        return
    
    # Command handlers
    if text == "/start" or text == "start":
        await handle_start(chat_id, username)
    elif "route" in text or "from" in text or "to" in text:
        await handle_route_query(chat_id, text)
    elif text in ["status", "current", "/status"]:
        await handle_status(chat_id)
    elif text in ["help", "/help"]:
        await send_telegram_message(chat_id, """📖 <b>FlowMasters Commands</b>

• <code>route S3 to S18</code> - Find best path
• <code>status</code> - Current situation
• <code>help</code> - Show this message

💡 Signal IDs are like S1, S2, ... S35""")
    else:
        # Try to parse as route query anyway
        if re.search(r'[sS]\d+.*[sS]\d+', text):
            await handle_route_query(chat_id, text)
        else:
            await send_telegram_message(chat_id, 
                "❓ Not sure what you mean.\nTry: <code>route S3 to S18</code> or <code>status</code>")


# ============================================================================
# Scenario Alert Functions (Called by Simulation Backend)
# ============================================================================

async def trigger_emergency_alert(path: List[str], vehicle_type: str = "Ambulance"):
    """Trigger emergency vehicle alert."""
    global current_scenario
    
    current_scenario = {
        "type": "emergency",
        "blocked_signals": [],
        "green_corridor": path,
        "diversion_routes": [],
        "path": path,
        "start_time": datetime.now().isoformat()
    }
    
    # Curate message with Gemini
    message = await curate_message_with_gemini({
        "type": f"Emergency Vehicle ({vehicle_type})",
        "blocked_signals": [],
        "path": path,
        "duration": "~10-15 minutes"
    })
    
    if not message:
        message = f"""🚨 <b>EMERGENCY ALERT</b> 🚨

🚑 {vehicle_type} requires green corridor!

📍 Route: <code>{' → '.join(path)}</code>
🟢 These signals will have priority green

⚠️ Please avoid this route if possible.

Reply <code>route S1 to S20</code> for alternate directions."""
    
    await broadcast_alert(message)


async def trigger_accident_alert(signals: List[str]):
    """Trigger accident alert."""
    global current_scenario
    
    current_scenario = {
        "type": "accident",
        "blocked_signals": signals,
        "green_corridor": [],
        "diversion_routes": [],
        "path": [],
        "start_time": datetime.now().isoformat()
    }
    
    message = await curate_message_with_gemini({
        "type": "Accident",
        "blocked_signals": signals,
        "path": [],
        "duration": "~30-60 minutes"
    })
    
    if not message:
        message = f"""🔥 <b>ACCIDENT ALERT</b> 🔥

⚠️ Traffic incident reported!

🚧 Blocked Signals: <code>{', '.join(signals)}</code>
⏱️ Expected duration: ~30-60 minutes

Reply <code>route S1 to S20</code> for alternate directions."""
    
    await broadcast_alert(message)


async def trigger_rally_alert(signals: List[str], path: List[str] = None):
    """Trigger rally/procession alert."""
    global current_scenario
    
    current_scenario = {
        "type": "rally",
        "blocked_signals": signals,
        "green_corridor": [],
        "diversion_routes": [],
        "path": path or [],
        "start_time": datetime.now().isoformat()
    }
    
    message = await curate_message_with_gemini({
        "type": "Rally/Procession",
        "blocked_signals": signals,
        "path": path or [],
        "duration": "~1-2 hours"
    })
    
    if not message:
        message = f"""🚶 <b>RALLY/PROCESSION ALERT</b> 🚶

📢 Public gathering/procession in progress

🚧 Affected Signals: <code>{', '.join(signals)}</code>
⏱️ Expected duration: ~1-2 hours

Reply <code>route S1 to S20</code> for alternate directions."""
    
    await broadcast_alert(message)


async def clear_scenario():
    """Clear current scenario (all clear)."""
    global current_scenario
    
    if current_scenario.get("type"):
        await broadcast_alert("✅ <b>ALL CLEAR</b>\n\nThe incident has been resolved. Traffic returning to normal.")
    
    current_scenario = {
        "type": None,
        "blocked_signals": [],
        "green_corridor": [],
        "diversion_routes": [],
        "path": [],
        "start_time": None
    }


# ============================================================================
# Main Bot Loop
# ============================================================================

async def bot_polling_loop():
    """Main loop to receive and process Telegram messages."""
    print("\n" + "="*60)
    print("🤖 FlowMasters Telegram Bot Started!")
    print("="*60)
    print(f"   Bot Token: {TELEGRAM_BOT_TOKEN[:20]}...")
    print(f"   Registered Users: {len(registered_users)}")
    print("="*60)
    print("\n💡 Users should search for your bot and send /start")
    print("📡 Listening for messages...\n")
    
    offset = 0
    
    while True:
        try:
            updates = await get_updates(offset)
            
            for update in updates:
                offset = update["update_id"] + 1
                await handle_message(update)
        
        except asyncio.CancelledError:
            print("\n👋 Bot stopped")
            break
        except Exception as e:
            print(f"⚠️ Error: {e}")
            await asyncio.sleep(5)


# ============================================================================
# Entry Point
# ============================================================================

if __name__ == "__main__":
    # Load network graph
    build_network_graph()
    
    # Load registered users from file
    load_registered_users()
    
    # Start bot
    try:
        asyncio.run(bot_polling_loop())
    except KeyboardInterrupt:
        print("\n👋 Bot stopped by user")
