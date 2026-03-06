from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from ultralytics import YOLO
import cv2
import numpy as np
from PIL import Image
import io
import os
import time
from pathlib import Path

app = Flask(__name__)
CORS(app)

# GPU Detection
import torch
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
if DEVICE == "cuda":
    print(f"🚀 GPU detected: {torch.cuda.get_device_name(0)}")
else:
    print("ℹ️ No GPU detected, using CPU")

# Load YOLO model on GPU/CPU
model_path = Path(__file__).parent / "yolov8n.pt"
print(f"Loading YOLO model from: {model_path} on {DEVICE}")
model = YOLO(str(model_path))
model.to(DEVICE)

# Create upload and processed directories if they don't exist
UPLOAD_FOLDER = Path(__file__).parent / "uploads"
PROCESSED_FOLDER = Path(__file__).parent / "processed"
UPLOAD_FOLDER.mkdir(exist_ok=True)
PROCESSED_FOLDER.mkdir(exist_ok=True)

# Confidence threshold - lower to increase sensitivity for potholes
CONF_THRESHOLD = 0.15

# COCO class names to exclude (these are definitely NOT potholes)
EXCLUDE_CLASSES = {
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
    'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
    'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
    'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
    'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
    'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
    'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
    'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
    'toothbrush'
}

# Classes that YOLO often misidentifies potholes as
POTHOLE_CANDIDATE_CLASSES = {'sink', 'bowl', 'donut', 'cake', 'potted plant'}

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "message": "Pothole detection server is running"})

