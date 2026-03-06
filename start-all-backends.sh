#!/bin/bash

# =============================================================================
# Yatayat Unified Backend Startup Script
# Starts all backend services for both FlowMasters and Citizen Portal
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}       🚀 Yatayat Unified Backend Services${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping all services...${NC}"
    pkill -f "sim_server_tier1.py" 2>/dev/null || true
    pkill -f "sim_server_tier2.py" 2>/dev/null || true
    pkill -f "mappo_sim_server.py" 2>/dev/null || true
    pkill -f "telegram_alert_bot.py" 2>/dev/null || true
    pkill -f "cctv_server.py" 2>/dev/null || true
    pkill -f "lstm_comparison_server.py" 2>/dev/null || true
    pkill -f "citizen_backend" 2>/dev/null || true
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${YELLOW}Cleaning up existing processes...${NC}"
pkill -f "sim_server" 2>/dev/null || true
pkill -f "telegram_alert_bot.py" 2>/dev/null || true
pkill -f "cctv_server.py" 2>/dev/null || true
pkill -f "lstm_comparison_server.py" 2>/dev/null || true
sleep 2
echo ""

# =============================================================================
# FlowMasters Backend Services
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📊 FLOWMASTERS TRAFFIC CONTROL BACKENDS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

FLOWMASTERS_DIR="$SCRIPT_DIR/FlowMasters-frontend-final"

# Start Original MAPPO (from simulation_backend)
echo -e "${GREEN}🚀 Starting MAPPO Simulation (Port 8766)${NC}"
cd "$FLOWMASTERS_DIR/simulation_backend"
python3 sim_server.py &
sleep 1

# Start Tier 1
echo -e "${GREEN}🏢 Starting Tier 1 Metro City (Port 8767)${NC}"
cd "$FLOWMASTERS_DIR/simulation_tier1"
python3 sim_server_tier1.py &
sleep 1

# Start Tier 2
echo -e "${GREEN}🏙️ Starting Tier 2 District City (Port 8768)${NC}"
cd "$FLOWMASTERS_DIR/simulation_tier2"
python3 sim_server_tier2.py &
sleep 1

# Start CCTV Server
echo -e "${GREEN}📹 Starting CCTV Server (Port 8785)${NC}"
cd "$FLOWMASTERS_DIR/cctv_backend"
python3 cctv_server.py &
sleep 1

# Start LSTM Comparison
echo -e "${GREEN}📈 Starting LSTM Comparison Server (Port 8780)${NC}"
cd "$FLOWMASTERS_DIR/lstm_prediction"
python3 lstm_comparison_server.py &
sleep 1

# Start Telegram Bot
echo -e "${GREEN}🤖 Starting Telegram Alert Bot${NC}"
cd "$FLOWMASTERS_DIR"
python3 telegram_bot/telegram_alert_bot.py &
sleep 1

# =============================================================================
# Citizen Portal Backend (if exists)
# =============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}👤 CITIZEN PORTAL BACKENDS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

CITIZEN_DIR="$SCRIPT_DIR/YatayatCitizenPortal/backend"
if [ -d "$CITIZEN_DIR" ]; then
    echo -e "${GREEN}🔧 Starting Citizen Backend Services${NC}"
    for backend in "$CITIZEN_DIR"/*.py; do
        if [ -f "$backend" ]; then
            echo "   Starting: $(basename $backend)"
            cd "$CITIZEN_DIR"
            python3 "$backend" &
            sleep 0.5
        fi
    done
else
    echo -e "${YELLOW}⚠️ No citizen backend found at $CITIZEN_DIR${NC}"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}✅ All Backend Services Started!${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""
echo -e "  ${GREEN}FlowMasters Traffic Control:${NC}"
echo "    📊 MAPPO Simulation:    http://localhost:8766"
echo "    🏢 Tier 1 Metro:        http://localhost:8767"
echo "    🏙️  Tier 2 District:     http://localhost:8768"
echo "    📹 CCTV Detection:      http://localhost:8785"
echo "    📈 LSTM Comparison:     http://localhost:8780"
echo "    🤖 Telegram Bot:        Active"
echo ""
echo -e "  ${GREEN}Citizen Services:${NC}"
echo "    Backend services running (if available)"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# Wait for all background processes
wait
