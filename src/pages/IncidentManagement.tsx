import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Incident, mockIncidents, mockOfficers, TrafficDataStore } from "@/lib/trafficOfficerData";
import IncidentCard from "@/components/IncidentCard";
import DashboardMap from "@/components/DashboardMap";
import { AlertTriangle, Plus, MapPin, Clock, CheckCircle, XCircle, Users, Send, UserCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { geocodeAddress } from "@/lib/mapUtils";
import { useTranslation } from "react-i18next";
import { API_CONFIG } from "@/lib/apiConfig";

export default function IncidentManagement() {
    const { t } = useTranslation();
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [showAssignDialog, setShowAssignDialog] = useState(false);
    const [showDetailsDialog, setShowDetailsDialog] = useState(false);
    const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
    const [newIncident, setNewIncident] = useState({
        type: 'accident' as Incident['type'],
        severity: 'medium' as Incident['severity'],
        location: '',
        landmark: '',
        description: '',
        affectedLanes: 1
    });

    // Real officers from API
    const [realOfficers, setRealOfficers] = useState<{ phone: string; name: string; status: string }[]>([]);
    const [selectedOfficerPhone, setSelectedOfficerPhone] = useState<string>("");
    const [isDispatching, setIsDispatching] = useState(false);

    useEffect(() => {
        const fetchIncidents = async () => {
            // Fetch from BOTH backend API (cross-device SOS) and localStorage (same-device)
            let backendIncidents: Incident[] = [];
            try {
                const response = await fetch(`${API_CONFIG.SIMULATION}/api/incidents`);
                if (response.ok) {
                    const data = await response.json();
                    backendIncidents = (data.incidents || []).map((inc: any) => ({
                        ...inc,
                        assignedOfficers: inc.assignedOfficers || [],
                        notes: inc.notes || [],
                        timeline: inc.timeline || { reported: inc.reportedAt },
                    }));
                }
            } catch (err) {
                console.debug("Could not fetch backend incidents");
            }

            const localIncidents = TrafficDataStore.loadIncidents();

            // Merge: backend first (cross-device SOS), then local, dedupe by ID
            const merged = [
                ...backendIncidents,
                ...localIncidents.filter(li => !backendIncidents.find(bi => bi.id === li.id))
            ] as Incident[];

            setIncidents(prev => {
                if (JSON.stringify(merged) !== JSON.stringify(prev)) {
                    return merged.length > 0 ? merged : prev;
                }
                return prev;
            });
        };

        fetchIncidents();
        const interval = setInterval(fetchIncidents, 2000);
        return () => clearInterval(interval);
    }, []);

    // Fetch real officers from API
    useEffect(() => {
        const fetchOfficers = async () => {
            try {
                const response = await fetch(`${API_CONFIG.SIMULATION}/api/officers`);
                if (response.ok) {
                    const data = await response.json();
                    setRealOfficers(data.officers || []);
                }
            } catch (error) {
                console.debug("Failed to fetch officers");
            }
        };
        fetchOfficers();
        const interval = setInterval(fetchOfficers, 10000);
        return () => clearInterval(interval);
    }, []);

    // Auto-save effect removed to prevent overwriting server data during polling.
    // Saving is now handled explicitly in action handlers.

    const handleReportIncident = async () => {
        // Geocode the location
        const searchString = `${newIncident.landmark}, ${newIncident.location}, Vadodara`;
        let coords = [22.3072, 73.1812]; // Default

        try {
            const foundCoords = await geocodeAddress(searchString);
            if (foundCoords) {
                coords = foundCoords;
            } else {
                toast.error(t("incidentManagement.toasts.geocodingError"), {
                    description: t("incidentManagement.toasts.geocodingDesc")
                });
            }
        } catch (e) {
            console.error("Geocoding error", e);
        }

        const incident: Incident = {
            id: `INC-${String(incidents.length + 1).padStart(3, '0')}`,
            type: newIncident.type,
            severity: newIncident.severity,
            status: 'reported',
            location: {
                coordinates: [coords[0], coords[1]],
                address: newIncident.location,
                landmark: newIncident.landmark
            },
            reportedBy: 'Control Room',
            reportedAt: new Date().toISOString(),
            assignedOfficers: [],
            description: newIncident.description,
            timeline: {
                reported: new Date().toISOString()
            },
            affectedLanes: newIncident.affectedLanes,
            notes: []
        };

        const updatedList = [incident, ...incidents];
        setIncidents(updatedList);
        await TrafficDataStore.saveIncidents(updatedList); // Explicit Save

        toast.success(t("incidentManagement.toasts.reportSuccess"), {
            description: `${t(`incidents.types.${incident.type}`)} @ ${incident.location.landmark}`
        });
        setShowReportDialog(false);
        setNewIncident({
            type: 'accident',
            severity: 'medium',
            location: '',
            landmark: '',
            description: '',
            affectedLanes: 1
        });
    };

    const handleAssignOfficer = (incidentId: string) => {
        const incident = incidents.find(i => i.id === incidentId);
        if (incident) {
            setSelectedIncident(incident);
            setShowAssignDialog(true);
        }
    };

    const handleConfirmAssignment = async (officerPhone: string) => {
        if (!selectedIncident || !officerPhone) return;

        setIsDispatching(true);
        try {
            // Dispatch via real API
            const response = await fetch(`${API_CONFIG.SIMULATION}/api/dispatch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    officer_phone: officerPhone,
                    incident_id: selectedIncident.id,
                    incident_type: selectedIncident.type,
                    message: `${selectedIncident.type.toUpperCase()} - ${selectedIncident.severity}: Respond immediately`,
                    location: selectedIncident.location.landmark || selectedIncident.location.address || "Unknown",
                    lat: selectedIncident.location.coordinates?.[0] || 19.0330,
                    lng: selectedIncident.location.coordinates?.[1] || 73.0297,
                }),
            });

            if (response.ok) {
                const data = await response.json();

                // Update local incident state
                const updatedIncidents = incidents.map(incident => {
                    if (incident.id === selectedIncident.id) {
                        return {
                            ...incident,
                            status: 'assigned' as Incident['status'],
                            assignedOfficers: [...incident.assignedOfficers, officerPhone],
                            timeline: {
                                ...incident.timeline,
                                assigned: new Date().toISOString()
                            },
                            notes: [...incident.notes, `Officer ${data.officer} dispatched`]
                        };
                    }
                    return incident;
                });

                setIncidents(updatedIncidents);
                await TrafficDataStore.saveIncidents(updatedIncidents);

                toast.success("Officer Dispatched!", {
                    description: `${data.officer} assigned. ${data.telegram_notified ? "Telegram notification sent!" : ""}`
                });
            } else {
                throw new Error("Dispatch failed");
            }
        } catch (error) {
            toast.error("Dispatch Failed", {
                description: "Could not assign officer. Please try again."
            });
        } finally {
            setIsDispatching(false);
            setShowAssignDialog(false);
            setSelectedIncident(null);
            setSelectedOfficerPhone("");
        }
    };

    const handleUpdateStatus = async (incidentId: string, status: Incident['status']) => {
        const updatedIncidents = incidents.map(incident => {
            if (incident.id === incidentId) {
                const timeline = { ...incident.timeline };
                if (status === 'in-progress' && !timeline.arrived) {
                    timeline.arrived = new Date().toISOString();
                } else if (status === 'resolved' && !timeline.resolved) {
                    timeline.resolved = new Date().toISOString();
                }

                toast.success(t("incidentManagement.toasts.statusUpdated", { status: t(`incidents.statuses.${status}`) }), {
                    description: incident.location.landmark
                });

                return {
                    ...incident,
                    status,
                    timeline,
                    notes: [...incident.notes, t("incidentManagement.toasts.statusChanged", { status: t(`incidents.statuses.${status}`) })]
                };
            }
            return incident;
        });

        setIncidents(updatedIncidents);
        await TrafficDataStore.saveIncidents(updatedIncidents); // Explicit Save
    };

    const handleClearIncidents = async () => {
        if (window.confirm("Are you sure you want to clear resolved incidents? Active incidents will be kept.")) {
            // Keep only incidents that are NOT resolved/closed
            const activeIncidents = incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed');
            setIncidents(activeIncidents);
            await TrafficDataStore.saveIncidents(activeIncidents);
            toast.success("Resolved incidents cleared successfully");
        }
    };

    const handleViewDetails = (incidentId: string) => {
        const incident = incidents.find(i => i.id === incidentId);
        if (incident) {
            setSelectedIncident(incident);
            setShowDetailsDialog(true);
        }
    };

    const activeIncidents = incidents.filter(i => ['reported', 'assigned', 'in-progress'].includes(i.status));
    const resolvedIncidents = incidents.filter(i => i.status === 'resolved' || i.status === 'closed');

    const stats = {
        total: incidents.length,
        active: activeIncidents.length,
        critical: incidents.filter(i => i.severity === 'critical' && i.status !== 'resolved').length,
        resolved: resolvedIncidents.length
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{t("incidentManagement.title")}</h1>
                    <p className="text-muted-foreground mt-1">{t("incidentManagement.subtitle")}</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="destructive" onClick={handleClearIncidents}>
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Clear All
                    </Button>
                    <Button onClick={() => setShowReportDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        {t("incidentManagement.reportButton")}
                    </Button>
                </div>
            </div>

            {/* Statistics */}
            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-6 rounded-2xl border-2 border-primary/10 bg-primary/5 shadow-sm hover:shadow-md transition-all duration-300 group">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground font-medium mb-2">{t("incidentManagement.stats.total")}</p>
                            <h3 className="text-4xl font-bold text-primary mb-1 animate-fade-in">{stats.total}</h3>
                        </div>
                        <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform duration-300">
                            <MapPin className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-2xl border-2 border-primary/10 bg-primary/5 shadow-sm hover:shadow-md transition-all duration-300 group">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground font-medium mb-2">{t("incidentManagement.stats.active")}</p>
                            <h3 className="text-4xl font-bold text-primary mb-1 animate-fade-in">{stats.active}</h3>
                        </div>
                        <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform duration-300">
                            <Clock className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-2xl border-2 border-primary/10 bg-primary/5 shadow-sm hover:shadow-md transition-all duration-300 group">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground font-medium mb-2">{t("incidentManagement.stats.critical")}</p>
                            <h3 className="text-4xl font-bold text-primary mb-1 animate-fade-in">{stats.critical}</h3>
                        </div>
                        <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform duration-300">
                            <AlertTriangle className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-2xl border-2 border-primary/10 bg-primary/5 shadow-sm hover:shadow-md transition-all duration-300 group">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground font-medium mb-2">{t("incidentManagement.stats.resolved")}</p>
                            <h3 className="text-4xl font-bold text-primary mb-1 animate-fade-in">{stats.resolved}</h3>
                        </div>
                        <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform duration-300">
                            <CheckCircle className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Map and Incidents */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card className="p-6 rounded-2xl border-2 border-primary/10 bg-white/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                        <h3 className="font-semibold mb-4 flex items-center gap-2 text-lg">
                            <MapPin className="h-5 w-5 text-primary" />
                            {t("incidentManagement.mapTitle")}
                        </h3>
                        <div className="h-[500px] rounded-xl overflow-hidden border border-primary/10">
                            <DashboardMap incidents={activeIncidents} />
                        </div>
                    </Card>
                </div>

                <div>
                    <Tabs defaultValue="active" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="active">{t("incidentManagement.tabs.active")} ({activeIncidents.length})</TabsTrigger>
                            <TabsTrigger value="resolved">{t("incidentManagement.tabs.resolved")} ({resolvedIncidents.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="active" className="mt-4">
                            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                                {activeIncidents.length === 0 ? (
                                    <Card className="p-8 text-center bg-gradient-card border-2 border-primary/20">
                                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                                        <p className="text-muted-foreground">{t("incidents.noIncidents")}</p>
                                    </Card>
                                ) : (
                                    activeIncidents.map(incident => (
                                        <IncidentCard
                                            key={incident.id}
                                            incident={incident}
                                            onAssignOfficer={handleAssignOfficer}
                                            onUpdateStatus={handleUpdateStatus}
                                            onViewDetails={handleViewDetails}
                                        />
                                    ))
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="resolved" className="mt-4">
                            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                                {resolvedIncidents.length === 0 ? (
                                    <Card className="p-8 text-center bg-gradient-card border-2 border-primary/20">
                                        <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                                        <p className="text-muted-foreground">{t("incidents.noIncidents")}</p>
                                    </Card>
                                ) : (
                                    resolvedIncidents.map(incident => (
                                        <IncidentCard
                                            key={incident.id}
                                            incident={incident}
                                            onUpdateStatus={handleUpdateStatus}
                                            onViewDetails={handleViewDetails}
                                        />
                                    ))
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Report Incident Dialog */}
            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t("incidentManagement.reportDialog.title")}</DialogTitle>
                        <DialogDescription>{t("incidentManagement.reportDialog.subtitle")}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="incident-type">{t("incidentManagement.reportDialog.type")}</Label>
                                <Select value={newIncident.type} onValueChange={(value: Incident['type']) => setNewIncident(prev => ({ ...prev, type: value }))}>
                                    <SelectTrigger id="incident-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="accident">{t("incidents.types.accident")}</SelectItem>
                                        <SelectItem value="breakdown">{t("incidents.types.breakdown")}</SelectItem>
                                        <SelectItem value="road-closure">{t("incidents.types.road-closure")}</SelectItem>
                                        <SelectItem value="event">{t("incidents.types.event")}</SelectItem>
                                        <SelectItem value="hazard">{t("incidents.types.hazard")}</SelectItem>
                                        <SelectItem value="congestion">{t("incidents.types.congestion")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="severity">{t("incidentManagement.reportDialog.severity")}</Label>
                                <Select value={newIncident.severity} onValueChange={(value: Incident['severity']) => setNewIncident(prev => ({ ...prev, severity: value }))}>
                                    <SelectTrigger id="severity">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">{t("incidents.severities.low")}</SelectItem>
                                        <SelectItem value="medium">{t("incidents.severities.medium")}</SelectItem>
                                        <SelectItem value="high">{t("incidents.severities.high")}</SelectItem>
                                        <SelectItem value="critical">{t("incidents.severities.critical")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="landmark">{t("incidentManagement.reportDialog.landmark")}</Label>
                            <Input
                                id="landmark"
                                placeholder={t("incidentManagement.reportDialog.landmarkPlaceholder")}
                                value={newIncident.landmark}
                                onChange={(e) => setNewIncident(prev => ({ ...prev, landmark: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="location">{t("incidentManagement.reportDialog.address")}</Label>
                            <Input
                                id="location"
                                placeholder={t("incidentManagement.reportDialog.addressPlaceholder")}
                                value={newIncident.location}
                                onChange={(e) => setNewIncident(prev => ({ ...prev, location: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">{t("incidentManagement.reportDialog.descriptionLabel")}</Label>
                            <Textarea
                                id="description"
                                placeholder={t("incidentManagement.reportDialog.descriptionPlaceholder")}
                                value={newIncident.description}
                                onChange={(e) => setNewIncident(prev => ({ ...prev, description: e.target.value }))}
                                rows={4}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="affected-lanes">{t("incidentManagement.reportDialog.affectedLanes")}</Label>
                            <Input
                                id="affected-lanes"
                                type="number"
                                min="1"
                                max="8"
                                value={newIncident.affectedLanes}
                                onChange={(e) => setNewIncident(prev => ({ ...prev, affectedLanes: parseInt(e.target.value) || 1 }))}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setShowReportDialog(false)}>
                            {t("incidentManagement.reportDialog.cancel")}
                        </Button>
                        <Button onClick={handleReportIncident}>
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            {t("incidentManagement.reportDialog.report")}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Assign Officer Dialog - Uses Real Officers API */}
            <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Dispatch Officer
                        </DialogTitle>
                        <DialogDescription>
                            Assign an officer to: {selectedIncident?.location.landmark}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Incident Summary */}
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="text-sm font-medium">{selectedIncident?.type.toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3" />
                                {selectedIncident?.location.address || selectedIncident?.location.landmark}
                            </p>
                        </div>

                        {/* Real Officers List */}
                        {realOfficers.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground">
                                <Users className="h-10 w-10 mx-auto opacity-30 mb-2" />
                                <p className="text-sm">No officers registered yet.</p>
                                <p className="text-xs">Officers appear when they log in.</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[250px] overflow-y-auto">
                                {realOfficers.map(officer => (
                                    <Card
                                        key={officer.phone}
                                        className={`p-3 cursor-pointer transition-all border-2 ${selectedOfficerPhone === officer.phone
                                            ? 'border-primary bg-primary/5'
                                            : officer.status === 'available'
                                                ? 'border-green-500/20 hover:border-green-500/40'
                                                : 'border-orange-500/20 opacity-60'
                                            }`}
                                        onClick={() => officer.status === 'available' && setSelectedOfficerPhone(officer.phone)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${officer.status === 'available' ? 'bg-green-500/20' : 'bg-orange-500/20'
                                                    }`}>
                                                    <UserCheck className={`h-4 w-4 ${officer.status === 'available' ? 'text-green-500' : 'text-orange-500'
                                                        }`} />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm">{officer.name}</p>
                                                    <p className="text-xs text-muted-foreground">{officer.phone}</p>
                                                </div>
                                            </div>
                                            <Badge className={`${officer.status === 'available'
                                                ? 'bg-green-500/20 text-green-600 border-0'
                                                : 'bg-orange-500/20 text-orange-600 border-0'
                                                }`}>
                                                {officer.status === 'available' ? 'Available' : 'Busy'}
                                            </Badge>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => handleConfirmAssignment(selectedOfficerPhone)}
                            disabled={!selectedOfficerPhone || isDispatching}
                        >
                            <Send className="h-4 w-4 mr-2" />
                            {isDispatching ? "Dispatching..." : "Dispatch Now"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Details Dialog */}
            <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t("incidentManagement.detailsDialog.title")}</DialogTitle>
                        <DialogDescription>
                            {selectedIncident?.id} - {selectedIncident ? t(`incidents.types.${selectedIncident.type}`) : ''}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedIncident && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-start p-4 bg-muted/30 rounded-lg">
                                <div>
                                    <h4 className="font-semibold text-lg">{selectedIncident.location.landmark}</h4>
                                    <p className="text-muted-foreground">{selectedIncident.location.address}</p>
                                </div>
                                <div className="text-right">
                                    <Badge className="mb-1 block w-fit ml-auto">{selectedIncident ? t(`incidents.statuses.${selectedIncident.status}`) : ''}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {t("incidentManagement.detailsDialog.reported")}: {new Date(selectedIncident.reportedAt).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Card className="p-4">
                                    <h5 className="font-medium mb-2 flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4" /> {t("incidentManagement.detailsDialog.descriptionLabel")}
                                    </h5>
                                    <p className="text-sm">{selectedIncident.description}</p>
                                </Card>
                                <Card className="p-4">
                                    <h5 className="font-medium mb-2 flex items-center gap-2">
                                        <Users className="h-4 w-4" /> {t("incidentManagement.detailsDialog.assignedTeam")}
                                    </h5>
                                    {selectedIncident.assignedOfficers.length > 0 ? (
                                        <div className="space-y-1">
                                            {selectedIncident.assignedOfficers.map(officerId => {
                                                const officer = mockOfficers.find(o => o.id === officerId);
                                                return (
                                                    <div key={officerId} className="text-sm flex justify-between">
                                                        <span>{officer?.name || officerId}</span>
                                                        <span className="text-muted-foreground text-xs">{officer?.badgeNumber}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">{t("incidentManagement.detailsDialog.noOfficers")}</p>
                                    )}
                                </Card>
                            </div>

                            <Card className="p-4">
                                <h5 className="font-medium mb-2 flex items-center gap-2">
                                    <Clock className="h-4 w-4" /> {t("incidentManagement.detailsDialog.activityLog")}
                                </h5>
                                <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                    {selectedIncident.notes.map((note, i) => (
                                        <div key={i} className="text-sm border-l-2 border-primary/20 pl-2 py-1">
                                            {note}
                                        </div>
                                    ))}
                                    <div className="text-sm border-l-2 border-primary/20 pl-2 py-1 text-muted-foreground">
                                        {t("incidentManagement.detailsDialog.reportedBy", { name: selectedIncident.reportedBy })}
                                    </div>
                                </div>
                            </Card>

                            <div className="flex justify-end gap-2">
                                {selectedIncident.status === 'reported' && (
                                    <Button onClick={() => {
                                        setShowDetailsDialog(false);
                                        handleAssignOfficer(selectedIncident.id);
                                    }}>
                                        {t("incidentManagement.detailsDialog.startProgress")}
                                    </Button>
                                )}
                                {selectedIncident.status === 'assigned' && (
                                    <Button onClick={() => {
                                        handleUpdateStatus(selectedIncident.id, 'in-progress');
                                        setShowDetailsDialog(false);
                                    }}>
                                        {t("incidentManagement.detailsDialog.startProgress")}
                                    </Button>
                                )}
                                {selectedIncident.status === 'in-progress' && (
                                    <Button onClick={() => {
                                        handleUpdateStatus(selectedIncident.id, 'resolved');
                                        setShowDetailsDialog(false);
                                    }}>
                                        {t("incidentManagement.detailsDialog.markResolved")}
                                    </Button>
                                )}
                                <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>{t("incidentManagement.detailsDialog.close")}</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
