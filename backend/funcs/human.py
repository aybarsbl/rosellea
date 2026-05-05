import math
import threading
from dataclasses import dataclass

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import urllib.request
import os
from typing import TypedDict
from typing import List
from funcs.camera import Camera
from funcs.inheritance import Frame


@dataclass
class HandWaveState:
    prev_wrist_x: float | None = None
    prev_wrist_y: float | None = None
    direction_changes: int = 0
    last_direction: str | None = None


class TaskType(TypedDict):
    file_name: str
    url: str


class HandsConfidenceType(TypedDict):
    detection: (
        float  # Kameraya yeni bir el girdi mi? Bu pahalı bir işlem, tüm kareyi tarar.
    )

    presence: float  # El zaten takip ediliyorken "bu karede hâlâ el var mı?" diye hafifçe kontrol eder. Detection'dan çok daha ucuz.

    tracking: float  # Elin 21 noktası (parmak eklemleri vb.) başarılı şekilde takip ediliyor mu?


class Tasks:
    def __init__(self, download_path: str, tasks: List[TaskType]):
        self.download_path = download_path
        self.tasks = tasks

        self._download_all()

    def _download_all(self):
        for task in self.tasks:
            file_path = os.path.join(self.download_path, task["file_name"])
            if not os.path.exists(file_path):
                urllib.request.urlretrieve(task["url"], file_path)

    def _remove_all(self):
        for task in self.tasks:
            file_path = os.path.join(self.download_path, task["file_name"])
            if os.path.exists(file_path):
                os.remove(file_path)

    def repair(self):
        self._remove_all()
        self._download_all()


