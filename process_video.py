#!/usr/bin/env python3
import os
import sys
import json
import argparse
import shutil
import random
from datetime import datetime, timedelta

# Full 80 COCO Dataset Classes (People, Vehicles, Animals, and Common Objects)
COCO_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
    "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard",
    "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "chair", "couch", "potted plant", "bed", "dining table", "toilet",
    "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven",
    "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush"
]

def run_simulation(input_path, output_path, conf_threshold, alert_classes, is_image):
    print("WARNING: YOLOv8 dependencies missing. Running in simulated surveillance mode.", file=sys.stderr)
    
    # Copy file so a valid file exists
    if os.path.exists(input_path):
        try:
            shutil.copyfile(input_path, output_path)
        except Exception as e:
            print(f"Error copying file: {e}", file=sys.stderr)
    else:
        # Create a tiny dummy placeholder file
        with open(output_path, "wb") as f:
            f.write(b"\x00" * 1000)

    start_time = datetime.now()
    
    logs = []
    alerts = []
    counts = {}
    
    # Generate mock events
    num_events = 5 if is_image else 12
    
    for i in range(1, num_events + 1):
        time_offset = timedelta(seconds=i * 2)
        event_time = (start_time + time_offset).strftime("%H:%M:%S")
        
        # Select randomly from the full COCO classes
        label = random.choice(COCO_CLASSES)
        conf = round(random.uniform(conf_threshold, 0.98), 2)
        
        counts[label] = counts.get(label, 0) + 1
        
        logs.append({
            "time": event_time,
            "label": label,
            "confidence": conf
        })
        
        # Trigger alert warnings
        if label in alert_classes:
            alerts.append(f"🚨 ALERT: Unauthorized {label.upper()} detected in sector 1 at {event_time} (Confidence: {conf})")
            
    # Force an alert trigger if requested and none generated
    if not alerts and alert_classes:
        force_label = alert_classes[0]
        event_time = (start_time + timedelta(seconds=3)).strftime("%H:%M:%S")
        counts[force_label] = counts.get(force_label, 0) + 1
        logs.append({
            "time": event_time,
            "label": force_label,
            "confidence": 0.89
        })
        alerts.append(f"🚨 ALERT: {force_label.upper()} detected at boundary at {event_time}")

    output_data = {
        "status": "simulated",
        "object_counts": counts,
        "alerts": alerts,
        "recent_logs": logs
    }
    
    print(json.dumps(output_data))

def main():
    parser = argparse.ArgumentParser(description="Surveillance Video/Image Processor with YOLOv8 & Simulation Fallback")
    parser.add_argument("--input", required=True, help="Input file path")
    parser.add_argument("--output", required=True, help="Output processed file path")
    parser.add_argument("--conf", type=float, default=0.5, help="Confidence threshold")
    parser.add_argument("--alerts", default="person,car,dog", help="Comma-separated alert classes")
    parser.add_argument("--frame_skip", type=int, default=2, help="Process every Nth frame")
    
    args = parser.parse_args()
    
    alert_classes = [c.strip().lower() for c in args.alerts.split(",") if c.strip()]
    
    # Check if the input file is an image (static capture scan)
    is_image = args.input.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.bmp'))
    
    # Check if force simulation is enabled via environment variable
    force_sim = os.environ.get("FORCE_SIMULATION", "false").lower() == "true"
    
    if force_sim:
        run_simulation(args.input, args.output, args.conf, alert_classes, is_image)
        return
        
    try:
        import cv2
        import pandas as pd
        from ultralytics import YOLO
        
        # Execute actual YOLOv8
        run_real_yolo(args.input, args.output, args.conf, alert_classes, args.frame_skip, is_image)
    except ImportError:
        # Fall back to simulation
        run_simulation(args.input, args.output, args.conf, alert_classes, is_image)

