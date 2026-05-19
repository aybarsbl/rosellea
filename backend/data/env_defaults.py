DEFAULT_ENV = {
    "setup": {
        "completed": False,
    },
    "wifi": {
        "ssid": "",
        "password": "",
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
            "kaliteli": "gpt-5.4",
            "hızlı": "gpt-4o",
        },
    },
    "elabs": {
        "models": {
            "kaliteli": "eleven_multilingual_v2",
            "hızlı": "eleven_flash_v2_5",
        },
        "model": "eleven_multilingual_v2",
        "voices": {
            "Mia": "PdYVUd1CAGSXsTvZZTNn",
            "Fatih": "7VqWGAWwo2HMrylfKrcm",
            "Aybars": "Vtkz15gE7FWxaauqWMuM",
        },
        "voice": "PdYVUd1CAGSXsTvZZTNn",
    },
    "whisper": {
        "models": {
            "kaliteli": "gpt-4o-transcribe",
            "hızlı": "gpt-4o-mini-transcribe",
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
            "threshold": 5000,
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
