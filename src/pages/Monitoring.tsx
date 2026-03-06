import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Maximize2, X, RefreshCw, Server, Eye, EyeOff, Car, Truck } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { API_CONFIG } from "@/lib/apiConfig";

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
  ]);
  const [detectionEnabled, setDetectionEnabled] = useState<Record<number, boolean>>({
    1: true, 2: true, 3: true, 4: true
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
                detectionEnabled[camera.id] ? (
                  <img
                    src={getVideoSrc(camera.id, true)}
                    alt={`Camera ${camera.id} with detection`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={getVideoSrc(camera.id, false)}
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                )
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <VideoOff className="h-16 w-16 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">{t('monitoring.noFeed')}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {t('monitoring.noFeedHint', { cameraId: camera.id })}
                  </p>
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
            <img
              src={getVideoSrc(fullscreenCamera, true)}
              alt="Fullscreen detection"
              className="w-full rounded-lg"
            />
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
