import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/lib/trafficOfficerData";
import { AlertTriangle, Bell, Cloud, Activity, AlertCircle, X, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface AlertFeedProps {
    alerts: Alert[];
    onMarkAsRead?: (alertId: string) => void;
    onDismiss?: (alertId: string) => void;
    onViewMap?: (coordinates: [number, number]) => void;
    onClearAll?: () => void;
    maxHeight?: string;
}

export default function AlertFeed({ alerts, onMarkAsRead, onDismiss, onViewMap, onClearAll, maxHeight = "400px" }: AlertFeedProps) {
    const { t } = useTranslation();

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'critical': return 'border-l-red-500 bg-red-500/5';
            case 'high': return 'border-l-orange-500 bg-orange-500/5';
            case 'medium': return 'border-l-yellow-500 bg-yellow-500/5';
            case 'low': return 'border-l-blue-500 bg-blue-500/5';
            default: return 'border-l-gray-500 bg-gray-500/5';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'violation': return <AlertCircle className="h-4 w-4" />;
            case 'incident': return <AlertTriangle className="h-4 w-4" />;
            case 'system': return <Activity className="h-4 w-4" />;
            case 'weather': return <Cloud className="h-4 w-4" />;
            case 'congestion': return <Bell className="h-4 w-4" />;
            default: return <Bell className="h-4 w-4" />;
        }
    };

    const sortedAlerts = [...alerts].sort((a, b) => {
        // Unread first
        if (a.read !== b.read) return a.read ? 1 : -1;
        // Then by priority
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
        if (aPriority !== bPriority) return aPriority - bPriority;
        // Then by timestamp (newest first)
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const translateMessage = (alert: Alert) => {
        // Try to match hardcoded messages and translate them with parameters
        if (alert.message.includes('Accident reported')) {
            return t("alerts.messages.accident", { location: alert.location || 'Local Square' });
        }
        if (alert.message.includes('Heavy traffic detected')) {
            const density = alert.message.split('Density: ')[1] || '0';
            return t("alerts.messages.congestion", { location: alert.location || 'Local Square', density });
        }
        if (alert.message.includes('Signal offline')) {
            return t("alerts.messages.offline", { location: alert.location || 'Local Square' });
        }
        if (alert.message.includes('Speeding violation detected')) {
            const parts = alert.message.split(' - ')[1]?.split(' at ') || [];
            const vehicle = parts[0] || 'Unknown';
            const speed = parts[1]?.split(' ')[0] || '0';
            return t("alerts.messages.speeding", { vehicle, speed });
        }
        if (alert.message.includes('Heavy rain expected')) {
            return t("alerts.messages.weather");
        }

        // If it starts with SOS, it's dynamic but we can translate the prefix
        if (alert.message.startsWith('SOS:')) {
            return alert.message.replace('SOS:', '🚨 SOS:');
        }

        return alert.message;
    };

    return (
        <Card className="p-4 bg-gradient-card border-2 border-primary/20">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">{t("alerts.title")}</h3>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        {alerts.filter(a => !a.read).length} {t("alerts.new")}
                    </Badge>
                    {onClearAll && alerts.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] text-muted-foreground hover:text-red-500 gap-1 px-2"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClearAll();
                            }}
                        >
                            <X className="h-3 w-3" />
                            {t("alerts.clearAll")}
                        </Button>
                    )}
                </div>
            </div>

            <ScrollArea style={{ height: maxHeight }}>
                <div className="space-y-2 pr-4">
                    {sortedAlerts.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            {t("alerts.noAlerts")}
                        </div>
                    ) : (
                        sortedAlerts.map((alert) => (
                            <div
                                key={alert.id}
                                className={`border-l-4 ${getPriorityColor(alert.priority)} rounded-r p-3 transition-all hover:bg-background/50 ${alert.read ? 'opacity-60' : ''
                                    }`}
                                onClick={() => !alert.read && onMarkAsRead?.(alert.id)}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 ${alert.priority === 'critical' ? 'text-red-500' :
                                        alert.priority === 'high' ? 'text-orange-500' :
                                            alert.priority === 'medium' ? 'text-yellow-500' :
                                                'text-blue-500'
                                        }`}>
                                        {getTypeIcon(alert.type)}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1">
                                                <p className="text-sm font-medium">{translateMessage(alert)}</p>
                                                {alert.location && (
                                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                        <span>📍 {alert.location}</span>
                                                        {alert.reporterPhone && (
                                                            <span className="ml-2 px-1.5 py-0.5 bg-primary/10 text-primary rounded-md border border-primary/20 text-[10px] font-bold">
                                                                📞 {alert.reporterPhone}
                                                            </span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                            {onDismiss && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 w-6 p-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDismiss(alert.id);
                                                    }}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>

                                        {alert.coordinates && (
                                            <div className="flex gap-2 mt-2">
                                                {onViewMap && (
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        className="h-7 text-xs bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onViewMap(alert.coordinates!);
                                                        }}
                                                    >
                                                        <MapPin className="h-3 w-3 mr-1" />
                                                        {t("alerts.viewOnMap")}
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs border-primary/20 hover:bg-primary/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const [lat, lng] = alert.coordinates!;
                                                        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                                                    }}
                                                >
                                                    <img src="https://www.google.com/s2/favicons?domain=maps.google.com" className="h-3 w-3 mr-1" alt="" />
                                                    {t("alerts.viewOnGoogleMap")}
                                                </Button>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-3 mt-2">
                                            <Badge variant="outline" className="text-xs capitalize">
                                                {t(`alerts.types.${alert.type}`)}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs capitalize">
                                                {t(`alerts.priorities.${alert.priority}`)}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>
        </Card>
    );
}
