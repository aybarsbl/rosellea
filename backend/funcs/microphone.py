import threading
import time
import subprocess
import io
import wave
from typing import Callable, Optional
import numpy as np
import pyaudio
from openai import OpenAI
from funcs import threads


# USB ses cihazı native 48 kHz stereo. Pyaudio'yu 16 kHz mono açtığımızda
# PortAudio kendi düşük kalite resampler/channel-mixer'ını devreye sokuyor
# ve sinyalin büyük kısmını kaybediyoruz (RMS ~120 — neredeyse gürültü
# tabanı). Native rate'te açıp numpy ile downmix + decimation yapıyoruz.
NATIVE_RATE = 48000
NATIVE_CHANNELS = 2
TARGET_RATE = 16000
RESAMPLE_RATIO = NATIVE_RATE // TARGET_RATE  # 3
FRAMES_PER_BUFFER = 3072  # ~64 ms @ 48 kHz, downmix sonrası 1024 @ 16 kHz


class Microphone:
    def __init__(
        self,
        gpt: OpenAI,
        model_id: str,
        silence_thold: float,
        sound_thold: int,
        event: threading.Event,
        name: str,
        start: bool = False,
        pause_event: threading.Event | None = None,
        gain: int = 75,
    ):
        self._gpt = gpt
        self._model_id = model_id
        self._name = name
        self._silence_thold = silence_thold
        self._sound_thold = sound_thold
        self._event = event
        # Hoparlör konuşurken set edilir; loop o sırada speech detection
        # yapmaz (echo'yu "kullanıcı konuşması" diye transcribe etmesin).
        self._pause_event = pause_event
        self._gain = gain

        self._pyaudio = None
        self._mic = None

        self._thread = threads.Thread(name="Microphone", loop_func=self._loop)
        self._text: str = ""
        self._intro_text: str = ""
        self._magic_word: list[str] = ["hey", name, "selam", "merhaba"]
        # Online transcribe sessizlikte boş döner; "Altyazı M.K." gibi
        # faster-whisper'a özgü halüsinasyonlar artık beklenmez ama olası
        # benzer durumlar için listeyi koru.
        self._ignore: list[str] = ["Altyazı M.K."]

        self._speach = threading.Event()

        # Acil durum modu: set edilince her transkript "iptal" kelimesi için
        # taranır ve _on_cancel callback'i çağrılır. Normal listen() akışı
        # değişmez — magic-word algılaması paralel devam eder.
        self._cancel_words: list[str] = ["iptal"]
        self._cancel_mode = threading.Event()
        self._on_cancel: Optional[Callable[[], None]] = None

        if start:
            self.start()

    def _stereo_to_mono(self, data: bytes) -> np.ndarray:
        samples = np.frombuffer(data, dtype=np.int16)
        if samples.size == 0:
            return samples
        # Eşit olmayan örnek sayısını kırp (chunk her zaman çift gelir, paranoyak guard)
        if samples.size % NATIVE_CHANNELS:
            samples = samples[: -(samples.size % NATIVE_CHANNELS)]
        stereo = samples.reshape(-1, NATIVE_CHANNELS)
        # int16 → int32 ile topla, böl: overflow yok
        return (stereo.astype(np.int32).sum(axis=1) // NATIVE_CHANNELS).astype(np.int16)

    def _rms_calc(self, data: bytes) -> float:
        mono = self._stereo_to_mono(data)
        if mono.size == 0:
            return 0.0
        return float(np.sqrt(np.mean(mono.astype(np.float64) ** 2)))

    def _get_audio(self, frames: list[bytes]) -> io.BytesIO:
        # Tüm frame'leri birleştir, mono'ya indir, 48 kHz → 16 kHz decimate
        raw = b"".join(frames)
        mono48 = self._stereo_to_mono(raw)
        # 3-örnek ortalama (basit anti-alias) sonra decimate → 16 kHz
        if mono48.size % RESAMPLE_RATIO:
            mono48 = mono48[: -(mono48.size % RESAMPLE_RATIO)]
        grouped = mono48.astype(np.int32).reshape(-1, RESAMPLE_RATIO)
        mono16 = (grouped.sum(axis=1) // RESAMPLE_RATIO).astype(np.int16)

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(TARGET_RATE)
            wf.writeframes(mono16.tobytes())
        buf.seek(0)
        return buf

    def _isSilent(self, data: bytes) -> bool:
        return self._rms_calc(data) < self._sound_thold

    def _transcribe(self, audio: io.BytesIO) -> str:
        # Halüsinasyonu minimize etmek için: language="tr", temperature=0
        # ve prompt'ta Türkçe bağlam + asistan adı. Sessizlik zaten RMS
        # eşiğiyle filtrelendiği için API'ye gerçek konuşma gidiyor.
        # Latency için stream=True: token'lar geldikçe biriktir.
        transcribe_prompt = (
            f"Aşağıdaki ses Türkçe konuşmadır. "
            f"Asistanın adı '{self._name}'. "
            f"Kullanıcı asistanla doğal şekilde konuşur."
        )
        try:
            stream = self._gpt.audio.transcriptions.create(
                model=self._model_id,
                file=("audio.wav", audio.read(), "audio/wav"),
                language="tr",
                prompt=transcribe_prompt,
                temperature=0,
                response_format="text",
                stream=True,
            )
            text = ""
            for event in stream:
                etype = getattr(event, "type", None)
                if etype == "transcript.text.delta":
                    text += getattr(event, "delta", "") or ""
                elif etype == "transcript.text.done":
                    # Done event final text'i tekrar veriyor; delta'larla
                    # birikene güven, ama boşsa done'dan al.
                    if not text:
                        text = getattr(event, "text", "") or ""
            return text.strip()
        except Exception as e:
            print(f"[Microphone] transcribe hatası: {e}")
            return ""

    def _check(self) -> bool:
        return self._thread.running.is_set()

    def _loop(self):
        # Her okuma 64 ms (FRAMES_PER_BUFFER / NATIVE_RATE). 1 sn sessizlik
        # için kaç chunk gerek: NATIVE_RATE / FRAMES_PER_BUFFER ≈ 15.6
        chunks_per_second = NATIVE_RATE / FRAMES_PER_BUFFER
        while self._check():
            frames = []
            count = 0
            silence_limit = int(self._silence_thold * chunks_per_second)
            started = False

            while True:
                if not self._check():
                    return

                data = self._mic.read(FRAMES_PER_BUFFER, exception_on_overflow=False)
                # Hoparlör konuşuyorsa veriyi tüket ama detect etme — buffer
                # şişmemesi için read() devam, sadece RMS kontrolü atla.
                if self._pause_event is not None and self._pause_event.is_set():
                    continue
                if self._rms_calc(data) >= self._sound_thold:
                    started = True
                    frames.append(data)
                    break

            while True:
                if not self._check():
                    return

                data = self._mic.read(FRAMES_PER_BUFFER, exception_on_overflow=False)
                frames.append(data)
                rms = self._rms_calc(data)

                if rms < self._sound_thold:
                    count += 1
                else:
                    count = 0

                if count >= silence_limit:
                    break

            if not started or len(frames) < 5 or not self._check():
                continue

            audio = self._get_audio(frames)
            text = self._transcribe(audio)

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

            # Acil durum iptal taraması: lock dışında, callback bizden bağımsız
            # iş yapabilir (state mutex, timer cancel vb.) — kilitli tutmayalım.
            if self._cancel_mode.is_set() and text:
                lower = text.lower()
                if any(w in lower for w in self._cancel_words):
                    cb = self._on_cancel
                    if cb is not None:
                        try:
                            cb()
                        except Exception as e:
                            print(f"[Microphone] cancel callback hatası: {e}")

            self._speach.set()

    def set_cancel_listener(self, on_cancel: Optional[Callable[[], None]]):
        self._on_cancel = on_cancel

    def set_cancel_mode(self, active: bool):
        if active:
            self._cancel_mode.set()
        else:
            self._cancel_mode.clear()

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

    def _set_mic_gain(self):
        """USB cihaz gain'i +31 dB'de clipping yapıyor; varsayılan %75'e (~+23 dB)."""
        try:
            subprocess.run(
                ["amixer", "-c", "Device", "sset", "Mic", f"{self._gain}%"],
                capture_output=True,
                timeout=2,
                text=True,
            )
        except Exception:
            pass

    def start(self):
        self._set_mic_gain()

        self._pyaudio = pyaudio.PyAudio()
        self._mic = self._pyaudio.open(
            format=pyaudio.paInt16,
            channels=NATIVE_CHANNELS,
            rate=NATIVE_RATE,
            input=True,
            frames_per_buffer=FRAMES_PER_BUFFER,
        )

        self._thread.open()

    def stop(self):
        self._thread.close()
        self._mic.stop_stream()
        self._mic.close()
        self._pyaudio.terminate()
