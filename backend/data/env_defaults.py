DEFAULT_ENV = {
    "setup": {
        "completed": False,
    },
    "user": {
        "name": "",
        "age": "",
        "friendship": 0,
        "hobbies": [],
        "health_notes": [],
        "contacts": [],
    },
    "speaker": {
        "volume": 60,
    },
    "mic": {
        "gain": 75,
    },
    "assistant": {
        "model": "gpt-4o",
        "folder": "data/assistant/",
        "system_prompt": "SYSTEM_PROMPT.md",
        "tools": "tools.json",
    },
    "openai": {
        "models": {
            "large": "gpt-5.4",
            "medium": "gpt-5.4-mini",
            "small": "gpt-4o",
        },
    },
    "elabs": {
        "models": {
            "large": "eleven_v3",
            "medium": "eleven_multilingual_v2",
            "small": "eleven_flash_v2_5",
        },
        "model": "eleven_multilingual_v2",
        "outputs": {
            "high": "mp3_44100_192",
            "normal": "mp3_44100_128",
            "low": "mp3_22050_32",
            "streaming": "pcm_22050",
        },
        "output": "pcm_22050",
        "voices": {
            "aybars": "rs0m5Uct3s3z8gsNG6S5",
            "mia": "PdYVUd1CAGSXsTvZZTNn",
        },
        "voice": "PdYVUd1CAGSXsTvZZTNn",
    },
    "whisper": {
        "models": {
            "high": "gpt-4o-transcribe",
            "normal": "gpt-4o-mini-transcribe",
            "low": "whisper-1",
        },
        "model": "gpt-4o-transcribe",
    },
    "vad": {
        "speech_ratio_min": 0.35,
        "speech_ms_min": 250,
        "prob_threshold": 0.5,
    },
    "mediapipe": {
        "folder": "data/tasks/",
        "hand": {
            "file": "hand_landmarker.task",
            "url": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
        },
    },
    "safety": {
        "smoke": {
            "enabled": True,
            "threshold": 18000,
            "debounce_samples": 3,
            "poll_hz": 5.0,
            "i2c_address": 72,
            "adc_channel": 0,
            "countdown_s": 10,
            "sms_template": "ACIL DURUM: Rosellea ev içinde duman algıladı. Lütfen kontrol edin.",
            "test_enabled": False,
        },
        "heart_rate": {
            "enabled": True,
            "sustained_zero_seconds": 5,
            "low_threshold_bpm": 40,
            "low_threshold_seconds": 15,
            "high_threshold_bpm": 130,
            "high_threshold_seconds": 30,
            "sudden_change_bpm": 30,
            "sudden_change_window_s": 30,
            "sample_buffer_seconds": 120,
            "sms_template": "ACIL DURUM: Rosellea kalp ritmi anomalisi tespit etti. Lütfen kontrol edin.",
            "test_enabled": False,
        },
    },
}
