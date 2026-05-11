FROM debian:bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
    && curl -fsSL https://archive.raspberrypi.com/debian/raspberrypi.gpg.key \
        | gpg --dearmor -o /usr/share/keyrings/raspberrypi.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/raspberrypi.gpg] http://archive.raspberrypi.com/debian bookworm main" \
        > /etc/apt/sources.list.d/raspi.list \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-dev \
        python3-pip \
        python3-venv \
        python3-picamera2 \
        python3-libcamera \
        python3-numpy \
        build-essential \
        ffmpeg \
        portaudio19-dev \
        libasound2-dev \
        libasound2-plugins \
        alsa-utils \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libsdl2-2.0-0 \
        libpq-dev \
        dbus \
        bluez \
        network-manager \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv --system-site-packages
ENV PATH=/opt/venv/bin:$PATH

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

ENV HF_HOME=/opt/hf-cache
RUN python -c "from faster_whisper import WhisperModel; \
    [WhisperModel(s, device='cpu', compute_type='int8') for s in ('tiny', 'base', 'small')]"
ENV HF_HUB_OFFLINE=1

COPY . .

EXPOSE 8000

CMD ["python", "main.py"]
