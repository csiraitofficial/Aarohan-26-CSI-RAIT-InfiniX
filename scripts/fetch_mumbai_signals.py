#!/usr/bin/env python3
"""
Fetch real Mumbai traffic signal coordinates from OpenStreetMap Overpass API.
Updates tier1.json and tier2.json with actual junction locations.
"""

import json
import requests
from pathlib import Path
from typing import List, Dict, Tuple

# Overpass API endpoint
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Mumbai regions for each tier
REGIONS = {
    "tier1": {
        "name": "South Mumbai",
        "bbox": "18.90,72.80,18.96,72.86",  # South Mumbai: CST, Fort, Churchgate, Marine Drive
        "description": "CST, Flora Fountain, Marine Lines, Churchgate"
    },
    "tier2": {
        "name": "Bandra-Kurla",
        "bbox": "19.04,72.83,19.12,72.90",  # Western Suburbs: Bandra, BKC, Khar, Santacruz
        "description": "Bandra, BKC, Khar, Santacruz, Andheri"
    }
}

def fetch_traffic_signals(bbox: str) -> List[Dict]:
    """Fetch traffic signals from OpenStreetMap via Overpass API."""
    # Overpass QL query for traffic signals in bounding box
    query = f"""
    [out:json][timeout:60];
    (
      node["highway"="traffic_signals"]({bbox});
    );
    out body;
    """
    
    print(f"📡 Fetching traffic signals from OpenStreetMap...")
    print(f"   Bounding box: {bbox}")
    
    try:
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=60)
        response.raise_for_status()
        data = response.json()
        
        signals = []
        for element in data.get("elements", []):
            if element.get("type") == "node":
                signals.append({
                    "osm_id": element["id"],
                    "lat": element["lat"],
                    "lon": element["lon"],
                    "name": element.get("tags", {}).get("name", ""),
                    "ref": element.get("tags", {}).get("ref", "")
                })
        
        print(f"   Found {len(signals)} traffic signals")
        return signals
        
    except Exception as e:
        print(f"❌ Error fetching from Overpass API: {e}")
        return []


def assign_signals_to_network(osm_signals: List[Dict], network_path: Path, tier_name: str) -> None:
    """Assign real OSM coordinates to network signals."""
    
    with open(network_path) as f:
        network = json.load(f)
    
    num_signals = len(network)
    print(f"\n📍 Assigning {num_signals} signals for {tier_name}...")
    
    if len(osm_signals) < num_signals:
        print(f"   ⚠️ Only {len(osm_signals)} OSM signals found, need {num_signals}")
        print(f"   Will use available signals and spread remaining evenly")
    
    # Sort OSM signals by latitude (north to south) for logical ordering
    osm_sorted = sorted(osm_signals, key=lambda s: (-s["lat"], s["lon"]))
    
    # Assign coordinates
    for i, signal in enumerate(network):
        if i < len(osm_sorted):
            # Use real OSM coordinates
            signal["lat"] = round(osm_sorted[i]["lat"], 6)
            signal["lon"] = round(osm_sorted[i]["lon"], 6)
            if osm_sorted[i]["name"]:
                signal["osm_name"] = osm_sorted[i]["name"]
        else:
            # If we run out of OSM signals, interpolate
            # Use the last available signal's coordinates with slight offset
            base_idx = len(osm_sorted) - 1
            offset_lat = (i - base_idx) * 0.002
            offset_lon = (i - base_idx) * 0.001
            signal["lat"] = round(osm_sorted[base_idx]["lat"] + offset_lat, 6)
            signal["lon"] = round(osm_sorted[base_idx]["lon"] + offset_lon, 6)
    
    # Save updated network
    with open(network_path, "w") as f:
        json.dump(network, f, indent=4)
    
    print(f"   ✅ Updated {network_path}")
    
    # Print sample
    print(f"\n   Sample signals:")
    for i in range(min(5, len(network))):
        s = network[i]
        name = s.get("osm_name", "")
        print(f"   {s['signal_id']}: ({s['lat']:.6f}, {s['lon']:.6f}) {name}")


def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    print("🗺️ Fetching Real Mumbai Traffic Signal Coordinates")
    print("=" * 60)
    
    # Process Tier 1 - South Mumbai
    print(f"\n🏙️ TIER 1: {REGIONS['tier1']['name']}")
    print(f"   Area: {REGIONS['tier1']['description']}")
    tier1_signals = fetch_traffic_signals(REGIONS["tier1"]["bbox"])
    if tier1_signals:
        tier1_path = project_root / "simulation_tier1" / "tier1.json"
        assign_signals_to_network(tier1_signals, tier1_path, "Tier 1")
    
    # Process Tier 2 - Bandra/Western Suburbs
    print(f"\n🏙️ TIER 2: {REGIONS['tier2']['name']}")
    print(f"   Area: {REGIONS['tier2']['description']}")
    tier2_signals = fetch_traffic_signals(REGIONS["tier2"]["bbox"])
    if tier2_signals:
        tier2_path = project_root / "simulation_tier2" / "tier2.json"
        assign_signals_to_network(tier2_signals, tier2_path, "Tier 2")
    
    print("\n" + "=" * 60)
    print("🎉 Done! Restart ./start-all.sh to see real Mumbai locations.")
    print("   Toggle to 'Mumbai Map' view in the simulation pages.")


if __name__ == "__main__":
    main()
