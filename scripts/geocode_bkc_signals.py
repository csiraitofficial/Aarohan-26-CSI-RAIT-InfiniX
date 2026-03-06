#!/usr/bin/env python3
"""
Geocode BKC (Bandra-Kurla Complex) intersections using Mapbox Geocoding API.
Gets precise coordinates for real traffic signals in the BKC area.
"""

import json
import requests
import time
from pathlib import Path

# Mapbox access token
MAPBOX_TOKEN = "YOUR_MAPBOX_ACCESS_TOKEN_HERE"
GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places"

# Real BKC area intersections/landmarks for geocoding
BKC_JUNCTIONS = [
    # Main BKC intersections
    {"signal_id": "S1", "query": "Kalanagar junction Bandra East Mumbai"},
    {"signal_id": "S2", "query": "BKC connector road Bandra Mumbai"},
    {"signal_id": "S3", "query": "MMRDA building BKC Mumbai"},
    {"signal_id": "S4", "query": "Bharat Diamond Bourse BKC Mumbai"},
    {"signal_id": "S5", "query": "American Consulate BKC Mumbai"},
    {"signal_id": "S6", "query": "One BKC building Mumbai"},
    {"signal_id": "S7", "query": "Jio World Centre BKC Mumbai"},
    {"signal_id": "S8", "query": "Platina building BKC Mumbai"},
    {"signal_id": "S9", "query": "NESCO IT Park Goregaon Mumbai"},  # Nearby reference
    {"signal_id": "S10", "query": "Trident Hotel BKC Mumbai"},
    {"signal_id": "S11", "query": "Sofitel Hotel BKC Mumbai"},
    {"signal_id": "S12", "query": "Trade Centre BKC Mumbai"},
    {"signal_id": "S13", "query": "Family Court Bandra Mumbai"},
    {"signal_id": "S14", "query": "Kurla station junction Mumbai"},
    {"signal_id": "S15", "query": "LBS Marg Kurla junction Mumbai"},
]

# For tier1 (35 signals), we need more junctions in the greater BKC area
BKC_TIER1_JUNCTIONS = [
    {"signal_id": "S1", "query": "Kalanagar junction Bandra East Mumbai"},
    {"signal_id": "S2", "query": "BKC Bandra Kurla Complex main gate Mumbai"},
    {"signal_id": "S3", "query": "MMRDA junction BKC Mumbai"},
    {"signal_id": "S4", "query": "Bharat Diamond Bourse BKC Mumbai"},
    {"signal_id": "S5", "query": "American Consulate BKC Mumbai"},
    {"signal_id": "S6", "query": "One BKC building Bandra Mumbai"},
    {"signal_id": "S7", "query": "Jio World Centre BKC Mumbai"},
    {"signal_id": "S8", "query": "Platina tower BKC Mumbai"},
    {"signal_id": "S9", "query": "Maker Maxity BKC Mumbai"},
    {"signal_id": "S10", "query": "Trident Hotel Bandra Kurla Complex Mumbai"},
    {"signal_id": "S11", "query": "Sofitel Hotel Bandra Kurla Complex Mumbai"},
    {"signal_id": "S12", "query": "IL&FS building BKC Mumbai"},
    {"signal_id": "S13", "query": "Family Court Bandra Mumbai"},
    {"signal_id": "S14", "query": "Kurla railway station Mumbai"},
    {"signal_id": "S15", "query": "LBS Marg Kurla Mumbai"},
    {"signal_id": "S16", "query": "Bandra railway station east Mumbai"},
    {"signal_id": "S17", "query": "Bandra Terminus Mumbai"},
    {"signal_id": "S18", "query": "Dharavi junction Mumbai"},
    {"signal_id": "S19", "query": "Sion junction Mumbai"},
    {"signal_id": "S20", "query": "Chunabhatti junction Mumbai"},
    {"signal_id": "S21", "query": "Vakola junction Santacruz Mumbai"},
    {"signal_id": "S22", "query": "Kalina university junction Mumbai"},
    {"signal_id": "S23", "query": "CST Kalina Mumbai"},
    {"signal_id": "S24", "query": "Santacruz east junction Mumbai"},
    {"signal_id": "S25", "query": "Guru Nanak Hospital Bandra Mumbai"},
    {"signal_id": "S26", "query": "Bandra Reclamation junction Mumbai"},
    {"signal_id": "S27", "query": "Linking Road Bandra Mumbai"},
    {"signal_id": "S28", "query": "Khar station junction Mumbai"},
    {"signal_id": "S29", "query": "SV Road Khar junction Mumbai"},
    {"signal_id": "S30", "query": "Vile Parle junction Mumbai"},
    {"signal_id": "S31", "query": "Andheri junction Mumbai"},
    {"signal_id": "S32", "query": "SEEPZ Andheri east Mumbai"},
    {"signal_id": "S33", "query": "MIDC Andheri east Mumbai"},
    {"signal_id": "S34", "query": "Marol junction Andheri Mumbai"},
    {"signal_id": "S35", "query": "Saki Naka junction Mumbai"},
]


