import { useRef, useEffect, useState, memo } from 'react';
import * as tt from '@tomtom-international/web-sdk-maps';
import '@tomtom-international/web-sdk-maps/dist/maps.css';
import { useTheme } from './theme-provider';
import { useTranslation } from "react-i18next";

// TomTom API Key
const TOMTOM_API_KEY = "riFTeh0wpjONJX0XItCu3qmHWF657Mia";

// Device types for markers
type DeviceType = 'sensor' | 'camera' | 'repeater' | 'gateway';

export interface Device {
    id: string;
    type: DeviceType;
    pos: { lat: number; lng: number };
}

export interface DashboardMapProps {
    incidents?: any[];
    devices?: Device[];
    focusPos?: [number, number]; // [lat, lng]
}

const DashboardMap = ({ incidents, devices: propDevices, focusPos }: DashboardMapProps) => {
    const { t } = useTranslation();
    const mapElement = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<tt.Map | null>(null);
    const [showTraffic, setShowTraffic] = useState(true);
    const { theme } = useTheme();
    const markersRef = useRef<tt.Marker[]>([]);

    // Location search state
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [locationName, setLocationName] = useState('');
    const focusMarkerRef = useRef<tt.Marker | null>(null);

    // Search for location using TomTom Geocoding API
    const searchLocation = async () => {
        if (!searchQuery.trim() || !map) return;

        setIsSearching(true);
        try {
            const response = await fetch(
                `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(searchQuery)}.json?key=${TOMTOM_API_KEY}&limit=1`
            );
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                const { lat, lon } = result.position;
                map.setCenter([lon, lat]);
                map.setZoom(14);
                setLocationName(result.address.freeformAddress || searchQuery);
                setSearchQuery('');
            } else {
                alert(t("map.locationNotFound"));
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            alert(t("map.searchError"));
        } finally {
            setIsSearching(false);
        }
    };

    // Get current location using browser geolocation
    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert(t("map.searchError"));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                if (map) {
                    map.setCenter([longitude, latitude]);
                    map.setZoom(14);
                    setLocationName(t("map.currentLocation"));
                }
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert(t("map.searchError"));
            }
        );
    };


    // Use passed devices or fallback to mock
    const devices: Device[] = propDevices || [
        { id: "S-101", type: "sensor", pos: { lat: 20.2961, lng: 85.8245 } },
        { id: "C-201", type: "camera", pos: { lat: 20.2975, lng: 85.8260 } },
        { id: "R-301", type: "repeater", pos: { lat: 20.2945, lng: 85.8230 } },
        { id: "G-401", type: "gateway", pos: { lat: 20.2955, lng: 85.8255 } },
        { id: "S-102", type: "sensor", pos: { lat: 20.2970, lng: 85.8220 } },
        { id: "C-202", type: "camera", pos: { lat: 20.2930, lng: 85.8240 } },
    ];

    // Get device color based on type
    const getDeviceColor = (type: DeviceType): string => {
        switch (type) {
            case 'sensor': return '#3B82F6'; // Blue
            case 'camera': return '#EF4444'; // Red
            case 'repeater': return '#F59E0B'; // Orange
            case 'gateway': return '#10B981'; // Green
            default: return '#6B7280';
        }
    };

    // Get device icon/label
    const getDeviceLabel = (type: DeviceType): string => {
        switch (type) {
            case 'sensor': return 'S';
            case 'camera': return 'C';
            case 'repeater': return 'R';
            case 'gateway': return 'G';
            default: return '?';
        }
    };

    // Initialize Map
    useEffect(() => {
        if (mapElement.current && !map) {
            const mapInstance = tt.map({
                key: TOMTOM_API_KEY,
                container: mapElement.current,
                center: [72.8700, 19.0700], // BKC Mumbai
                zoom: 14,
                stylesVisibility: {
                    trafficIncidents: true,
                    trafficFlow: true
                }
            });

            // Add navigation controls
            mapInstance.addControl(new tt.NavigationControl(), 'top-left');

            // Enable traffic flow when map loads
            mapInstance.on('load', () => {
                console.log('TomTom DashboardMap loaded');
                mapInstance.showTrafficFlow();
                mapInstance.showTrafficIncidents();
            });

            setMap(mapInstance);

            return () => {
                mapInstance.remove();
            };
        }
    }, [mapElement]);

    // Toggle Traffic Flow
    useEffect(() => {
        if (map) {
            if (showTraffic) {
                map.showTrafficFlow();
                map.showTrafficIncidents();
            } else {
                map.hideTrafficFlow();
                map.hideTrafficIncidents();
            }
        }
    }, [showTraffic, map]);

    // Handle focus position changes
    useEffect(() => {
        if (!map || !focusPos) return;

        const [lat, lng] = focusPos;

        // Remove old focus marker
        if (focusMarkerRef.current) {
            focusMarkerRef.current.remove();
        }

        // Fly to location
        map.setCenter([lng, lat]);
        map.setZoom(17);

        // Add SOS pinpoint marker
        const el = document.createElement('div');
        el.className = 'sos-pinpoint';
        el.style.cssText = `
            width: 40px;
            height: 40px;
            background-color: #ef4444;
            border: 4px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 20px;
            box-shadow: 0 0 20px rgba(239, 68, 68, 0.8);
            animation: pulse-ring 1.5s infinite;
            cursor: pointer;
            z-index: 100;
        `;
        el.innerText = '🚨';

        // Add style for pulse animation if non-existent
        if (!document.getElementById('sos-map-animation')) {
            const style = document.createElement('style');
            style.id = 'sos-map-animation';
            style.innerHTML = `
                @keyframes pulse-ring {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
            `;
            document.head.appendChild(style);
        }

        const marker = new tt.Marker({ element: el })
            .setLngLat([lng, lat])
            .setPopup(new tt.Popup({ offset: 30 }).setHTML(`<b>${t("map.sosTitle")}</b><br/>${t("map.sosMessage")}`))
            .addTo(map);

        focusMarkerRef.current = marker;

        return () => {
            if (focusMarkerRef.current) {
                focusMarkerRef.current.remove();
            }
        };
    }, [map, focusPos]);

    // Create and manage incident beacons (SOS, Pothole, etc.)
    const incidentMarkersRef = useRef<tt.Marker[]>([]);

    useEffect(() => {
        if (!map || !incidents || incidents.length === 0) return;

        // Clear existing incident markers
        incidentMarkersRef.current.forEach(marker => marker.remove());
        incidentMarkersRef.current = [];

        // Add animation style if not exists
        if (!document.getElementById('incident-beacon-animation')) {
            const style = document.createElement('style');
            style.id = 'incident-beacon-animation';
            style.innerHTML = `
                @keyframes beacon-pulse {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 var(--beacon-color); }
                    70% { transform: scale(1); box-shadow: 0 0 0 12px transparent; }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 transparent; }
                }
            `;
            document.head.appendChild(style);
        }

        // Create markers for each incident
        incidents.forEach(incident => {
            if (!incident.location?.coordinates) return;

            const [lat, lng] = incident.location.coordinates;

            // Get beacon config based on incident type
            const getBeaconConfig = (type: string) => {
                switch (type) {
                    case 'sos':
                        return { color: '#ef4444', icon: '🚨', label: t("map.sosTitle") };
                    case 'pothole':
                        return { color: '#f97316', icon: '🕳️', label: t("map.pothole") || 'Pothole' };
                    case 'accident':
                        return { color: '#eab308', icon: '💥', label: t("map.accident") || 'Accident' };
                    default:
                        return { color: '#6b7280', icon: '📍', label: 'Incident' };
                }
            };

            const config = getBeaconConfig(incident.type);

            // Create beacon element
            const el = document.createElement('div');
            el.className = 'incident-beacon';
            el.style.cssText = `
                --beacon-color: ${config.color}40;
                width: 36px;
                height: 36px;
                background-color: ${config.color};
                border: 3px solid white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                box-shadow: 0 0 15px ${config.color}80;
                animation: beacon-pulse 2s infinite;
                cursor: pointer;
                z-index: ${incident.type === 'sos' ? 100 : 50};
            `;
            el.innerText = config.icon;

            // Create popup
            const popup = new tt.Popup({ offset: 25 }).setHTML(`
                <div style="padding: 8px;">
                    <strong>${config.label}</strong><br/>
                    <span style="font-size: 11px; color: #666;">${incident.id}</span><br/>
                    <span style="font-size: 11px;">${incident.location.address || ''}</span>
                </div>
            `);

            const marker = new tt.Marker({ element: el })
                .setLngLat([lng, lat])
                .setPopup(popup)
                .addTo(map);

            // Click to focus
            el.onclick = () => {
                map.setCenter([lng, lat]);
                map.setZoom(16);
                marker.togglePopup();
            };

            incidentMarkersRef.current.push(marker);
        });

        // Fit map to show all incidents if multiple
        if (incidents.length > 1) {
            const bounds = new tt.LngLatBounds();
            incidents.forEach(inc => {
                if (inc.location?.coordinates) {
                    bounds.extend([inc.location.coordinates[1], inc.location.coordinates[0]]);
                }
            });
            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
            }
        }

        return () => {
            incidentMarkersRef.current.forEach(marker => marker.remove());
            incidentMarkersRef.current = [];
        };
    }, [map, incidents]);

    // Create and manage device markers
    useEffect(() => {
        if (!map) return;

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        // Create new markers
        devices.forEach(device => {
            const markerElement = document.createElement('div');
            markerElement.className = 'device-marker';
            markerElement.style.cssText = `
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background-color: ${getDeviceColor(device.type)};
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                font-weight: bold;
                color: white;
                font-size: 12px;
            `;
            markerElement.innerText = getDeviceLabel(device.type);

            // Hover effect
            markerElement.onmouseenter = () => {
                markerElement.style.transform = 'scale(1.2)';
                markerElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.6)';
            };
            markerElement.onmouseleave = () => {
                markerElement.style.transform = 'scale(1)';
                markerElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
            };

            // Create popup content
            const popupContent = document.createElement('div');
            popupContent.className = 'p-3';
            popupContent.innerHTML = `
                <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${device.id}</div>
                <div style="font-size: 12px; color: #666; text-transform: capitalize;">${t(`map.${device.type}`)}</div>
                <div style="font-size: 11px; color: #888; margin-top: 4px;">
                    Lat: ${device.pos.lat.toFixed(4)}<br/>
                    Lng: ${device.pos.lng.toFixed(4)}
                </div>
            `;

            const popup = new tt.Popup({ offset: 25 }).setDOMContent(popupContent);

            const marker = new tt.Marker({ element: markerElement })
                .setLngLat([device.pos.lng, device.pos.lat])
                .setPopup(popup)
                .addTo(map);

            // Click to fly to device
            markerElement.onclick = () => {
                map.setCenter([device.pos.lng, device.pos.lat]);
                map.setZoom(18);
            };

            markersRef.current.push(marker);
        });

        return () => {
            markersRef.current.forEach(marker => marker.remove());
            markersRef.current = [];
        };
    }, [map]);

    return (
        <div className="relative w-full h-[400px] rounded-xl overflow-hidden border-2 border-primary/20 shadow-lg">
            <div ref={mapElement} className="w-full h-full" />

            {/* Location Search Box */}
            <div className="absolute top-4 left-14 z-10 bg-background/90 backdrop-blur-sm p-2 rounded-lg border border-border shadow-lg">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder={t("map.searchPlaceholder")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchLocation()}
                        className="w-48 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                        onClick={searchLocation}
                        disabled={isSearching || !searchQuery.trim()}
                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        {isSearching ? '...' : '🔍'}
                    </button>
                    <button
                        onClick={getCurrentLocation}
                        title="Use current location"
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-500 transition"
                    >
                        📍
                    </button>
                </div>
                {locationName && (
                    <p className="text-xs text-muted-foreground mt-1 truncate max-w-[280px]">
                        📌 {locationName}
                    </p>
                )}
            </div>

            {/* Traffic Toggle Control */}

            <div className="absolute top-4 right-4 z-10 bg-background/90 backdrop-blur-sm p-3 rounded-lg border border-border shadow-lg">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium cursor-pointer select-none" htmlFor="dashboard-traffic-toggle">
                        {t("map.liveTraffic")}
                    </label>
                    <input
                        id="dashboard-traffic-toggle"
                        type="checkbox"
                        checked={showTraffic}
                        onChange={(e) => setShowTraffic(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    {t("map.trafficDesc")}
                </p>
            </div>

            {/* Device Legend */}
            <div className="absolute bottom-4 left-4 z-10 bg-background/90 backdrop-blur-sm p-3 rounded-lg border border-border shadow-lg">
                <h4 className="text-xs font-semibold mb-2">{t("map.deviceTypes")}</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                        <span>{t("map.sensor")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-red-500"></span>
                        <span>{t("map.camera")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                        <span>{t("map.repeater")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-green-500"></span>
                        <span>{t("map.gateway")}</span>
                    </div>
                </div>
            </div>

            {/* TomTom Attribution */}
            <div className="absolute bottom-4 right-4 z-10 text-xs text-muted-foreground bg-background/70 px-2 py-1 rounded">
                Powered by TomTom
            </div>
        </div>
    );
};

const MemoizedDashboardMap = memo(DashboardMap);
export default MemoizedDashboardMap;
