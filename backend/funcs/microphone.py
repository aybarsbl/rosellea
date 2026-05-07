import threading
import time
import subprocess
import io
import wave
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
        openai_client: OpenAI,
        silence_thold: float,
        sound_thold: int,
        event: threading.Event,
        name: str,
        start: bool = False,
        pause_event: threading.Event | None = None,
        stt_model: str = "whisper-1",
        user_name: str = "",
    ):
        self._openai = openai_client
        self._stt_model = stt_model
        self._silence_thold = silence_thold
        self._sound_thold = sound_thold
        self._event = event
        # Hoparlör konuşurken set edilir; loop o sırada speech detection
        # yapmaz (echo'yu "kullanıcı konuşması" diye transcribe etmesin).
        self._pause_event = pause_event

        self._pyaudio = None
        self._mic = None

        self._thread = threads.Thread(name="Microphone", loop_func=self._loop)
        self._text: str = ""
        self._intro_text: str = ""
        self._magic_word: list[str] = ["hey", name, "selam", "merhaba"]
        self._ignore: list[str] = ["Altyazı M.K."]
        # Whisper'a stil/kelime ipucu — özel isimler ("Mia", "Aybars") sık
        # geçer, hint olmadan bunlar yanlış transkribe oluyor.
        actors = ", ".join([n for n in (name, user_name) if n])
        self._stt_prompt = (
            f"Konuşma Türkçe. Geçen özel isimler: {actors}." if actors
            else "Konuşma Türkçe."
        )

        self._speach = threading.Event()

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

    def _transcribe(self, audio: io.BytesIO) -> str:
        """OpenAI Whisper API ile transcribe — Pi 5 CPU'da yerel whisper hem
        yavaş hem doğruluk düşük; whisper-1 (large-v2) Türkçe'de güçlü,
        ~1-1.5 sn'de döner. Özel isimler için prompt hint kullanıyoruz."""
        audio.seek(0)
        try:
            response = self._openai.audio.transcriptions.create(
                model=self._stt_model,
                file=("audio.wav", audio.read(), "audio/wav"),
                language="tr",
                prompt=self._stt_prompt,
                timeout=10,
            )
            return (response.text or "").strip()
        except Exception as e:
            print(f"[Mic] transcribe error: {e!r}")
            return ""

    def _set_mic_gain(self):
        """USB cihaz gain'i +31 dB'de clipping yapıyor; %75'e (~+23 dB) çek."""
        try:
            subprocess.run(
                ["amixer", "-c", "Device", "sset", "Mic", "75%"],
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
