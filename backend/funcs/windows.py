from threading import Thread
from time import sleep
from typing import Callable, Literal

import cv2
from cv2.typing import MatLike

from funcs import threads


class Window:
    def __init__(self, name: str, get_frame: Callable[[], tuple[bool, MatLike | None]]):
        self._name = name.strip()
        self._get_frame = get_frame

        self._ret: bool = False
        self._frame: MatLike | None = None

        _thread_name = f"Thread: {self._name}"

        self._thread = threads.Thread(name=_thread_name, loop_func=self._loop)

    def _loop(self):
        while self._thread.running.is_set():
            ret, frame = self._get_frame()
            with self._thread.lock:
                self._ret = ret
                self._frame = frame

    def add_text(
        self,
        frame,
        text,
        font,
        scale,
        color: Literal["red", "green", "blue", "black", "white"],
        thickness,
        position: Literal[
            "top-left",
            "top",
            "top-right",
            "left",
            "center",
            "right",
            "bottom-left",
            "bottom",
            "bottom-right",
        ],
    ):
        (tw, th), _ = cv2.getTextSize(text, font, scale, thickness)
        m = 10
        W, H = frame.shape[1], frame.shape[0]

        positions = {
            "top-left": (m, th + m),
            "top-right": (W - tw - m, th + m),
            "bottom-left": (m, H - m),
            "bottom-right": (W - tw - m, H - m),
            "center": ((W - tw) // 2, (H + th) // 2),
            "top": ((W - tw) // 2, th + m),
            "bottom": ((W - tw) // 2, H - m),
            "left": (m, (H + th) // 2),
            "right": (W - tw - m, (H + th) // 2),
        }

        colors = {
            "red": (0, 0, 255),
            "green": (0, 255, 0),
            "blue": (255, 0, 0),
            "black": (0, 0, 0),
            "white": (255, 255, 255),
        }

        (x, y) = positions[position]
        cv2.putText(frame, text, (x, y), font, scale, colors[color], thickness)

    def open(self):
        self._thread.open()
        sleep(1)
        while self._thread.running.is_set():
            with self._thread.lock:
                ret = self._ret
                frame = self._frame.copy() if self._frame is not None else None

            if ret and frame is not None:
                cv2.imshow(self._name, frame)
            else:
                print("Error: Frame is None!")
                self.close()
                break

            if cv2.waitKey(1) & 0xFF == ord("q"):
                self.close()
                break

    def close(self):
        try:
            cv2.destroyWindow(self._name)
        except cv2.error:
            pass
        self._thread.close()
