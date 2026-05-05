import json
import os

from jinja2 import Environment, FileSystemLoader
from funcs import env
from datetime import datetime
import re


class System:
    def __init__(self, folder: str, file: str, env: env.Environment):
        self._folder = folder
        self._file = file

        self._path = Environment(loader=FileSystemLoader(self._folder))
        self._prompt = self._path.get_template(self._file)
        self._env = env

    def get_assistant_name(self):
        voices = self._env.get("elabs.voices")
        selected = self._env.get("elabs.voice")
        for key, value in voices.items():
            if value == selected:
                return str(key).capitalize()

        return None

    def _get_tools(self):
        with open(
            os.path.join(self._folder, self._env.get("assistant.tools")),
            "r",
            encoding="utf-8",
        ) as f:
            return json.load(f)

    def get(self):
        now = datetime.now()
        date = now.strftime("%d/%m/%Y")
        time = now.strftime("%H:%M")

        user = {
            "name": self._env.get("user.name"),
            "age": self._env.get("user.age"),
            "friendship": self._env.get("user.friendship"),
            "hobbies": self._env.get("user.hobbies"),
            "health_notes": self._env.get("user.health_notes"),
            "contacts": self._env.get("user.contacts"),
        }
        assistant = {
            "name": self.get_assistant_name(),
            "model": self._env.get("assistant.model"),
        }

        data = {
            "assistant": assistant,
            "user": user,
            "tools": self._get_tools(),
            "date": date,
            "time": time,
        }

        prompt = self._prompt.render(**data)
        return re.sub(r"\n{3,}", "\n\n", prompt)
