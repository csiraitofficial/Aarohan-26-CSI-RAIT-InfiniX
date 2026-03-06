import { cn } from "@/lib/utils";
import { Activity, Radio, Signal, Server, Camera, Box } from "lucide-react";

type DeviceType = "sensor" | "radio" | "repeater" | "gateway" | "camera" | "cabinet";

interface MapMarkerProps {
    type: DeviceType;
    selected?: boolean;
    onClick?: () => void;
}

export const MapMarker = ({ type, selected, onClick }: MapMarkerProps) => {
    const getMarkerColor = (type: DeviceType) => {
        switch (type) {
            case "sensor": return "bg-[hsl(211,85%,56%)]";
            case "radio": return "bg-[hsl(145,63%,42%)]";
            case "repeater": return "bg-[hsl(28,87%,62%)]";
            case "gateway": return "bg-[hsl(271,70%,60%)]";
            case "camera": return "bg-[hsl(45,88%,62%)]";
            case "cabinet": return "bg-[hsl(354,78%,63%)]";
            default: return "bg-gray-500";
        }
    };

    const getIcon = (type: DeviceType) => {
        switch (type) {
            case "sensor": return <Activity className="h-3 w-3 text-white" />;
            case "radio": return <Radio className="h-3 w-3 text-white" />;
            case "repeater": return <Signal className="h-3 w-3 text-white" />;
            case "gateway": return <Server className="h-3 w-3 text-white" />;
            case "camera": return <Camera className="h-3 w-3 text-white" />;
            case "cabinet": return <Box className="h-3 w-3 text-white" />;
        }
    };

    return (
        <div
            onClick={onClick}
            className={cn(
                "relative cursor-pointer transform transition-all duration-300 hover:scale-110",
                selected ? "scale-125 z-50" : "z-10"
            )}
        >
            {/* Pin Head */}
            <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white",
                getMarkerColor(type),
                selected ? "ring-4 ring-white/50" : ""
            )}>
                {getIcon(type)}
            </div>

            {/* Pin Point */}
            <div className={cn(
                "absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px]",
                type === "sensor" && "border-t-[hsl(211,85%,56%)]",
                type === "radio" && "border-t-[hsl(145,63%,42%)]",
                type === "repeater" && "border-t-[hsl(28,87%,62%)]",
                type === "gateway" && "border-t-[hsl(271,70%,60%)]",
                type === "camera" && "border-t-[hsl(45,88%,62%)]",
                type === "cabinet" && "border-t-[hsl(354,78%,63%)]"
            )} />

            {/* Pulse Effect for Selected/Active */}
            {selected && (
                <div className={cn(
                    "absolute -inset-2 rounded-full opacity-50 animate-ping",
                    getMarkerColor(type)
                )} />
            )}
        </div>
    );
};
