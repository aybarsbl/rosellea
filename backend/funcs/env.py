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

    def ensure_defaults(self, defaults: dict) -> bool:
        # Eski env.json sürümlerine sonradan eklenmiş anahtarları doldurur:
        # mevcut değerleri ASLA override etmez, sadece eksik path'leri yazar.
        # Yeni feature'ları (örn. safety.heart_rate) kullanıcı reset etmek
        # zorunda kalmadan açabilsin diye.
        data = self._read()
        changed = self._merge_missing(data, defaults)
        if changed:
            return self._write(data)
        return True

    @staticmethod
    def _merge_missing(target: dict, defaults: dict) -> bool:
        changed = False
        for key, default_value in defaults.items():
            if key not in target:
                target[key] = default_value
                changed = True
            elif isinstance(default_value, dict) and isinstance(target.get(key), dict):
                if Environment._merge_missing(target[key], default_value):
                    changed = True
        return changed
