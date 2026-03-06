#!/usr/bin/env python3
"""
Geocode Mumbai intersection names using Mapbox Geocoding API.
Gets precise coordinates for each signal location.
"""

import json
import requests
import time
from pathlib import Path

# Mapbox access token (same as used in frontend)
MAPBOX_TOKEN = "YOUR_MAPBOX_ACCESS_TOKEN_HERE"
GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places"

# Tier 1: South Mumbai intersections - specific junction names
TIER1_JUNCTIONS = [
    {"signal_id": "S1", "query": "Nariman Point junction Mumbai"},
    {"signal_id": "S2", "query": "NCPA junction Nariman Point Mumbai"},
    {"signal_id": "S3", "query": "Oberoi Hotel Marine Drive Mumbai"},
    {"signal_id": "S4", "query": "Marine Plaza Hotel junction Mumbai"},
    {"signal_id": "S5", "query": "Girgaon Chowpatty junction Mumbai"},
    {"signal_id": "S6", "query": "Wilson College junction Mumbai"},
    {"signal_id": "S7", "query": "Charni Road station junction Mumbai"},
    {"signal_id": "S8", "query": "Grant Road West junction Mumbai"},
    {"signal_id": "S9", "query": "Opera House junction Mumbai"},
    {"signal_id": "S10", "query": "Hughes Road junction Mumbai"},
    {"signal_id": "S11", "query": "Tardeo Circle junction Mumbai"},
    {"signal_id": "S12", "query": "Haji Ali junction Mumbai"},
    {"signal_id": "S13", "query": "Flora Fountain junction Mumbai"},
    {"signal_id": "S14", "query": "Horniman Circle junction Mumbai"},
    {"signal_id": "S15", "query": "Fort junction Mumbai"},
    {"signal_id": "S16", "query": "Ballard Estate junction Mumbai"},
    {"signal_id": "S17", "query": "Kala Ghoda junction Mumbai"},
    {"signal_id": "S18", "query": "Churchgate station junction Mumbai"},
    {"signal_id": "S19", "query": "Eros Cinema junction Mumbai"},
    {"signal_id": "S20", "query": "Metro Cinema junction Mumbai"},
    {"signal_id": "S21", "query": "CST station junction Mumbai"},
    {"signal_id": "S22", "query": "Victoria Terminus junction Mumbai"},
    {"signal_id": "S23", "query": "Gateway of India junction Mumbai"},
    {"signal_id": "S24", "query": "Taj Mahal Hotel Colaba junction Mumbai"},
    {"signal_id": "S25", "query": "Regal Cinema Colaba junction Mumbai"},
    {"signal_id": "S26", "query": "Colaba Causeway junction Mumbai"},
    {"signal_id": "S27", "query": "Radio Club Colaba junction Mumbai"},
    {"signal_id": "S28", "query": "Peddar Road junction Mumbai"},
    {"signal_id": "S29", "query": "Breach Candy junction Mumbai"},
    {"signal_id": "S30", "query": "Mahalaxmi junction Mumbai"},
    {"signal_id": "S31", "query": "Worli Naka junction Mumbai"},
    {"signal_id": "S32", "query": "Annie Besant Road junction Mumbai"},
    {"signal_id": "S33", "query": "Air India Building junction Mumbai"},
    {"signal_id": "S34", "query": "MG Road junction Mumbai Fort"},
    {"signal_id": "S35", "query": "DN Road junction Mumbai"},
]

