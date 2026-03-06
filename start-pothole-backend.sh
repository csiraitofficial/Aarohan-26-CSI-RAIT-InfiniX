#!/bin/bash

echo "=========================================="
echo "Starting Pothole Detection Backend"
echo "=========================================="

cd pothole_backend

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Starting Flask server..."
python pothole_server.py
