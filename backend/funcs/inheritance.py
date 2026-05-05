from typing import Callable
from cv2.typing import MatLike
from funcs import threads, windows


class Frame:
    def __init__(
        self,
        name: str,
        thread_func: Callable[..., object] | None = None,
        start: bool = False,
    ):
        self._name = name.strip()
        self._thread_func = thread_func
        self._start = start

        self._ret: bool = False
        self._frame: MatLike | None = None

        self._window_name = self._name
        self._thread_name = f"Thread: {self._window_name}"

        self._window = windows.Window(self._window_name, self.get_frame)
        self._thread = threads.Thread(self._thread_name, loop_func=self._thread_func)

        if self._start:
            self.start()

    def get_frame(self):
        with self._thread.lock:
            ret = self._ret
            frame = self._frame.copy() if self._frame is not None else None

        return (ret, frame)

    def set_frame(self, ret: bool, frame: MatLike | None):
        with self._thread.lock:
            self._ret = ret
            self._frame = frame

    def start(self):
        self._thread.open()

    def stop(self):
        self._window.close()
        self._thread.close()

    def show(self):
        self._window.open()
