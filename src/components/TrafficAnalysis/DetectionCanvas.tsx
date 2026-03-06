import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { YOLOv11, DetectedObject } from '../../utils/yolo';

interface DetectionCanvasProps {
    model: YOLOv11;
    videoSource: string | null; // null for camera, string for video URL
    isCamera: boolean;
    threshold: number;
    onStatsUpdate: (stats: DetectedObject[]) => void;
}

export const DetectionCanvas: React.FC<DetectionCanvasProps> = ({
    model,
    videoSource,
    isCamera,
    threshold,
    onStatsUpdate
}) => {
    const webcamRef = useRef<Webcam>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef<number>();

    const drawDetections = (canvas: HTMLCanvasElement, detections: DetectedObject[]) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear previous drawings
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        detections.forEach(det => {
            const [x1, y1, x2, y2] = det.box;
            const width = x2 - x1;
            const height = y2 - y1;

            // Draw box
            ctx.strokeStyle = "#00FF00";
            ctx.lineWidth = 2;
            ctx.strokeRect(x1, y1, width, height);

            // Draw label
            ctx.fillStyle = "#00FF00";
            ctx.font = "16px Arial";
            ctx.fillText(`${det.label} ${(det.confidence * 100).toFixed(1)}%`, x1, y1 - 5);
        });
    };

    const detectFrame = useCallback(async () => {
        if (error) return;
        const video = isCamera ? webcamRef.current?.video : videoRef.current;
        const canvas = canvasRef.current;

        if (video && canvas && video.readyState === 4) {
            try {
                const detections = await model.detect(video, canvas, threshold);
                drawDetections(canvas, detections);
                onStatsUpdate(detections);
            } catch (e) {
                console.error("Detection error:", e);
            }
        }

        requestRef.current = requestAnimationFrame(detectFrame);
    }, [model, isCamera, threshold, onStatsUpdate, error]);

    useEffect(() => {
        const loadModel = async () => {
            try {
                setIsLoaded(false);
                setError(null);
                await model.load();
                setIsLoaded(true);
            } catch (error) {
                console.error("Model failed to load", error);
                setError("Failed to load model. Please ensure 'yolo11m.onnx' is in 'public/models/'.");
            }
        };
        loadModel();
    }, [model]);

    useEffect(() => {
        if (isLoaded && !error) {
            requestRef.current = requestAnimationFrame(detectFrame);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isLoaded, detectFrame, error]);

    return (
        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-border">
            {isCamera ? (
                <Webcam
                    ref={webcamRef}
                    className="absolute top-0 left-0 w-full h-full object-contain"
                    screenshotFormat="image/jpeg"
                />
            ) : (
                videoSource && (
                    <video
                        ref={videoRef}
                        src={videoSource}
                        className="absolute top-0 left-0 w-full h-full object-contain"
                        loop
                        muted
                        autoPlay
                        controls
                    />
                )
            )}
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
            {!isLoaded && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                    Loading Model...
                </div>
            )}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-500 p-4 text-center">
                    {error}
                </div>
            )}
        </div>
    );
};
