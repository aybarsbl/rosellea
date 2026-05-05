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
        duration: int = 300,
    ):
        self._duration = duration
        self._speaker = speaker
        self._voice_id = voice_id
        self._speaker_model = speaker_model
        self._output_format = output_format

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
        play(audio=buf.getvalue())
