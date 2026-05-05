import json
import threading
from funcs import camera, database, human


class Tools:
    def __init__(
        self,
        path: str,
        messages: database.Messages,
        event: threading.Event,
        cam: camera.Camera,
        hands: human.Hands,
    ):
        self._path = path
        self._messages = messages

        self._funcs = {
            "exit": lambda: event.set(),
            "show_camera": lambda: cam.show(),
            "show_hands": lambda: hands.show(),
            "log": self._log,
        }

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
