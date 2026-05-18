import queue
import re
import subprocess
import threading
import time
from time import perf_counter
from elevenlabs import ElevenLabs


class Speaker:
    def __init__(
        self,
        speaker: ElevenLabs,
        voice_id: str,
        speaker_model: str,
        output_format: str,
        duration: int = 300,
        pause_event: threading.Event | None = None,
        volume: int = 60,
    ):
        # `duration` artık aplay stdin'e yazılan başlangıç sessizliği (ms).
        # Eski 800 ms (pydub silence prepend) yerine 300 ms — streaming
        # mod'da bu kadar yeterli; net latency tasarrufu sağlar.
        self._duration_ms = duration
        self._speaker = speaker
        self._voice_id = voice_id
        self._speaker_model = speaker_model
        self._output_format = output_format
        # set edildiğinde mic loop speech detection yapmaz — TTS'in
        # mikrofona geri sızıp "kullanıcı konuşması" gibi yorumlanmasını
        # önler.
        self._pause_event = pause_event
        self._volume = volume
        self._sample_rate = self._parse_pcm_rate(output_format)
        self._set_volume()

        # Streaming oturum state'i — her begin() çağrısında sıfırlanır.
        self._queue: queue.Queue | None = None
        self._worker: threading.Thread | None = None
        self._proc: subprocess.Popen | None = None
        self.streamed: bool = False

    @staticmethod
    def _parse_pcm_rate(fmt: str) -> int:
        """`pcm_22050` → 22050. Diğer format'larda default 22050."""
        m = re.match(r"pcm_(\d+)", fmt or "")
        return int(m.group(1)) if m else 22050

    def _set_volume(self):
        """USB cihaz Speaker çıkışını yüzdeyle ayarlar (0-100). amixer
        dB skalasına linear map eder: -63 dB - 0 dB aralığı."""
        try:
            subprocess.run(
                ["amixer", "-c", "Device", "sset", "Speaker", f"{self._volume}%"],
                capture_output=True,
                timeout=2,
                text=True,
            )
        except Exception:
            pass

    def _open_aplay(self) -> subprocess.Popen:
        """Raw S16_LE mono PCM'i ALSA'ya pipe edecek long-lived aplay aç."""
        return subprocess.Popen(
            [
                "aplay",
                "-q",
                "-f", "S16_LE",
                "-r", str(self._sample_rate),
                "-c", "1",
                "-t", "raw",
                "-D", "plughw:0,0",
            ],
            stdin=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )

    def _stream_sentence(self, sentence: str, first_chunk_done: dict, t_begin: float):
        """ElevenLabs'tan cümle için PCM chunk akışı al, aplay.stdin'e pipe."""
        if not self._proc or not self._proc.stdin:
            return
        try:
            stream = self._speaker.text_to_speech.stream(
                voice_id=self._voice_id,
                text=sentence,
                model_id=self._speaker_model,
                output_format=self._output_format,
            )
            for chunk in stream:
                if not chunk:
                    continue
                try:
                    self._proc.stdin.write(chunk)
                    if not first_chunk_done["v"]:
                        first_chunk_done["v"] = True
                        print(
                            f"[perf] tts_first_chunk_ms="
                            f"{(perf_counter()-t_begin)*1000:.0f}"
                        )
                except BrokenPipeError:
                    # aplay erken kapandıysa sessizce kes.
                    return
        except Exception as e:
            print(f"[Speaker] TTS hatası: {e}")

    def _worker_run(self, t_begin: float):
        first_chunk_done = {"v": False}
        while True:
            item = self._queue.get()
            if item is None:
                return
            self._stream_sentence(item, first_chunk_done, t_begin)

    def begin(self) -> None:
        """Yeni streaming oturumu başlat: aplay aç, mic'i durdur, worker
        thread'i ayağa kaldır. feed() ile cümleler kuyruğa eklenir."""
        self.streamed = False
        self._queue = queue.Queue()

        if self._pause_event is not None:
            self._pause_event.set()

        self._proc = self._open_aplay()
        # İlk PCM bytes hemen yazılır — leading zero pad, USB ses kartı
        # buffer'ının "uyanması" için yeterli, pop sesini elemine eder.
        if self._proc.stdin:
            pad = b"\x00" * int(self._sample_rate * 2 * self._duration_ms / 1000)
            try:
                self._proc.stdin.write(pad)
            except BrokenPipeError:
                pass

        t_begin = perf_counter()
        self._worker = threading.Thread(
            target=self._worker_run, args=(t_begin,), daemon=True
        )
        self._worker.start()

    def feed(self, sentence: str) -> None:
        """Cümle bazlı TTS kuyruğa ekler — LLM stream'inden çağrılır."""
        if not sentence or not sentence.strip():
            return
        if self._queue is None:
            return
        self.streamed = True
        self._queue.put(sentence)

    def end(self) -> None:
        """Worker'ı drain et, aplay'in ALSA buffer'ını bitir, mic'i aç."""
        if self._queue is None:
            return

        self._queue.put(None)
        if self._worker:
            self._worker.join()

        if self._proc:
            try:
                if self._proc.stdin:
                    self._proc.stdin.close()
                # aplay.wait() ALSA buffer drain'i için kritik — burada
                # bloklamazsak mic_pause son ses çalmadan clear olur ve
                # echo kuyruğu mikrofona düşer.
                self._proc.wait()
            except Exception:
                pass

        # Hoparlörden son ses kesildikten sonra echo kuyruğu için kısa
        # tampon — ardından mic dinlemeye geri döner.
        time.sleep(0.4)
        if self._pause_event is not None:
            self._pause_event.clear()

        self._queue = None
        self._worker = None
        self._proc = None

    def speak(self, text: str) -> None:
        """Backward-compat: tool_call path eski non-streaming API'yi kullanır.
        İçeride begin/feed/end zinciri çalışır — pydub/MP3 yolu kaldırıldı."""
        if not text:
            return
        self.begin()
        self.feed(text)
        self.end()
