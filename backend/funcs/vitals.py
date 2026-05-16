import threading
import time
from collections import deque
from typing import Deque, Optional

from funcs import emergency as emergency_mod
from funcs import env as env_mod


# Cihaz başına kalp ritmi örneklerini tutar, dört anomali kuralını her ingest'te
# değerlendirir. Off-wrist örnekler buffer'a yine yazılır ama hiçbir kuralı
# tetiklemez — kullanıcının saati çıkardığında alarm çalmasını istemiyoruz.
class VitalsMonitor:
    SOURCE = "heart_rate"

    def __init__(
        self,
        emergency: emergency_mod.EmergencyManager,
        env: env_mod.Environment,
        clock=time.time,
    ):
        self._emergency = emergency
        self._env = env
        self._clock = clock
        self._lock = threading.Lock()
        # device_id -> deque[(ts, hr, on_wrist, accuracy)]
        self._buffers: dict[str, Deque[tuple[float, int, bool, str]]] = {}

    def _buffer_seconds(self) -> int:
        v = self._env.get("safety.heart_rate.sample_buffer_seconds")
        return int(v) if isinstance(v, (int, float)) and v > 0 else 120

    def _get_buffer(self, device_id: str) -> Deque[tuple[float, int, bool, str]]:
        buf = self._buffers.get(device_id)
        if buf is None:
            # Saatten saniyede ~1 örnek geliyor + 5 saniyede bir POST. 120 sn
            # pencere için ~120 örnek yeter; biraz fazla yer ayır.
            buf = deque(maxlen=256)
            self._buffers[device_id] = buf
        return buf

    def snapshot(self, device_id: str = "watch") -> dict:
        with self._lock:
            buf = list(self._buffers.get(device_id, ()))
        return {
            "device_id": device_id,
            "samples": len(buf),
            "last": buf[-1] if buf else None,
        }

    def ingest(
        self,
        device_id: str,
        hr: int,
        on_wrist: bool,
        accuracy: str,
        ts: float,
    ) -> None:
        device_id = device_id or "watch"
        ts = float(ts) if ts else self._clock()
        hr = int(hr) if hr is not None else 0
        with self._lock:
            buf = self._get_buffer(device_id)
            buf.append((ts, hr, bool(on_wrist), str(accuracy or "UNKNOWN")))
            # Pencere dışındakileri at — maxlen zaten örnek sayısını sınırlıyor
            # ama uzun süreli düşük frekansta zamansal pencere de daralsın.
            window = max(
                self._buffer_seconds(),
                int(self._env.get("safety.heart_rate.sudden_change_window_s") or 30),
                int(self._env.get("safety.heart_rate.high_threshold_seconds") or 30),
                int(self._env.get("safety.heart_rate.low_threshold_seconds") or 15),
            )
            cutoff = ts - window
            while buf and buf[0][0] < cutoff:
                buf.popleft()
            samples = list(buf)

        if not self._env.get("safety.heart_rate.enabled"):
            return
        if self._emergency.state in (
            emergency_mod.EmergencyManager.STATE_ARMED,
            emergency_mod.EmergencyManager.STATE_FIRED,
            emergency_mod.EmergencyManager.STATE_SENT,
        ):
            # Zaten aktif acil durum var, yeni trigger atma.
            return

        rule, raw = self._evaluate(samples)
        if rule is None:
            return
        print(f"[Vitals] Anomali kuralı tetiklendi: {rule} (device={device_id}, hr={raw})")
        self._emergency.trigger(raw, source=self.SOURCE)

    def _evaluate(self, samples: list[tuple[float, int, bool, str]]):
        if not samples:
            return None, 0
        env = self._env
        zero_s = float(env.get("safety.heart_rate.sustained_zero_seconds") or 5)
        low_bpm = int(env.get("safety.heart_rate.low_threshold_bpm") or 40)
        low_s = float(env.get("safety.heart_rate.low_threshold_seconds") or 15)
        high_bpm = int(env.get("safety.heart_rate.high_threshold_bpm") or 130)
        high_s = float(env.get("safety.heart_rate.high_threshold_seconds") or 30)
        sudden_bpm = int(env.get("safety.heart_rate.sudden_change_bpm") or 30)
        sudden_window = float(env.get("safety.heart_rate.sudden_change_window_s") or 30)

        now = samples[-1][0]
        last = samples[-1]
        last_ts, last_hr, last_wrist, _ = last

        # 1) sustained_zero — on_wrist=True ve hr==0 kesintisiz >= zero_s
        if last_wrist and last_hr == 0:
            run_start = last_ts
            for ts, hr, wrist, _ in reversed(samples):
                if wrist and hr == 0:
                    run_start = ts
                else:
                    break
            if last_ts - run_start >= zero_s:
                return "sustained_zero", 0

        # 2) low_threshold — on_wrist=True ve 0 < hr <= low_bpm kesintisiz >= low_s
        if last_wrist and 0 < last_hr <= low_bpm:
            run_start = last_ts
            for ts, hr, wrist, _ in reversed(samples):
                if wrist and 0 < hr <= low_bpm:
                    run_start = ts
                else:
                    break
            if last_ts - run_start >= low_s:
                return "low_threshold", last_hr

        # 3) high_threshold — on_wrist=True ve hr >= high_bpm kesintisiz >= high_s
        if last_wrist and last_hr >= high_bpm:
            run_start = last_ts
            for ts, hr, wrist, _ in reversed(samples):
                if wrist and hr >= high_bpm:
                    run_start = ts
                else:
                    break
            if last_ts - run_start >= high_s:
                return "high_threshold", last_hr

        # 4) sudden_change — son sudden_window saniyede on_wrist=True örneklerin
        #    (max - min) >= sudden_bpm. Anlık spike'ları yakalar.
        window_cutoff = now - sudden_window
        window_hrs = [hr for ts, hr, wrist, _ in samples if ts >= window_cutoff and wrist]
        if len(window_hrs) >= 2:
            spread = max(window_hrs) - min(window_hrs)
            if spread >= sudden_bpm:
                return "sudden_change", last_hr

        return None, 0
