import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Incident } from "@/lib/trafficOfficerData";
import { MapPin, Clock, Users, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";

interface IncidentCardProps {
    incident: Incident;
    onAssignOfficer?: (incidentId: string) => void;
    onUpdateStatus?: (incidentId: string, status: Incident['status']) => void;
    onViewDetails?: (incidentId: string) => void;
}

export default function IncidentCard({ incident, onAssignOfficer, onUpdateStatus, onViewDetails }: IncidentCardProps) {
    const { t } = useTranslation();

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
            case 'medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            case 'low': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'reported': return 'bg-blue-500/10 text-blue-500';
            case 'assigned': return 'bg-purple-500/10 text-purple-500';
            case 'in-progress': return 'bg-yellow-500/10 text-yellow-500';
            case 'resolved': return 'bg-green-500/10 text-green-500';
            case 'closed': return 'bg-gray-500/10 text-gray-500';
            default: return 'bg-gray-500/10 text-gray-500';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'accident': return '🚗';
            case 'breakdown': return '🔧';
            case 'road-closure': return '🚧';
            case 'event': return '🎉';
            case 'hazard': return '⚠️';
            case 'congestion': return '🚦';
            case 'sos': return '🛟';
            default: return '📍';
        }
    };

    return (
        <Card className="p-4 bg-gradient-card border-2 border-primary/20 hover:border-primary/40 transition-all">
            <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{getTypeIcon(incident.type)}</span>
                        <div>
                            <h3 className="font-semibold text-sm capitalize">{t(`incidents.types.${incident.type}`)}</h3>
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-muted-foreground">{incident.id}</p>
                                {incident.reporterPhone && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-md">
                                        📞 {incident.reporterPhone}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <Badge className={`${getSeverityColor(incident.severity)} border text-xs`}>
                            {t(`incidents.severities.${incident.severity}`)}
                        </Badge>
                        <Badge className={`${getStatusColor(incident.status)} text-xs`}>
                            {t(`incidents.statuses.${incident.status}`)}
                        </Badge>
                    </div>
                </div>

                {/* Description */}
                <p className="text-sm text-foreground">
                    {incident.description === 'Two-vehicle collision, minor injuries reported' ? t("alerts.messages.accident", { location: incident.location.landmark }) :
                        incident.description === 'Heavy truck breakdown blocking right lane' ? t("alerts.messages.congestion", { location: incident.location.landmark, density: 'Medium' }) :
                            incident.description}
                </p>

                {/* Location */}
                <div className="flex items-start gap-2 text-xs">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                        <p className="font-medium">{incident.location.landmark}</p>
                        <p className="text-muted-foreground">{incident.location.address}</p>
                    </div>
                </div>

                {/* Time Info */}
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                            {formatDistanceToNow(new Date(incident.reportedAt), { addSuffix: true })}
                        </span>
                    </div>
                    {incident.assignedOfficers.length > 0 && (
                        <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">
                                {incident.assignedOfficers.length} {incident.assignedOfficers.length > 1 ? t("incidents.officers") : t("incidents.officer")}
                            </span>
                        </div>
                    )}
                </div>

                {/* Impact */}
                <div className="bg-background/50 rounded p-2 space-y-1">
                    <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("incidents.affectedLanes")}:</span>
                        <span className="font-semibold">{incident.affectedLanes}</span>
                    </div>
                    {incident.estimatedClearanceTime && (
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{t("incidents.estClearance")}:</span>
                            <span className="font-semibold">
                                {formatDistanceToNow(new Date(incident.estimatedClearanceTime), { addSuffix: true })}
                            </span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                    {incident.status === 'reported' && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8 text-xs min-w-[120px]"
                            onClick={() => onAssignOfficer?.(incident.id)}
                        >
                            <Users className="h-3 w-3 mr-1" />
                            {t("incidents.assignOfficer")}
                        </Button>
                    )}
                    {incident.status === 'in-progress' && (
                        <Button
                            size="sm"
                            variant="default"
                            className="flex-1 h-8 text-xs min-w-[120px]"
                            onClick={() => onUpdateStatus?.(incident.id, 'resolved')}
                        >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t("incidents.markResolved")}
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs min-w-[100px]"
                        onClick={() => onViewDetails?.(incident.id)}
                    >
                        {t("incidents.viewDetails")}
                    </Button>

                    {incident.location.coordinates && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8 text-xs border-primary/20 hover:bg-primary/10 min-w-[140px]"
                            onClick={(e) => {
                                e.stopPropagation();
                                const [lat, lng] = incident.location.coordinates;
                                window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                            }}
                        >
                            <img src="https://www.google.com/s2/favicons?domain=maps.google.com" className="h-3 w-3 mr-1" alt="" />
                            {t("incidents.viewOnGoogleMap")}
                        </Button>
                    )}
                </div>

                {/* Notes */}
                {incident.notes.length > 0 && (
                    <div className="border-t border-border pt-2">
                        <p className="text-xs text-muted-foreground mb-1">{t("incidents.latestUpdate")}:</p>
                        <p className="text-xs">{incident.notes[incident.notes.length - 1]}</p>
                    </div>
                )}
            </div>
        </Card>
    );
}
