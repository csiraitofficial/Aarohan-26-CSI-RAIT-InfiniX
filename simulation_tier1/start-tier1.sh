#!/bin/bash
# ================================================================
# Tier 1 Metro City Simulation - Start Script
# 45 junctions with NodeMAPPO control on port 8767
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8767

echo "🏢 Starting Tier 1 Metro City Simulation (NodeMAPPO)..."
echo "   Network: tier1.json (45 junctions)"
echo "   Port: $PORT"
echo ""

# Kill any process using the port
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo "   Killing existing process on port $PORT..."
    kill -9 $(lsof -ti:$PORT) 2>/dev/null
    sleep 1
fi

cd "$SCRIPT_DIR"
python sim_server_tier1.py
