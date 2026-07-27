#!/usr/bin/env python3
"""
OpenCV hand-motion controller for the JARVIS Brain Graph.

Uses the camera only (microphone stays free for wake word / keep-listening).

Gestures
--------
  Open palm + move     → rotate graph (yaw / pitch)
  Pinch (thumb+index)  → zoom in/out
  Point (index only)   → select nearest repo (pulse select=1)
  Fist                 → reset camera (select=-1)
  Victory (2 fingers)  → freeze auto-spin toggle pulse

Run
---
  pip install opencv-python mediapipe
  python backend/scripts/hand_graph_control.py

Env
---
  JARVIS_GESTURE_API  default http://127.0.0.1:8002/gestures/event
  CAMERA_INDEX        default 0
"""

from __future__ import annotations

import math
import os
import time
import urllib.error
import urllib.request

import cv2
import numpy as np

API = os.getenv("JARVIS_GESTURE_API", "http://127.0.0.1:8002/gestures/event")
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))


def post_event(payload: dict) -> None:
    import json

    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    token = (os.getenv("JARVIS_API_TOKEN") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        API,
        data=data,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=0.4) as resp:
            resp.read()
    except (urllib.error.URLError, TimeoutError, OSError):
        pass


def dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def finger_up(landmarks, tip, pip) -> bool:
    return landmarks[tip][1] < landmarks[pip][1]


def classify(landmarks) -> tuple[str, int]:
    """Return (gesture_name, finger_count). landmarks: list of (x,y) normalized."""
    tips = [4, 8, 12, 16, 20]
    pips = [3, 6, 10, 14, 18]
    ups = []
    # Thumb: compare x relative to IP (handedness approximated)
    ups.append(landmarks[4][0] < landmarks[3][0] if landmarks[17][0] < landmarks[5][0] else landmarks[4][0] > landmarks[3][0])
    for tip, pip in zip(tips[1:], pips[1:]):
        ups.append(finger_up(landmarks, tip, pip))
    count = sum(1 for u in ups if u)

    thumb_tip, index_tip = landmarks[4], landmarks[8]
    pinch = dist(thumb_tip, index_tip) < 0.07

    if pinch:
        return "pinch", count
    if count <= 1 and not ups[1]:
        return "fist", 0
    if ups[1] and not ups[2] and not ups[3] and not ups[4]:
        return "point", 1
    if ups[1] and ups[2] and not ups[3] and not ups[4]:
        return "victory", 2
    if count >= 4:
        return "palm", count
    return "move", count


def run_mediapipe():
    import mediapipe as mp

    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )
    drawer = mp.solutions.drawing_utils

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera index {CAMERA_INDEX}")

    prev_cx = prev_cy = None
    prev_pinch = None
    last_select = 0.0
    last_post = 0.0

    print("[hand_graph_control] OpenCV + MediaPipe running")
    print(f"[hand_graph_control] posting → {API}")
    print("[hand_graph_control] Wake word still uses the mic in the browser — keep Lab → Wake enabled.")
    print("[hand_graph_control] Press Q or Esc to quit.")

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = hands.process(rgb)

        gesture = "none"
        yaw = pitch = zoom = 0.0
        select = 0
        fingers = 0
        cursor = {"x": 0.5, "y": 0.5}
        message = "Show an open palm to rotate"

        if result.multi_hand_landmarks:
            hand = result.multi_hand_landmarks[0]
            drawer.draw_landmarks(frame, hand, mp_hands.HAND_CONNECTIONS)
            lm = [(p.x, p.y) for p in hand.landmark]
            gesture, fingers = classify(lm)
            cx, cy = lm[9]
            cursor = {"x": float(cx), "y": float(cy)}

            if gesture == "palm" or gesture == "move":
                if prev_cx is not None:
                    yaw = (cx - prev_cx) * 4.5
                    pitch = (cy - prev_cy) * 3.5
                message = "Rotate"
            elif gesture == "pinch":
                pinch_d = dist(lm[4], lm[8])
                if prev_pinch is not None:
                    zoom = (prev_pinch - pinch_d) * 8.0
                prev_pinch = pinch_d
                message = "Zoom"
            elif gesture == "point":
                message = "Select"
                if time.time() - last_select > 0.9:
                    select = 1
                    last_select = time.time()
            elif gesture == "fist":
                message = "Reset camera"
                if time.time() - last_select > 1.0:
                    select = -1
                    last_select = time.time()
            elif gesture == "victory":
                message = "Toggle spin"
                if time.time() - last_select > 1.2:
                    select = 2
                    last_select = time.time()

            prev_cx, prev_cy = cx, cy
            if gesture != "pinch":
                prev_pinch = None

            cv2.circle(frame, (int(cx * w), int(cy * h)), 10, (0, 200, 255), -1)
        else:
            prev_cx = prev_cy = None
            prev_pinch = None
            message = "No hand — mouse/keyboard still work in UI"

        now = time.time()
        if now - last_post > 0.04:
            post_event(
                {
                    "gesture": gesture,
                    "yaw": yaw,
                    "pitch": pitch,
                    "zoom": zoom,
                    "select": select,
                    "fingers": fingers,
                    "cursor": cursor,
                    "message": message,
                    "source": "opencv",
                }
            )
            last_post = now

        cv2.putText(frame, f"{gesture.upper()}  {message}", (16, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 220, 255), 2)
        cv2.putText(frame, "Q/Esc quit | mic free for JARVIS wake", (16, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)
        cv2.imshow("JARVIS Hand Graph Control", frame)
        key = cv2.waitKey(1) & 0xFF
        if key in (27, ord("q"), ord("Q")):
            break

    cap.release()
    cv2.destroyAllWindows()
    hands.close()
    post_event({"gesture": "none", "message": "Hand control stopped", "yaw": 0, "pitch": 0, "zoom": 0, "select": 0})


def run_optical_flow_fallback():
    """If MediaPipe is missing, rough motion via optical flow still posts yaw/pitch."""
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera index {CAMERA_INDEX}")

    ret, prev = cap.read()
    if not ret:
        raise RuntimeError("Camera read failed")
    prev_gray = cv2.cvtColor(cv2.flip(prev, 1), cv2.COLOR_BGR2GRAY)
    print("[hand_graph_control] MediaPipe not installed — optical-flow fallback (install mediapipe for full gestures)")
    print("  pip install mediapipe opencv-python")

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.flip(frame, 1)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        flow = cv2.calcOpticalFlowFarneback(prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        yaw = float(np.nanmean(flow[..., 0]) / 40.0)
        pitch = float(np.nanmean(flow[..., 1]) / 40.0)
        post_event(
            {
                "gesture": "flow",
                "yaw": max(-1.5, min(1.5, yaw)),
                "pitch": max(-1.5, min(1.5, pitch)),
                "zoom": 0,
                "select": 0,
                "message": "Optical flow rotate (install mediapipe for pinch/point)",
                "source": "opencv-flow",
            }
        )
        prev_gray = gray
        cv2.putText(frame, "FLOW FALLBACK — install mediapipe", (16, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 180, 255), 2)
        cv2.imshow("JARVIS Hand Graph Control", frame)
        if cv2.waitKey(1) & 0xFF in (27, ord("q"), ord("Q")):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    try:
        run_mediapipe()
    except ImportError:
        run_optical_flow_fallback()
    except Exception as exc:
        print(f"[hand_graph_control] fatal: {exc}")
        raise