def find_potholes_heuristics(frame):
    """
    OpenCV based fallback detection for potholes.
    Enhanced to exclude green foliage (trees) and background clutter.
    """
    height, width = frame.shape[:2]
    # Tight ROI: ignore top 50% and side 15% (where trees/background usually are)
    roi_top = int(height * 0.52)
    roi_bottom = int(height * 0.96)
    roi_left = int(width * 0.15)
    roi_right = int(width * 0.85)
    roi = frame[roi_top:roi_bottom, roi_left:roi_right]
    
    # Check if ROI is valid
    if roi.size == 0:
        return []

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

    # --- 1. Green Exclusion Mask (To ignore trees/foliage) ---
    lower_green = np.array([35, 20, 20])
    upper_green = np.array([85, 255, 255])
    green_mask = cv2.inRange(hsv, lower_green, upper_green)
    
    # --- 2. Dark Pothole Detection ---
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    _, dark_thresh = cv2.threshold(blurred, 60, 255, cv2.THRESH_BINARY_INV)
    
    # --- 3. Muddy/Brown Pothole Detection ---
    lower_mud = np.array([10, 30, 80])
    upper_mud = np.array([35, 200, 220])
    mud_mask = cv2.inRange(hsv, lower_mud, upper_mud)
    
    # Combine masks and remove green areas
    combined_mask = cv2.bitwise_or(dark_thresh, mud_mask)
    # Stricter: subtract green areas from the pothole candidates
    combined_mask = cv2.bitwise_and(combined_mask, cv2.bitwise_not(green_mask))
    
    # Morphological processing
    kernel = np.ones((5, 5), np.uint8)
    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel)
    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)
    
    contours, _ = cv2.findContours(combined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    detections = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if 600 < area < (width * height * 0.1):
            x, y, w, h = cv2.boundingRect(cnt)
            aspect_ratio = float(w)/h
            
            # Potholes on road are horizontal/elliptical (w > h usually)
            # Stricter aspect ratio to ignore vertical tree trunks
            if 0.7 < aspect_ratio < 4.0:
                hull = cv2.convexHull(cnt)
                hull_area = cv2.contourArea(hull)
                solidity = float(area)/hull_area if hull_area > 0 else 0
                
                # Solidity check: potholes are usually solid shapes
                if solidity < 0.7:
                    continue

                # Texture check: potholes are relatively smooth compared to trees
                cnt_roi = roi[y:y+h, x:x+w]
                if cnt_roi.size > 0:
                    gray_cnt = cv2.cvtColor(cnt_roi, cv2.COLOR_BGR2GRAY)
                    edge_complexity = cv2.Laplacian(gray_cnt, cv2.CV_64F).var()
                    # Lower threshold to be more selective against textured trees
                    if edge_complexity > 380: 
                        continue

                    # Final check: is the area mostly green? (redundant but safe)
                    mask_roi = green_mask[y:y+h, x:x+w]
                    if np.mean(mask_roi) > 30: # If > 12% is green, skip
                        continue

                    # Adjust coordinates back to full frame
                    detections.append({
                        'bbox': [x + roi_left, y + roi_top, x + w + roi_left, y + h + roi_top],
                        'conf': min(0.6 + (solidity * 0.2), 0.95),
                        'class': 'pothole (H)'
                    })
    return detections

class PotholeTracker:
    """Tracks potholes across frames for persistence during vehicle occlusion"""
    def __init__(self, max_frames_lost=15):
        self.potholes = [] # List of [bbox, last_seen_frame, id]
        self.next_id = 0
        self.max_frames_lost = max_frames_lost
        self.current_frame_idx = 0

    def update(self, current_detections):
        self.current_frame_idx += 1
        updated_potholes = []
        
        # Match current detections with existing ones using IOU
        matched_indices = set()
        for i, (old_bbox, last_seen, pid) in enumerate(self.potholes):
            best_iou = 0
            best_match_idx = -1
            
            for j, det in enumerate(current_detections):
                if j in matched_indices: continue
                iou = self._calculate_iou(old_bbox, det['bbox'])
                if iou > best_iou:
                    best_iou = iou
                    best_match_idx = j
            
            if best_iou > 0.3: # Match found
                updated_potholes.append([current_detections[best_match_idx]['bbox'], self.current_frame_idx, pid])
                matched_indices.add(best_match_idx)
            elif (self.current_frame_idx - last_seen) < self.max_frames_lost:
                # Keep the pothole alive even if not seen (Occlusion handling)
                updated_potholes.append([old_bbox, last_seen, pid])

        # Add remaining new detections as new potholes
        for j, det in enumerate(current_detections):
            if j not in matched_indices:
                updated_potholes.append([det['bbox'], self.current_frame_idx, self.next_id])
                self.next_id += 1
        
        self.potholes = updated_potholes
        return self.potholes

    def _calculate_iou(self, boxA, boxB):
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])
        interArea = max(0, xB - xA + 1) * max(0, yB - yA + 1)
        boxAArea = (boxA[2] - boxA[0] + 1) * (boxA[3] - boxA[1] + 1)
        boxBArea = (boxB[2] - boxB[0] + 1) * (boxB[3] - boxB[1] + 1)
        iou = interArea / float(boxAArea + boxBArea - interArea)
        return iou

def get_detections(frame):
    """Combined YOLO and Heuristic detection"""
    # 1. Try YOLO first (also check for cars)
    results = model(frame, conf=CONF_THRESHOLD, verbose=False)
    detections = []
    has_car = False
    
    for result in results:
        boxes = result.boxes
        for box in boxes:
            class_id = int(box.cls[0])
            class_name = model.names[class_id] if class_id < len(model.names) else "unknown"
            
            if class_name.lower() in ['car', 'truck', 'bus']:
                has_car = True
                continue
                
            is_pothole = class_name.lower() not in EXCLUDE_CLASSES or class_name.lower() in POTHOLE_CANDIDATE_CLASSES
            
            if is_pothole:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                detections.append({
                    'bbox': [int(x1), int(y1), int(x2), int(y2)],
                    'conf': float(box.conf[0]),
                    'class': f"{class_name} (Y)"
                })
    
    # 2. Add Heuristics
    h_detections = find_potholes_heuristics(frame)
    for h_det in h_detections:
        is_duplicate = False
        hx1, hy1, hx2, hy2 = h_det['bbox']
        for d in detections:
            dx1, dy1, dx2, dy2 = d['bbox']
            hcx, hcy = (hx1+hx2)/2, (hy1+hy2)/2
            if dx1 <= hcx <= dx2 and dy1 <= hcy <= dy2:
                is_duplicate = True
                break
        if not is_duplicate:
            detections.append(h_det)
                
    return detections, has_car

