import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Upload, Image as ImageIcon, Video, AlertCircle, CheckCircle2, FileImage, X, Download, Clock, MapPin, Construction, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrafficDataStore, Incident, Alert } from "@/lib/trafficOfficerData";
import { API_CONFIG } from "@/lib/apiConfig";
import { addIncident, addAlert } from "@/lib/sharedDataSync";
import { useEffect } from "react";

interface DetectionResult {
    id: string;
    filename: string;
    type: 'image' | 'video';
    uploadedAt: Date;
    potholeCount: number;
    severity: 'low' | 'medium' | 'high';
    detections: {
        x: number;
        y: number;
        width: number;
        height: number;
        confidence: number;
        severity: 'low' | 'medium' | 'high';
    }[];
    processedUrl?: string;
    streamUrl?: string;
}

const PotholeDetection = () => {
    const { t } = useTranslation();
    const [isDragging, setIsDragging] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentResult, setCurrentResult] = useState<DetectionResult | null>(null);

    const [detectionHistory, setDetectionHistory] = useState<DetectionResult[]>([]);
    const [userReports, setUserReports] = useState<Incident[]>([]);
    const [selectedReport, setSelectedReport] = useState<Incident | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    // Load user reports on mount
    useEffect(() => {
        const incidents = TrafficDataStore.loadIncidents();

        // Check if incidents exists and is an array before filtering
        if (Array.isArray(incidents)) {
            const potholeReports = incidents.filter(i => i.type === 'pothole');
            setUserReports(potholeReports);
        } else {
            console.warn("TrafficDataStore returned invalid data:", incidents);
            setUserReports([]); // Fallback to empty array
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        const validFile = files.find(file =>
            file.type.startsWith('image/') || file.type.startsWith('video/')
        );

        if (validFile) {
            processFile(validFile);
        } else {
            toast({
                title: t('potholeDetection.toasts.invalidType'),
                description: t('potholeDetection.toasts.invalidTypeDesc'),
                variant: "destructive",
            });
        }
    }, [toast]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const processFile = (file: File) => {
        setUploadedFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);

        toast({
            title: t('potholeDetection.toasts.uploaded'),
            description: t('potholeDetection.toasts.ready', { name: file.name }),
        });
    };

    const runDetection = async () => {
        if (!uploadedFile) return;

        setIsProcessing(true);

        try {
            const isVideo = uploadedFile.type.startsWith('video/');

            // Create FormData to send file to backend
            const formData = new FormData();
            formData.append(isVideo ? 'video' : 'image', uploadedFile);

            // Call appropriate backend API endpoint
            const endpoint = isVideo ? `${API_CONFIG.POTHOLE}/detect-video` : `${API_CONFIG.POTHOLE}/detect`;

            const response = await fetch(endpoint, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Detection failed');
            }

            // Create result object from API response
            const result: DetectionResult = {
                id: Date.now().toString(),
                filename: uploadedFile.name,
                type: isVideo ? 'video' : 'image',
                uploadedAt: new Date(),
                potholeCount: data.potholeCount || 0,
                severity: isVideo ? 'medium' : data.severity,
                detections: data.detections || [],
                processedUrl: data.processedVideoUrl
                    ? `${API_CONFIG.POTHOLE}${data.processedVideoUrl}`
                    : previewUrl || undefined,
                streamUrl: data.streamUrl ? `${API_CONFIG.POTHOLE}${data.streamUrl}` : undefined
            };

            setCurrentResult(result);
            setDetectionHistory(prev => [result, ...prev]);

            toast({
                title: isVideo ? t('potholeDetection.toasts.liveStarted') : t('potholeDetection.toasts.complete'),
                description: isVideo
                    ? t('potholeDetection.toasts.processingLive')
                    : t('potholeDetection.toasts.found', { count: data.potholeCount }),
            });

            // If potholes were detected, automatically raise an incident + alert
            if (result.potholeCount > 0) {
                const createdAt = new Date().toISOString();
                const reporterPhone = localStorage.getItem("userPhone") || undefined;

                const createAndSyncPotholeIncident = async (latitude: number, longitude: number, address: string) => {
                    const incidentId = `POT-AI-${Date.now()}`;

                    const potholeIncident: Incident = {
                        id: incidentId,
                        type: "pothole",
                        severity: result.severity,
                        status: "reported",
                        location: {
                            coordinates: [latitude, longitude],
                            address,
                            landmark: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`
                        },
                        reportedBy: "AI Pothole Detection",
                        reportedAt: createdAt,
                        assignedOfficers: [],
                        description: `AI detected ${result.potholeCount} pothole(s) from ${result.filename} near ${address}.`,
                        timeline: {
                            reported: createdAt
                        },
                        affectedLanes: 1,
                        notes: ["Auto-generated from pothole detection module"],
                        reporterPhone,
                    };

                    const potholeAlert: Alert = {
                        id: `ALT-POT-${Date.now()}`,
                        type: "incident",
                        priority: result.severity === "high" ? "high" : "medium",
                        message: `🕳️ Pothole detected (${result.potholeCount}) near ${address}`,
                        location: address,
                        coordinates: [latitude, longitude],
                        reporterPhone,
                        timestamp: createdAt,
                        read: false,
                    };

                    try {
                        // Sync with backend so admin dashboard/incidents see it
                        await addIncident(potholeIncident as any);
                        await addAlert(potholeAlert as any);
                    } catch (syncError) {
                        console.error("Failed to sync pothole incident/alert:", syncError);
                    }

                    // Also save locally so dashboards update on this device
                    TrafficDataStore.addIncident(potholeIncident);
                    TrafficDataStore.addAlert(potholeAlert);
                    setUserReports(prev => [potholeIncident, ...prev]);
                };

                if ("geolocation" in navigator) {
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            const { latitude, longitude } = position.coords;
                            let address = "Pothole detection location";

                            try {
                                // Reverse geocode using TomTom API (same as SOS flow)
                                const resp = await fetch(
                                    `https://api.tomtom.com/search/2/reverseGeocode/${latitude},${longitude}.json?key=riFTeh0wpjONJX0XItCu3qmHWF657Mia`
                                );
                                const geo = await resp.json();
                                if (geo.addresses && geo.addresses.length > 0) {
                                    address = geo.addresses[0].address.freeformAddress;
                                }
                            } catch (geoError) {
                                console.error("Reverse geocoding for pothole detection failed:", geoError);
                            }

                            await createAndSyncPotholeIncident(latitude, longitude, address);
                        },
                        async (error) => {
                            console.error("Geolocation error for pothole detection:", error);
                            // Fallback to default city coordinates
                            const fallbackLat = 22.3072;
                            const fallbackLng = 73.1812;
                            const fallbackAddress = "Pothole detected (location approximate)";
                            await createAndSyncPotholeIncident(fallbackLat, fallbackLng, fallbackAddress);
                        },
                        { enableHighAccuracy: true, timeout: 10000 }
                    );
                } else {
                    // Geolocation not supported - still raise an incident with generic location
                    const fallbackLat = 22.3072;
                    const fallbackLng = 73.1812;
                    const fallbackAddress = "Pothole detected (location unknown)";
                    await createAndSyncPotholeIncident(fallbackLat, fallbackLng, fallbackAddress);
                }
            }
        } catch (error) {
            console.error('Detection error:', error);
            toast({
                title: t('potholeDetection.toasts.failed'),
                description: error instanceof Error ? error.message : t('potholeDetection.toasts.failed'),
                variant: "destructive",
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const clearUpload = () => {
        setUploadedFile(null);
        setPreviewUrl(null);
        setCurrentResult(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
        switch (severity) {
            case 'low': return 'bg-green-500';
            case 'medium': return 'bg-yellow-500';
            case 'high': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    };

    const totalPotholes = detectionHistory.reduce((sum, item) => sum + item.potholeCount, 0);
    const avgSeverity = detectionHistory.length > 0
        ? detectionHistory.filter(h => h.severity === 'high').length > detectionHistory.length / 2
            ? 'high'
            : 'medium'
        : 'low';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-foreground">{t('potholeDetection.title')}</h1>
                <p className="text-muted-foreground mt-1">{t('potholeDetection.subtitle')}</p>
            </div>


            <div className="max-w-4xl mx-auto">
                <Tabs defaultValue="detect" className="w-full">
                    <TabsList className="grid grid-cols-2 mb-8">
                        <TabsTrigger value="detect">
                            <Construction className="h-4 w-4 mr-2" />
                            {t('potholeDetection.tabs.ai')}
                        </TabsTrigger>
                        <TabsTrigger value="reports">
                            <MessageSquare className="h-4 w-4 mr-2" />
                            {t('potholeDetection.tabs.reports')} ({userReports.length})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="detect" className="space-y-6">
                        {/* Upload Zone */}
                        {!uploadedFile ? (
                            <Card className="p-8 bg-gradient-card border-2 border-dashed border-border hover:border-primary/50 transition-all">
                                {/* ... existing upload content ... */}
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`flex flex-col items-center justify-center py-12 ${isDragging ? 'bg-primary/10 rounded-lg' : ''
                                        }`}
                                >
                                    <Upload className={`h-16 w-16 mb-4 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                                    <h3 className="text-xl font-semibold mb-2">{t('potholeDetection.upload.title')}</h3>
                                    <p className="text-muted-foreground mb-4">{t('potholeDetection.upload.desc')}</p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,video/*"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                    <Button onClick={() => fileInputRef.current?.click()}>
                                        <FileImage className="h-4 w-4 mr-2" />
                                        {t('potholeDetection.upload.select')}
                                    </Button>
                                    <p className="text-xs text-muted-foreground mt-4">
                                        {t('potholeDetection.upload.formats')}
                                    </p>
                                </div>
                            </Card>
                        ) : (
                            <>
                                {/* Preview Card */}
                                <Card className="p-4 bg-gradient-card border-2 border-primary/40">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            {uploadedFile.type.startsWith('image/') ? (
                                                <ImageIcon className="h-5 w-5 text-primary" />
                                            ) : (
                                                <Video className="h-5 w-5 text-primary" />
                                            )}
                                            <span className="font-semibold">{uploadedFile.name}</span>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={clearUpload}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {/* Preview */}
                                    <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
                                        {uploadedFile.type.startsWith('image/') ? (
                                            <img
                                                src={previewUrl || ''}
                                                alt="Preview"
                                                className="w-full h-full object-contain"
                                            />
                                        ) : (
                                            currentResult?.streamUrl ? (
                                                <div className="relative w-full h-full">
                                                    <img
                                                        src={currentResult.streamUrl}
                                                        alt="Live Detection Stream"
                                                        className="w-full h-full object-contain"
                                                    />
                                                    <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse flex items-center gap-2 shadow-lg">
                                                        <span className="w-2 h-2 bg-white rounded-full"></span>
                                                        {t('potholeDetection.messages.liveDetection')}
                                                    </div>
                                                </div>
                                            ) : (
                                                <video
                                                    src={currentResult?.processedUrl && currentResult.processedUrl.includes('processed')
                                                        ? currentResult.processedUrl
                                                        : previewUrl || ''}
                                                    className="w-full h-full object-contain"
                                                    controls
                                                    key={currentResult?.processedUrl || previewUrl}
                                                />
                                            )
                                        )}

                                        {/* Detection Overlays */}
                                        {uploadedFile.type.startsWith('image/') && currentResult && currentResult.detections.map((detection, idx) => (
                                            <div
                                                key={idx}
                                                className="absolute border-4 border-red-500 rounded"
                                                style={{
                                                    left: `${detection.x}%`,
                                                    top: `${detection.y}%`,
                                                    width: `${detection.width}%`,
                                                    height: `${detection.height}%`,
                                                }}
                                            >
                                                <div className="absolute -top-6 left-0 bg-red-500 text-white text-xs px-2 py-1 rounded">
                                                    {(detection.confidence * 100).toFixed(0)}%
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 mt-4">
                                        <Button
                                            onClick={runDetection}
                                            disabled={isProcessing}
                                            className="flex-1"
                                        >
                                            {isProcessing ? (
                                                <>
                                                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                                                    {t('potholeDetection.actions.processing')}
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                                    {t('potholeDetection.actions.run')}
                                                </>
                                            )}
                                        </Button>
                                        {currentResult && (
                                            <Button variant="outline">
                                                <Download className="h-4 w-4 mr-2" />
                                                {t('potholeDetection.actions.export')}
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            </>
                        )}
                    </TabsContent>

                    <TabsContent value="reports">
                        <div className="space-y-4">
                            {userReports.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground bg-gray-50 rounded-lg">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                    <p>{t('potholeDetection.messages.noReports')}</p>
                                </div>
                            ) : (
                                userReports.map(report => (
                                    <Card key={report.id} className="p-4 bg-white hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge variant={report.status === 'resolved' ? 'default' : 'destructive'}>
                                                        {report.status.toUpperCase()}
                                                    </Badge>
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(report.reportedAt).toLocaleString()}
                                                    </span>
                                                </div>
                                                <h3 className="font-semibold text-lg">{report.location.address}</h3>
                                                <p className="text-gray-600 mt-1">{report.description}</p>
                                                {report.notes.length > 0 && (
                                                    <div className="mt-2 text-xs bg-gray-100 p-2 rounded">
                                                        {t('potholeDetection.details.notes')}: {report.notes.join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => setSelectedReport(report)}>{t('potholeDetection.actions.view')}</Button>
                                        </div>
                                    </Card>
                                ))
                            )}
                        </div>
                    </TabsContent>
                </Tabs>

                <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>{t('potholeDetection.details.title')}</DialogTitle>
                            <DialogDescription>
                                {selectedReport && t('potholeDetection.details.reportedOn', { date: new Date(selectedReport.reportedAt).toLocaleString() })}
                            </DialogDescription>
                        </DialogHeader>
                        {selectedReport && (
                            <div className="space-y-4 py-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-medium leading-none">{t('potholeDetection.details.location')}</h4>
                                    <p className="text-sm text-muted-foreground">{selectedReport.location.address}</p>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-sm font-medium leading-none">{t('potholeDetection.details.description')}</h4>
                                    <p className="text-sm text-muted-foreground">{selectedReport.description}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-medium leading-none">{t('potholeDetection.details.severity')}</h4>
                                        <Badge variant={selectedReport.severity === 'high' ? 'destructive' : 'default'} className="mt-1">
                                            {selectedReport.severity.toUpperCase()}
                                        </Badge>
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-medium leading-none">{t('potholeDetection.details.status')}</h4>
                                        <Badge variant="outline" className="mt-1">
                                            {selectedReport.status.toUpperCase()}
                                        </Badge>
                                    </div>
                                </div>
                                {selectedReport.notes && selectedReport.notes.length > 0 && (
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-medium leading-none">{t('potholeDetection.details.notes')}</h4>
                                        <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                                            {selectedReport.notes.join(', ')}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default PotholeDetection;