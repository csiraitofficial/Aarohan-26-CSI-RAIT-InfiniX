import { useState, useCallback, useEffect } from "react";
import { EmergencyMap } from "@/components/EmergencyMap";
import { useTranslation } from "react-i18next";
import { EmergencyControlPanel } from "@/components/EmergencyControlPanel";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, ArrowRightLeft, MapPin, Navigation } from "lucide-react";
import { API_CONFIG } from "@/lib/apiConfig";

const MAPBOX_TOKEN = 'YOUR_MAPBOX_TOKEN_HERE';

interface LocationSuggestion {
    address: string;
    position: [number, number];
}

interface RouteSummary {
    lengthInMeters: number;
    travelTimeInSeconds: number;
    trafficDelayInSeconds: number;
}

interface RouteData {
    coordinates: [number, number][];
    summary: RouteSummary;
}

const Emergency = () => {
    const { t } = useTranslation();
    const [mode, setMode] = useState<"ambulance" | "vip" | "fire">("ambulance");
    const [isActive, setIsActive] = useState(false);
    const [isTrafficDetected, setIsTrafficDetected] = useState(false);
    const [activeRouteIndex, setActiveRouteIndex] = useState(0);
    const [calculatedRoutes, setCalculatedRoutes] = useState<RouteData[]>([]);
    const [isCalculating, setIsCalculating] = useState(false);
    const { toast } = useToast();

    // Location search states
    const [startLocation, setStartLocation] = useState("Master Canteen, Bhubaneswar");
    const [endLocation, setEndLocation] = useState("Jayadev Vihar, Bhubaneswar");
    const [startPoint, setStartPoint] = useState<[number, number]>([20.2721, 85.8392]); // Master Canteen
    const [endPoint, setEndPoint] = useState<[number, number]>([20.2961, 85.8189]); // Jayadev Vihar
    const [startSuggestions, setStartSuggestions] = useState<LocationSuggestion[]>([]);
    const [endSuggestions, setEndSuggestions] = useState<LocationSuggestion[]>([]);
    const [showStartSuggestions, setShowStartSuggestions] = useState(false);
    const [showEndSuggestions, setShowEndSuggestions] = useState(false);

    // Search for location using Mapbox Geocoding API
    const searchLocation = async (query: string): Promise<LocationSuggestion[]> => {
        if (query.length < 3) return [];

        try {
            const response = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=IN&limit=5`
            );
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                return data.features.map((feature: any) => ({
                    address: feature.place_name,
                    position: [feature.center[1], feature.center[0]] as [number, number] // Mapbox returns [lon, lat], we need [lat, lon]
                }));
            }
        } catch (error) {
            console.error("Error searching location:", error);
        }
        return [];
    };

    // Handle start location search
    const handleStartLocationChange = async (value: string) => {
        setStartLocation(value);
        if (value.length >= 3) {
            const suggestions = await searchLocation(value);
            setStartSuggestions(suggestions);
            setShowStartSuggestions(true);
        } else {
            setShowStartSuggestions(false);
        }
    };

    // Handle end location search
    const handleEndLocationChange = async (value: string) => {
        setEndLocation(value);
        if (value.length >= 3) {
            const suggestions = await searchLocation(value);
            setEndSuggestions(suggestions);
            setShowEndSuggestions(true);
        } else {
            setShowEndSuggestions(false);
        }
    };

    // Select start location from suggestions
    const selectStartLocation = (suggestion: LocationSuggestion) => {
        setStartLocation(suggestion.address);
        setStartPoint(suggestion.position);
        setShowStartSuggestions(false);
        toast({
            title: t('emergency.toasts.startSet'),
            description: suggestion.address,
        });
    };

    // Select end location from suggestions
    const selectEndLocation = (suggestion: LocationSuggestion) => {
        setEndLocation(suggestion.address);
        setEndPoint(suggestion.position);
        setShowEndSuggestions(false);
        toast({
            title: t('emergency.toasts.destSet'),
            description: suggestion.address,
        });
    };


    // Swap start and end locations
    const swapLocations = () => {
        const tempLocation = startLocation;
        const tempPoint = startPoint;
        setStartLocation(endLocation);
        setStartPoint(endPoint);
        setEndLocation(tempLocation);
        setEndPoint(tempPoint);
        toast({
            title: t('emergency.toasts.swapped'),
            description: t('emergency.toasts.swappedDesc'),
        });
    };

    // Calculate routes using Mapbox Directions API
    const calculateRoutes = useCallback(async () => {
        setIsCalculating(true);
        try {
            // Format: longitude,latitude (Mapbox uses lon,lat)
            const coordinates = `${startPoint[1]},${startPoint[0]};${endPoint[1]},${endPoint[0]}`;

            const response = await fetch(
                `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?alternatives=true&steps=true&geometries=geojson&access_token=${MAPBOX_TOKEN}`
            );
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                const routes: RouteData[] = data.routes.map(route => {
                    // Mapbox returns coordinates as [lon, lat], we need [lat, lon]
                    const coordinates: [number, number][] = route.geometry.coordinates.map(
                        (coord: [number, number]) => [coord[1], coord[0]]
                    );

                    return {
                        coordinates,
                        summary: {
                            lengthInMeters: route.distance,
                            travelTimeInSeconds: route.duration,
                            trafficDelayInSeconds: 0
                        }
                    };
                });

                // Sort routes by travel time (fastest first)
                routes.sort((a, b) => a.summary.travelTimeInSeconds - b.summary.travelTimeInSeconds);

                setCalculatedRoutes(routes);
                setActiveRouteIndex(0);

                const fastestTime = Math.round(routes[0].summary.travelTimeInSeconds / 60);
                const fastestDistance = (routes[0].summary.lengthInMeters / 1000).toFixed(1);

                toast({
                    title: t('emergency.toasts.calculated'),
                    description: t('emergency.toasts.calculatedDesc', { count: routes.length, suffix: routes.length > 1 ? 's' : '', time: fastestTime, distance: fastestDistance }),
                });
            }
        } catch (error) {
            console.error("Error calculating routes:", error);
            toast({
                title: t('emergency.toasts.failed'),
                description: t('emergency.toasts.failedDesc'),
                variant: "destructive"
            });
        } finally {
            setIsCalculating(false);
        }
    }, [startPoint, endPoint, toast]);

    // Calculate routes when requested
    const handleCalculateRoute = () => {
        if (startPoint && endPoint) {
            calculateRoutes();
        } else {
            toast({
                title: t('emergency.toasts.invalid'),
                description: t('emergency.toasts.invalidDesc'),
                variant: "destructive"
            });
        }
    };

    // Calculate routes on initial load
    useEffect(() => {
        calculateRoutes();
    }, [calculateRoutes]);

    const currentRoute = calculatedRoutes[activeRouteIndex]?.coordinates || [];
    const currentRouteSummary = calculatedRoutes[activeRouteIndex]?.summary;

    const handleActivate = useCallback(async () => {
        setIsActive(true);
        setIsTrafficDetected(false);
        setActiveRouteIndex(0);
        toast({
            title: t('emergency.toasts.activated'),
            description: t('emergency.toasts.activatedDesc', { vehicle: mode === 'ambulance' ? t('emergency.vehicles.ambulance') : mode === 'fire' ? t('emergency.vehicles.fire') : t('emergency.vehicles.vip') }),
            variant: mode === 'vip' ? "default" : "destructive",
        });

        // Trigger Telegram Alert
        try {
            const currentPath = calculatedRoutes[0]?.coordinates || [];
            if (currentPath.length === 0) return;

            // Simplified path: just take start and end points of segments or simplified version
            // For now, let's just send a descriptive string or simplified list if backend expects list
            // Backend expects list of strings for path (signal IDs). 
            // Since we don't have signal IDs here easily mapped without more logic, 
            // we will send a mock path or best effort. 
            // ideally we would map coordinates to signals.
            // For hackathon demo, let's send a generic "S1 -> ... -> S10" or similar if we can't map exact signals client side.
            // OR better: The backend trigger_emergency_alert takes a LIST of STRINGS (signal IDs).

            // NOTE: We don't have signal IDs on frontend easily. 
            // Let's send a list of placeholder signal IDs or derived ones to simulate functionality.
            const mockSignals = ["S1", "S4", "S7", "S12", "S15"];

            await fetch(`${API_CONFIG.SIMULATION}/api/alert/emergency`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    path: mockSignals,
                    vehicle_type: mode === 'ambulance' ? 'Ambulance' : mode === 'fire' ? 'Fire Brigade' : 'VIP Convoy'
                })
            });
            console.log("Alert sent to Telegram Bot");
        } catch (e) {
            console.error("Failed to send alert", e);
        }
    }, [mode, toast, calculatedRoutes]);

    const handleDeactivate = useCallback(() => {
        setIsActive(false);
        setIsTrafficDetected(false);
        setActiveRouteIndex(0);
        toast({
            title: t('emergency.toasts.deactivated'),
            description: t('emergency.toasts.deactivatedDesc'),
        });
    }, [toast]);

    const handleTrafficDetected = useCallback(() => {
        if (!isTrafficDetected && isActive && calculatedRoutes.length > 1) {
            setIsTrafficDetected(true);
        }
    }, [isTrafficDetected, isActive, calculatedRoutes]);

    const handleSwitchRoute = useCallback((routeIndex: number) => {
        if (calculatedRoutes[routeIndex]) {
            const timeSaved = Math.round((currentRouteSummary!.travelTimeInSeconds - calculatedRoutes[routeIndex].summary.travelTimeInSeconds) / 60);
            setActiveRouteIndex(routeIndex);
            setIsTrafficDetected(false);

            toast({
                title: t('emergency.toasts.updated'),
                description: t('emergency.toasts.updated', { defaultValue: 'Route Updated' }) + `. ${timeSaved > 0 ? t('emergency.toasts.saving', { time: timeSaved }) : ''}`,
                className: "bg-green-500 text-white border-none"
            });
        }
    }, [calculatedRoutes, currentRouteSummary, toast]);

    // Prepare route options for display
    const allRouteOptions = calculatedRoutes.map((route, index) => ({
        index,
        coordinates: route.coordinates,
        summary: route.summary,
        isCurrent: index === activeRouteIndex
    }));

    // Calculate route suggestion details
    const getRouteSuggestion = () => {
        if (calculatedRoutes.length < 2 || !currentRouteSummary) return undefined;

        // Find the fastest alternative
        let fastestRoute = calculatedRoutes[1];
        for (let i = 2; i < calculatedRoutes.length; i++) {
            if (calculatedRoutes[i].summary.travelTimeInSeconds < fastestRoute.summary.travelTimeInSeconds) {
                fastestRoute = calculatedRoutes[i];
            }
        }

        const timeSaved = Math.round((currentRouteSummary.travelTimeInSeconds - fastestRoute.summary.travelTimeInSeconds) / 60);
        const distanceDiff = ((currentRouteSummary.lengthInMeters - fastestRoute.summary.lengthInMeters) / 1000).toFixed(1);

        return {
            name: t('emergency.altRoute'),
            timeSaved: `${timeSaved} mins`,
            details: `${Math.abs(parseFloat(distanceDiff))} km ${parseFloat(distanceDiff) > 0 ? 'shorter' : 'longer'}, avoids heavy traffic`
        };
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-foreground">{t('emergency.title')}</h1>
                <p className="text-muted-foreground mt-1">{t('emergency.subtitle')}</p>
            </div>

            {/* Location Search Panel */}
            <Card className="p-4 bg-gradient-card border-2 border-primary/20">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Navigation className="h-5 w-5 text-primary" />
                    {t('emergency.routePlanning')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Start Location */}
                    <div className="space-y-2 relative">
                        <Label htmlFor="start-location" className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-green-500" />
                            {t('emergency.startLocation')}
                        </Label>
                        <div className="relative">
                            <Input
                                id="start-location"
                                placeholder={t('emergency.searchStart')}
                                value={startLocation}
                                onChange={(e) => handleStartLocationChange(e.target.value)}
                                onFocus={() => startSuggestions.length > 0 && setShowStartSuggestions(true)}
                                className="pr-10"
                            />
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                        {showStartSuggestions && startSuggestions.length > 0 && (
                            <Card className="absolute z-10 w-full mt-1 p-2 bg-card border-2 border-primary/20 max-h-60 overflow-y-auto">
                                {startSuggestions.map((suggestion, idx) => (
                                    <div
                                        key={idx}
                                        className="p-2 hover:bg-primary/10 cursor-pointer rounded text-sm"
                                        onClick={() => selectStartLocation(suggestion)}
                                    >
                                        <MapPin className="h-3 w-3 inline mr-2 text-green-500" />
                                        {suggestion.address}
                                    </div>
                                ))}
                            </Card>
                        )}
                    </div>

                    {/* End Location */}
                    <div className="space-y-2 relative">
                        <Label htmlFor="end-location" className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-red-500" />
                            {t('emergency.destination')}
                        </Label>
                        <div className="relative">
                            <Input
                                id="end-location"
                                placeholder={t('emergency.searchDest')}
                                value={endLocation}
                                onChange={(e) => handleEndLocationChange(e.target.value)}
                                onFocus={() => endSuggestions.length > 0 && setShowEndSuggestions(true)}
                                className="pr-10"
                            />
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                        {showEndSuggestions && endSuggestions.length > 0 && (
                            <Card className="absolute z-10 w-full mt-1 p-2 bg-card border-2 border-primary/20 max-h-60 overflow-y-auto">
                                {endSuggestions.map((suggestion, idx) => (
                                    <div
                                        key={idx}
                                        className="p-2 hover:bg-primary/10 cursor-pointer rounded text-sm"
                                        onClick={() => selectEndLocation(suggestion)}
                                    >
                                        <MapPin className="h-3 w-3 inline mr-2 text-red-500" />
                                        {suggestion.address}
                                    </div>
                                ))}
                            </Card>
                        )}
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                    <Button
                        onClick={handleCalculateRoute}
                        disabled={isCalculating}
                        className="flex-1"
                    >
                        <Navigation className="h-4 w-4 mr-2" />
                        {isCalculating ? t('emergency.calculating') : t('emergency.calculateRoutes')}
                    </Button>
                    <Button
                        onClick={swapLocations}
                        variant="outline"
                        size="icon"
                    >
                        <ArrowRightLeft className="h-4 w-4" />
                    </Button>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <EmergencyMap
                        isActive={isActive}
                        startPoint={startPoint}
                        endPoint={endPoint}
                        allRoutes={allRouteOptions}
                        onTrafficDetected={handleTrafficDetected}
                    />
                </div>
                <div>
                    <EmergencyControlPanel
                        mode={mode}
                        setMode={setMode}
                        isActive={isActive}
                        onActivate={handleActivate}
                        onDeactivate={handleDeactivate}
                        isTrafficDetected={isTrafficDetected}
                        onSwitchRoute={handleSwitchRoute}
                        routeSuggestion={getRouteSuggestion()}
                        currentRouteSummary={currentRouteSummary}
                        allRoutes={allRouteOptions}
                    />
                </div>
            </div>
        </div>
    );
};

export default Emergency;
