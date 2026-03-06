#!/bin/bash
# ================================================================
# Yatayat - Start All Services
# Kills existing processes and runs on ports:
#   - Frontend:      3000
#   - Backend (Sim): 8766
#   - Pothole:       5001
#   - Tier 1:        8767
#   - Tier 2:        8768
#   - CCTV:          8785
# ================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_PORT=3000
BACKEND_PORT=8766
POTHOLE_PORT=5001
TIER1_PORT=8767
TIER2_PORT=8768
CCTV_PORT=8785

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Yatayat - Starting All Services${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# [1/9] Kill existing processes on all ports
echo -e "${YELLOW}[1/9] Cleaning up existing processes...${NC}"

# Kill any existing ngrok tunnels first
if pgrep -f ngrok > /dev/null 2>&1; then
    echo "   Killing existing ngrok tunnels..."
    pkill -f ngrok 2>/dev/null || true
    sleep 1
fi

for PORT in $FRONTEND_PORT $BACKEND_PORT $POTHOLE_PORT $TIER1_PORT $TIER2_PORT $CCTV_PORT; do
    if lsof -ti:$PORT > /dev/null 2>&1; then
        echo "   Killing process on port $PORT..."
        kill -9 $(lsof -ti:$PORT) 2>/dev/null || true
    fi
done

sleep 2

# [2/8] Start Pothole Detection Backend
echo -e "${GREEN}[2/8] Starting Pothole Detection Backend (Port $POTHOLE_PORT)...${NC}"
cd "$SCRIPT_DIR/pothole_backend"
if [ -f "pothole_server.py" ]; then
    python3 pothole_server.py > /tmp/pothole_backend.log 2>&1 &
    POTHOLE_PID=$!
    echo "   Pothole Backend PID: $POTHOLE_PID"
else
    echo -e "${RED}   Warning: pothole_backend/pothole_server.py not found${NC}"
    POTHOLE_PID=""
fi

# [3/8] Start Enhanced Simulation Backend
echo -e "${GREEN}[3/8] Starting Enhanced Simulation Backend (Port $BACKEND_PORT)...${NC}"
cd "$SCRIPT_DIR/simulation_backend"
if [ -f "enhanced_sim_server.py" ]; then
    python enhanced_sim_server.py &
elif [ -f "sim_server.py" ]; then
    python sim_server.py &
fi
BACKEND_PID=$!
echo "   Simulation Backend PID: $BACKEND_PID"

# [4/8] Start Tier 1 Metro Simulation
echo -e "${GREEN}[4/8] Starting Tier 1 Metro Simulation (Port $TIER1_PORT)...${NC}"
cd "$SCRIPT_DIR/simulation_tier1"
if [ -f "sim_server_tier1.py" ]; then
    python sim_server_tier1.py &
    TIER1_PID=$!
    echo "   Tier 1 Backend PID: $TIER1_PID"
else
    echo -e "${RED}   Warning: sim_server_tier1.py not found${NC}"
    TIER1_PID=""
fi

# [5/8] Start Tier 2 District Simulation
echo -e "${GREEN}[5/8] Starting Tier 2 District Simulation (Port $TIER2_PORT)...${NC}"
cd "$SCRIPT_DIR/simulation_tier2"
if [ -f "sim_server_tier2.py" ]; then
    python sim_server_tier2.py &
    TIER2_PID=$!
    echo "   Tier 2 Backend PID: $TIER2_PID"
else
    echo -e "${RED}   Warning: sim_server_tier2.py not found${NC}"
    TIER2_PID=""
fi

# [6/8] Start CCTV Monitoring Server
echo -e "${GREEN}[6/8] Starting CCTV Monitoring Server (Port $CCTV_PORT)...${NC}"
cd "$SCRIPT_DIR/cctv_backend"
if [ -f "cctv_server.py" ]; then
    python cctv_server.py &
    CCTV_PID=$!
    echo "   CCTV Backend PID: $CCTV_PID"
else
    echo -e "${RED}   Warning: cctv_server.py not found${NC}"
    CCTV_PID=""
fi

# [7/8] Start Telegram Bots
echo -e "${GREEN}[7/8] Starting Telegram Bots...${NC}"
cd "$SCRIPT_DIR/telegram_bot"
if [ -f "telegram_alert_bot.py" ]; then
    python telegram_alert_bot.py &
    ALERT_BOT_PID=$!
    echo "   Alert Bot PID: $ALERT_BOT_PID"
else
    echo -e "${RED}   Warning: telegram_alert_bot.py not found${NC}"
    ALERT_BOT_PID=""
fi

if [ -f "telegram_login_bot.py" ]; then
    python telegram_login_bot.py &
    LOGIN_BOT_PID=$!
    echo "   Login Bot PID: $LOGIN_BOT_PID"
else
    echo -e "${RED}   Warning: telegram_login_bot.py not found${NC}"
    LOGIN_BOT_PID=""
fi

if [ -f "telegram_employee_bot.py" ]; then
    python telegram_employee_bot.py &
    EMPLOYEE_BOT_PID=$!
    echo "   Employee Bot PID: $EMPLOYEE_BOT_PID"
else
    echo -e "${YELLOW}   Note: telegram_employee_bot.py not configured (optional)${NC}"
    EMPLOYEE_BOT_PID=""
fi

# Wait for backends to initialize
sleep 3

# [8/9] Start Frontend (dev server with polling to avoid ENOSPC watchers)
echo -e "${GREEN}[8/9] Starting Vite Frontend (Port $FRONTEND_PORT)...${NC}"
cd "$SCRIPT_DIR"

# Workaround for: ENOSPC: System limit for number of file watchers reached
# Use polling instead of inotify watchers.
CHOKIDAR_USEPOLLING=1 CHOKIDAR_INTERVAL=1000 npm run dev -- --port $FRONTEND_PORT --host 0.0.0.0 > /tmp/yatayat_frontend_dev.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

# Wait for frontend to start
sleep 3

# [9/9] Start ngrok tunnel for mobile access
echo -e "${GREEN}[9/9] Starting ngrok tunnel for mobile access...${NC}"
NGROK_BIN="/tmp/ngrok"
NGROK_URL=""

# Download ngrok if not present
if [ ! -f "$NGROK_BIN" ]; then
    echo "   Downloading ngrok..."
    wget -q https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz -O /tmp/ngrok.tgz
    tar -xzf /tmp/ngrok.tgz -C /tmp
    chmod +x $NGROK_BIN
fi

# Check if ngrok auth token is configured (check config file directly)
NGROK_CONFIG="$HOME/.config/ngrok/ngrok.yml"
if [ -f "$NGROK_CONFIG" ] && grep -q "authtoken" "$NGROK_CONFIG"; then
    # Start ngrok in background
    $NGROK_BIN http $FRONTEND_PORT --log=stdout > /tmp/ngrok.log 2>&1 &
    NGROK_PID=$!
    echo "   ngrok PID: $NGROK_PID"
    
    # Wait for ngrok to start and get URL
    sleep 5
    NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tunnels'][0]['public_url'] if d.get('tunnels') else '')" 2>/dev/null || echo "")
    
    if [ -z "$NGROK_URL" ]; then
        echo -e "   ${RED}Warning: ngrok started but URL not available${NC}"
        echo -e "   ${YELLOW}Check: curl http://127.0.0.1:4040/api/tunnels${NC}"
    else
        # Send public link to all registered Telegram users
        echo -e "   ${GREEN}Sending public link to registered users...${NC}"
        CHATS_FILE="$SCRIPT_DIR/telegram_bot/login_registered_chats.json"
        BOT_TOKEN="8339506549:AAEn5b3duPYb8NNZ0skjJGBLXHEfNgy41AU"
        
        if [ -f "$CHATS_FILE" ]; then
            python3 - <<EOF
import json
import urllib.request
import urllib.parse

chats_file = "$CHATS_FILE"
bot_token = "$BOT_TOKEN"
public_url = "$NGROK_URL"

try:
    with open(chats_file, 'r') as f:
        chats = json.load(f)
    
    if not isinstance(chats, dict):
        print("   No registered users found")
        exit(0)
    
    message = f"""🚀 <b>Yatayat Platform is LIVE!</b>

Access the platform from anywhere:

📱 <b>Public Link:</b>
<a href="{public_url}">{public_url}</a>

<i>This link is valid until the server restarts.</i>

---
Login with your registered phone number."""

    sent_count = 0
    for phone, chat_id in chats.items():
        try:
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            data = urllib.parse.urlencode({
                'chat_id': chat_id,
                'text': message,
                'parse_mode': 'HTML',
                'disable_web_page_preview': 'false'
            }).encode()
            req = urllib.request.Request(url, data=data)
            urllib.request.urlopen(req, timeout=5)
            sent_count += 1
        except Exception as e:
            print(f"   Failed to send to {phone}: {e}")
    
    print(f"   📤 Sent public link to {sent_count} users")
except Exception as e:
    print(f"   Error: {e}")
EOF
        else
            echo -e "   ${YELLOW}No registered users file found${NC}"
        fi
    fi
else
    echo -e "   ${RED}Warning: ngrok not configured. Run: /tmp/ngrok config add-authtoken YOUR_TOKEN${NC}"
    NGROK_PID=""
fi

echo ""
echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}  ✨ All Yatayat services started!${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""
echo -e "  ${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}🖥️  LOCAL ACCESS:${NC}"
echo -e "     Frontend:      ${YELLOW}http://localhost:$FRONTEND_PORT${NC}"
echo -e ""
echo -e "  ${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ -n "$NGROK_URL" ]; then
echo -e "  ${GREEN}📱 MOBILE ACCESS (share this link!):${NC}"
echo -e "     Public URL:    ${YELLOW}$NGROK_URL${NC}"
echo -e ""
echo -e "  ${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi
echo -e "  ${GREEN}⚙️  BACKEND SERVICES:${NC}"
echo -e "     Simulation:    ${YELLOW}http://localhost:$BACKEND_PORT${NC}"
echo -e "     Pothole:       ${YELLOW}http://localhost:$POTHOLE_PORT${NC}"
echo -e "     Tier 1:        ${YELLOW}http://localhost:$TIER1_PORT${NC}"
echo -e "     Tier 2:        ${YELLOW}http://localhost:$TIER2_PORT${NC}"
echo -e "     CCTV:          ${YELLOW}http://localhost:$CCTV_PORT${NC}"
echo -e "  ${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop all services"
echo ""

# Collect all PIDs for cleanup
ALL_PIDS="$FRONTEND_PID $BACKEND_PID"
[ -n "$POTHOLE_PID" ] && ALL_PIDS="$ALL_PIDS $POTHOLE_PID"
[ -n "$TIER1_PID" ] && ALL_PIDS="$ALL_PIDS $TIER1_PID"
[ -n "$TIER2_PID" ] && ALL_PIDS="$ALL_PIDS $TIER2_PID"
[ -n "$CCTV_PID" ] && ALL_PIDS="$ALL_PIDS $CCTV_PID"
[ -n "$ALERT_BOT_PID" ] && ALL_PIDS="$ALL_PIDS $ALERT_BOT_PID"
[ -n "$LOGIN_BOT_PID" ] && ALL_PIDS="$ALL_PIDS $LOGIN_BOT_PID"
[ -n "$NGROK_PID" ] && ALL_PIDS="$ALL_PIDS $NGROK_PID"

# Handle Ctrl+C to cleanup
trap "echo -e '\n${YELLOW}Stopping all services...${NC}'; kill $ALL_PIDS 2>/dev/null; exit" SIGINT SIGTERM

# Wait for all processes
wait

