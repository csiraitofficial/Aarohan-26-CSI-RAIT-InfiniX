import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserCheck, Send, MapPin, Clock, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { API_CONFIG } from "@/lib/apiConfig";

interface Officer {
    phone: string;
    name: string;
    status: "available" | "busy";
    registered_at: string;
    last_seen: string;
    current_assignment?: any;
}

interface Incident {
    id: string;
    type: string;
    location: { address?: string; landmark?: string; coordinates?: number[] };
    severity?: string;
}

interface OfficerDispatchProps {
    incident?: Incident;
    onDispatchComplete?: () => void;
}

export const OfficerDispatch = ({ incident, onDispatchComplete }: OfficerDispatchProps) => {
    const [officers, setOfficers] = useState<Officer[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedOfficer, setSelectedOfficer] = useState<string>("");
    const [isDispatching, setIsDispatching] = useState(false);

    const fetchOfficers = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_CONFIG.SIMULATION}/api/officers`);
            if (response.ok) {
                const data = await response.json();
                setOfficers(data.officers || []);
            }
        } catch (error) {
            console.error("Failed to fetch officers:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOfficers();
        // Poll for updates every 10 seconds
        const interval = setInterval(fetchOfficers, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleDispatch = async () => {
        if (!selectedOfficer || !incident) return;

        setIsDispatching(true);
        try {
            const locationStr = incident.location?.address || incident.location?.landmark || "Unknown location";
            const coords = incident.location?.coordinates || [19.0330, 73.0297];

            const response = await fetch(`${API_CONFIG.SIMULATION}/api/dispatch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    officer_phone: selectedOfficer,
                    incident_id: incident.id,
                    incident_type: incident.type,
                    message: `${incident.type.toUpperCase()} - ${incident.severity || 'URGENT'}: Respond immediately`,
                    location: locationStr,
                    lat: coords[0],
                    lng: coords[1],
                }),
            });

            if (response.ok) {
                const data = await response.json();
                toast({
                    title: "Officer Dispatched",
                    description: `${data.officer} has been assigned. ${data.telegram_notified ? "Telegram notification sent!" : ""}`,
                });
                setIsDialogOpen(false);
                setSelectedOfficer("");
                fetchOfficers();
                onDispatchComplete?.();
            } else {
                throw new Error("Failed to dispatch");
            }
        } catch (error) {
            toast({
                title: "Dispatch Failed",
                description: "Could not assign officer. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsDispatching(false);
        }
    };

    const availableOfficers = officers.filter(o => o.status === "available");
    const busyOfficers = officers.filter(o => o.status === "busy");

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Officers on Duty</h3>
                    <Badge variant="outline" className="ml-2">{officers.length}</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchOfficers} disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {officers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto opacity-30 mb-2" />
                    <p className="text-sm">No officers registered yet.</p>
                    <p className="text-xs">Officers appear here when they log in.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Available Officers */}
                    {availableOfficers.length > 0 && (
                        <div>
                            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Available</p>
                            <div className="space-y-2">
                                {availableOfficers.map((officer) => (
                                    <div key={officer.phone} className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                                                <UserCheck className="h-4 w-4 text-green-500" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{officer.name}</p>
                                                <p className="text-xs text-muted-foreground">{officer.phone}</p>
                                            </div>
                                        </div>
                                        <Badge className="bg-green-500/20 text-green-600 border-0">Available</Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Busy Officers */}
                    {busyOfficers.length > 0 && (
                        <div>
                            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">On Assignment</p>
                            <div className="space-y-2">
                                {busyOfficers.map((officer) => (
                                    <div key={officer.phone} className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                                                <MapPin className="h-4 w-4 text-orange-500" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{officer.name}</p>
                                                <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                                                    {officer.current_assignment?.message || "Active assignment"}
                                                </p>
                                            </div>
                                        </div>
                                        <Badge className="bg-orange-500/20 text-orange-600 border-0">Busy</Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Dispatch Dialog */}
            {incident && (
                <>
                    <Button
                        className="w-full mt-4"
                        onClick={() => setIsDialogOpen(true)}
                        disabled={availableOfficers.length === 0}
                    >
                        <Send className="h-4 w-4 mr-2" />
                        Dispatch Officer to Incident
                    </Button>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Dispatch Officer</DialogTitle>
                                <DialogDescription>
                                    Assign an officer to respond to this {incident.type}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-4">
                                <div className="p-3 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">{incident.type.toUpperCase()}</p>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                        <MapPin className="h-3 w-3" />
                                        {incident.location?.address || incident.location?.landmark || "Unknown"}
                                    </p>
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Select Officer</label>
                                    <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="Choose an available officer" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableOfficers.map((officer) => (
                                                <SelectItem key={officer.phone} value={officer.phone}>
                                                    {officer.name} ({officer.phone})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleDispatch} disabled={!selectedOfficer || isDispatching}>
                                    {isDispatching ? "Dispatching..." : "Dispatch Now"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            )}
        </Card>
    );
};

export default OfficerDispatch;
