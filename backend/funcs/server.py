import threading
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from funcs.env import Environment


class EnvPatch(BaseModel):
    key: str
    value: Any


class Server:
    def __init__(
        self,
        env: Environment,
        name: str,
        host: str = "0.0.0.0",
        port: int = 8000,
        setup_ready: threading.Event | None = None,
    ):
        self.env = env
        self.name = name
        self.host = host
        self.port = port
        self.setup_ready = setup_ready

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

    def start(self):
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

    def stop(self):
        if self._uvicorn:
            self._uvicorn.should_exit = True
        if self._thread:
            self._thread.join(timeout=2)
