#!/bin/bash

# =============================================================================
# Yatayat Unified Frontend Startup Script
# Starts all frontend services: Homepage, FlowMasters, Citizen Portal
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BLUE}================================================================${NC}"
echo -e "${CYAN}       🌐 Yatayat Unified Frontend Services${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping all frontend services...${NC}"
    pkill -f "serve.py" 2>/dev/null || true
    pkill -f "npm run dev" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    echo -e "${GREEN}✅ All frontend services stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Kill existing frontend processes
echo -e "${YELLOW}Cleaning up existing frontend processes...${NC}"
pkill -f "serve.py" 2>/dev/null || true
# Be careful not to kill the script itself
sleep 2
echo ""

# =============================================================================
# Start Unified Homepage (Port 3000)
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🏠 UNIFIED HOMEPAGE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

HOMEPAGE_DIR="$SCRIPT_DIR/YatayatHomepage"
if [ -f "$HOMEPAGE_DIR/serve.py" ]; then
    echo -e "${GREEN}🏠 Starting Yatayat Homepage (Port 3000)${NC}"
    cd "$HOMEPAGE_DIR"
    python3 serve.py &
    HOMEPAGE_PID=$!
    echo "   PID: $HOMEPAGE_PID"
    sleep 2
else
    echo -e "${YELLOW}⚠️ Homepage not found at $HOMEPAGE_DIR${NC}"
fi
echo ""

# =============================================================================
# Start FlowMasters Frontend (Port 8081)
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🚦 FLOWMASTERS TRAFFIC CONTROL${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

FLOWMASTERS_DIR="$SCRIPT_DIR/FlowMasters-frontend-final"
if [ -d "$FLOWMASTERS_DIR" ]; then
    echo -e "${GREEN}🚀 Starting FlowMasters Frontend (Port 8081)${NC}"
    cd "$FLOWMASTERS_DIR"
    npm run dev -- --port 8081 &
    FLOWMASTERS_PID=$!
    echo "   PID: $FLOWMASTERS_PID"
    sleep 3
else
    echo -e "${RED}❌ FlowMasters not found at $FLOWMASTERS_DIR${NC}"
fi
echo ""

# =============================================================================
# Start Citizen Portal Frontend (Port 5173)
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}👤 CITIZEN PORTAL${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

CITIZEN_DIR="$SCRIPT_DIR/YatayatCitizenPortal"
if [ -d "$CITIZEN_DIR" ]; then
    echo -e "${GREEN}🚀 Starting Citizen Portal Frontend (Port 5173)${NC}"
    cd "$CITIZEN_DIR"
    npm run dev &
    CITIZEN_PID=$!
    echo "   PID: $CITIZEN_PID"
    sleep 3
else
    echo -e "${RED}❌ Citizen Portal not found at $CITIZEN_DIR${NC}"
fi
echo ""

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}✅ All Frontend Services Started!${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""
echo -e "  ${CYAN}🏠 Unified Homepage:${NC}"
echo "     http://localhost:3000"
echo ""
echo -e "  ${GREEN}🚦 FlowMasters Traffic Control:${NC}"
echo "     http://localhost:8081"
echo ""
echo -e "  ${GREEN}👤 Citizen Portal:${NC}"
echo "     http://localhost:5173"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}🌟 START HERE: http://localhost:3000${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all frontend services${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# Wait for all background processes
wait
