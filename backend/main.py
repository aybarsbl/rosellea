import socket
import threading
import time
import cv2
import os
from dotenv import load_dotenv
from openai import OpenAI
from elevenlabs.client import ElevenLabs

os.environ["OPENCV_LOG_LEVEL"] = "OFF"
from funcs import (
    database,
    discovery,
    env,
    llm,
    prompt,
    camera,
    human,
    provisioning,
    server,
    speaker,
    threads,
    microphone,
    tools,
    wifi,
)

# -------------------
# CONFIG
# -------------------
base_path = os.path.dirname(os.path.abspath(__file__))
_env = env.Environment(os.path.join(base_path, "data/env.json"))
is_active = threading.Event()
quit = threading.Event()


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
Cam = camera.Camera(start=True)
Mic = microphone.Microphone(
    model_size="small",
    silence_thold=1.0,
    sound_thold=100,
    event=is_active,
    name=SystemPrompt.get_assistant_name(),
    start=True,
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
    start=True,
)
Speaker = speaker.Speaker(
    speaker=ELABS,
    voice_id=elabs_voice,
    speaker_model=elabs_model,
    output_format=elabs_output,
)
Messages = database.Messages(url=DATABASE, speaker=Speaker, restart=True)
Tools = tools.Tools(
    path=os.path.join(base_path, llm_folder, llm_tools),
    messages=Messages,
    event=quit,
    cam=Cam,
    hands=Hands,
)
AI = llm.LLM(gpt=GPT, gpt_model=llm_model, tools=Tools)
HttpServer = server.Server(env=_env, name=ROBOT_NAME, port=HTTP_PORT)
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
    HttpServer.stop()
    Discovery.stop()
    Provisioning.stop()
    threads.show()


def start():
    is_active.set()
    quit.clear()

    if wifi.is_connected():
        HttpServer.start()
        Discovery.start()
    else:
        # Wi-Fi yok: önce BLE peripheral'i aç, kullanıcı telefonundan
        # provisioning yapsın. Bağlanınca HTTP + mDNS de başlar.
        print("[main] Wi-Fi bağlantısı yok, BLE provisioning başlatılıyor...")
        Provisioning.on_complete = lambda ip: (
            print(f"[provisioning] connected, ip={ip}"),
            HttpServer.start(),
            Discovery.start(),
        )
        Provisioning.start()

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

                question = Mic.listen(timeout=30)
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
