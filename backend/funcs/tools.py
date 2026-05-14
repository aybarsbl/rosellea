import json
import threading
from typing import Optional
from funcs import camera, database, human
from funcs.emergency import EmergencyManager


class Tools:
    def __init__(
        self,
        path: str,
        messages: database.Messages,
        event: threading.Event,
        cam: camera.Camera,
        hands: human.Hands,
        emergency: Optional[EmergencyManager] = None,
    ):
        self._path = path
        self._messages = messages
        self._emergency = emergency

        self._funcs = {
            "exit": lambda: event.set(),
            "show_camera": lambda: cam.show(),
            "show_hands": lambda: hands.show(),
            "log": self._log,
            "trigger_emergency": self._trigger_emergency,
        }

    def _trigger_emergency(self):
        if self._emergency is None:
            return
        # raw=0: LLM tetiklemesi sensörden değil, kullanıcı sözlü ifadesinden.
        self._emergency.trigger(0)

    def get(self):
        with open(self._path, "r", encoding="utf-8") as f:
            return json.load(f)

    def call(self, tool_calls: dict[int, dict] | None = None):
        if tool_calls is None:
            return

        for tool_call in tool_calls.values():
            name = tool_call["name"]
            args = json.loads(tool_call.get("arguments") or "{}")

            func = self._funcs.get(name)
            if func is not None:
                func(**args)

    def _log(self, content: str):
        self._messages.insert(role="assistant", content=content)
