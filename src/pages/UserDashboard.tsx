import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MapPin, Camera, Send, CheckCircle2, History, LifeBuoy, Loader2, Video, Upload } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

import {
    TrafficDataStore,
    Incident,
    Alert
} from "@/lib/trafficOfficerData";
import { addIncident, addAlert, fetchIncidents } from "@/lib/sharedDataSync";
import { useTranslation } from "react-i18next";

const UserDashboard = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        type: "",
        location: "",
        description: "",
        vehicleNo: ""
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSOSLoading, setIsSOSLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [myReports, setMyReports] = useState<Incident[]>([]);
    const [showDetectionOptions, setShowDetectionOptions] = useState(false);
    const [isDetecting, setIsDetecting] = useState(false);
    const [detectionResult, setDetectionResult] = useState<{ detected: boolean; confidence: number } | null>(null);

    useEffect(() => {
        const loadReports = () => {
            const allIncidents = TrafficDataStore.loadIncidents();
            // In a real app we would filter by userID available in session
            // For this mock, we filter by 'User Report'
            const userHistory = allIncidents.filter(i => i.reportedBy === 'User Report');
            setMyReports(userHistory.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()));
        };
        loadReports();
        // Poll for updates every 5 seconds so status changes are reflected
        const interval = setInterval(loadReports, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.type || !formData.location || !formData.description) {
            toast({
                title: t("userDashboard.toasts.missingInfo"),
                description: t("userDashboard.toasts.missingInfoDesc"),
                variant: "destructive"
            });
            return;
        }

        setIsSubmitting(true);

        try {
            const mappedType = formData.type === 'other' ? 'hazard' : formData.type;

            const userPhone = localStorage.getItem("userPhone") || "Unknown (Please Re-login)";
            const newIncident: Incident = {
                id: `INC-${Math.floor(Math.random() * 10000)}`,
                type: mappedType as any,
                severity: 'medium', // Default severity
                status: 'reported',
                location: {
                    coordinates: [22.3072, 73.1812], // Default to Vadodara Center
                    address: formData.location,
                    landmark: formData.location
                },
                reportedBy: 'User Report',
                reporterPhone: userPhone,
                reportedAt: new Date().toISOString(),
                assignedOfficers: [],
                description: formData.description,
                timeline: {
                    reported: new Date().toISOString()
                },
                affectedLanes: 1,
                notes: formData.vehicleNo ? [`Vehicle involved: ${formData.vehicleNo}`] : []
            };

            // Save locally on this device
            try {
                const currentIncidents = TrafficDataStore.loadIncidents();
                const updatedIncidents = [newIncident, ...currentIncidents];
                TrafficDataStore.saveIncidents(updatedIncidents);
                console.log("Incident saved locally:", newIncident);
            } catch (error) {
                console.error("Failed to save incident locally:", error);
            }

            // Construct alert
            const newAlert: Alert = {
                id: `ALT-INC-${Math.floor(Math.random() * 10000)}`,
                type: mappedType === 'accident' ? 'incident' : 'congestion',
                priority: mappedType === 'accident' ? 'high' : 'medium',
                message: `New ${mappedType} reported at ${formData.location}`,
                location: formData.location,
                reporterPhone: userPhone,
                timestamp: new Date().toISOString(),
                read: false
            };

            // Sync with backend so admin dashboard & incidents see it
            try {
                await addIncident(newIncident as any);
            } catch (syncError) {
                console.error("Backend incident sync failed:", syncError);
            }

            try {
                await addAlert(newAlert as any);
            } catch (syncError) {
                console.error("Backend alert sync failed:", syncError);
            }

            // Also keep alert locally
            TrafficDataStore.addAlert(newAlert);

            setIsSubmitting(false);
            setSubmitted(true);

            toast({
                title: t("userDashboard.toasts.reportSubmitted"),
                description: t("userDashboard.toasts.reportSubmittedDesc"),
                className: "bg-green-500 text-white"
            });
        } catch (err) {
            console.error("Error submitting incident:", err);
            setIsSubmitting(false);
            toast({
                title: t("userDashboard.toasts.submitFailedTitle") || "Submission Failed",
                description: t("userDashboard.toasts.submitFailedDesc") || "Could not send incident to server.",
                variant: "destructive"
            });
        }
    };

    const resetForm = () => {
        setFormData({
            type: "",
            location: "",
            description: "",
            vehicleNo: ""
        });
        setSubmitted(false);
    };

    const handleSOS = async () => {
        if (!("geolocation" in navigator)) {
            toast({
                title: t("userDashboard.toasts.geoNotSupported"),
                description: t("userDashboard.toasts.geoNotSupportedDesc"),
                variant: "destructive"
            });
            return;
        }

        setIsSOSLoading(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                let address = "Emergency SOS Location";

                try {
                    // Reverse geocode using TomTom API
                    const response = await fetch(
                        `https://api.tomtom.com/search/2/reverseGeocode/${latitude},${longitude}.json?key=riFTeh0wpjONJX0XItCu3qmHWF657Mia`
                    );
                    const data = await response.json();
                    if (data.addresses && data.addresses.length > 0) {
                        address = data.addresses[0].address.freeformAddress;
                    }
                } catch (error) {
                    console.error("Reverse geocoding failed:", error);
                }

                const userPhone = localStorage.getItem("userPhone") || "Unknown (Please Re-login)";
                const sosIncident: Incident = {
                    id: `SOS-${Math.floor(Math.random() * 10000)}`,
                    type: 'sos',
                    severity: 'critical',
                    status: 'reported',
                    location: {
                        coordinates: [latitude, longitude],
                        address: address,
                        landmark: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`
                    },
                    reportedBy: 'User SOS',
                    reporterPhone: userPhone,
                    reportedAt: new Date().toISOString(),
                    assignedOfficers: [],
                    description: `User triggered SOS emergency button near ${address}.`,
                    timeline: {
                        reported: new Date().toISOString()
                    },
                    affectedLanes: 0,
                    notes: ["PRIORITY: EMERGENCY SOS"]
                };

                const sosAlert: Alert = {
                    id: `ALT-SOS-${Math.floor(Math.random() * 10000)}`,
                    type: 'incident',
                    priority: 'critical',
                    message: `🚨 SOS EMERGENCY: User needs help near ${address}`,
                    location: address,
                    coordinates: [latitude, longitude],
                    reporterPhone: userPhone,
                    timestamp: new Date().toISOString(),
                    read: false
                };

                // Send to backend for cross-device sync (mobile -> admin)
                await addIncident(sosIncident as any);
                await addAlert(sosAlert as any);

                // Also save locally for this device's view
                TrafficDataStore.addIncident(sosIncident);
                TrafficDataStore.addAlert(sosAlert);

                toast({
                    title: t("userDashboard.toasts.sosSent"),
                    description: t("userDashboard.toasts.sosSentDesc", { address }),
                    variant: "destructive",
                    className: "bg-red-600 text-white font-bold"
                });

                setIsSOSLoading(false);
            },
            (error) => {
                console.error("Geolocation error:", error);
                toast({
                    title: t("userDashboard.toasts.locationFailed"),
                    description: t("userDashboard.toasts.locationFailedDesc"),
                    variant: "destructive"
                });
                setIsSOSLoading(false);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    };

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-fade-in">
                <div className="bg-green-100 dark:bg-green-900/20 p-6 rounded-full">
                    <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold">{t("userDashboard.successTitle")}</h2>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto">
                        {t("userDashboard.successDesc")}
                    </p>
                </div>
                <Button onClick={resetForm} size="lg" className="mt-8">
                    {t("userDashboard.reportAnother")}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-2">
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">{t("userDashboard.title")}</h1>
                    <p className="text-slate-600 text-lg">{t("userDashboard.subtitle")}</p>
                </div>
                <div className="flex flex-wrap gap-4">
                    <Button
                        size="lg"
                        className="h-16 px-8 rounded-2xl shadow-2xl shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all bg-indigo-600 hover:bg-indigo-700 font-black text-xl gap-3 text-white border-0"
                        onClick={() => setShowDetectionOptions(true)}
                    >
                        <Video className="h-6 w-6" />
                        {t("userDashboard.detectIncidentLive")}
                    </Button>
                    <Button
                        size="lg"
                        variant="destructive"
                        className="h-16 px-8 rounded-2xl shadow-2xl shadow-red-500/50 hover:scale-105 active:scale-95 transition-all bg-red-600 hover:bg-red-700 font-black text-xl gap-3"
                        onClick={handleSOS}
                        disabled={isSOSLoading}
                    >
                        {isSOSLoading ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                            <LifeBuoy className="h-6 w-6 animate-pulse" />
                        )}
                        {t("userDashboard.sosButton")}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="glass-card border-t-4 border-t-indigo-600 shadow-xl shadow-indigo-100/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-primary" />
                            {t("userDashboard.reportTitle")}
                        </CardTitle>
                        <CardDescription>
                            {t("userDashboard.reportDesc")}
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="type">{t("userDashboard.incidentType")}</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(val) => setFormData({ ...formData, type: val })}
                                >
                                    <SelectTrigger id="type">
                                        <SelectValue placeholder={t("userDashboard.selectType")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="accident">{t("userDashboard.types.accident")}</SelectItem>
                                        <SelectItem value="breakdown">{t("userDashboard.types.breakdown")}</SelectItem>
                                        <SelectItem value="hazard">{t("userDashboard.types.hazard")}</SelectItem>
                                        <SelectItem value="congestion">{t("userDashboard.types.congestion")}</SelectItem>
                                        <SelectItem value="road-closure">{t("userDashboard.types.road-closure")}</SelectItem>
                                        <SelectItem value="other">{t("userDashboard.types.other")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="location">{t("userDashboard.location")}</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="location"
                                        placeholder={t("userDashboard.locationPlaceholder")}
                                        className="pl-9"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="vehicle">{t("userDashboard.vehicleNo")}</Label>
                                <Input
                                    id="vehicle"
                                    placeholder={t("userDashboard.vehiclePlaceholder")}
                                    value={formData.vehicleNo}
                                    onChange={(e) => setFormData({ ...formData, vehicleNo: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">{t("userDashboard.description")}</Label>
                                <Textarea
                                    id="description"
                                    placeholder={t("userDashboard.descriptionPlaceholder")}
                                    className="min-h-[100px]"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>{t("userDashboard.evidence")}</Label>
                                <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer">
                                    <Camera className="h-8 w-8" />
                                    <span className="text-sm">{t("userDashboard.evidenceUpload")}</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>{t("userDashboard.submitting")}</>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4" />
                                        {t("userDashboard.submit")}
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* Right Side Info Panel - Switched to Activity Feed */}
                <div className="space-y-6">
                    <Card className="glass-card border-slate-100">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="h-5 w-5" />
                                {t("userDashboard.myReports")}
                            </CardTitle>
                            <CardDescription>{t("userDashboard.myReportsDesc")}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                            {myReports.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <p>{t("userDashboard.noReports")}</p>
                                </div>
                            ) : (
                                myReports.map(report => (
                                    <div key={report.id} className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                {report.type === 'sos' ? (
                                                    <LifeBuoy className="h-4 w-4 text-red-500" />
                                                ) : report.type === 'accident' ? (
                                                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                                                ) : (
                                                    <AlertTriangle className="h-4 w-4 text-blue-500" />
                                                )}
                                                <span className="font-semibold text-sm capitalize">{report.type === 'sos' ? t("incidents.types.sos") : t(`incidents.types.${report.type}`)}</span>
                                            </div>
                                            <Badge variant={
                                                report.status === 'resolved' ? 'default' :
                                                    report.status === 'in-progress' ? 'secondary' :
                                                        'outline'
                                            } className="text-[10px]">
                                                {t(`incidents.statuses.${report.status}`).toUpperCase()}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-1">
                                            {new Date(report.reportedAt).toLocaleDateString()} • {report.location.address}
                                        </p>
                                        <p className="text-sm line-clamp-2">{report.description}</p>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-indigo-50 border-indigo-100">
                        <CardHeader>
                            <CardTitle className="text-indigo-700">{t("userDashboard.whyReport")}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-indigo-900 space-y-2">
                            <p>• {t("userDashboard.reasons.response")}</p>
                            <p>• {t("userDashboard.reasons.mapping")}</p>
                            <p>• {t("userDashboard.reasons.planning")}</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={showDetectionOptions} onOpenChange={(val) => {
                if (!isDetecting) setShowDetectionOptions(val);
                if (!val) setDetectionResult(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t("userDashboard.detectIncidentLive")}</DialogTitle>
                        <DialogDescription>
                            {isDetecting ? t("userDashboard.detecting") : "Choose how you want to provide interest evidence for AI detection."}
                        </DialogDescription>
                    </DialogHeader>

                    {isDetecting ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <div className="relative h-20 w-20">
                                <div className="absolute inset-0 rounded-full border-4 border-indigo-100 italic"></div>
                                <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-indigo-600 font-bold animate-pulse">{t("userDashboard.detecting")}</p>
                        </div>
                    ) : detectionResult ? (
                        <div className="py-6 space-y-6">
                            <div className={`p-6 rounded-2xl border-2 flex flex-col items-center text-center gap-3 transition-all ${detectionResult.detected
                                ? "bg-red-50 border-red-200 text-red-900 shadow-lg shadow-red-100"
                                : "bg-emerald-50 border-emerald-200 text-emerald-900"
                                }`}>
                                {detectionResult.detected ? (
                                    <>
                                        <AlertTriangle className="h-12 w-16 text-red-600 animate-bounce" />
                                        <h3 className="text-2xl font-black">{t("userDashboard.accidentDetected")}</h3>
                                        <p className="text-sm font-medium opacity-80">Confidence: {(detectionResult.confidence * 100).toFixed(1)}%</p>
                                        <Button
                                            className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-bold h-12 shadow-xl shadow-red-200"
                                            onClick={() => {
                                                // Auto-report detected incident with geolocation (similar to SOS)
                                                if (!("geolocation" in navigator)) {
                                                    toast({
                                                        title: t("userDashboard.toasts.geoNotSupported"),
                                                        description: t("userDashboard.toasts.geoNotSupportedDesc"),
                                                        variant: "destructive"
                                                    });
                                                    return;
                                                }

                                                setIsDetecting(true);

                                                navigator.geolocation.getCurrentPosition(
                                                    async (position) => {
                                                        const { latitude, longitude } = position.coords;
                                                        let address = "AI-detected incident location";

                                                        try {
                                                            const response = await fetch(
                                                                `https://api.tomtom.com/search/2/reverseGeocode/${latitude},${longitude}.json?key=riFTeh0wpjONJX0XItCu3qmHWF657Mia`
                                                            );
                                                            const data = await response.json();
                                                            if (data.addresses && data.addresses.length > 0) {
                                                                address = data.addresses[0].address.freeformAddress;
                                                            }
                                                        } catch (error) {
                                                            console.error("Reverse geocoding for detected incident failed:", error);
                                                        }

                                                        const userPhone = localStorage.getItem("userPhone") || "Unknown (Please Re-login)";
                                                        const incidentId = `AI-INC-${Date.now()}`;

                                                        const detectedIncident: Incident = {
                                                            id: incidentId,
                                                            type: "pothole",
                                                            severity: "medium",
                                                            status: "reported",
                                                            location: {
                                                                coordinates: [latitude, longitude],
                                                                address,
                                                                landmark: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`
                                                            },
                                                            reportedBy: "User Live Detection",
                                                            reporterPhone: userPhone,
                                                            reportedAt: new Date().toISOString(),
                                                            assignedOfficers: [],
                                                            description: `AI detected a road hazard/pothole from user video near ${address}.`,
                                                            timeline: { reported: new Date().toISOString() },
                                                            affectedLanes: 1,
                                                            notes: ["Auto-generated from user live detection"]
                                                        };

                                                        const detectedAlert: Alert = {
                                                            id: `ALT-AI-${Date.now()}`,
                                                            type: "incident",
                                                            priority: "high",
                                                            message: `🕳️ AI-detected pothole/hazard near ${address}`,
                                                            location: address,
                                                            coordinates: [latitude, longitude],
                                                            reporterPhone: userPhone,
                                                            timestamp: new Date().toISOString(),
                                                            read: false
                                                        };

                                                        try {
                                                            await addIncident(detectedIncident as any);
                                                        } catch (syncError) {
                                                            console.error("Failed to sync AI-detected incident:", syncError);
                                                        }

                                                        try {
                                                            await addAlert(detectedAlert as any);
                                                        } catch (syncError) {
                                                            console.error("Failed to sync AI-detected alert:", syncError);
                                                        }

                                                        // Also store locally so this device sees it
                                                        TrafficDataStore.addIncident(detectedIncident);
                                                        TrafficDataStore.addAlert(detectedAlert);
                                                        setMyReports(prev => [detectedIncident, ...prev]);

                                                        setIsDetecting(false);
                                                        setShowDetectionOptions(false);
                                                        setDetectionResult(null);

                                                        toast({
                                                            title: t("userDashboard.toasts.reportSubmitted"),
                                                            description: t("userDashboard.toasts.reportSubmittedDesc"),
                                                            className: "bg-red-600 text-white"
                                                        });
                                                    },
                                                    (error) => {
                                                        console.error("Geolocation error for detected incident:", error);
                                                        setIsDetecting(false);
                                                        toast({
                                                            title: t("userDashboard.toasts.locationFailed"),
                                                            description: t("userDashboard.toasts.locationFailedDesc"),
                                                            variant: "destructive"
                                                        });
                                                    },
                                                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                                                );
                                            }}
                                        >
                                            <Send className="h-4 w-4 mr-2" />
                                            {t("userDashboard.reportThis")}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                                        <h3 className="text-xl font-bold">{t("userDashboard.noIncidentDetected")}</h3>
                                        <p className="text-sm">The footage appears clear of major traffic incidents.</p>
                                        <Button
                                            variant="outline"
                                            className="w-full mt-4"
                                            onClick={() => {
                                                setShowDetectionOptions(false);
                                                setDetectionResult(null);
                                            }}
                                        >
                                            Done
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 py-4">
                            <Button
                                variant="outline"
                                className="flex flex-col h-32 gap-3 border-2 hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
                                onClick={() => {
                                    setIsDetecting(true);
                                    // Simulate live capture & detection
                                    setTimeout(() => {
                                        setIsDetecting(false);
                                        setDetectionResult({ detected: true, confidence: 0.94 });
                                    }, 3000);
                                }}
                            >
                                <Camera className="h-8 w-8 text-indigo-600 group-hover:scale-110 transition-transform" />
                                <span className="font-bold">{t("userDashboard.captureLive")}</span>
                            </Button>
                            <Button
                                variant="outline"
                                className="flex flex-col h-32 gap-3 border-2 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                                onClick={() => {
                                    // Trigger file upload
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = 'video/*,image/*';
                                    input.onchange = (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0];
                                        if (file) {
                                            setIsDetecting(true);
                                            // Simulate AI processing
                                            setTimeout(() => {
                                                setIsDetecting(false);
                                                // If filename has 'accident' it detects one
                                                const isAccident = file.name.toLowerCase().includes('accident') || Math.random() > 0.5;
                                                setDetectionResult({
                                                    detected: isAccident,
                                                    confidence: isAccident ? 0.85 + Math.random() * 0.1 : 0.98
                                                });
                                            }, 2500);
                                        }
                                    };
                                    input.click();
                                }}
                            >
                                <Upload className="h-8 w-8 text-emerald-600 group-hover:scale-110 transition-transform" />
                                <span className="font-bold">{t("userDashboard.uploadVideo")}</span>
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default UserDashboard;