@app.route('/detect', methods=['POST'])
def detect_potholes():
    """Detect potholes in uploaded image"""
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image file provided"}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        image_bytes = file.read()
        image = Image.open(io.BytesIO(image_bytes))
        img_array = np.array(image)
        
        if len(img_array.shape) == 3 and img_array.shape[2] == 3:
            img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        img_height, img_width = img_array.shape[:2]
        
        # Get detections using improved logic
        raw_detections, _ = get_detections(img_array)
        
        detections = []
        for det in raw_detections:
            x1, y1, x2, y2 = det['bbox']
            
            x_center = ((x1 + x2) / 2) / img_width * 100
            y_center = ((y1 + y2) / 2) / img_height * 100
            width = (x2 - x1) / img_width * 100
            height = (y2 - y1) / img_height * 100
            
            area_percentage = (width * height) / 100
            severity = 'high' if area_percentage > 5 else 'medium' if area_percentage > 2 else 'low'
            
            detections.append({
                'x': float(x_center - width/2),
                'y': float(y_center - height/2),
                'width': float(width),
                'height': float(height),
                'confidence': det['conf'],
                'severity': severity,
                'class': det['class']
            })
        
        overall_severity = 'high' if len(detections) >= 3 else 'medium' if len(detections) > 0 else 'low'
        
        return jsonify({
            'success': True,
            'potholeCount': len(detections),
            'severity': overall_severity,
            'detections': detections,
            'imageWidth': img_width,
            'imageHeight': img_height
        })
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return jsonify({"error": str(e), "success": False}), 500

def generate_stream(video_path):
    """Generator for MJPEG stream with live detection and temporal tracking"""
    cap = cv2.VideoCapture(str(video_path))
    tracker = PotholeTracker(max_frames_lost=15) # Maintain persistence for ~0.6s
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
            
        # Get raw detections and vehicle presence
        current_dets, car_present = get_detections(frame)
        
        # Update tracker with current sightings
        tracked_potholes = tracker.update(current_dets)
        
        for bbox, last_seen, pid in tracked_potholes:
            x1, y1, x2, y2 = bbox
            is_active = (tracker.current_frame_idx == last_seen)
            
            # Color: Bright Red for current, Orange for persistent/occluded
            color = (0, 0, 255) if is_active else (0, 140, 255)
            label = f"Pothole {pid}" if is_active else f"Pothole {pid} (tracked)"
            
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, label, (x1, y1 - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        if car_present:
            cv2.putText(frame, "VEHICLE DETECTED: Persistence Active", (20, 40),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        
        # Encode as JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
    
    cap.release()
    # Optional: remove original video if it was temp
    # os.remove(str(video_path))

@app.route('/video_feed/<filename>')
def video_feed(filename):
    """Stream video with live detections"""
    video_path = UPLOAD_FOLDER / filename
    if not video_path.exists():
        return "Video not found", 404
    return Response(generate_stream(video_path),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/detect-video', methods=['POST'])
def detect_potholes_video():
    """Handle video upload and trigger server-side processing for later playback"""
    try:
        if 'video' not in request.files:
            return jsonify({"error": "No video file provided"}), 400
        
        file = request.files['video']
        filename = f"video_{int(time.time() * 1000)}.mp4"
        video_path = UPLOAD_FOLDER / filename
        file.save(str(video_path))
        
        # Instead of full processing now, we just return the filename
        # The frontend will then use /video_feed/<filename> for live view
        return jsonify({
            'success': True,
            'videoFilename': filename,
            'potholeCount': 0, # Estimated or will be updated live
            'streamUrl': f'/video_feed/{filename}'
        })
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500

@app.route('/processed/<filename>')
def serve_processed_video(filename):
    """Serve processed video files"""
    return send_from_directory(str(PROCESSED_FOLDER), filename)

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Starting Live Pothole Detection Server")
    print("=" * 60)
    print("🌐 Server running on http://localhost:5001")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5001, debug=True)
