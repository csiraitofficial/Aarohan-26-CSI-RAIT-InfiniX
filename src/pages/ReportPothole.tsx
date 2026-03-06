import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Construction, MapPin, Camera, Send, CheckCircle2, Loader2, Navigation } from "lucide-react";
import { TrafficDataStore, Incident } from "@/lib/trafficOfficerData";
import { addIncident } from "@/lib/sharedDataSync";
import { useTranslation } from "react-i18next";

const ReportPothole = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        location: "",
        severity: "",
        description: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // GPS coordinates state
    const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
    const [gpsLoading, setGpsLoading] = useState(true);
    const [gpsError, setGpsError] = useState<string | null>(null);

    // Get GPS coordinates on component mount
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setCoordinates([position.coords.latitude, position.coords.longitude]);
                    setGpsLoading(false);
                },
                (error) => {
                    console.error('GPS error:', error);
                    setGpsError('Could not get location. Using default.');
                    setGpsLoading(false);
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            setGpsError('Geolocation not supported');
            setGpsLoading(false);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.location || !formData.severity || !formData.description) {
            toast({
                title: t("reportPothole.toasts.missingInfo"),
                description: t("reportPothole.toasts.missingInfoDesc"),
                variant: "destructive"
            });
            return;
        }

        setIsSubmitting(true);

        try {
            // Use captured GPS or default coordinates
            const coords = coordinates || [22.3072, 73.1812];

            const newIncident: Incident = {
                id: `POT-${Math.floor(Math.random() * 10000)}`,
                type: 'pothole',
                severity: formData.severity as 'low' | 'medium' | 'high',
                status: 'reported',
                location: {
                    coordinates: coords,
                    address: formData.location,
                    landmark: `Lat: ${coords[0].toFixed(4)}, Lon: ${coords[1].toFixed(4)}`
                },
                reportedBy: 'User Report',
                reportedAt: new Date().toISOString(),
                assignedOfficers: [],
                description: formData.description,
                timeline: {
                    reported: new Date().toISOString()
                },
                affectedLanes: 1,
                notes: ['Reported via mobile app']
            };

            // POST to backend API for cross-device sync
            await addIncident(newIncident);
            console.log("Pothole synced to backend:", newIncident);

            // Also save to localStorage for same-device access
            try {
                const currentIncidents = TrafficDataStore.loadIncidents();
                const updatedIncidents = [newIncident, ...currentIncidents];
                TrafficDataStore.saveIncidents(updatedIncidents);
            } catch (localError) {
                console.warn("LocalStorage save failed:", localError);
            }

            setIsSubmitting(false);
            setSubmitted(true);

            toast({
                title: t("reportPothole.toasts.success"),
                description: t("reportPothole.toasts.successDesc"),
                className: "bg-green-500 text-white"
            });
        } catch (error) {
            console.error("Failed to submit pothole report:", error);
            setIsSubmitting(false);
            toast({
                title: "Submission Failed",
                description: "Could not submit report. Please try again.",
                variant: "destructive"
            });
        }
    };

    const resetForm = () => {
        setFormData({
            location: "",
            severity: "",
            description: "",
        });
        setSubmitted(false);
    };

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-fade-in">
                <div className="bg-green-100 dark:bg-green-900/20 p-6 rounded-full">
                    <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold">{t("reportPothole.successTitle")}</h2>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto">
                        {t("reportPothole.successDesc")}
                    </p>
                </div>
                <Button onClick={resetForm} size="lg" className="mt-8">
                    {t("reportPothole.reportAnother")}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            <div className="space-y-2">
                <h1 className="text-4xl font-bold gradient-text">{t("reportPothole.title")}</h1>
                <p className="text-muted-foreground text-lg">{t("reportPothole.subtitle")}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-t-4 border-t-orange-500 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Construction className="h-5 w-5 text-orange-500" />
                            {t("reportPothole.cardTitle")}
                        </CardTitle>
                        <CardDescription>
                            {t("reportPothole.cardDesc")}
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="location">{t("reportPothole.locationLabel")}</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="location"
                                        placeholder={t("reportPothole.locationPlaceholder")}
                                        className="pl-9"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                    />
                                </div>
                                {/* GPS Coordinates Display */}
                                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-xs">
                                    <Navigation className="h-3 w-3" />
                                    {gpsLoading ? (
                                        <span className="flex items-center gap-1 text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin" /> Getting GPS...
                                        </span>
                                    ) : coordinates ? (
                                        <span className="text-green-600 dark:text-green-400">
                                            📍 {coordinates[0].toFixed(4)}, {coordinates[1].toFixed(4)}
                                        </span>
                                    ) : (
                                        <span className="text-orange-500">{gpsError || 'Using default location'}</span>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="severity">{t("reportPothole.severityLabel")}</Label>
                                <Select
                                    value={formData.severity}
                                    onValueChange={(val) => setFormData({ ...formData, severity: val })}
                                >
                                    <SelectTrigger id="severity">
                                        <SelectValue placeholder={t("reportPothole.severityPlaceholder")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">{t("reportPothole.severities.low")}</SelectItem>
                                        <SelectItem value="medium">{t("reportPothole.severities.medium")}</SelectItem>
                                        <SelectItem value="high">{t("reportPothole.severities.high")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">{t("reportPothole.descriptionLabel")}</Label>
                                <Textarea
                                    id="description"
                                    placeholder={t("reportPothole.descriptionPlaceholder")}
                                    className="min-h-[100px]"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>{t("reportPothole.photoLabel")}</Label>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                                >
                                    <Camera className="h-8 w-8" />
                                    <span className="text-sm">{t("reportPothole.photoUpload")}</span>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="w-full gap-2 bg-orange-600 hover:bg-orange-700" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>{t("reportPothole.sending")}</>
                                ) : (
                                    <>
                                        <Construction className="h-4 w-4" />
                                        {t("reportPothole.submitReport")}
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* Right Side Info Panel */}
                <div className="space-y-6">
                    <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
                        <CardHeader>
                            <CardTitle className="text-orange-700 dark:text-orange-400">{t("reportPothole.tipsTitle")}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-orange-900 dark:text-orange-200 space-y-2">
                            <p>• {t("reportPothole.tips.tip1")}</p>
                            <p>• {t("reportPothole.tips.tip2")}</p>
                            <p>• {t("reportPothole.tips.tip3")}</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ReportPothole;