# Tier 2: Bandra-BKC intersections
TIER2_JUNCTIONS = [
    {"signal_id": "S1", "query": "Bandra Station West junction Mumbai"},
    {"signal_id": "S2", "query": "Hill Road Bandra junction Mumbai"},
    {"signal_id": "S3", "query": "Pali Hill junction Bandra Mumbai"},
    {"signal_id": "S4", "query": "Carter Road junction Bandra Mumbai"},
    {"signal_id": "S5", "query": "Linking Road Bandra junction Mumbai"},
    {"signal_id": "S6", "query": "Turner Road Bandra junction Mumbai"},
    {"signal_id": "S7", "query": "Chapel Road Bandra junction Mumbai"},
    {"signal_id": "S8", "query": "Bandra Station East junction Mumbai"},
    {"signal_id": "S9", "query": "Kalanagar junction Bandra Mumbai"},
    {"signal_id": "S10", "query": "BKC connector junction Mumbai"},
    {"signal_id": "S11", "query": "Bandra Kurla Complex Gate 1 Mumbai"},
    {"signal_id": "S12", "query": "BKC Central junction Mumbai"},
    {"signal_id": "S13", "query": "Bharat Diamond Bourse BKC Mumbai"},
    {"signal_id": "S14", "query": "American Consulate BKC Mumbai"},
    {"signal_id": "S15", "query": "Platina building BKC Mumbai"},
    {"signal_id": "S16", "query": "MMRDA junction BKC Mumbai"},
    {"signal_id": "S17", "query": "Khar Station junction Mumbai"},
    {"signal_id": "S18", "query": "Khar West junction Mumbai"},
    {"signal_id": "S19", "query": "Linking Road Khar junction Mumbai"},
    {"signal_id": "S20", "query": "Khar Danda junction Mumbai"},
    {"signal_id": "S21", "query": "Santacruz West junction Mumbai"},
    {"signal_id": "S22", "query": "Juhu Circle junction Mumbai"},
    {"signal_id": "S23", "query": "Juhu Beach junction Mumbai"},
    {"signal_id": "S24", "query": "Bandra Terminus junction Mumbai"},
    {"signal_id": "S25", "query": "Guru Nanak Hospital Bandra Mumbai"},
    {"signal_id": "S26", "query": "SV Road Khar junction Mumbai"},
    {"signal_id": "S27", "query": "SV Road Santacruz junction Mumbai"},
    {"signal_id": "S28", "query": "Vile Parle junction Mumbai"},
    {"signal_id": "S29", "query": "Western Express Highway Bandra junction Mumbai"},
    {"signal_id": "S30", "query": "Western Express Highway Khar junction Mumbai"},
    {"signal_id": "S31", "query": "Western Express Highway Santacruz junction Mumbai"},
    {"signal_id": "S32", "query": "Western Express Highway Vile Parle junction Mumbai"},
    {"signal_id": "S33", "query": "Bandra Kurla Complex entrance Mumbai"},
    {"signal_id": "S34", "query": "Kurla LBS Road junction Mumbai"},
    {"signal_id": "S35", "query": "Kurla East junction Mumbai"},
    {"signal_id": "S36", "query": "Kurla Station junction Mumbai"},
    {"signal_id": "S37", "query": "Dharavi junction Mumbai"},
    {"signal_id": "S38", "query": "Perry Cross Road Bandra junction Mumbai"},
    {"signal_id": "S39", "query": "St Andrews Road Bandra junction Mumbai"},
    {"signal_id": "S40", "query": "Juhu Tara Road junction Mumbai"},
    {"signal_id": "S41", "query": "Santacruz East junction Mumbai"},
    {"signal_id": "S42", "query": "Vakola junction Mumbai"},
    {"signal_id": "S43", "query": "Bandra Reclamation junction Mumbai"},
    {"signal_id": "S44", "query": "Bandstand junction Bandra Mumbai"},
    {"signal_id": "S45", "query": "Mount Mary junction Bandra Mumbai"},
]


def geocode_location(query: str) -> tuple:
    """Geocode a location using Mapbox API. Returns (lat, lon, place_name) or None."""
    url = f"{GEOCODE_URL}/{requests.utils.quote(query)}.json"
    params = {
        "access_token": MAPBOX_TOKEN,
        "country": "IN",
        "limit": 1,
        "types": "poi,address,place",
        # Mumbai bounding box to restrict results
        "bbox": "72.77,18.85,73.05,19.30",
        # Proximity bias towards central Mumbai
        "proximity": "72.88,19.07"
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


def geocode_and_update(junctions: list, network_path: Path, tier_name: str) -> None:
    """Geocode all junctions and update network file."""
    
    with open(network_path) as f:
        network = json.load(f)
    
    print(f"\n📍 Geocoding {len(junctions)} junctions for {tier_name}...")
    
    success_count = 0
    for junction in junctions:
        sid = junction["signal_id"]
        query = junction["query"]
        
        result = geocode_location(query)
        if result:
            lat, lon, place_name = result
            # Find and update signal in network
            for signal in network:
                if signal["signal_id"] == sid:
                    signal["lat"] = lat
                    signal["lon"] = lon
                    signal["location_name"] = query.replace(" junction Mumbai", "").replace(" Mumbai", "")
                    signal["geocoded_place"] = place_name
                    success_count += 1
                    print(f"   ✓ {sid}: {lat}, {lon} - {query.split(' junction')[0]}")
                    break
        else:
            print(f"   ✗ {sid}: Failed to geocode '{query}'")
        
        # Rate limiting - be nice to the API
        time.sleep(0.2)
    
    # Save updated network
    with open(network_path, "w") as f:
        json.dump(network, f, indent=4)
    
    print(f"\n   ✅ Updated {success_count}/{len(junctions)} signals in {network_path.name}")


def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    print("🗺️ Geocoding Mumbai Intersections with Mapbox API")
    print("=" * 60)
    print("   Using precise Mapbox geocoding for exact coordinates")
    
    tier1_path = project_root / "simulation_tier1" / "tier1.json"
    tier2_path = project_root / "simulation_tier2" / "tier2.json"
    
    # Geocode Tier 1
    print(f"\n🏙️ TIER 1: South Mumbai")
    geocode_and_update(TIER1_JUNCTIONS, tier1_path, "Tier 1")
    
    # Geocode Tier 2
    print(f"\n🏙️ TIER 2: Bandra-BKC")
    geocode_and_update(TIER2_JUNCTIONS, tier2_path, "Tier 2")
    
    print("\n" + "=" * 60)
    print("🎉 Done! Signals now have precise geocoded coordinates.")
    print("   Restart ./start-all.sh and toggle to 'Mumbai Map' view.")


if __name__ == "__main__":
    main()
