import asyncio
import os
import queue as queue_mod
import sys
import threading
import time
from typing import Any, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from data.env_defaults import DEFAULT_ENV
from funcs import wifi
from funcs.emergency import EmergencyManager
from funcs.env import Environment


class EnvPatch(BaseModel):
    key: str
    value: Any


class WifiCredentials(BaseModel):
    ssid: str
    password: str = ""


class EmergencyCancel(BaseModel):
    source: str = "app"


class EmergencySent(BaseModel):
    count: int = 0


class HeartRate(BaseModel):
    heart_rate: int
    on_wrist: bool
    accuracy: str = "UNKNOWN"
    timestamp: float | None = None
    device_id: str = "watch"


class Server:
    def __init__(
        self,
        env: Environment,
        name: str,
        host: str = "0.0.0.0",
        port: int = 8000,
        setup_ready: threading.Event | None = None,
        emergency: Optional[EmergencyManager] = None,
        smoke: Any = None,
        vitals: Any = None,
    ):
        self.env = env
        self.name = name
        self.host = host
        self.port = port
        self.setup_ready = setup_ready
        self.emergency = emergency
        # Smoke izleyici opsiyonel; sadece raw current değerini frontend'e
        # bandırmak için lazım. Tip Any çünkü Smoke hardware-failsafe.
        self.smoke = smoke
        # Saatten gelen kalp ritmi örneklerini değerlendiren monitor.
        self.vitals = vitals

        self.app = FastAPI(title="Rosellea")
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )
        self._register_routes()

        self._thread: threading.Thread | None = None
        self._uvicorn: uvicorn.Server | None = None

    def _register_routes(self):
        @self.app.get("/health")
        def health():
            return {
                "name": self.name,
                "version": "1.0",
                "setup_completed": bool(self.env.get("setup.completed")),
            }

        @self.app.get("/env")
        def get_env():
            return self.env._read()

        @self.app.patch("/env")
        def patch_env(patch: EnvPatch):
            ok = self.env.set(patch.key, patch.value)
            if not ok:
                raise HTTPException(status_code=400, detail=f"Invalid key: {patch.key}")
            return {"ok": True, "key": patch.key}

        @self.app.post("/setup/complete")
        def setup_complete():
            # Telefonun ayarlar ekranı "kaydet" basınca buraya istek atar.
            # Flag kalıcı (env.json'a yazılır), event ise bu süreçte AI/Mic/Cam
            # döngüsünü bekleten main.start()'ı serbest bırakır.
            self.env.set("setup.completed", True)
            if self.setup_ready is not None:
                self.setup_ready.set()
            return {"ok": True}

        @self.app.get("/wifi/scan")
        def wifi_scan():
            return {"current": wifi.current_ssid(), "networks": wifi.scan()}

        @self.app.post("/wifi/connect")
        def wifi_connect(creds: WifiCredentials):
            ssid = creds.ssid.strip()
            if not ssid:
                raise HTTPException(status_code=400, detail="ssid boş olamaz")
            ok = wifi.connect(ssid, creds.password)
            if not ok:
                raise HTTPException(status_code=400, detail="Wi-Fi'a bağlanılamadı")
            ip = wifi.local_ip()
            if not ip:
                raise HTTPException(status_code=500, detail="IP alınamadı")
            return {"ok": True, "ip": ip}

        @self.app.get("/emergency")
        def emergency_state():
            snap = self.emergency.snapshot() if self.emergency else {
                "state": "idle",
                "raw": 0,
                "threshold": 0,
                "started_at": 0,
                "fired_at": 0,
                "countdown_s": 0,
                "sent_count": 0,
            }
            if self.smoke is not None:
                cur = self.smoke.current()
                if cur is not None:
                    snap["raw"] = cur
            return snap

        @self.app.post("/emergency/cancel")
        def emergency_cancel(body: EmergencyCancel | None = None):
            if self.emergency is None:
                raise HTTPException(status_code=503, detail="Acil durum yöneticisi yok")
            source = (body.source if body else "app") or "app"
            if self.emergency.state != EmergencyManager.STATE_ARMED:
                raise HTTPException(
                    status_code=409,
                    detail=f"İptal edilemez, mevcut durum: {self.emergency.state}",
                )
            self.emergency.cancel(source)
            return {"ok": True}

        @self.app.post("/emergency/sent")
        def emergency_sent(body: EmergencySent):
            if self.emergency is None:
                raise HTTPException(status_code=503, detail="Acil durum yöneticisi yok")
            ok = self.emergency.mark_sent(body.count)
            if not ok:
                raise HTTPException(
                    status_code=409,
                    detail=f"Mevcut durum SMS bildirimini kabul etmiyor: {self.emergency.state}",
                )
            return {"ok": True}

        @self.app.post("/emergency/test")
        def emergency_test():
            if self.emergency is None:
                raise HTTPException(status_code=503, detail="Acil durum yöneticisi yok")
            if not self.env.get("safety.smoke.test_enabled"):
                raise HTTPException(
                    status_code=403,
                    detail="Test modu kapalı (safety.smoke.test_enabled=false).",
                )
            self.emergency.trigger(99999)
            return {"ok": True}

        @self.app.post("/vitals/heart_rate")
        def vitals_heart_rate(body: HeartRate):
            if self.vitals is None:
                raise HTTPException(status_code=503, detail="Vitals yöneticisi yok")
            ts = body.timestamp if body.timestamp else time.time()
            self.vitals.ingest(
                body.device_id,
                body.heart_rate,
                body.on_wrist,
                body.accuracy,
                ts,
            )
            return {"ok": True}

        @self.app.get("/vitals/heart_rate")
        def vitals_heart_rate_snapshot(device_id: Optional[str] = None):
            # Vitals tamamen devre dışıyken (env.safety.heart_rate.enabled=False
            # ve init'te None verildi) bile frontend kart gösterebilsin diye boş
            # bir kabuk dön. 503 atmak UI'da hataya neden olur.
            if self.vitals is None:
                return {
                    "device_id": device_id or "watch",
                    "samples": 0,
                    "last": None,
                    "enabled": False,
                    "low_bpm": int(self.env.get("safety.heart_rate.low_threshold_bpm") or 40),
                    "high_bpm": int(self.env.get("safety.heart_rate.high_threshold_bpm") or 130),
                }
            return self.vitals.snapshot(device_id)

        @self.app.get("/events")
        async def events(request: Request):
            if self.emergency is None:
                raise HTTPException(status_code=503, detail="Acil durum yöneticisi yok")
            q = self.emergency.subscribe()
            loop = asyncio.get_event_loop()

            async def generator():
                last_ping = time.time()
                try:
                    while True:
                        if await request.is_disconnected():
                            break
                        try:
                            event = await loop.run_in_executor(
                                None, lambda: q.get(timeout=1.0)
                            )
                        except queue_mod.Empty:
                            event = None

                        if event is not None:
                            yield EmergencyManager.format_sse(event)

                        if time.time() - last_ping > 15:
                            # Proxy / load-balancer connection idle timeout'ları
                            # için heartbeat. ":" ile başlayan satır SSE comment.
                            yield b": ping\n\n"
                            last_ping = time.time()
                finally:
                    if self.emergency is not None:
                        self.emergency.unsubscribe(q)

            headers = {
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
            return StreamingResponse(
                generator(),
                media_type="text/event-stream",
                headers=headers,
            )

        @self.app.post("/reset")
        def reset():
            # env.json'u default'a al, sonra süreci os.execv ile yeniden başlat.
            # Restart, HTTP cevabı tel üzerinde uçtuktan sonra olsun diye
            # daemon thread içinde kısa bir gecikmeyle tetikleniyor.
            ok = self.env.reset(DEFAULT_ENV)
            if not ok:
                raise HTTPException(status_code=500, detail="env.json yazılamadı")

            def _respawn():
                time.sleep(0.5)
                sys.stdout.flush()
                sys.stderr.flush()
                os.execv(sys.executable, [sys.executable] + sys.argv)

            threading.Thread(target=_respawn, name="rosellea-respawn", daemon=True).start()
            return {"ok": True}

    def start(self, wait_timeout: float = 5.0):
        if self._thread and self._thread.is_alive():
            return
        config = uvicorn.Config(
            self.app,
            host=self.host,
            port=self.port,
            log_level="warning",
            access_log=False,
        )
        self._uvicorn = uvicorn.Server(config)
        self._thread = threading.Thread(
            target=self._uvicorn.run, name="rosellea-http", daemon=True
        )
        self._thread.start()
        # Provisioning sonrası telefon BLE notify alır almaz HTTP'ye fetch
        # atıyor. uvicorn'un dinlemeye başladığını doğrulamadan dönersek
        # connection refused alıyor, bu yüzden bloklayıp bekliyoruz.
        deadline = time.time() + wait_timeout
        while time.time() < deadline:
            if self._uvicorn.started:
                return
            time.sleep(0.05)

    def stop(self):
        if self._uvicorn:
            self._uvicorn.should_exit = True
        if self._thread:
            self._thread.join(timeout=2)
