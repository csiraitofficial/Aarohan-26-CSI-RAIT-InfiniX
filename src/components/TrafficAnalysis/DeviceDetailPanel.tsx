import { useState } from "react";
import { Search, Battery, Signal, Settings, Info, ChevronLeft, ChevronRight, Camera, Radio, Server, Activity, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Device types based on Sensys colors
type DeviceType = "sensor" | "radio" | "repeater" | "gateway" | "camera" | "cabinet";

interface Device {
    id: string;
    name: string;
    type: DeviceType;
    status: "online" | "offline" | "warning";
    battery?: number;
    signal?: number;
    location: { lat: number; lng: number };
    lastUpdate: string;
}

const mockDevices: Device[] = [
    { id: "S-101", name: "Sensor Zone 5", type: "sensor", status: "online", battery: 85, signal: 92, location: { lat: 0, lng: 0 }, lastUpdate: "2 min ago" },
    { id: "C-201", name: "Camera 4", type: "camera", status: "online", location: { lat: 0, lng: 0 }, lastUpdate: "Live" },
    { id: "R-301", name: "Repeater North", type: "repeater", status: "warning", battery: 45, signal: 60, location: { lat: 0, lng: 0 }, lastUpdate: "15 min ago" },
    { id: "G-401", name: "Gateway Main", type: "gateway", status: "online", location: { lat: 0, lng: 0 }, lastUpdate: "1 min ago" },
];

export const DeviceDetailPanel = () => {
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(mockDevices[0]);
    const [searchQuery, setSearchQuery] = useState("");

    const getDeviceColor = (type: DeviceType) => {
        switch (type) {
            case "sensor": return "text-[hsl(211,85%,56%)] bg-[hsl(211,85%,56%)]/10 border-[hsl(211,85%,56%)]/20";
            case "radio": return "text-[hsl(145,63%,42%)] bg-[hsl(145,63%,42%)]/10 border-[hsl(145,63%,42%)]/20";
            case "repeater": return "text-[hsl(28,87%,62%)] bg-[hsl(28,87%,62%)]/10 border-[hsl(28,87%,62%)]/20";
            case "gateway": return "text-[hsl(271,70%,60%)] bg-[hsl(271,70%,60%)]/10 border-[hsl(271,70%,60%)]/20";
            case "camera": return "text-[hsl(45,88%,62%)] bg-[hsl(45,88%,62%)]/10 border-[hsl(45,88%,62%)]/20";
            case "cabinet": return "text-[hsl(354,78%,63%)] bg-[hsl(354,78%,63%)]/10 border-[hsl(354,78%,63%)]/20";
            default: return "text-gray-500 bg-gray-100 border-gray-200";
        }
    };

    const getDeviceIcon = (type: DeviceType) => {
        switch (type) {
            case "sensor": return <Activity className="h-4 w-4" />;
            case "radio": return <Radio className="h-4 w-4" />;
            case "repeater": return <Signal className="h-4 w-4" />;
            case "gateway": return <Server className="h-4 w-4" />;
            case "camera": return <Camera className="h-4 w-4" />;
            case "cabinet": return <Box className="h-4 w-4" />;
        }
    };

    return (
        <div className="flex h-full bg-background border-r border-border">
            {/* Left Sidebar - Device List */}
            <div className="w-80 flex flex-col border-r border-border bg-card/50 backdrop-blur-sm">
                <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <Settings className="h-5 w-5 text-primary" />
                        </div>
                        <h2 className="font-bold text-lg">SensConfig</h2>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 bg-background/50"
                        />
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {mockDevices.map((device) => (
                            <button
                                key={device.id}
                                onClick={() => setSelectedDevice(device)}
                                className={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all hover:bg-accent/50",
                                    selectedDevice?.id === device.id ? "bg-accent shadow-sm" : ""
                                )}
                            >
                                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center border", getDeviceColor(device.type))}>
                                    {getDeviceIcon(device.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{device.name}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{device.type}</p>
                                </div>
                                {device.status === "warning" && (
                                    <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                                )}
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* Right Panel - Device Details */}
            {selectedDevice ? (
                <div className="w-96 flex flex-col bg-card border-l border-border shadow-xl z-10">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-border">
                                <img src="https://ui-avatars.com/api/?name=Jasbir+S&background=random" alt="User" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Jasbir S.</p>
                                <p className="text-xs text-muted-foreground">Technician</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon">
                            <Settings className="h-4 w-4" />
                        </Button>
                    </div>

                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-6">
                            {/* Device Header */}
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground mb-4">Sensor Zone</h3>
                                <div className="aspect-square rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center border border-border shadow-inner mb-6 relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
                                    {/* 3D-like Device Representation */}
                                    <div className="relative z-10 transform transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                                        {selectedDevice.type === 'camera' ? (
                                            <Camera className="h-32 w-32 text-gray-400 drop-shadow-2xl" strokeWidth={1} />
                                        ) : (
                                            <Box className="h-32 w-32 text-gray-400 drop-shadow-2xl" strokeWidth={1} />
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Name</label>
                                        <Input value={selectedDevice.name} readOnly className="bg-muted/50" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Used For</label>
                                        <Input value="Stopbar Detection" readOnly className="bg-muted/50" />
                                    </div>
                                </div>
                            </div>

                            {/* Configuration */}
                            <div className="space-y-4 pt-4 border-t border-border">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">Sensitivity</label>
                                    <span className="text-xs font-mono bg-muted px-2 py-1 rounded">6</span>
                                </div>
                                <Slider defaultValue={[60]} max={100} step={1} className="py-4" />
                            </div>

                            {/* Status */}
                            <div className="space-y-4 pt-4 border-t border-border">
                                <div className="flex items-center gap-2 text-orange-500 bg-orange-500/10 p-3 rounded-lg border border-orange-500/20">
                                    <Info className="h-4 w-4" />
                                    <span className="text-xs font-medium">Sensor reporting delay</span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Battery className="h-3 w-3" />
                                            <span className="text-xs">Battery</span>
                                        </div>
                                        <p className="font-mono font-medium">{selectedDevice.battery || 100}%</p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Signal className="h-3 w-3" />
                                            <span className="text-xs">Signal</span>
                                        </div>
                                        <p className="font-mono font-medium">-{selectedDevice.signal || 45} dBm</p>
                                    </div>
                                </div>

                                <div className="space-y-2 text-xs text-muted-foreground">
                                    <div className="flex justify-between py-1 border-b border-border">
                                        <span>Factory ID</span>
                                        <span className="font-mono text-foreground">DC683</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-border">
                                        <span>Soft Version</span>
                                        <span className="font-mono text-foreground">221.5.3</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-border">
                                        <span>Extension Time</span>
                                        <span className="font-mono text-foreground">0</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            ) : null}
        </div>
    );
};
