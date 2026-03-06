#!/usr/bin/env python3
"""
CCTV Video Monitoring Server with YOLOv8 Detection
Port: 8785

Features:
- Video upload for 4 camera slots
- Video streaming (raw and with detection)
- YOLOv8 vehicle detection (car, motorcycle, bus, truck)
- Detection count API
"""

import asyncio
import base64
import json
import logging
import os
import random
import shutil
import threading
import time
from pathlib import Path
from typing import Dict

import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import cv2

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

try:
    from ultralytics import YOLO
    logger.info("Loading YOLO model...")
    yolo_model = YOLO("yolov8n.pt")  # Downloads automatically on first use
    yolo_available = True
    logger.info("✅ YOLO model loaded!")
except ImportError:
    logger.warning("⚠️ ultralytics not installed. Detection will be disabled.")
    logger.warning("   Install with: pip install ultralytics opencv-python")
except Exception as e:
    logger.warning(f"⚠️ YOLO loading failed: {e}")

# Vehicle class IDs in COCO dataset
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

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


# Path to Telegram bot registration data
SCRIPT_DIR_SERVER = os.path.dirname(os.path.abspath(__file__))
CHATS_FILE = os.path.join(SCRIPT_DIR_SERVER, "..", "telegram_bot", "login_registered_chats.json")
TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE"

# Temporary OTP storage (Phone -> OTP)
pending_otps = {}

# ===== Core Logic =====

# ===== Auth Endpoints (Restored for Admin Login) =====

@app.post("/api/auth/send-otp")
async def send_otp(data: dict):
    phone = data.get("phone")
    if not phone:
        raise HTTPException(400, "Phone number required")
    
    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))
    pending_otps[phone] = otp
    
    # Check if user is registered on Telegram
    chat_id = None
    try:
        if os.path.exists(CHATS_FILE):
            with open(CHATS_FILE, 'r') as f:
                registered_users = json.load(f)
                chat_id = registered_users.get(phone)
    except Exception as e:
        logger.error(f"Error loading registered users: {e}")

    if not chat_id:
        # For the demo, if not registered, we still allow log in with any OTP but log a warning
        logger.warning(f"⚠️ User {phone} NOT registered on Telegram. Cannot send OTP.")
        return {"status": "warning", "message": "User not registered on Telegram bot. Please join the bot first."}

    # Send OTP via Telegram API
    try:
        async with httpx.AsyncClient() as client:
            tg_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": f"🔐 <b>Your Yatayat Verification Code</b>\n\nYour OTP is: <code>{otp}</code>\n\nValid for 5 minutes.",
                "parse_mode": "HTML"
            }
            resp = await client.post(tg_url, json=payload)
            if resp.status_code == 200:
                logger.info(f"✅ OTP sent to {phone} (Chat: {chat_id})")
                return {"status": "sent", "message": "OTP sent to Telegram"}
            else:
                logger.error(f"❌ Failed to send Telegram message: {resp.text}")
                raise HTTPException(502, "Failed to send OTP via Telegram")
    except Exception as e:
        logger.error(f"❌ Error sending Telegram message: {e}")
        raise HTTPException(500, "Error sending OTP")

@app.post("/api/auth/verify-otp")
async def verify_otp(data: dict):
    phone = data.get("phone")
    otp = data.get("otp")
    
    if not phone or not otp:
        raise HTTPException(400, "Phone and OTP required")
    
    # Check if OTP matches
    stored_otp = pending_otps.get(phone)
    
    # Allow bypass for specific admin number for testing if needed, or if OTP matches
    is_valid = (stored_otp and otp == stored_otp) or (phone == "9876543210" and otp == "123456")
    
    if is_valid:
        # Clear OTP after successful use
        if phone in pending_otps:
            del pending_otps[phone]
            
        return {
            "status": "verified",
            "role": "admin",
            "name": "Admin User" if phone == "9876543210" else f"User {phone}",
            "phone": phone
        }
    
    raise HTTPException(401, "Invalid OTP")


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
        if frame_count % DETECT_EVERY_N_FRAMES == 1 and yolo_available:
            h, w = frame.shape[:2]
            scale = 320 / max(h, w)
            small_frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
            
            results = yolo_model(small_frame, verbose=False, classes=list(VEHICLE_CLASSES.keys()))
            
            cached_counts = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
            cached_boxes = []
            
            for result in results:
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    if cls_id in VEHICLE_CLASSES:
                        vehicle_type = VEHICLE_CLASSES[cls_id]
                        cached_counts[vehicle_type] += 1
                        
                        x1, y1, x2, y2 = box.xyxy[0]
                        x1, y1, x2, y2 = int(x1/scale), int(y1/scale), int(x2/scale), int(y2/scale)
                        conf = float(box.conf[0])
                        
                        cached_boxes.append({
                            'coords': (x1, y1, x2, y2),
                            'type': vehicle_type,
                            'conf': conf
                        })
        
        # Draw boxes
        colors = {"car": (255, 0, 0), "motorcycle": (0, 255, 0), 
                  "bus": (0, 165, 255), "truck": (128, 0, 128)}
        
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


if __name__ == "__main__":
    import uvicorn
    print(f"\n{'='*60}")
    print(f"📹 CCTV Video Monitoring Server")
    print(f"{'='*60}")
    print(f"   Port: {PORT}")
    print(f"   YOLO Detection: {'✅ Available' if yolo_available else '❌ Not installed'}")
    print(f"   Upload Dir: {CCTV_UPLOAD_DIR}")
    print(f"{'='*60}\n")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
