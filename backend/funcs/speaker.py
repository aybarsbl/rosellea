import subprocess
import threading
import time
from io import BytesIO
from elevenlabs import ElevenLabs
from elevenlabs.play import play
from pydub import AudioSegment


class Speaker:
    def __init__(
        self,
        speaker: ElevenLabs,
        voice_id: str,
        speaker_model: str,
        output_format: str,
        duration: int = 1500,
        pause_event: threading.Event | None = None,
        volume: int = 60,
    ):
        self._duration = duration
        self._speaker = speaker
        self._voice_id = voice_id
        self._speaker_model = speaker_model
        self._output_format = output_format
        # set edildiğinde mic loop speech detection yapmaz — TTS'in
        # mikrofona geri sızıp "kullanıcı konuşması" gibi yorumlanmasını
        # önler.
        self._pause_event = pause_event
        self._volume = volume
        self._set_volume()

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

    def speak(
        self,
        text: str,
    ):
        audio_bytes = b"".join(
            self._speaker.text_to_speech.convert(
                voice_id=self._voice_id,
                text=text,
                model_id=self._speaker_model,
                output_format=self._output_format,
            )
        )
        speech = AudioSegment.from_mp3(BytesIO(audio_bytes))
        silence = AudioSegment.silent(duration=self._duration)
        audio = silence + speech
        buf = BytesIO()
        audio.export(buf, format="mp3")
        if self._pause_event is not None:
            self._pause_event.set()
        try:
            play(audio=buf.getvalue())
        finally:
            if self._pause_event is not None:
                # Hoparlörden son ses kesildikten sonra echo kuyruğu için
                # kısa tampon — ardından mic dinlemeye geri döner.
                time.sleep(0.4)
                self._pause_event.clear()
