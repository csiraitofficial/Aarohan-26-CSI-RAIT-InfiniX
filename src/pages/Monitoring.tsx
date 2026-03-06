import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Maximize2, X, RefreshCw, Server, Eye, EyeOff, Car, Truck, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { API_CONFIG } from "@/lib/apiConfig";
import { TrafficDataStore, Incident, Alert } from "@/lib/trafficOfficerData";
import { toast } from "sonner";

const BACKEND_URL = API_CONFIG.MONITORING;

interface CameraFeed {
  id: number;
  name: string;
  direction: string;
  hasVideo: boolean;
}

interface DetectionCounts {
  car: number;
  motorcycle: number;
  bus: number;
  truck: number;
}

const Monitoring = () => {
  const { t } = useTranslation();
  const [cameras, setCameras] = useState<CameraFeed[]>([
    { id: 1, name: "Camera 1", direction: "North", hasVideo: false },
    { id: 2, name: "Camera 2", direction: "East", hasVideo: false },
    { id: 3, name: "Camera 3", direction: "South", hasVideo: false },
    { id: 4, name: "Camera 4", direction: "West", hasVideo: false },
    { id: 5, name: "Junction 18", direction: "South", hasVideo: false },
  ]);
  const [testVideoSrc, setTestVideoSrc] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectionEnabled, setDetectionEnabled] = useState<Record<number, boolean>>({
    1: true, 2: true, 3: true, 4: true, 5: true
  });
  const [detectionCounts, setDetectionCounts] = useState<Record<number, DetectionCounts>>({});
  const [fullscreenCamera, setFullscreenCamera] = useState<number | null>(null);
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "checking">("checking");

  // Check backend and load cameras on mount
  useEffect(() => {
    loadCamerasFromBackend();
  }, []);

  // Poll detection counts every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      cameras.forEach(cam => {
        if (cam.hasVideo && detectionEnabled[cam.id]) {
          fetchDetectionCounts(cam.id);
        }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [cameras, detectionEnabled]);

  const loadCamerasFromBackend = async () => {
    setBackendStatus("checking");
    try {
      const response = await fetch(`${BACKEND_URL}/api/cctv/videos`);
      if (response.ok) {
        setBackendStatus("online");
        const data = await response.json();
        setCameras(prev => prev.map(cam => {
          if (cam.id === 5) return cam; // Protect local camera state
          const backendCam = data.cameras.find((c: any) => c.camera_id === cam.id);
          return { ...cam, hasVideo: backendCam?.has_video || false };
        }));
      } else {
        setBackendStatus("offline");
      }
    } catch {
      setBackendStatus("offline");
    }
  };

  const fetchDetectionCounts = async (cameraId: number) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/cctv/detections/${cameraId}`);
      if (response.ok) {
        const data = await response.json();
        setDetectionCounts(prev => ({ ...prev, [cameraId]: data.counts }));
      }
    } catch {
      // Ignore errors
    }
  };

  const toggleDetection = (cameraId: number) => {
    setDetectionEnabled(prev => ({ ...prev, [cameraId]: !prev[cameraId] }));
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setTestVideoSrc(url);
      setCameras(prev => prev.map(cam =>
        cam.id === 5 ? { ...cam, hasVideo: true } : cam
      ));

      // Auto-start detection analysis with actual file
      analyzeVideoForIncidents(file.name, file);
    }
  };

  const analyzeVideoForIncidents = async (fileName: string, file?: File) => {
    setIsAnalyzing(true);
    toast.info("Analyzing footage with AI...", {
      description: "Running YOLOv8 detection models on the uploaded video."
    });

    let detectionType: 'accident' | 'emergency' | null = null;
    let confidence = 0;

    // Try real AI detection via backend
    if (file) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_CONFIG.CCTV}/api/cctv/analyze-junction`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          console.log("AI Detection result:", data);

          if (data.detection_type === 'emergency') {
            detectionType = 'emergency';
            confidence = data.confidence;
          } else if (data.detection_type === 'accident') {
            detectionType = 'accident';
            confidence = data.confidence;
          }
          // else: data.detection_type === 'none' — no detection
        } else {
          console.warn("AI detection endpoint returned:", response.status);
          // Fallback to filename-based detection
          const isMockAccident = fileName.toLowerCase().includes("accident") || fileName.toLowerCase().includes("crash");
          const isMockAmbulance = fileName.toLowerCase().includes("ambulance") || fileName.toLowerCase().includes("emergency");
          if (isMockAmbulance) detectionType = 'emergency';
          else if (isMockAccident) detectionType = 'accident';
        }
      } catch (err) {
        console.warn("AI backend unavailable, falling back to filename detection:", err);
        // Fallback to filename-based detection
        const isMockAccident = fileName.toLowerCase().includes("accident") || fileName.toLowerCase().includes("crash");
        const isMockAmbulance = fileName.toLowerCase().includes("ambulance") || fileName.toLowerCase().includes("emergency");
        if (isMockAmbulance) detectionType = 'emergency';
        else if (isMockAccident) detectionType = 'accident';
      }
    } else {
      // No file object, use filename-based fallback
      const isMockAccident = fileName.toLowerCase().includes("accident") || fileName.toLowerCase().includes("crash");
      const isMockAmbulance = fileName.toLowerCase().includes("ambulance") || fileName.toLowerCase().includes("emergency");
      if (isMockAmbulance) detectionType = 'emergency';
      else if (isMockAccident) detectionType = 'accident';
    }

    setIsAnalyzing(false);

    if (detectionType) {
      const incidentId = `INC-AUTO-${Math.floor(Math.random() * 900) + 100}`;
      const alertId = `ALT-AUTO-${Math.floor(Math.random() * 900) + 100}`;

      const newIncident: Incident = {
        id: incidentId,
        type: detectionType === 'emergency' ? 'sos' : 'accident',
        severity: 'high',
        status: 'reported',
        location: {
          coordinates: [19.0330, 73.0297],
          address: "Nerul, Navi Mumbai",
          landmark: "Nerul Node"
        },
        reportedBy: "AI Detection System",
        reportedAt: new Date().toISOString(),
        assignedOfficers: [],
        description: detectionType === 'emergency'
          ? `Automated detection: Emergency vehicle (Ambulance) detected at Junction 18 (${fileName}). Confidence: ${(confidence * 100).toFixed(1)}%. Requesting green corridor.`
          : `Automated detection: Potential collision identified in Junction 18 footage (${fileName}). Confidence: ${(confidence * 100).toFixed(1)}%.`,
        timeline: { reported: new Date().toISOString() },
        affectedLanes: 2,
        notes: [`AI detection via Junction 18 upload (${detectionType}, confidence: ${(confidence * 100).toFixed(1)}%)`]
      };

      const newAlert: Alert = {
        id: alertId,
        type: 'incident',
        priority: 'high',
        message: detectionType === 'emergency' ? `Ambulance (Emergency) detected! Green corridor requested for Signal 18.` : `ACCIDENT DETECTED: Automated alert from Junction 18 feed.`,
        location: "Junction 18 / Nerul",
        coordinates: [19.0330, 73.0297],
        timestamp: new Date().toISOString(),
        read: false
      };

      // 1. Update Local Data Store
      TrafficDataStore.addIncident(newIncident);
      TrafficDataStore.addAlert(newAlert);

      // 2. Sync with Backend
      try {
        // Sync Incident & Alert to Shared Store (Cross-Device)
        await fetch(`${API_CONFIG.SIMULATION}/api/incidents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newIncident)
        });
        await fetch(`${API_CONFIG.SIMULATION}/api/alerts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newAlert)
        });

        // 3. Trigger Telegram Broadcast
        const telegramResp = await fetch(`${API_CONFIG.SIMULATION}/api/alert/accident`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: newIncident.location.address,
            severity: "high",
            description: newIncident.description,
            lat: newIncident.location.coordinates[0],
            lng: newIncident.location.coordinates[1]
          })
        });

        if (telegramResp.ok) {
          toast.success(
            detectionType === 'emergency' ? "🚑 Emergency Vehicle Detected!" : "⚠️ Accident Detected!",
            {
              description: detectionType === 'emergency'
                ? `Green corridor requested. Confidence: ${(confidence * 100).toFixed(1)}%`
                : `Alert sent. Confidence: ${(confidence * 100).toFixed(1)}%`
            }
          );
        }

        // 4. Trigger simulation events on BOTH main (MAPPO) and Tier 1 backends
        const simTargets = [
          { name: "Main (MAPPO)", url: API_CONFIG.SIMULATION },
          { name: "Tier 1", url: API_CONFIG.TIER1 },
        ];

        for (const sim of simTargets) {
          try {
            if (detectionType === 'emergency') {
              await fetch(`${sim.url}/api/events/emergency`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  path: ["S18"],
                  vehicle_type: "ambulance"
                })
              });
              console.log(`${sim.name} Simulation: Emergency Green Corridor at S18 triggered.`);
            } else {
              await fetch(`${sim.url}/api/events/accident`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blocked: ["S18"] })
              });
              console.log(`${sim.name} Simulation: Accident at S18 triggered.`);
            }
          } catch (simError) {
            console.warn(`${sim.name} Simulation sync failed (ensure sim is running):`, simError);
          }
        }

      } catch (error) {
        console.error("Failed to sync incident", error);
      }
    } else {
      toast.success("Analysis Complete", {
        description: "No incidents detected in the footage."
      });
    }
  };

  const getDirectionColor = (direction: string) => {
    const colors: Record<string, string> = {
      "North": "bg-blue-600",
      "East": "bg-green-600",
      "South": "bg-yellow-600",
      "West": "bg-purple-600"
    };
    return colors[direction] || "bg-gray-600";
  };

  const getVideoSrc = (cameraId: number, withDetection: boolean) => {
    if (cameraId === 5) {
      console.log("Getting Junction 18 source:", testVideoSrc);
      return testVideoSrc || "";
    }
    if (withDetection) {
      return `${BACKEND_URL}/api/cctv/detect/${cameraId}`;
    }
    return `${BACKEND_URL}/api/cctv/video/${cameraId}`;
  };

  const activeCount = cameras.filter(c => c.hasVideo).length;
  const totalVehicles = Object.values(detectionCounts).reduce((sum, counts) => {
    return sum + (counts?.car || 0) + (counts?.motorcycle || 0) + (counts?.bus || 0) + (counts?.truck || 0);
  }, 0);

  const backendOk = backendStatus === "online"; // Helper for the new badge logic

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">📹 {t('monitoring.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('monitoring.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className={`px-3 py-1 flex items-center gap-2 ${backendStatus === "online" ? "border-green-500 text-green-500" : "border-red-500 text-red-500"
            }`}>
            <Server className="h-4 w-4" />
            {backendStatus === "online" ? t('monitoring.backendStatus.online') : t('monitoring.backendStatus.offline')}
          </Badge>
          <Button variant="outline" size="sm" onClick={loadCamerasFromBackend}>
            <RefreshCw className="h-4 w-4 mr-2" />{t('monitoring.refresh')}
          </Button>
          <Badge className="bg-primary text-lg px-4 py-2">
            <Car className="h-4 w-4 mr-2" />
            {t('monitoring.vehiclesDetected', { count: totalVehicles })}
          </Badge>
        </div>
      </div>

      {/* 2x2 Camera Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cameras.map((camera) => (
          <Card key={camera.id} className={`p-4 bg-gradient-card border-2 transition-all ${camera.hasVideo ? 'border-green-500/40' : 'border-border'
            }`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge className={`${getDirectionColor(camera.direction)} text-white`}>
                  {camera.direction}
                </Badge>
                <span className="font-semibold text-foreground">{camera.name}</span>
              </div>
              <div className="flex items-center gap-3">
                {camera.hasVideo && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t('monitoring.yolo')}</span>
                    <Switch
                      checked={detectionEnabled[camera.id]}
                      onCheckedChange={() => toggleDetection(camera.id)}
                    />
                    {detectionEnabled[camera.id] ? (
                      <Eye className="h-4 w-4 text-green-500" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}
                {camera.hasVideo ? (
                  <Badge className="bg-green-600 text-white animate-pulse">
                    <Video className="h-3 w-3 mr-1" /> {t('monitoring.live')}
                  </Badge>
                ) : (
                  <Badge className="bg-muted text-muted-foreground">
                    <VideoOff className="h-3 w-3 mr-1" /> {t('monitoring.noFeed')}
                  </Badge>
                )}
                {camera.hasVideo && (
                  <Button variant="ghost" size="sm" onClick={() => setFullscreenCamera(camera.id)} className="h-8 w-8 p-0">
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Video Display */}
            <div className="relative aspect-video bg-gradient-to-br from-card to-muted rounded-lg overflow-hidden">
              {camera.hasVideo ? (
                (detectionEnabled[camera.id] && camera.id !== 5) ? (
                  <img
                    src={getVideoSrc(camera.id, true)}
                    alt={`Camera ${camera.id} with detection`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    key={testVideoSrc || `cam-${camera.id}`}
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    controls={camera.id === 5}
                    onLoadedData={() => console.log(`Camera ${camera.id} loaded`)}
                    onError={(e) => console.error(`Camera ${camera.id} error`, e)}
                  >
                    <source src={getVideoSrc(camera.id, false)} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                )
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <VideoOff className="h-16 w-16 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">{t('monitoring.noFeed')}</p>
                  {camera.id === 5 ? (
                    <div className="flex flex-col items-center gap-4">
                      <Button
                        variant="default"
                        size="lg"
                        className="bg-primary/90 hover:bg-primary shadow-lg border-2 border-white/20 px-8 py-6 rounded-2xl group transition-all duration-300"
                        onClick={() => document.getElementById('test-video-upload')?.click()}
                        disabled={isAnalyzing}
                      >
                        <Upload className="h-6 w-6 mr-3 group-hover:scale-110 transition-transform" />
                        <div className="flex flex-col items-start">
                          <span className="text-lg font-bold">
                            {isAnalyzing ? "Analyzing..." : t('monitoring.uploadTestVideo')}
                          </span>
                          <span className="text-xs opacity-70 font-normal">Supports MP4, WebM, OGG</span>
                        </div>
                      </Button>
                      <input
                        id="test-video-upload"
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleVideoUpload}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {t('monitoring.noFeedHint', { cameraId: camera.id })}
                    </p>
                  )}
                </div>
              )}

              {/* Live + Detection indicator */}
              {camera.hasVideo && (
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-xs text-white bg-black/60 px-2 py-1 rounded">
                    {detectionEnabled[camera.id] ? t('monitoring.yoloActive') : t('monitoring.rec')}
                  </span>
                </div>
              )}
            </div>

            {/* Detection Counts */}
            {camera.hasVideo && detectionEnabled[camera.id] && detectionCounts[camera.id] && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {detectionCounts[camera.id].car > 0 && (
                  <Badge variant="outline" className="border-blue-500 text-blue-500">
                    🚗 {detectionCounts[camera.id].car} {t('monitoring.cars')}
                  </Badge>
                )}
                {detectionCounts[camera.id].motorcycle > 0 && (
                  <Badge variant="outline" className="border-green-500 text-green-500">
                    🏍️ {detectionCounts[camera.id].motorcycle} Bikes
                  </Badge>
                )}
                {detectionCounts[camera.id].bus > 0 && (
                  <Badge variant="outline" className="border-orange-500 text-orange-500">
                    🚌 {detectionCounts[camera.id].bus} Buses
                  </Badge>
                )}
                {detectionCounts[camera.id].truck > 0 && (
                  <Badge variant="outline" className="border-purple-500 text-purple-500">
                    🚛 {detectionCounts[camera.id].truck} Trucks
                  </Badge>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Fullscreen Modal */}
      {fullscreenCamera && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-4 right-4 text-white hover:bg-white/20 z-10"
            onClick={() => setFullscreenCamera(null)}
          >
            <X className="h-6 w-6" />
          </Button>

          <div className="absolute top-4 left-4 flex items-center gap-4 z-10">
            <span className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></span>
            <span className="text-white font-bold">LIVE - YOLO DETECTION</span>
          </div>

          <div className="max-w-6xl w-full p-4">
            {(detectionEnabled[fullscreenCamera] && fullscreenCamera !== 5) ? (
              <img
                src={getVideoSrc(fullscreenCamera, true)}
                alt="Fullscreen detection"
                className="w-full rounded-lg"
              />
            ) : (
              <video
                src={getVideoSrc(fullscreenCamera, false)}
                className="w-full rounded-lg"
                autoPlay
                loop
                muted
                playsInline
                controls={fullscreenCamera === 5}
              />
            )}
            <div className="text-center mt-4">
              <Badge className={`${getDirectionColor(cameras.find(c => c.id === fullscreenCamera)?.direction || '')} text-white text-lg px-4 py-2`}>
                {cameras.find(c => c.id === fullscreenCamera)?.name}
              </Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Monitoring;
