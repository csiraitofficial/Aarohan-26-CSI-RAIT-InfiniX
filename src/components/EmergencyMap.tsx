import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = 'YOUR_MAPBOX_TOKEN_HERE';

interface RouteStep {
    instruction: string;
    distance: number;
    duration: number;
    maneuver: string;
}

interface EmergencyMapProps {
    isActive: boolean;
    startPoint: [number, number];
    endPoint: [number, number];
    allRoutes: any[];
    onTrafficDetected?: () => void;
    onStepsUpdate?: (steps: RouteStep[]) => void;
}

export const EmergencyMap = (props: EmergencyMapProps) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const [showTraffic, setShowTraffic] = useState(true);
    const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);

    useEffect(() => {
        if (map.current) return;
        if (!mapContainer.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/navigation-night-v1',
            center: [73.0297, 19.0330], // Nerul Navi Mumbai
            zoom: 8,
            pitch: 40,
        });

        map.current.on('load', () => {
            if (map.current) {
                try {
                    // Add traffic layer
                    map.current.addSource('traffic-source', {
                        type: 'vector',
                        url: 'mapbox://mapbox.mapbox-traffic-v1'
                    });

                    map.current.addLayer({
                        id: 'traffic',
                        type: 'line',
                        source: 'traffic-source',
                        'source-layer': 'traffic',
                        paint: {
                            'line-width': 3,
                            'line-color': [
                                'case',
                                ['==', ['get', 'congestion'], 'low'], '#4ade80',
                                ['==', ['get', 'congestion'], 'moderate'], '#fbbf24',
                                ['==', ['get', 'congestion'], 'heavy'], '#f97316',
                                ['==', ['get', 'congestion'], 'severe'], '#ef4444',
                                '#94a3b8'
                            ]
                        }
                    });
                } catch (err) {
                    console.error('Error adding traffic layer:', err);
                }
            }
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    }, []);

    useEffect(() => {
        if (!map.current || !map.current.getLayer('traffic')) return;
        map.current.setLayoutProperty('traffic', 'visibility', showTraffic ? 'visible' : 'none');
    }, [showTraffic]);

    // Fetch turn-by-turn directions
    const fetchDirections = async (start: [number, number], end: [number, number]) => {
        try {
            const response = await fetch(
                `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${start[1]},${start[0]};${end[1]},${end[0]}?steps=true&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
            );
            const data = await response.json();

            if (data.routes && data.routes[0] && data.routes[0].legs) {
                const steps: RouteStep[] = data.routes[0].legs[0].steps.map((step: any) => ({
                    instruction: step.maneuver.instruction,
                    distance: step.distance,
                    duration: step.duration,
                    maneuver: step.maneuver.type
                }));
                setRouteSteps(steps);
                if (props.onStepsUpdate) {
                    props.onStepsUpdate(steps);
                }
            }
        } catch (error) {
            console.error('Error fetching directions:', error);
        }
    };

    useEffect(() => {
        if (!map.current || !props.allRoutes || props.allRoutes.length === 0) return;

        // Fetch turn-by-turn for current route
        if (props.startPoint && props.endPoint) {
            fetchDirections(props.startPoint, props.endPoint);
        }

        try {
            // Remove existing route layers
            for (let i = 0; i < 10; i++) {
                if (map.current.getLayer(`route-${i}`)) map.current.removeLayer(`route-${i}`);
                if (map.current.getLayer(`route-${i}-outline`)) map.current.removeLayer(`route-${i}-outline`);
                if (map.current.getLayer(`route-${i}-glow`)) map.current.removeLayer(`route-${i}-glow`);
                if (map.current.getSource(`route-${i}`)) map.current.removeSource(`route-${i}`);
            }

            const oldMarkers = document.querySelectorAll('.mapboxgl-marker');
            oldMarkers.forEach(marker => marker.remove());

            // Draw routes with improved styling
            props.allRoutes.forEach((route: any, idx: number) => {
                if (!route.coordinates || route.coordinates.length === 0 || !map.current) return;

                map.current.addSource(`route-${idx}`, {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: route.coordinates.map((p: [number, number]) => [p[1], p[0]])
                        },
                        properties: {}
                    }
                });

                const isCurrent = route.isCurrent;

                // Glow effect for current route
                if (isCurrent && props.isActive) {
                    map.current.addLayer({
                        id: `route-${idx}-glow`,
                        type: 'line',
                        source: `route-${idx}`,
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: {
                            'line-color': '#ef4444',
                            'line-width': 20,
                            'line-opacity': 0.3,
                            'line-blur': 8
                        }
                    });
                }

                // Outline layer
                map.current.addLayer({
                    id: `route-${idx}-outline`,
                    type: 'line',
                    source: `route-${idx}`,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': isCurrent ? (props.isActive ? '#991b1b' : '#1e40af') : '#475569',
                        'line-width': isCurrent ? 12 : 8,
                        'line-opacity': 1
                    }
                });

                // Main route layer
                map.current.addLayer({
                    id: `route-${idx}`,
                    type: 'line',
                    source: `route-${idx}`,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': isCurrent ? (props.isActive ? '#ef4444' : '#3b82f6') : '#94a3b8',
                        'line-width': isCurrent ? 8 : 5,
                        'line-opacity': 1,
                        'line-dasharray': isCurrent ? [1, 0] : [2, 1]
                    }
                });
            });

            // Add enhanced start marker
            if (props.startPoint && !isNaN(props.startPoint[0]) && !isNaN(props.startPoint[1])) {
                const startEl = document.createElement('div');
                startEl.innerHTML = `
                    <div style="
                        width: 40px;
                        height: 40px;
                        background: linear-gradient(135deg, #22c55e, #16a34a);
                        border-radius: 50%;
                        border: 4px solid white;
                        box-shadow: 0 4px 15px rgba(34, 197, 94, 0.5);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 16px;
                    ">A</div>
                `;
                new mapboxgl.Marker(startEl)
                    .setLngLat([props.startPoint[1], props.startPoint[0]])
                    .addTo(map.current);
            }

            // Add enhanced end marker
            if (props.endPoint && !isNaN(props.endPoint[0]) && !isNaN(props.endPoint[1])) {
                const endEl = document.createElement('div');
                endEl.innerHTML = `
                    <div style="
                        width: 40px;
                        height: 40px;
                        background: linear-gradient(135deg, #ef4444, #dc2626);
                        border-radius: 50%;
                        border: 4px solid white;
                        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.5);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 16px;
                    ">B</div>
                `;
                new mapboxgl.Marker(endEl)
                    .setLngLat([props.endPoint[1], props.endPoint[0]])
                    .addTo(map.current);
            }

            // Fit bounds
            if (props.allRoutes[0]?.coordinates?.length > 0 && map.current) {
                try {
                    const bounds = new mapboxgl.LngLatBounds();
                    let hasValidCoords = false;
                    props.allRoutes.forEach((route: any) => {
                        if (route.coordinates && Array.isArray(route.coordinates)) {
                            route.coordinates.forEach((coord: [number, number]) => {
                                if (coord && !isNaN(coord[0]) && !isNaN(coord[1])) {
                                    bounds.extend([coord[1], coord[0]]);
                                    hasValidCoords = true;
                                }
                            });
                        }
                    });
                    if (hasValidCoords) {
                        map.current.fitBounds(bounds, { padding: 80, pitch: 40 });
                    }
                } catch (boundsError) {
                    console.error('Error fitting bounds:', boundsError);
                }
            }
        } catch (error) {
            console.error('Error displaying routes:', error);
        }
    }, [props.allRoutes, props.isActive, props.startPoint, props.endPoint]);

    const fastestRoute = props.allRoutes?.length > 0 ? props.allRoutes.find(r => r.isCurrent) : null;

    const getManeuverIcon = (maneuver: string) => {
        switch (maneuver) {
            case 'turn': return '↱';
            case 'turn-left': case 'left': return '←';
            case 'turn-right': case 'right': return '→';
            case 'straight': case 'continue': return '↑';
            case 'merge': return '⤵';
            case 'roundabout': return '⟳';
            case 'arrive': return '🏁';
            case 'depart': return '🚗';
            default: return '•';
        }
    };

    return (
        <div className="h-[550px] w-full rounded-xl overflow-hidden border-2 border-primary/20 shadow-xl relative">
            <div ref={mapContainer} className="w-full h-full" />

            {/* Route Info Banner */}
            {fastestRoute && fastestRoute.summary && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 rounded-full border-2 border-white/30 shadow-2xl">
                    <div className="flex items-center gap-4 text-white">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold">
                                {Math.round(fastestRoute.summary.travelTimeInSeconds / 60)} min
                            </span>
                            <span className="text-sm font-medium opacity-80">
                                ({(fastestRoute.summary.lengthInMeters / 1000).toFixed(1)} km)
                            </span>
                        </div>
                        <div className="h-6 w-px bg-white/30"></div>
                        <div className="text-sm font-semibold flex items-center gap-1">
                            ⚡ Fastest Route
                        </div>
                    </div>
                </div>
            )}

            {/* Traffic Toggle */}
            <div className="absolute top-4 left-4 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-3 rounded-xl border shadow-lg">
                <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showTraffic}
                            onChange={(e) => setShowTraffic(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                    <span className="text-sm font-medium">Live Traffic</span>
                </div>
                <div className="flex gap-2 mt-2 text-xs">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-400 rounded"></span>Clear</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-yellow-400 rounded"></span>Moderate</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-500 rounded"></span>Heavy</span>
                </div>
            </div>

            {/* Turn-by-Turn Directions Panel */}
            {routeSteps.length > 0 && (
                <div className="absolute bottom-4 left-4 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-3 rounded-xl border shadow-lg max-w-sm max-h-[200px] overflow-y-auto">
                    <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                        🧭 Turn-by-Turn Directions
                    </h4>
                    <div className="space-y-2">
                        {routeSteps.slice(0, 5).map((step, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <span className="text-lg">{getManeuverIcon(step.maneuver)}</span>
                                <div className="flex-1">
                                    <p className="font-medium">{step.instruction}</p>
                                    <p className="text-muted-foreground">
                                        {step.distance > 1000
                                            ? `${(step.distance / 1000).toFixed(1)} km`
                                            : `${Math.round(step.distance)} m`
                                        }
                                        {' • '}
                                        {Math.round(step.duration / 60)} min
                                    </p>
                                </div>
                            </div>
                        ))}
                        {routeSteps.length > 5 && (
                            <p className="text-xs text-muted-foreground text-center">
                                +{routeSteps.length - 5} more steps...
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Route List */}
            {props.allRoutes && props.allRoutes.length > 0 && (
                <div className="absolute bottom-4 right-4 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-3 rounded-xl border shadow-lg max-w-[200px]">
                    <h4 className="text-sm font-bold mb-2">Routes Available</h4>
                    <div className="space-y-2">
                        {props.allRoutes.map((route, idx) => {
                            const isCurrent = route.isCurrent;
                            const time = route.summary ? Math.round(route.summary.travelTimeInSeconds / 60) : 0;
                            const distance = route.summary ? (route.summary.lengthInMeters / 1000).toFixed(1) : '0';

                            return (
                                <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg transition-all ${isCurrent
                                    ? 'bg-blue-500/20 border border-blue-500/50'
                                    : 'bg-gray-100 dark:bg-gray-800'}`}>
                                    <div className={`w-4 h-1 rounded ${isCurrent ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                                    <div className="flex-1 text-xs">
                                        <div className="font-semibold">{isCurrent ? '⚡ Fastest' : `Route ${idx + 1}`}</div>
                                        <div className="text-muted-foreground">{time} min · {distance} km</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
