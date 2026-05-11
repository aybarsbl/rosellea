import json


class Environment:
    def __init__(self, path: str):
        self.path = path

    def _read(self):
        with open(self.path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write(self, data):
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            return True
        except Exception:
            return False

    def get(self, key: str):
        parts = key.split(".")
        data = self._read()
        for part in parts:
            if not isinstance(data, dict) or part not in data:
                return None
            data = data[part]
        return data

    def set(self, key: str, value) -> bool:
        parts = key.split(".")
        data = self._read()

        current = data
        for part in parts[:-1]:
            if part not in current or not isinstance(current[part], dict):
                return False
            current = current[part]

        current[parts[-1]] = value
        return self._write(data)

    def reset(self, defaults: dict) -> bool:
        return self._write(defaults)
