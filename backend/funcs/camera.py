import cv2
from time import sleep
from funcs.inheritance import Frame


class Camera(Frame):
    def __init__(self, start: bool = False):
        self._camera: cv2.VideoCapture | None = None

        self.error: str | None = None

        super().__init__(
            name="Camera",
            thread_func=self._loop,
            start=start,
        )

    def _loop(self):
        while self._thread.running.is_set():
            ret, frame = self._camera.read()
            try:
                frame = cv2.flip(frame, 1)
            except Exception:
                pass
            self.set_frame(ret=ret, frame=frame)
            if ret == False:
                self.check()

    def check(self):
        while True:
            self._camera = cv2.VideoCapture(0)
            if self._camera.isOpened() == False:
                self._camera.release()
                cv2.destroyAllWindows()
                self.error = "Kamera bulunamadı!"
            else:
                ret, _ = self._camera.read()
                if ret == False:
                    self._camera.release()
                    cv2.destroyAllWindows()
                    self.error = "Kameraya erişilemedi!"
                else:
                    self.error = None
                    break
            print(f"Hata: {self.error}")
            sleep(1)

    def start(self):
        self.check()
        super().start()

    def stop(self):
        super().stop()
        if self._camera:
            self._camera.release()
