import socket

from zeroconf import IPVersion, ServiceInfo, Zeroconf

SERVICE_TYPE = "_rosellea._tcp.local."


class Discovery:
    def __init__(self, name: str, port: int = 8000):
        self.name = name
        self.port = port
        self._zc: Zeroconf | None = None
        self._info: ServiceInfo | None = None

    def _local_ip(self) -> str:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"
        finally:
            s.close()

    def start(self):
        if self._zc is not None:
            return
        ip = self._local_ip()
        hostname = socket.gethostname()
        if not hostname.endswith(".local."):
            hostname = f"{hostname}.local."

        instance = f"{self.name}.{SERVICE_TYPE}"
        self._info = ServiceInfo(
            type_=SERVICE_TYPE,
            name=instance,
            addresses=[socket.inet_aton(ip)],
            port=self.port,
            properties={"name": self.name, "version": "1.0"},
            server=hostname,
        )
        self._zc = Zeroconf(ip_version=IPVersion.V4Only)
        self._zc.register_service(self._info)

    def stop(self):
        if self._zc and self._info:
            try:
                self._zc.unregister_service(self._info)
            except Exception:
                pass
        if self._zc:
            self._zc.close()
        self._zc = None
        self._info = None
