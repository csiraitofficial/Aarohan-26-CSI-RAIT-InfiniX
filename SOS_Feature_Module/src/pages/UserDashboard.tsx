import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MapPin, Camera, Send, CheckCircle2, History, Construction, LifeBuoy, Loader2 } from "lucide-react";
import {
    TrafficDataStore,
    Incident,
    Alert
} from "@/lib/trafficOfficerData";

const UserDashboard = () => {
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.type || !formData.location || !formData.description) {
            toast({
                title: "Missing Information",
                description: "Please fill in all required fields.",
                variant: "destructive"
            });
            return;
        }

        setIsSubmitting(true);

        // Simulate network delay
        setTimeout(() => {
            const mappedType = formData.type === 'other' ? 'hazard' : formData.type;

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
                reportedAt: new Date().toISOString(),
                assignedOfficers: [],
                description: formData.description,
                timeline: {
                    reported: new Date().toISOString()
                },
                affectedLanes: 1,
                notes: formData.vehicleNo ? [`Vehicle involved: ${formData.vehicleNo}`] : []
            };

            // Save to store
            try {
                const currentIncidents = TrafficDataStore.loadIncidents();
                const updatedIncidents = [newIncident, ...currentIncidents];
                TrafficDataStore.saveIncidents(updatedIncidents);
                console.log("Incident saved:", newIncident);
            } catch (error) {
                console.error("Failed to save incident:", error);
            }

            setIsSubmitting(false);
            setSubmitted(true);

            toast({
                title: "Report Submitted",
                description: "Authorities have been notified. Thank you for your help.",
                className: "bg-green-500 text-white"
            });
        }, 500);
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
                title: "Geolocation Not Supported",
                description: "Your browser does not support geolocation.",
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
                        `https://api.tomtom.com/search/2/reverseGeocode/${latitude},${longitude}.json?key=YOUR_TOMTOM_API_KEY_HERE`
                    );
                    const data = await response.json();
                    if (data.addresses && data.addresses.length > 0) {
                        address = data.addresses[0].address.freeformAddress;
                    }
                } catch (error) {
                    console.error("Reverse geocoding failed:", error);
                }

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
                    timestamp: new Date().toISOString(),
                    read: false
                };

                TrafficDataStore.addIncident(sosIncident);
                TrafficDataStore.addAlert(sosAlert);

                toast({
                    title: "SOS ALERT SENT",
                    description: `Emergency help requested at ${address}.`,
                    variant: "destructive",
                    className: "bg-red-600 text-white font-bold"
                });

                setIsSOSLoading(false);
            },
            (error) => {
                console.error("Geolocation error:", error);
                toast({
                    title: "Location Failed",
                    description: "Could not get your location for the SOS alert.",
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
                    <h2 className="text-3xl font-bold">Report Submitted!</h2>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto">
                        Your incident report has been successfully sent to the Central Command Center.
                    </p>
                </div>
                <Button onClick={resetForm} size="lg" className="mt-8">
                    Submit Another Report
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-2">
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">Public Reporting Portal</h1>
                    <p className="text-slate-600 text-lg">Help keep our city safe by reporting traffic incidents and hazards.</p>
                </div>
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
                    SOS EMERGENCY
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="glass-card border-t-4 border-t-indigo-600 shadow-xl shadow-indigo-100/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-primary" />
                            Report an Incident
                        </CardTitle>
                        <CardDescription>
                            Provide details about accidents, stalls, or road hazards.
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="type">Incident Type</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(val) => setFormData({ ...formData, type: val })}
                                >
                                    <SelectTrigger id="type">
                                        <SelectValue placeholder="Select type..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="accident">Accident / Collision</SelectItem>
                                        <SelectItem value="breakdown">Vehicle Breakdown</SelectItem>
                                        <SelectItem value="hazard">Road Hazard / Debris</SelectItem>
                                        <SelectItem value="congestion">Severe Congestion</SelectItem>
                                        <SelectItem value="road-closure">Road Closure</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="location">Location</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="location"
                                        placeholder="e.g. Alkapuri Circle"
                                        className="pl-9"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="vehicle">Vehicle Number (Optional)</Label>
                                <Input
                                    id="vehicle"
                                    placeholder="OD-XX-YYYY"
                                    value={formData.vehicleNo}
                                    onChange={(e) => setFormData({ ...formData, vehicleNo: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Describe what happened..."
                                    className="min-h-[100px]"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Evidence (Optional)</Label>
                                <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer">
                                    <Camera className="h-8 w-8" />
                                    <span className="text-sm">Click to upload photos/videos</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>Sending Report...</>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4" />
                                        Submit Report
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
                                My Reports
                            </CardTitle>
                            <CardDescription>Status of your submitted issues</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                            {myReports.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <p>No reports submitted yet.</p>
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
                                                <span className="font-semibold text-sm capitalize">{report.type.replace('-', ' ')}</span>
                                            </div>
                                            <Badge variant={
                                                report.status === 'resolved' ? 'default' :
                                                    report.status === 'in-progress' ? 'secondary' :
                                                        'outline'
                                            } className="text-[10px]">
                                                {report.status.toUpperCase()}
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
                            <CardTitle className="text-indigo-700">Why Report?</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-indigo-900 space-y-2">
                            <p>• Faster emergency response times.</p>
                            <p>• Helps update navigation for other drivers.</p>
                            <p>• Improves city traffic planning.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default UserDashboard;
