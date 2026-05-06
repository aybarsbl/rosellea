from time import sleep

import cv2

from funcs.inheritance import Frame

try:
    from picamera2 import Picamera2
except ImportError:
    Picamera2 = None


class Camera(Frame):
    def __init__(
        self,
        start: bool = False,
        size: tuple[int, int] = (640, 480),
        max_retries: int = 3,
    ):
        self._size = size
        self._max_retries = max_retries
        self._camera: "Picamera2 | None" = None
        self.error: str | None = None

        super().__init__(
            name="Camera",
            thread_func=self._loop,
            start=start,
        )

    def _loop(self):
        while self._thread.running.is_set():
            if self._camera is None:
                self.set_frame(ret=False, frame=None)
                sleep(0.5)
                continue
            try:
                frame = self._camera.capture_array()
                frame = cv2.flip(frame, 1)
                self.set_frame(ret=True, frame=frame)
            except Exception as e:
                self.error = f"Kamera okuma hatası: {e}"
                print(f"Hata: {self.error}")
                self.set_frame(ret=False, frame=None)
                sleep(1)

    def check(self) -> bool:
        if Picamera2 is None:
            self.error = "picamera2 kütüphanesi bulunamadı (yalnızca Raspberry Pi'de çalışır)"
            print(f"Hata: {self.error}")
            return False

        for attempt in range(1, self._max_retries + 1):
            try:
                cam = Picamera2()
                config = cam.create_video_configuration(
                    main={"size": self._size, "format": "RGB888"}
                )
                cam.configure(config)
                cam.start()
                self._camera = cam
                self.error = None
                return True
            except Exception as e:
                self.error = f"Kameraya erişilemedi: {e}"
                print(f"Hata: {self.error} (deneme {attempt}/{self._max_retries})")
                try:
                    cam.close()
                except Exception:
                    pass
                self._camera = None
                if attempt < self._max_retries:
                    sleep(1)
        return False

    def start(self):
        if not self.check():
            print("[camera] Kamera başlatılamadı, devam ediliyor.")
            return
        super().start()

    def stop(self):
        super().stop()
        if self._camera is not None:
            try:
                self._camera.stop()
                self._camera.close()
            except Exception:
                pass
            self._camera = None
