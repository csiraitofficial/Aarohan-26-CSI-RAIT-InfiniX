#!/bin/bash
# ================================================================
# Yatayat - Start Essential Services
# Kills existing processes and runs on ports:
#   - Frontend:      3000
#   - CCTV:          8785
# ================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_PORT=3000
CCTV_PORT=8785

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Yatayat - Starting Essential Services${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# [1/4] Kill existing processes
echo -e "${YELLOW}[1/4] Cleaning up existing processes...${NC}"

for PORT in $FRONTEND_PORT $CCTV_PORT; do
    if lsof -ti:$PORT > /dev/null 2>&1; then
        echo "   Killing process on port $PORT..."
        kill -9 $(lsof -ti:$PORT) 2>/dev/null || true
    fi
done

sleep 2

# [2/4] Start CCTV Monitoring Server
echo -e "${GREEN}[2/4] Starting CCTV Monitoring Server (Port $CCTV_PORT)...${NC}"
cd "$SCRIPT_DIR/cctv_backend"
if [ -f "cctv_server.py" ]; then
    python cctv_server.py &
    CCTV_PID=$!
    echo "   CCTV Backend PID: $CCTV_PID"
else
    echo -e "${RED}   Warning: cctv_server.py not found${NC}"
    CCTV_PID=""
fi

# [4/4] Start Frontend
echo -e "${GREEN}[4/4] Starting Vite Frontend (Port $FRONTEND_PORT)...${NC}"
cd "$SCRIPT_DIR"
npm run dev -- --port $FRONTEND_PORT &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}  ✨ Essential Yatayat services started!${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""
echo -e "  Frontend:      ${YELLOW}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  CCTV:          ${YELLOW}http://localhost:$CCTV_PORT${NC}"
echo -e "  Telegram Bot:  ${YELLOW}Join @YatayatLoginBot${NC}"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop all services"
echo ""

# Collect all PIDs for cleanup
ALL_PIDS="$FRONTEND_PID"
[ -n "$CCTV_PID" ] && ALL_PIDS="$ALL_PIDS $CCTV_PID"
[ -n "$BOT_PID" ] && ALL_PIDS="$ALL_PIDS $BOT_PID"

# Handle Ctrl+C to cleanup
trap "echo -e '\n${YELLOW}Stopping all services...${NC}'; kill $ALL_PIDS 2>/dev/null; exit" SIGINT SIGTERM

# Wait for all processes
wait

