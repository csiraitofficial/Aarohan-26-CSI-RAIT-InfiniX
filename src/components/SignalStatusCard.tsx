import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrafficSignal } from "@/lib/trafficOfficerData";
import { Activity, AlertTriangle, Settings, Zap, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SignalStatusCardProps {
    signal: TrafficSignal;
    onAdjustTiming?: (signalId: string) => void;
    onToggleAdaptive?: (signalId: string) => void;
    distance?: number; // km from searched location
}

export default function SignalStatusCard({ signal, onAdjustTiming, onToggleAdaptive, distance }: SignalStatusCardProps) {
    const { t } = useTranslation();
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'operational': return 'bg-green-500/10 text-green-500 border-green-500/20';
            case 'warning': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            case 'offline': return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'maintenance': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
        }
    };

    const getPhaseColor = (phase: string) => {
        switch (phase) {
            case 'red': return 'bg-red-500';
            case 'yellow': return 'bg-yellow-500';
            case 'green': return 'bg-green-500';
            default: return 'bg-gray-500';
        }
    };

    const getDensityColor = (density: number) => {
        if (density >= 8) return 'text-red-500';
        if (density >= 6) return 'text-yellow-500';
        return 'text-green-500';
    };

    return (
        <Card className="p-4 bg-gradient-card border-2 border-primary/20 hover:border-primary/40 transition-all">
            <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">{signal.name}</h3>
                            <div className={`w-3 h-3 rounded-full ${getPhaseColor(signal.currentPhase)} animate-pulse`} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{signal.id}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <Badge className={`${getStatusColor(signal.status)} border`}>
                            {t(`signals.statuses.${signal.status}`)}
                        </Badge>
                        {distance !== undefined && (
                            <Badge variant="outline" className="gap-1 text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                                <MapPin className="h-2.5 w-2.5" />
                                {distance < 1 ? `${(distance * 1000).toFixed(0)}m` : `${distance.toFixed(1)}km`}
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Current Phase */}
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{t("signalControl.card.phase")}</span>
                    <span className="font-semibold uppercase">{t(`signals.phases.${signal.currentPhase}`)}</span>
                    {signal.adaptiveMode && (
                        <Badge variant="outline" className="ml-auto gap-1">
                            <Zap className="h-3 w-3" />
                            {t("signalControl.card.adaptive")}
                        </Badge>
                    )}
                </div>

                {/* Traffic Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                        <Activity className="h-3 w-3 text-muted-foreground" />
                        <div>
                            <p className="text-muted-foreground">{t("signalControl.card.density")}</p>
                            <p className={`font-semibold ${getDensityColor(signal.trafficDensity)}`}>
                                {signal.trafficDensity.toFixed(1)}/10
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                        <div>
                            <p className="text-muted-foreground">{t("signalControl.card.vehicles")}</p>
                            <p className="font-semibold">{signal.vehicleCount}</p>
                        </div>
                    </div>
                </div>

                {/* Timings */}
                <div className="bg-background/50 rounded p-2 space-y-1">
                    <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("signalControl.card.red")}</span>
                        <span className="font-mono">{signal.timings.redDuration}s</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("signalControl.card.yellow")}</span>
                        <span className="font-mono">{signal.timings.yellowDuration}s</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("signalControl.card.green")}</span>
                        <span className="font-mono">{signal.timings.greenDuration}s</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs"
                        onClick={() => onAdjustTiming?.(signal.id)}
                    >
                        <Settings className="h-3 w-3 mr-1" />
                        {t("signalControl.card.adjust")}
                    </Button>
                    <Button
                        size="sm"
                        variant={signal.adaptiveMode ? "default" : "outline"}
                        className="flex-1 h-8 text-xs"
                        onClick={() => onToggleAdaptive?.(signal.id)}
                    >
                        <Zap className="h-3 w-3 mr-1" />
                        {signal.adaptiveMode ? t("signalControl.card.autoMode") : t("signalControl.card.manualMode")}
                    </Button>
                </div>
            </div>
        </Card>
    );
}
