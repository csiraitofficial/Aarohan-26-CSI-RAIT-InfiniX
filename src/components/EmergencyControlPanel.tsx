import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ambulance, Crown, Siren, Timer, Flame, ArrowRight } from "lucide-react";

interface RouteSuggestion {
    name: string;
    timeSaved: string;
    details: string;
}

interface RouteSummary {
    lengthInMeters: number;
    travelTimeInSeconds: number;
    trafficDelayInSeconds: number;
}

interface RouteOption {
    index: number;
    coordinates: [number, number][];
    summary: RouteSummary;
    isCurrent: boolean;
}

interface EmergencyControlPanelProps {
    mode: "ambulance" | "vip" | "fire";
    setMode: (mode: "ambulance" | "vip" | "fire") => void;
    isActive: boolean;
    onActivate: () => void;
    onDeactivate: () => void;
    isTrafficDetected?: boolean;
    onSwitchRoute?: (routeIndex: number) => void;
    routeSuggestion?: RouteSuggestion;
    currentRouteSummary?: RouteSummary;
    allRoutes?: RouteOption[];
}

export const EmergencyControlPanel = ({
    mode,
    setMode,
    isActive,
    onActivate,
    onDeactivate,
    isTrafficDetected,
    onSwitchRoute,
    routeSuggestion,
    currentRouteSummary,
    allRoutes = []
}: EmergencyControlPanelProps) => {
    const { t } = useTranslation();
    return (
        <Card className="p-6 bg-gradient-card border-2 border-primary/20 h-full flex flex-col">
            <div className="space-y-6 flex-1">
                <div>
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Siren className={`h-6 w-6 ${isActive ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`} />
                        {t('emergency.panel.title')}
                    </h2>
                    <p className="text-muted-foreground">{t('emergency.panel.subtitle')}</p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>{t('emergency.panel.priorityMode')}</Label>
                        <RadioGroup
                            defaultValue="ambulance"
                            value={mode}
                            onValueChange={(v) => setMode(v as "ambulance" | "vip" | "fire")}
                            className="grid grid-cols-3 gap-4"
                            disabled={isActive}
                        >
                            <div>
                                <RadioGroupItem value="ambulance" id="ambulance" className="peer sr-only" />
                                <Label
                                    htmlFor="ambulance"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-destructive peer-data-[state=checked]:text-destructive cursor-pointer"
                                >
                                    <Ambulance className="mb-3 h-6 w-6" />
                                    {t('emergency.vehicles.ambulance')}
                                </Label>
                            </div>
                            <div>
                                <RadioGroupItem value="fire" id="fire" className="peer sr-only" />
                                <Label
                                    htmlFor="fire"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-orange-500 peer-data-[state=checked]:text-orange-500 cursor-pointer"
                                >
                                    <Flame className="mb-3 h-6 w-6" />
                                    {t('emergency.vehicles.fire')}
                                </Label>
                            </div>
                            <div>
                                <RadioGroupItem value="vip" id="vip" className="peer sr-only" />
                                <Label
                                    htmlFor="vip"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary cursor-pointer"
                                >
                                    <Crown className="mb-3 h-6 w-6" />
                                    {t('emergency.vehicles.vipEscort')}
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <div className="space-y-2">
                        <Label>{t('emergency.panel.routeSelection')}</Label>
                        <div className="grid grid-cols-1 gap-2">
                            <Select disabled={isActive}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('emergency.panel.selectStart')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hospital">{t('emergency.panel.locations.hospital')}</SelectItem>
                                    <SelectItem value="airport">{t('emergency.panel.locations.airport')}</SelectItem>
                                    <SelectItem value="downtown">{t('emergency.panel.locations.downtown')}</SelectItem>
                                    <SelectItem value="firestation">{t('emergency.panel.locations.firestation')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select disabled={isActive}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('emergency.panel.selectDest')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hospital">{t('emergency.panel.locations.hospital')}</SelectItem>
                                    <SelectItem value="airport">{t('emergency.panel.locations.airport')}</SelectItem>
                                    <SelectItem value="stadium">{t('emergency.panel.locations.stadium')}</SelectItem>
                                    <SelectItem value="industrial">{t('emergency.panel.locations.industrial')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {isActive ? (
                        <Button
                            className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            onClick={onDeactivate}
                        >
                            {t('emergency.panel.deactivate')}
                        </Button>
                    ) : (
                        <Button
                            className={`w-full ${mode === 'ambulance' ? 'bg-destructive hover:bg-destructive/90' :
                                mode === 'fire' ? 'bg-orange-500 hover:bg-orange-600' :
                                    'bg-primary hover:bg-primary/90'
                                }`}
                            onClick={onActivate}
                        >
                            {t('emergency.panel.activate')}
                        </Button>
                    )}
                </div>

                {isActive && (
                    <div className="space-y-3">
                        <div className="p-4 bg-card/50 rounded-lg border border-border space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">{t('emergency.panel.metrics.distance')}</span>
                                <span className="font-bold text-foreground">
                                    {currentRouteSummary ? (currentRouteSummary.lengthInMeters / 1000).toFixed(1) : '--'} km
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">{t('emergency.panel.metrics.eta')}</span>
                                <span className="font-bold text-foreground flex items-center gap-1">
                                    <Timer className="h-4 w-4" />
                                    {currentRouteSummary ? Math.round(currentRouteSummary.travelTimeInSeconds / 60) : '--'} mins
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">{t('emergency.panel.metrics.delay')}</span>
                                <span className="font-bold text-warning">
                                    {currentRouteSummary ? Math.round(currentRouteSummary.trafficDelayInSeconds / 60) : '--'} mins
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">{t('emergency.panel.metrics.status')}</span>
                                <span className={`font-bold ${isTrafficDetected ? 'text-destructive animate-pulse' : 'text-success'}`}>
                                    {isTrafficDetected ? t('emergency.panel.metrics.heavy') : t('emergency.panel.metrics.clear')}
                                </span>
                            </div>
                        </div>

                        {/* Display all available routes when traffic is detected */}
                        {isTrafficDetected && allRoutes.length > 1 && (
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                                    <ArrowRight className="h-4 w-4 text-blue-500" />
                                    {t('emergency.panel.availableRoutes')}
                                </h4>
                                {allRoutes.map((route, idx) => {
                                    const timeMins = Math.round(route.summary.travelTimeInSeconds / 60);
                                    const distanceKm = (route.summary.lengthInMeters / 1000).toFixed(1);
                                    const delayMins = Math.round(route.summary.trafficDelayInSeconds / 60);

                                    // Find fastest route
                                    const fastestTime = Math.min(...allRoutes.map(r => r.summary.travelTimeInSeconds));
                                    const isFastest = route.summary.travelTimeInSeconds === fastestTime;
                                    const currentRouteTime = allRoutes.find(r => r.isCurrent)?.summary.travelTimeInSeconds || 0;
                                    const timeSaved = route.isCurrent ? 0 : Math.round((currentRouteTime - route.summary.travelTimeInSeconds) / 60);

                                    return (
                                        <div
                                            key={idx}
                                            className={`p-3 rounded-lg border transition-all ${route.isCurrent
                                                ? 'bg-primary/10 border-primary/50'
                                                : 'bg-card/50 border-border hover:border-primary/30 cursor-pointer'
                                                }`}
                                            onClick={() => !route.isCurrent && onSwitchRoute?.(route.index)}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-sm">
                                                        Route {idx + 1}
                                                    </span>
                                                    {route.isCurrent && (
                                                        <span className="text-[10px] px-2 py-0.5 bg-primary/20 text-primary rounded-full">
                                                            {t('emergency.panel.current')}
                                                        </span>
                                                    )}
                                                    {isFastest && !route.isCurrent && (
                                                        <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full font-semibold">
                                                            ⚡ {t('emergency.panel.fastest')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-sm">{timeMins} {t('simulations.mappo.stats.simulationStep').includes('चरण') ? 'मिनट' : 'mins'}</div>
                                                    {!route.isCurrent && timeSaved > 0 && (
                                                        <div className="text-[10px] text-green-400 font-medium">{t('emergency.toasts.saving', { time: timeSaved })}</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="text-muted-foreground">
                                                    {t('emergency.panel.metrics.distance')}: <span className="text-foreground font-medium">{distanceKm} km</span>
                                                </div>
                                                <div className="text-muted-foreground">
                                                    {t('emergency.panel.metrics.delay')}: <span className="text-warning font-medium">{delayMins} min</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
};