class Hands(Frame):
    def __init__(
        self,
        camera: Camera,
        task_path: str,
        max_hands: int,
        confidence_scores: HandsConfidenceType,
        event: threading.Event,
        start: bool = False,
    ):
        _base_options = python.BaseOptions(model_asset_path=task_path)
        _options = vision.HandLandmarkerOptions(
            base_options=_base_options,
            num_hands=max_hands,
            min_hand_detection_confidence=confidence_scores["detection"],
            min_hand_presence_confidence=confidence_scores["presence"],
            min_tracking_confidence=confidence_scores["tracking"],
        )
        self._detector = vision.HandLandmarker.create_from_options(_options)

        self._camera = camera
        super().__init__(
            name="Hands",
            thread_func=self._loop,
            start=start,
        )

        self._joints = [
            (0, 1),
            (1, 2),
            (2, 3),
            (3, 4),
            (0, 5),
            (5, 6),
            (6, 7),
            (7, 8),
            (0, 9),
            (9, 10),
            (10, 11),
            (11, 12),
            (0, 13),
            (13, 14),
            (14, 15),
            (15, 16),
            (0, 17),
            (17, 18),
            (18, 19),
            (19, 20),
            (5, 9),
            (9, 13),
            (13, 17),
        ]

        self._max_hands = max_hands
        self._hand_states: dict[int, HandWaveState] = {}
        self._next_hand_id = 0
        self._match_threshold = 0.15

        self._event = event

    def _match_hands(self, hands):
        current_wrists = []
        for hand_landmark in hands.hand_landmarks:
            wrist = hand_landmark[0]
            current_wrists.append((wrist.x, wrist.y))

        matched: dict[int, tuple[float, float]] = {}
        used_prev = set()
        used_curr = set()

        pairs = []
        for ci, (cx, cy) in enumerate(current_wrists):
            for hand_id, state in self._hand_states.items():
                if state.prev_wrist_x is not None:
                    dist = math.hypot(cx - state.prev_wrist_x, cy - state.prev_wrist_y)
                    pairs.append((dist, ci, hand_id))

        pairs.sort()
        for dist, ci, hand_id in pairs:
            if ci in used_curr or hand_id in used_prev:
                continue
            if dist > self._match_threshold:
                continue
            matched[hand_id] = current_wrists[ci]
            used_prev.add(hand_id)
            used_curr.add(ci)

        for ci, wrist_pos in enumerate(current_wrists):
            if ci not in used_curr:
                new_id = self._next_hand_id
                self._next_hand_id += 1
                self._hand_states[new_id] = HandWaveState()
                matched[new_id] = wrist_pos

        stale_ids = [hid for hid in self._hand_states if hid not in matched]
        for hid in stale_ids:
            del self._hand_states[hid]

        return matched

    def _is_hand_upright(self, hand_landmark):
        wrist = hand_landmark[0]
        middle_tip = hand_landmark[12]

        # Parmak uçları bilekten yukarıda olmalı (y yukarıdan aşağı artar)
        if middle_tip.y >= wrist.y:
            return False

        # Elin dikey olup olmadığını kontrol et: bilek→orta parmak ucu vektörü
        dx = middle_tip.x - wrist.x
        dy = middle_tip.y - wrist.y
        angle = abs(math.degrees(math.atan2(dx, -dy)))  # 0° = tam dikey yukarı
        return angle < 45

    def _is_hand_open(self, hand_landmark):
        fingers = [
            (5, 6, 8),  # INDEX:  MCP, PIP, TIP
            (9, 10, 12),  # MIDDLE: MCP, PIP, TIP
            (13, 14, 16),  # RING:   MCP, PIP, TIP
            (17, 18, 20),  # PINKY:  MCP, PIP, TIP
        ]
        extended = 0
        for mcp, pip, tip in fingers:
            mcp_pt = hand_landmark[mcp]
            pip_pt = hand_landmark[pip]
            tip_pt = hand_landmark[tip]
            tip_dist = math.hypot(tip_pt.x - mcp_pt.x, tip_pt.y - mcp_pt.y)
            pip_dist = math.hypot(pip_pt.x - mcp_pt.x, pip_pt.y - mcp_pt.y)
            if tip_dist > pip_dist:
                extended += 1
        return extended >= 3

    def _wave_detector(self, hands):
        if hands.hand_landmarks:
            matched = self._match_hands(hands)

            open_hand_ids = set()
            for hand_landmark in hands.hand_landmarks:
                if self._is_hand_open(hand_landmark) and self._is_hand_upright(
                    hand_landmark
                ):
                    for hand_id, (wx, wy) in matched.items():
                        wrist = hand_landmark[0]
                        if abs(wrist.x - wx) < 0.001 and abs(wrist.y - wy) < 0.001:
                            open_hand_ids.add(hand_id)
                            break

            for hand_id, (wx, wy) in matched.items():
                state = self._hand_states[hand_id]

                if hand_id not in open_hand_ids:
                    state.prev_wrist_x = wx
                    state.prev_wrist_y = wy
                    state.last_direction = None
                    state.direction_changes = 0
                    continue

                if state.prev_wrist_x is not None:
                    delta = wx - state.prev_wrist_x

                    if abs(delta) > 0.01:
                        direction = "right" if delta > 0 else "left"

                        if state.last_direction and direction != state.last_direction:
                            state.direction_changes += 1

                        state.last_direction = direction

                        if state.direction_changes >= 3:
                            state.direction_changes = 0
                            self._event.set()

                state.prev_wrist_x = wx
                state.prev_wrist_y = wy
        else:
            self._hand_states.clear()

    def _draw(self, frame, hands):
        for hand_landmark in hands.hand_landmarks:
            h, w, _ = frame.shape
            points = [(int(lm.x * w), int(lm.y * h)) for lm in hand_landmark]
            for a, b in self._joints:
                cv2.line(frame, points[a], points[b], (0, 255, 0), 2)
            for pt in points:
                cv2.circle(frame, pt, 4, (255, 0, 0), -1)

    def _loop(self):
        while self._thread.running.is_set():
            ret, frame = self._camera.get_frame()
            if ret and frame is not None:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                hands = self._detector.detect(mp_image)
                self._draw(frame=frame, hands=hands)
                self._wave_detector(hands=hands)
            self.set_frame(ret=ret, frame=frame)

    def stop(self):
        super().stop()
        self._detector.close()
