#!/usr/bin/env python3
"""
Pre-process CCTV videos with YOLO detection annotations.
This creates new video files with bounding boxes already drawn,
allowing smooth real-time playback without frame drops.
"""

import cv2
from ultralytics import YOLO
from pathlib import Path
import sys

# Setup paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
CCTV_DIR = PROJECT_ROOT / "cctv_uploads"
OUTPUT_DIR = PROJECT_ROOT / "cctv_processed"

# Vehicle class IDs in COCO dataset
VEHICLE_CLASSES = {
    2: "car",
    3: "motorcycle", 
    5: "bus",
    7: "truck"
}

COLORS = {
    "car": (255, 0, 0),       # Blue
    "motorcycle": (0, 255, 0), # Green
    "bus": (0, 165, 255),      # Orange
    "truck": (128, 0, 128)     # Purple
}

def process_video(input_path: Path, output_path: Path, model: YOLO):
    """Process a single video with YOLO annotations."""
    print(f"\n{'='*60}")
    print(f"Processing: {input_path.name}")
    print(f"Output: {output_path.name}")
    print(f"{'='*60}")
    
    cap = cv2.VideoCapture(str(input_path))
    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    print(f"Resolution: {width}x{height}")
    print(f"FPS: {fps}")
    print(f"Total frames: {total_frames}")
    
    # Create video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
    
    frame_count = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        
        # Run YOLO detection
        results = model(frame, verbose=False, classes=list(VEHICLE_CLASSES.keys()))
        
        # Draw detections
        counts = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
        
        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                if cls_id in VEHICLE_CLASSES:
                    vehicle_type = VEHICLE_CLASSES[cls_id]
                    counts[vehicle_type] += 1
                    
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    color = COLORS.get(vehicle_type, (255, 255, 255))
                    
                    # Draw box
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    
                    # Draw label
                    label = f"{vehicle_type} {conf:.2f}"
                    label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)[0]
                    cv2.rectangle(frame, (x1, y1 - label_size[1] - 10), 
                                 (x1 + label_size[0], y1), color, -1)
                    cv2.putText(frame, label, (x1, y1 - 5), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
        
        # Add count overlay
        y_pos = 30
        total = sum(counts.values())
        cv2.putText(frame, f"Total Vehicles: {total}", (10, y_pos),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        y_pos += 30
        
        for vtype, count in counts.items():
            if count > 0:
                cv2.putText(frame, f"{vtype}: {count}", (10, y_pos),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, COLORS[vtype], 2)
                y_pos += 25
        
        # Write frame
        out.write(frame)
        
        # Progress
        if frame_count % 30 == 0:
            progress = (frame_count / total_frames) * 100
            print(f"  Progress: {progress:.1f}% ({frame_count}/{total_frames})")
    
    cap.release()
    out.release()
    
    print(f"✓ Completed: {output_path.name}")
    return frame_count

def main():
    print("=" * 60)
    print("YOLO Video Preprocessor")
    print("=" * 60)
    
    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Load YOLO model
    print("\nLoading YOLO model...")
    model = YOLO("yolov8n.pt")
    print("Model loaded!\n")
    
    # Find videos to process
    videos = list(CCTV_DIR.glob("camera_*.mp4"))
    
    if not videos:
        print("No videos found in cctv_uploads/")
        print("Expected files: camera_1.mp4, camera_2.mp4, camera_3.mp4, camera_4.mp4")
        sys.exit(1)
    
    print(f"Found {len(videos)} videos to process:")
    for v in videos:
        print(f"  - {v.name}")
    
    # Process each video
    total_frames = 0
    for video_path in sorted(videos):
        output_path = OUTPUT_DIR / f"{video_path.stem}_yolo.mp4"
        frames = process_video(video_path, output_path, model)
        total_frames += frames
    
    print("\n" + "=" * 60)
    print("✓ All videos processed!")
    print(f"  Total frames: {total_frames}")
    print(f"  Output directory: {OUTPUT_DIR}")
    print("=" * 60)

if __name__ == "__main__":
    main()