def run_real_yolo(input_path, output_path, conf_threshold, alert_classes, frame_skip, is_image):
    import cv2
    from ultralytics import YOLO
    
    model = YOLO("yolov8n.pt")
    
    if is_image:
        # Process static image
        frame = cv2.imread(input_path)
        if frame is None:
            print(f"Error loading image: {input_path}", file=sys.stderr)
            run_simulation(input_path, output_path, conf_threshold, alert_classes, is_image)
            return
            
        results = model(frame, verbose=False)[0]
        logs = []
        alerts = []
        counts = {}
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        for box in results.boxes:
            cls_id = int(box.cls[0])
            label = model.names[cls_id]
            conf = float(box.conf[0])
            
            if conf >= conf_threshold:
                counts[label] = counts.get(label, 0) + 1
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                
                # Purple bounding box for alerts, green for normal
                color = (250, 52, 188) if label.lower() in alert_classes else (0, 255, 102)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, f"{label} {conf:.2f}", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                
                logs.append({
                    "time": timestamp,
                    "label": label,
                    "confidence": round(conf, 2)
                })
                
                if label.lower() in alert_classes:
                    alerts.append(f"🚨 ALERT: {label.upper()} detected in capture scan at {timestamp} (Confidence: {conf:.2f})")
                    
        cv2.imwrite(output_path, frame)
        
        output_data = {
            "status": "success",
            "object_counts": counts,
            "alerts": alerts,
            "recent_logs": logs
        }
        print(json.dumps(output_data))
        
    else:
        # Process video stream
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            print(f"Error opening video: {input_path}", file=sys.stderr)
            run_simulation(input_path, output_path, conf_threshold, alert_classes, is_image)
            return
            
        orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
        orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)
        fps = cap.get(cv2.CAP_PROP_FPS) or 20.0
        
        # Downscale large videos to speed up processing and video encoding
        MAX_DIMENSION = 640
        if orig_width > MAX_DIMENSION or orig_height > MAX_DIMENSION:
            if orig_width > orig_height:
                new_width = MAX_DIMENSION
                new_height = int(orig_height * (MAX_DIMENSION / orig_width))
            else:
                new_height = MAX_DIMENSION
                new_width = int(orig_width * (MAX_DIMENSION / orig_height))
            # Dimensions must be even for standard video codecs (like avc1/H.264)
            width = (new_width // 2) * 2
            height = (new_height // 2) * 2
            print(f"[Performance Guide] Resizing video stream from {orig_width}x{orig_height} to {width}x{height} for fast CPU processing", file=sys.stderr)
        else:
            width = orig_width
            height = orig_height
        
        # Use 'mp4v' for OpenCV VideoWriter as 'avc1' / H.264 is often unsupported in Linux cv2 prebuilt wheels.
        # We will write to a temp raw file first, then transcode it using ffmpeg to standard browser-playable H.264.
        temp_raw_path = output_path + ".raw.mp4"
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(temp_raw_path, fourcc, fps / frame_skip, (width, height))
        
        logs = []
        alerts = []
        counts = {}
        frame_count = 0
        last_logged = {} # track {label: last_second_logged}
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
                
            frame_count += 1
            if frame_count % frame_skip != 0:
                continue
                
            # Resize frame if downscaling is enabled
            if frame.shape[1] != width or frame.shape[0] != height:
                frame = cv2.resize(frame, (width, height))
                
            results = model(frame, verbose=False)[0]
            
            frame_counts = {}
            for box in results.boxes:
                cls_id = int(box.cls[0])
                label = model.names[cls_id]
                conf = float(box.conf[0])
                
                if conf >= conf_threshold:
                    frame_counts[label] = frame_counts.get(label, 0) + 1
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    
                    color = (250, 52, 188) if label.lower() in alert_classes else (0, 255, 102)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(frame, f"{label} {conf:.2f}", (x1, y1 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                    
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    current_second = datetime.now().second
                    
                    # Log at most once per second per class to prevent spamming
                    if label not in last_logged or last_logged[label] != current_second:
                        last_logged[label] = current_second
                        logs.append({
                            "time": timestamp,
                            "label": label,
                            "confidence": round(conf, 2)
                        })
                        
                        if label.lower() in alert_classes:
                            alerts.append(f"🚨 ALERT: {label.upper()} detected in stream at {timestamp} (Confidence: {conf:.2f})")
            
            # Record maximum simultaneous counts of each class seen in any single frame
            for label, count in frame_counts.items():
                counts[label] = max(counts.get(label, 0), count)
                
            out.write(frame)
            
        cap.release()
        out.release()
        
        # Optimize output video for web streaming using ffmpeg if available
        import subprocess
        if os.path.exists(temp_raw_path):
            try:
                # Re-encode from the raw mp4v file to highly compatible H.264 format
                ffmpeg_cmd = [
                    "ffmpeg", "-y", "-i", temp_raw_path,
                    "-vcodec", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-profile:v", "baseline", "-level", "3.0",
                    "-an",
                    "-movflags", "+faststart",
                    "-crf", "28",
                    output_path
                ]
                
                # Run conversion silently
                subprocess.run(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                
                # Remove temporary raw file
                if os.path.exists(temp_raw_path):
                    os.remove(temp_raw_path)
            except Exception as e:
                print(f"[FFmpeg Warning] Web optimization/transcoding failed: {e}", file=sys.stderr)
                # Rollback: rename temp_raw_path to output_path so we have at least the raw video
                if os.path.exists(temp_raw_path):
                    if os.path.exists(output_path):
                        try: os.remove(output_path)
                        except: pass
                    os.rename(temp_raw_path, output_path)
        
        output_data = {
            "status": "success",
            "object_counts": counts,
            "alerts": alerts,
            "recent_logs": logs
        }
        print(json.dumps(output_data))

if __name__ == "__main__":
    main()
