import asyncio
import json
import threading
from typing import Callable

from bless import (
    BlessGATTCharacteristic,
    BlessServer,
    GATTAttributePermissions,
    GATTCharacteristicProperties,
)

from funcs import wifi

SERVICE_UUID = "b2e7c8f0-1a4d-4e6f-9b8c-2d3e4f5a6b7c"
CHAR_WIFI_UUID = "b2e7c8f0-1a4d-4e6f-9b8c-2d3e4f5a6b71"
CHAR_STATUS_UUID = "b2e7c8f0-1a4d-4e6f-9b8c-2d3e4f5a6b72"
CHAR_IP_UUID = "b2e7c8f0-1a4d-4e6f-9b8c-2d3e4f5a6b73"
CHAR_SCAN_UUID = "b2e7c8f0-1a4d-4e6f-9b8c-2d3e4f5a6b74"


class Provisioning:
    """BLE GATT peripheral. Wi-Fi credentials alır, ağa bağlanır, IP'yi
    notify ile telefona bildirir. Server kalıcıdır — Wi-Fi gelse bile açık
    kalır, böylece kullanıcı sonradan yeni Wi-Fi credentials gönderebilir.

    Karakteristikler:
      - WIFI: write    {ssid, password} JSON
      - STATUS: read/notify  idle|connecting|connected|failed|scanning
      - IP: read/notify       son alınan IP (utf-8 string)
      - SCAN: write/read/notify  write -> tarama tetikler, sonuç JSON dizi
    """

    def __init__(self, name: str, on_complete: Callable[[str], None] | None = None):
        self.name = name
        self.on_complete = on_complete

        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._server: BlessServer | None = None
        self._stop_event: asyncio.Event | None = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(
            target=self._run, name="rosellea-ble", daemon=True
        )
        self._thread.start()

    def stop(self):
        if not self._loop or not self._stop_event:
            return
        self._loop.call_soon_threadsafe(self._stop_event.set)
        if self._thread:
            self._thread.join(timeout=3)

    def _run(self):
        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._serve())
        finally:
            loop.close()
            self._loop = None

    async def _serve(self):
        self._stop_event = asyncio.Event()
        self._server = BlessServer(name=self.name, loop=asyncio.get_event_loop())
        self._server.read_request_func = self._on_read
        self._server.write_request_func = self._on_write

        await self._server.add_new_service(SERVICE_UUID)

        await self._server.add_new_characteristic(
            SERVICE_UUID,
            CHAR_WIFI_UUID,
            GATTCharacteristicProperties.write,
            None,
            GATTAttributePermissions.writeable,
        )
        await self._server.add_new_characteristic(
            SERVICE_UUID,
            CHAR_STATUS_UUID,
            GATTCharacteristicProperties.read | GATTCharacteristicProperties.notify,
            bytearray(b"idle"),
            GATTAttributePermissions.readable,
        )
        await self._server.add_new_characteristic(
            SERVICE_UUID,
            CHAR_IP_UUID,
            GATTCharacteristicProperties.read | GATTCharacteristicProperties.notify,
            bytearray(b""),
            GATTAttributePermissions.readable,
        )
        await self._server.add_new_characteristic(
            SERVICE_UUID,
            CHAR_SCAN_UUID,
            GATTCharacteristicProperties.write
            | GATTCharacteristicProperties.read
            | GATTCharacteristicProperties.notify,
            bytearray(b"[]"),
            GATTAttributePermissions.readable | GATTAttributePermissions.writeable,
        )

        await self._server.start()
        try:
            await self._stop_event.wait()
        finally:
            try:
                await self._server.stop()
            except Exception:
                pass

    # ---- characteristic callbacks ----

    def _on_read(self, characteristic: BlessGATTCharacteristic, **kwargs) -> bytearray:
        return characteristic.value

    def _on_write(
        self,
        characteristic: BlessGATTCharacteristic,
        value: bytearray,
        **kwargs,
    ):
        uuid = str(characteristic.uuid).lower()
        if uuid == CHAR_WIFI_UUID:
            self._handle_wifi_write(value)
        elif uuid == CHAR_SCAN_UUID:
            self._handle_scan_write()

    def _handle_wifi_write(self, value: bytearray):
        try:
            payload = json.loads(bytes(value).decode("utf-8"))
            ssid = str(payload.get("ssid", "")).strip()
            password = str(payload.get("password", ""))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._publish_status(b"failed")
            return

        if not ssid:
            self._publish_status(b"failed")
            return

        threading.Thread(
            target=self._connect_wifi,
            args=(ssid, password),
            name="rosellea-wifi-connect",
            daemon=True,
        ).start()

    def _handle_scan_write(self):
        # Scan blocking subprocess; event loop'u tıkamamak için ayrı thread.
        threading.Thread(
            target=self._run_scan,
            name="rosellea-wifi-scan",
            daemon=True,
        ).start()

    def _run_scan(self):
        self._publish_status(b"scanning")
        networks = wifi.scan()
        try:
            payload = json.dumps(networks, ensure_ascii=False).encode("utf-8")
        except (TypeError, ValueError):
            payload = b"[]"
        self._update_char(CHAR_SCAN_UUID, payload)
        self._publish_status(b"idle")

    def _connect_wifi(self, ssid: str, password: str):
        self._publish_status(b"connecting")
        ok = wifi.connect(ssid, password)
        if not ok:
            self._publish_status(b"failed")
            return
        ip = wifi.local_ip()
        if not ip:
            self._publish_status(b"failed")
            return
        self._publish_status(b"connected")
        # IP'yi notify etmeden önce HTTP server / mDNS hazır olsun.
        # Aksi halde telefon hemen disconnect olup configure ekranında
        # getEnv() atınca uvicorn henüz bind etmemiş oluyor.
        if self.on_complete:
            try:
                self.on_complete(ip)
            except Exception:
                pass
        self._publish_ip(ip.encode("utf-8"))

    def _publish_status(self, value: bytes):
        self._update_char(CHAR_STATUS_UUID, value)

    def _publish_ip(self, value: bytes):
        self._update_char(CHAR_IP_UUID, value)

    def _update_char(self, uuid: str, value: bytes):
        if not self._server:
            return
        try:
            char = self._server.get_characteristic(uuid)
            if char is None:
                return
            char.value = bytearray(value)
            self._server.update_value(SERVICE_UUID, uuid)
        except Exception:
            pass
