import threading
from typing import Callable


def ignore_threads():
    for t in threading.enumerate():
        if t is not threading.main_thread():
            t.join(timeout=1)


def show():
    if len(threading.enumerate()) > 1:
        print(f"Alive Threads ({len(threading.enumerate())}):")
    for t in threading.enumerate():
        if t is not threading.main_thread() and t.is_alive():
            print(f"{t.name}")


class Thread:
    def __init__(
        self, name: str | None = None, loop_func: Callable[..., object] | None = None
    ):
        self.name = name
        self.loop_func = loop_func

        self.running = threading.Event()
        self.thread: threading.Thread | None = None
        self.lock = threading.Lock()

        self.running.clear()

    def open(self):
        if self.thread and self.thread.is_alive():
            return
        self.running.set()
        self.thread = threading.Thread(
            target=self.loop_func, name=self.name, daemon=True
        )
        self.thread.start()

    def close(self):
        self.running.clear()
        if self.thread:
            self.thread.join()
