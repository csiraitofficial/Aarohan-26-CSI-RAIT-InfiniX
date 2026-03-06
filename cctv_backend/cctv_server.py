#!/usr/bin/env python3


import os
import logging
import threading
import time
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import shutil
import json

# Setup
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cctv_server")

# Video upload directory
CCTV_UPLOAD_DIR = PROJECT_ROOT / "public" / "videos"
CCTV_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Camera info file
CAMERA_INFO_FILE = CCTV_UPLOAD_DIR / "cameras.json"

PORT = 8785

app = FastAPI(title="CCTV Monitoring Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== YOLO Detection Setup =====
yolo_model = None
yolo_available = False
DEVICE = "cpu"

try:
    import torch
    if torch.cuda.is_available():
        DEVICE = "cuda"
        logger.info(f"🚀 GPU detected: {torch.cuda.get_device_name(0)}")
    else:
        logger.info("ℹ️ No GPU detected, using CPU")
except ImportError:
    pass

try:
    from ultralytics import YOLO
    import cv2
    logger.info(f"Loading YOLO model on {DEVICE}...")
    yolo_model = YOLO("yolov8n.pt")
    yolo_model.to(DEVICE)
    yolo_available = True
    logger.info(f"✅ YOLO model loaded on {DEVICE}!")
except ImportError:
    logger.warning("⚠️ ultralytics not installed. Detection will be disabled.")
    logger.warning("   Install with: pip install ultralytics opencv-python")
except Exception as e:
    logger.warning(f"⚠️ YOLO loading failed: {e}")

# Vehicle class IDs in COCO dataset (including emergency vehicles)
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
EMERGENCY_CLASSES = {7: "truck"}  # Trucks flagged for ambulance/fire truck visual check

# Detection counts per camera
detection_counts: Dict[int, Dict[str, int]] = {1: {}, 2: {}, 3: {}, 4: {}}
detection_lock = threading.Lock()


def load_camera_info() -> dict:
    if CAMERA_INFO_FILE.exists():
        with open(CAMERA_INFO_FILE) as f:
            return json.load(f)
    return {}

def save_camera_info(info: dict):
    with open(CAMERA_INFO_FILE, "w") as f:
        json.dump(info, f, indent=2)


@app.get("/")
def root():
    return {
       "name": "CCTV Monitoring Server",
        "version": "1.0.0",
        "port": PORT,
        "yolo_available": yolo_available,
        "upload_dir": str(CCTV_UPLOAD_DIR)
    }


@app.post("/api/cctv/upload/{camera_id}")
async def upload_cctv_video(camera_id: int, file: UploadFile = File(...)):
    """Upload a video file for a specific camera (1-4)"""
    if camera_id < 1 or camera_id > 4:
        raise HTTPException(400, "Camera ID must be 1-4")
    
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(400, "Only video files are allowed")
    
    ext = Path(file.filename).suffix if file.filename else ".mp4"
    video_path = CCTV_UPLOAD_DIR / f"camera_{camera_id}{ext}"
    
    # Remove old file if exists
    for old_file in CCTV_UPLOAD_DIR.glob(f"camera_{camera_id}.*"):
        if old_file.suffix.lower() in [".mp4", ".webm", ".mov", ".avi"]:
            old_file.unlink()
    
    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update camera info
    info = load_camera_info()
    info[str(camera_id)] = {
        "filename": video_path.name,
        "original_name": file.filename,
        "size": video_path.stat().st_size,
    }
    save_camera_info(info)
    
    logger.info(f"📹 Uploaded video for camera {camera_id}: {file.filename}")
    
    return {
        "status": "uploaded",
        "camera_id": camera_id,
        "filename": video_path.name,
        "url": f"/api/cctv/video/{camera_id}"
    }


@app.get("/api/cctv/videos")
def list_cctv_videos():
    """List all camera videos"""
    cameras = []
    for cam_id in [1, 2, 3, 4]:
        video_found = None
        for ext in [".mp4", ".webm", ".mov", ".avi"]:
            video_path = CCTV_UPLOAD_DIR / f"camera_{cam_id}{ext}"
            if video_path.exists():
                video_found = video_path
                break
        
        cameras.append({
            "camera_id": cam_id,
            "has_video": video_found is not None,
            "filename": video_found.name if video_found else None,
            "url": f"/api/cctv/video/{cam_id}" if video_found else None
        })
    return {"cameras": cameras}


@app.get("/api/cctv/video/{camera_id}")
def get_cctv_video(camera_id: int):
    """Stream a camera video file"""
    if camera_id < 1 or camera_id > 4:
        raise HTTPException(400, "Camera ID must be 1-4")
    
    for video_file in CCTV_UPLOAD_DIR.glob(f"camera_{camera_id}.*"):
        if video_file.suffix.lower() in [".mp4", ".webm", ".mov", ".avi"]:
            return FileResponse(
                video_file,
                media_type="video/mp4",
                filename=video_file.name
            )
    
    raise HTTPException(404, f"No video found for camera {camera_id}")


@app.delete("/api/cctv/video/{camera_id}")
def delete_cctv_video(camera_id: int):
    """Delete a camera video"""
    if camera_id < 1 or camera_id > 4:
        raise HTTPException(400, "Camera ID must be 1-4")
    
    deleted = False
    for video_file in CCTV_UPLOAD_DIR.glob(f"camera_{camera_id}.*"):
        if video_file.suffix.lower() in [".mp4", ".webm", ".mov", ".avi"]:
            video_file.unlink()
            deleted = True
    
    info = load_camera_info()
    if str(camera_id) in info:
        del info[str(camera_id)]
        save_camera_info(info)
    
    if deleted:
        return {"status": "deleted", "camera_id": camera_id}
    raise HTTPException(404, f"No video found for camera {camera_id}")


def generate_detection_frames(video_path: str, camera_id: int):
    """Generator that yields MJPEG frames with YOLO detection"""
    import cv2
    cap = cv2.VideoCapture(video_path)
    
    DETECT_EVERY_N_FRAMES = 3
    frame_count = 0
    cached_boxes = []
    cached_counts = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
    
    while True:
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            frame_count = 0
            continue
        
        frame_count += 1
        
        # Run detection periodically
        if frame_count % DETECT_EVERY_N_FRAMES == 1:
            h, w = frame.shape[:2]
            scale = 320 / max(h, w)
            small_frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
            
            cached_boxes = []
            cached_counts = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0, "ambulance": 0, "accident": 0}

            # 1. Base Vehicle Detection
            if yolo_available:
                results = yolo_model(small_frame, verbose=False, classes=list(VEHICLE_CLASSES.keys()))
                for result in results:
                    for box in result.boxes:
                        cls_id = int(box.cls[0])
                        if cls_id in VEHICLE_CLASSES:
                            vehicle_type = VEHICLE_CLASSES[cls_id]
                            cached_counts[vehicle_type] += 1
                            x1, y1, x2, y2 = box.xyxy[0]
                            x1, y1, x2, y2 = int(x1/scale), int(y1/scale), int(x2/scale), int(y2/scale)
                            cached_boxes.append({
                                'coords': (x1, y1, x2, y2),
                                'type': vehicle_type,
                                'conf': float(box.conf[0])
                            })

            # 2. Custom Ambulance Detection
            if ambulance_model:
                amb_results = ambulance_model(small_frame, conf=0.4, verbose=False)
                for r in amb_results:
                    for box in r.boxes:
                        cls_name = r.names[int(box.cls[0])].lower()
                        if 'ambulance' in cls_name or 'siren' in cls_name:
                            cached_counts["ambulance"] += 1
                            x1, y1, x2, y2 = box.xyxy[0]
                            x1, y1, x2, y2 = int(x1/scale), int(y1/scale), int(x2/scale), int(y2/scale)
                            cached_boxes.append({
                                'coords': (x1, y1, x2, y2),
                                'type': "ambulance",
                                'conf': float(box.conf[0])
                            })

            # 3. Custom Accident Detection
            if accident_model:
                acc_results = accident_model(small_frame, conf=0.4, verbose=False)
                for r in acc_results:
                    for box in r.boxes:
                        cached_counts["accident"] += 1
                        x1, y1, x2, y2 = box.xyxy[0]
                        x1, y1, x2, y2 = int(x1/scale), int(y1/scale), int(x2/scale), int(y2/scale)
                        cached_boxes.append({
                            'coords': (x1, y1, x2, y2),
                            'type': "accident",
                            'conf': float(box.conf[0])
                        })
        
        # Draw boxes
        colors = {
            "car": (255, 0, 0), 
            "motorcycle": (0, 255, 0), 
            "bus": (0, 165, 255), 
            "truck": (128, 0, 128),
            "ambulance": (0, 0, 255),  # Pure Red for ambulance
            "accident": (0, 255, 255)   # Yellow for accident
        }
        
        for box_info in cached_boxes:
            x1, y1, x2, y2 = box_info['coords']
            color = colors.get(box_info['type'], (255, 255, 255))
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            label = f"{box_info['type']} {box_info['conf']:.2f}"
            cv2.putText(frame, label, (x1, y1 - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        # Update counts
        with detection_lock:
            detection_counts[camera_id] = cached_counts
        
        # Add overlay
        y_pos = 30
        for vtype, count in cached_counts.items():
            if count > 0:
                cv2.putText(frame, f"{vtype}: {count}", (10, y_pos),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                y_pos += 25
        
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        
        time.sleep(1/30)  # 30 FPS
    
    cap.release()


@app.get("/api/cctv/detect/{camera_id}")
def stream_detection(camera_id: int):
    """Stream video with YOLO detection boxes (MJPEG)"""
    if not yolo_available:
        raise HTTPException(503, "YOLO not available. Install: pip install ultralytics opencv-python")
    
    if camera_id < 1 or camera_id > 4:
        raise HTTPException(400, "Camera ID must be 1-4")
    
    video_path = None
    for ext in [".mp4", ".webm", ".mov", ".avi"]:
        path = CCTV_UPLOAD_DIR / f"camera_{camera_id}{ext}"
        if path.exists():
            video_path = str(path)
            break
    
    if not video_path:
        raise HTTPException(404, f"No video found for camera {camera_id}")
    
    return StreamingResponse(
        generate_detection_frames(video_path, camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/api/cctv/detections/{camera_id}")
def get_detection_counts(camera_id: int):
    """Get current vehicle detection counts for a camera"""
    if camera_id < 1 or camera_id > 4:
        raise HTTPException(400, "Camera ID must be 1-4")
    
    with detection_lock:
        counts = detection_counts.get(camera_id, {})
    
    return {
        "camera_id": camera_id,
        "counts": counts,
        "total": sum(counts.values()) if counts else 0
    }


# ===== Custom Detection Models for Junction 18 =====
MODELS_DIR = SCRIPT_DIR / "models"
ambulance_model = None
accident_model = None

def load_custom_models():
    """Load custom-trained ambulance and accident detection models"""
    global ambulance_model, accident_model
    
    amb_path = MODELS_DIR / "ambulance_best.pt"
    acc_path = MODELS_DIR / "accident_best.pt"
    
    if amb_path.exists():
        try:
            from ultralytics import YOLO
            ambulance_model = YOLO(str(amb_path))
            ambulance_model.to(DEVICE)
            logger.info(f"✅ Ambulance model loaded on {DEVICE}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to load ambulance model: {e}")
    else:
        logger.info(f"ℹ️ Ambulance model not found at {amb_path}")
    
    if acc_path.exists():
        try:
            from ultralytics import YOLO
            accident_model = YOLO(str(acc_path))
            accident_model.to(DEVICE)
            logger.info(f"✅ Accident model loaded on {DEVICE}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to load accident model: {e}")
    else:
        logger.info(f"ℹ️ Accident model not found at {acc_path}")

# Load on startup
load_custom_models()


@app.post("/api/cctv/analyze-junction")
async def analyze_junction_video(file: UploadFile = File(...)):
    """
    Analyze an uploaded video for ambulance/accident using custom YOLO models.
    Returns detection type: 'emergency', 'accident', or 'none'.
    """
    import tempfile
    
    if not ambulance_model and not accident_model:
        raise HTTPException(503, "Custom detection models not loaded. Train models first.")
    
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(400, "Only video files are accepted")
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        import cv2
        cap = cv2.VideoCapture(tmp_path)
        
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        analyze_every_n = max(1, int(fps / 5))  # ~5 frames per second
        
        ambulance_detections = 0
        accident_detections = 0
        frame_idx = 0
        frames_analyzed = 0
        ambulance_confidence_sum = 0.0
        accident_confidence_sum = 0.0
        
        max_frames_to_check = min(total_frames, int(fps * 30))  # Max 30 seconds
        
        while frame_idx < max_frames_to_check:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_idx += 1
            if frame_idx % analyze_every_n != 0:
                continue
            
            frames_analyzed += 1
            
            # Run ambulance detection
            if ambulance_model:
                results = ambulance_model(frame, conf=0.3, verbose=False)
                for r in results:
                    for box in r.boxes:
                        cls_name = r.names[int(box.cls[0])].lower()
                        conf = float(box.conf[0])
                        if cls_name in ['ambulance', 'siren']:
                            ambulance_detections += 1
                            ambulance_confidence_sum += conf
            
            # Run accident detection
            if accident_model:
                results = accident_model(frame, conf=0.3, verbose=False)
                for r in results:
                    for box in r.boxes:
                        conf = float(box.conf[0])
                        accident_detections += 1
                        accident_confidence_sum += conf
        
        cap.release()
        
        # Determine detection type based on frame counts
        detection_type = "none"
        confidence = 0.0
        
        if ambulance_detections >= 3:
            detection_type = "emergency"
            confidence = ambulance_confidence_sum / ambulance_detections
        elif accident_detections >= 2:
            detection_type = "accident"
            confidence = accident_confidence_sum / accident_detections
        
        logger.info(f"🔍 Junction Analysis: type={detection_type}, ambulance_frames={ambulance_detections}, accident_frames={accident_detections}, frames_analyzed={frames_analyzed}")
        
        return {
            "detection_type": detection_type,
            "confidence": round(confidence, 3),
            "ambulance_frames": ambulance_detections,
            "accident_frames": accident_detections,
            "frames_analyzed": frames_analyzed,
            "total_frames": total_frames,
            "models_loaded": {
                "ambulance": ambulance_model is not None,
                "accident": accident_model is not None
            }
        }
    
    finally:
        os.unlink(tmp_path)


@app.post("/api/cctv/reload-models")
async def reload_models():
    """Reload custom detection models (after training new ones)"""
    load_custom_models()
    return {
        "ambulance_loaded": ambulance_model is not None,
        "accident_loaded": accident_model is not None
    }


if __name__ == "__main__":
    import uvicorn
    print(f"\n{'='*60}")
    print(f"📹 CCTV Video Monitoring Server")
    print(f"{'='*60}")
    print(f"   Port: {PORT}")
    print(f"   YOLO Detection: {'✅ Available' if yolo_available else '❌ Not installed'}")
    print(f"   Ambulance Model: {'✅ Loaded' if ambulance_model else '❌ Not found'}")
    print(f"   Accident Model:  {'✅ Loaded' if accident_model else '❌ Not found'}")
    print(f"   Device: {DEVICE}")
    print(f"   Upload Dir: {CCTV_UPLOAD_DIR}")
    print(f"{'='*60}\n")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
