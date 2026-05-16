import socket
import threading
import time
import cv2
import os
from dotenv import load_dotenv
from openai import OpenAI
from elevenlabs.client import ElevenLabs

os.environ["OPENCV_LOG_LEVEL"] = "OFF"
from data.env_defaults import DEFAULT_ENV
from funcs import (
    database,
    discovery,
    emergency,
    env,
    llm,
    prompt,
    camera,
    human,
    provisioning,
    server,
    smoke,
    speaker,
    threads,
    microphone,
    tools,
    vitals,
    wifi,
)

# -------------------
# CONFIG
# -------------------
base_path = os.path.dirname(os.path.abspath(__file__))
_env = env.Environment(os.path.join(base_path, "data/env.json"))
# Eski env.json sürümleri için: env_defaults.py'a sonradan eklenmiş
# anahtarları (örn. safety.heart_rate) eksikse doldur. Mevcut değerlere
# dokunmaz, kullanıcı reset etmek zorunda kalmadan yeni feature'lar açılır.
_env.ensure_defaults(DEFAULT_ENV)
is_active = threading.Event()
quit = threading.Event()
setup_ready = threading.Event()
# Mia konuşurken (Speaker.speak) set edilir — Mic bu sırada speech detection
# yapmaz, hoparlörden mikrofona geri sızan ses "kullanıcı" diye transcribe
# edilmesin.
mic_pause = threading.Event()


# -------------------
# IDENTITY
# -------------------
ROBOT_NAME = _env.get("robot.name") or f"Rosellea-{socket.gethostname()}"
HTTP_PORT = 8000


# -------------------
# API
# -------------------
load_dotenv()
OPENAI_API = os.getenv("OPENAI")
ELABS_API = os.getenv("ELABS")
DATABASE = os.getenv("DATABASE")


# -------------------
# LLM
# -------------------
llm_model = _env.get("assistant.model")
llm_folder = _env.get("assistant.folder")
llm_system = _env.get("assistant.system_prompt")
llm_tools = _env.get("assistant.tools")


# -------------------
# ELEVENLABS
# -------------------
elabs_model = _env.get("elabs.model")
elabs_output = _env.get("elabs.output")
elabs_voice = _env.get("elabs.voice")


# -------------------
# WHISPER (OpenAI online transcription)
# -------------------
whisper_model = _env.get("whisper.model") or "gpt-4o-transcribe"


# -------------------
# AUDIO LEVELS
# -------------------
speaker_volume = _env.get("speaker.volume")
if not isinstance(speaker_volume, int):
    speaker_volume = 60
mic_gain = _env.get("mic.gain")
if not isinstance(mic_gain, int):
    mic_gain = 75


# -------------------
# MEDIAPIPE
# -------------------
mediapipe_tasks = _env.get("mediapipe.folder")
hand_file = _env.get("mediapipe.hand.file")
hand_url = _env.get("mediapipe.hand.url")


# -------------------
# CLASSES
# -------------------
GPT = OpenAI(api_key=OPENAI_API)
ELABS = ElevenLabs(api_key=ELABS_API)
SystemPrompt = prompt.System(
    folder=os.path.join(base_path, llm_folder), file=llm_system, env=_env
)
Cam = camera.Camera(start=False)
Mic = microphone.Microphone(
    gpt=GPT,
    model_id=whisper_model,
    silence_thold=0.6,
    sound_thold=300,
    event=is_active,
    name=SystemPrompt.get_assistant_name(),
    start=False,
    pause_event=mic_pause,
    gain=mic_gain,
)
MediapipeTasks = human.Tasks(
    download_path=os.path.join(base_path, mediapipe_tasks),
    tasks=[{"file_name": hand_file, "url": hand_url}],
)
Hands = human.Hands(
    camera=Cam,
    task_path=os.path.join(base_path, mediapipe_tasks, hand_file),
    max_hands=10,
    confidence_scores={"detection": 0.2, "presence": 0.9, "tracking": 0.9},
    event=is_active,
    start=False,
)
Speaker = speaker.Speaker(
    speaker=ELABS,
    voice_id=elabs_voice,
    speaker_model=elabs_model,
    output_format=elabs_output,
    pause_event=mic_pause,
    volume=speaker_volume,
    duration=800,
)
Messages = database.Messages(url=DATABASE, speaker=Speaker, restart=True)
Emergency = emergency.EmergencyManager(
    speaker=Speaker,
    mic=Mic,
    env=_env,
    messages=Messages,
    countdown_s=_env.get("safety.smoke.countdown_s") or 10,
)
Vitals = (
    vitals.VitalsMonitor(emergency=Emergency, env=_env)
    if _env.get("safety.heart_rate.enabled")
    else None
)
Smoke = smoke.Smoke(
    on_detected=Emergency.trigger,
    threshold=_env.get("safety.smoke.threshold") or 18000,
    debounce_samples=_env.get("safety.smoke.debounce_samples") or 3,
    poll_hz=_env.get("safety.smoke.poll_hz") or 5.0,
    i2c_address=_env.get("safety.smoke.i2c_address") or 0x48,
    adc_channel=_env.get("safety.smoke.adc_channel") or 0,
)
Tools = tools.Tools(
    path=os.path.join(base_path, llm_folder, llm_tools),
    messages=Messages,
    event=quit,
    cam=Cam,
    hands=Hands,
    emergency=Emergency,
)
AI = llm.LLM(gpt=GPT, gpt_model=llm_model, tools=Tools)
HttpServer = server.Server(
    env=_env,
    name=ROBOT_NAME,
    port=HTTP_PORT,
    setup_ready=setup_ready,
    emergency=Emergency,
    smoke=Smoke,
    vitals=Vitals,
)
Discovery = discovery.Discovery(name=ROBOT_NAME, port=HTTP_PORT)
Provisioning = provisioning.Provisioning(
    name=ROBOT_NAME,
    on_complete=lambda ip: print(f"[provisioning] connected, ip={ip}"),
)


