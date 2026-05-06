import threading
import time
from typing import Literal
import struct
import io
import wave
import pyaudio
from faster_whisper import WhisperModel
from funcs import threads


class Microphone:
    def __init__(
        self,
        model_size: Literal["tiny", "base", "small", "medium", "large-v3"],
        silence_thold: float,
        sound_thold: int,
        event: threading.Event,
        name: str,
        start: bool = False,
    ):
        self._model_size = model_size
        self._silence_thold = silence_thold
        self._sound_thold = sound_thold
        self._event = event

        self._model: WhisperModel | None = None
        self._pyaudio = None
        self._mic = None

        self._thread = threads.Thread(name="Microphone", loop_func=self._loop)
        self._text: str = ""
        self._intro_text: str = ""
        self._magic_word: list[str] = ["hey", name, "selam", "merhaba"]
        self._ignore: list[str] = ["Altyazı M.K."]

        self._speach = threading.Event()

        if start:
            self.start()

    def _rms_calc(self, data: bytes) -> float:
        count = len(data) // 2
        if count == 0:
            return 0.0
        frames = sum(s**2 for s in struct.unpack(f"{count}h", data))
        return (frames / count) ** 0.5

    def _get_audio(self, frames: list[bytes]) -> io.BytesIO:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"".join(frames))
        buf.seek(0)
        return buf

    def _isSilent(self, data: bytes) -> bool:
        return self._rms_calc(data) < self._sound_thold

    def _check(self) -> bool:
        return self._thread.running.is_set()

    def _loop(self):
        while self._check():
            frames = []
            count = 0
            silence_limit = int(self._silence_thold * 16000 / 1024)
            started = False

            while True:
                if not self._check():
                    return

                data = self._mic.read(1024, exception_on_overflow=False)
                if not self._isSilent(data):
                    started = True
                    frames.append(data)
                    break

            while True:
                if not self._check():
                    return

                data = self._mic.read(1024, exception_on_overflow=False)
                frames.append(data)

                if self._isSilent(data):
                    count += 1
                else:
                    count = 0

                if count >= silence_limit:
                    break

            if not started or len(frames) < 5 or not self._check():
                continue

            audio = self._get_audio(frames)

            segments, _ = self._model.transcribe(
                audio=audio,
                language="tr",
                beam_size=5,
                best_of=5,
                temperature=0.0,
                condition_on_previous_text=False,
                no_speech_threshold=0.6,
                log_prob_threshold=-1.0,
                compression_ratio_threshold=2.4,
                vad_filter=True,
                vad_parameters={
                    "min_silence_duration_ms": 500,
                    "speech_pad_ms": 200,
                },
            )

            text = " ".join(s.text.strip() for s in segments).strip()

            with self._thread.lock:
                if text:
                    self._text = text
                else:
                    self._text = ""

                for word in self._magic_word:
                    if word.lower() in self._text.lower():
                        if not self._event.is_set():
                            self._intro_text = self._text
                        self._event.set()

            self._speach.set()

    def wake_up(self):
        text = ""
        if self._intro_text:
            with self._thread.lock:
                text = self._intro_text
                self._intro_text = ""

        if not text:
            text = "[El Sallandı]"

        return text

    def listen(self, timeout: int = 0):
        text = ""

        started = time.time()
        cut = False
        while True:
            self._speach.clear()
            while not self._speach.wait(timeout=0.5):
                if timeout > 0 and time.time() - started >= timeout:
                    cut = True
                    break

            if cut:
                return None

            with self._thread.lock:
                text = self._text
                for word in self._ignore:
                    if word.lower() in self._text.lower():
                        text = ""

            if text:
                break

        return text

    def start(self):
        self._model = WhisperModel(
            self._model_size,
            device="cpu",
            compute_type="int8",
        )

        self._pyaudio = pyaudio.PyAudio()
        self._mic = self._pyaudio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=16000,
            input=True,
            frames_per_buffer=1024,
        )

        self._thread.open()

    def stop(self):
        self._thread.close()
        self._mic.stop_stream()
        self._mic.close()
        self._pyaudio.terminate()
