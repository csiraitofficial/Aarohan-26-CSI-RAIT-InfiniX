#!/bin/bash
# ================================================================
# Tier 2 Medium City Simulation - Start Script
# 35 junctions with NodeMAPPO control on port 8768
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8768

echo "🏙️ Starting Tier 2 Medium City Simulation (NodeMAPPO)..."
echo "   Network: tier2.json (35 junctions)"
echo "   Port: $PORT"
echo ""

# Kill any process using the port
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo "   Killing existing process on port $PORT..."
    kill -9 $(lsof -ti:$PORT) 2>/dev/null
    sleep 1
fi

cd "$SCRIPT_DIR"
python sim_server_tier2.py