# -------------------
# MAIN
# -------------------
def stop():
    cv2.destroyAllWindows()
    Cam.stop()
    Mic.stop()
    Hands.stop()
    Smoke.stop()
    HttpServer.stop()
    Discovery.stop()
    Provisioning.stop()
    threads.show()


def _on_provisioned(ip: str):
    # BLE'den yeni Wi-Fi credentials alındığında çağrılır. HTTP/Discovery
    # zaten started kontrolü yapıyor, bu yüzden idempotent — Wi-Fi varken
    # tekrar credentials yazılırsa bu callback yine güvenle çalışır.
    print(f"[provisioning] connected, ip={ip}")
    HttpServer.start()
    Discovery.start()


def start():
    is_active.set()
    quit.clear()

    # BLE peripheral en başta. Wi-Fi olsa bile arka planda açık kalır;
    # kullanıcı sonradan telefonla yeni Wi-Fi credentials gönderebilir.
    Provisioning.on_complete = _on_provisioned
    Provisioning.start()

    if wifi.is_connected():
        HttpServer.start()
        Discovery.start()
    else:
        print("[main] Wi-Fi yok, BLE provisioning bekleniyor...")
        while not quit.is_set():
            if wifi.is_connected():
                break
            time.sleep(0.5)
        if quit.is_set():
            stop()
            return

    # Wi-Fi var, HTTP/mDNS açık. Kullanıcı telefondan ayarlar ekranını
    # açıp "kaydet" basana kadar (POST /setup/complete) Cam/Mic/Hands ve
    # AI döngüsünü başlatma. Önceden kurulum tamamlandıysa direkt geç.
    if _env.get("setup.completed"):
        setup_ready.set()
    else:
        print("[main] Kurulum bekleniyor: telefondan ayarları kaydet.")
    while not quit.is_set():
        if setup_ready.wait(timeout=0.5):
            break
    if quit.is_set():
        stop()
        return

    Cam.start()
    Hands.start()
    Mic.start()

    if _env.get("safety.smoke.enabled"):
        Smoke.start()

    Messages.insert("system", SystemPrompt.get())
    Messages.insert("assistant", "[Sistem Başlatıldı]", speak=False)
    answer = AI.chat(messages=Messages.select_all())
    Messages.insert("assistant", answer)
    firstTime: bool = True

    while not quit.is_set():
        if is_active.wait(timeout=0.5):
            if not firstTime:
                wake_up = Mic.wake_up()
                Messages.insert("user", wake_up)
            else:
                firstTime = False
            while not quit.is_set():
                Messages.insert("system", SystemPrompt.get())

                question = Mic.listen(timeout=120)
                Messages.insert("user", question)

                if not question:
                    Messages.insert("assistant", "[Uyku Moduna Geçiliyor]", speak=False)
                    is_active.clear()
                    break

                answer = AI.chat(messages=Messages.select_all())
                Messages.insert("assistant", answer)

    stop()


if __name__ == "__main__":
    time.sleep(2)
    os.system("cls")
    start()