def geocode_location(query: str) -> tuple:
    """Geocode a location using Mapbox API. Returns (lat, lon, place_name) or None."""
    url = f"{GEOCODE_URL}/{requests.utils.quote(query)}.json"
    params = {
        "access_token": MAPBOX_TOKEN,
        "country": "IN",
        "limit": 1,
        "types": "poi,address,place,locality",
        # BKC/Bandra area bounding box
        "bbox": "72.82,19.02,72.92,19.12",
        # Proximity bias towards BKC center
        "proximity": "72.87,19.07"
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get("features"):
            feature = data["features"][0]
            lon, lat = feature["center"]  # Mapbox returns [lon, lat]
            
            # Validate that result is within Mumbai
            if not (18.85 <= lat <= 19.35 and 72.75 <= lon <= 73.10):
                print(f"   ⚠️ Result outside Mumbai bounds: {lat}, {lon}")
                return None
            
            place_name = feature.get("place_name", "")
            return (round(lat, 6), round(lon, 6), place_name)
    except Exception as e:
        print(f"   ⚠️ Error geocoding '{query}': {e}")
    
    return None


def update_network_file(junctions: list, network_path: Path) -> None:
    """Geocode all junctions and update network file coordinates."""
    
    with open(network_path) as f:
        network = json.load(f)
    
    print(f"\n📍 Geocoding {len(junctions)} junctions for {network_path.name}...")
    print(f"   Network has {len(network)} signals")
    
    results = []
    for junction in junctions:
        sid = junction["signal_id"]
        query = junction["query"]
        
        result = geocode_location(query)
        if result:
            lat, lon, place_name = result
            results.append({
                "signal_id": sid,
                "lat": lat,
                "lon": lon,
                "query": query,
                "geocoded": place_name
            })
            print(f"   ✓ {sid}: ({lat}, {lon}) - {query.split(' Mumbai')[0]}")
        else:
            print(f"   ✗ {sid}: Failed to geocode '{query}'")
        
        # Rate limiting
        time.sleep(0.25)
    
    # Update network signals with geocoded coordinates
    for r in results:
        for sig in network:
            if sig["signal_id"] == r["signal_id"]:
                sig["lat"] = r["lat"]
                sig["lon"] = r["lon"]
                # Remove location_name if present (user wants just S1, S2, etc.)
                sig.pop("location_name", None)
                break
    
    # Save updated network
    with open(network_path, "w") as f:
        json.dump(network, f, indent=4)
    
    print(f"\n   ✅ Updated {len(results)}/{len(junctions)} signals in {network_path.name}")
    
    # Print coordinate summary
    lats = [s["lat"] for s in network]
    lons = [s["lon"] for s in network]
    print(f"   📊 Lat range: {min(lats):.4f} to {max(lats):.4f}")
    print(f"   📊 Lon range: {min(lons):.4f} to {max(lons):.4f}")


def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    print("🗺️ Geocoding BKC Intersections with Mapbox API")
    print("=" * 60)
    
    # Update main simulation file (15 signals)
    main_network = project_root / "sambalpur_signals_15_movement.json"
    if main_network.exists():
        print("\n🚦 MAPPO Simulation (15 signals)")
        update_network_file(BKC_JUNCTIONS, main_network)
    
    # Update tier1 file (35 signals)
    tier1_network = project_root / "simulation_tier1" / "tier1.json"
    if tier1_network.exists():
        print("\n🚦 TIER 1 Simulation (35 signals)")
        update_network_file(BKC_TIER1_JUNCTIONS, tier1_network)
    
    print("\n" + "=" * 60)
    print("🎉 Done! Signals now have real geocoded BKC coordinates.")
    print("   Restart ./start-all.sh and check the map view.")


if __name__ == "__main__":
    main()
