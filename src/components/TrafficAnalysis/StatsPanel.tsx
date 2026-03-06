import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, AlertTriangle, Activity, PlayCircle } from "lucide-react";
import { DetectedObject, TRAFFIC_LABELS } from '../../utils/yolo';

interface StatsPanelProps {
    stats: DetectedObject[];
    isCamera: boolean;
    onToggleSource: () => void;
    onVideoUpload: (file: File) => void;
    onDemoVideo: () => void;
    threshold: number;
    onThresholdChange: (val: number) => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
    stats,
    isCamera,
    onToggleSource,
    onVideoUpload,
    onDemoVideo,
    threshold,
    onThresholdChange
}) => {
    // Count objects
    const counts = stats.reduce((acc, curr) => {
        acc[curr.label] = (acc[curr.label] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const totalVehicles = (counts['car'] || 0) + (counts['bus'] || 0) + (counts['truck'] || 0);

    // Traffic Status Logic
    let statusColor = "bg-green-500";
    let statusText = "Low Traffic";

    if (totalVehicles > 15) {
        statusColor = "bg-red-500";
        statusText = "High Congestion";
    } else if (totalVehicles > 5) {
        statusColor = "bg-yellow-500";
        statusText = "Moderate Traffic";
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Live Statistics
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className={`p-4 rounded-lg ${statusColor} text-white flex items-center justify-between`}>
                        <span className="font-bold text-lg">{statusText}</span>
                        {statusText === "High Congestion" && <AlertTriangle className="h-6 w-6 animate-pulse" />}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-muted p-3 rounded-md text-center">
                            <div className="text-2xl font-bold">{counts['car'] || 0}</div>
                            <div className="text-xs text-muted-foreground">Cars</div>
                        </div>
                        <div className="bg-muted p-3 rounded-md text-center">
                            <div className="text-2xl font-bold">{counts['person'] || 0}</div>
                            <div className="text-xs text-muted-foreground">Pedestrians</div>
                        </div>
                        <div className="bg-muted p-3 rounded-md text-center">
                            <div className="text-2xl font-bold">{counts['bus'] || 0}</div>
                            <div className="text-xs text-muted-foreground">Buses</div>
                        </div>
                        <div className="bg-muted p-3 rounded-md text-center">
                            <div className="text-2xl font-bold">{counts['truck'] || 0}</div>
                            <div className="text-xs text-muted-foreground">Trucks</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <Button
                                variant={isCamera ? "default" : "outline"}
                                onClick={onToggleSource}
                                className="flex-1"
                            >
                                <Camera className="mr-2 h-4 w-4" /> Live Camera
                            </Button>
                            <div className="relative flex-1">
                                <Input
                                    type="file"
                                    accept="video/*"
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    onChange={(e) => e.target.files?.[0] && onVideoUpload(e.target.files[0])}
                                />
                                <Button variant={!isCamera ? "default" : "outline"} className="w-full">
                                    <Upload className="mr-2 h-4 w-4" /> Upload Video
                                </Button>
                            </div>
                        </div>
                        <Button variant="secondary" className="w-full" onClick={onDemoVideo}>
                            <PlayCircle className="mr-2 h-4 w-4" /> Load Demo Video (TrafficNM.mp4)
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>Confidence Threshold</span>
                            <span>{Math.round(threshold * 100)}%</span>
                        </div>
                        <Slider
                            value={[threshold * 100]}
                            min={10}
                            max={100}
                            step={1}
                            onValueChange={(val) => onThresholdChange(val[0] / 100)}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
