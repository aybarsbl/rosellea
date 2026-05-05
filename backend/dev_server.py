"""Geliştirme amaçlı: sadece HTTP + mDNS servislerini ayağa kaldırır.

main.py mediapipe, opencv, pyaudio gibi donanım gerektiren modülleri
yüklediği için Windows/Mac geliştirme makinesinde sorun çıkarır.
Bu script sadece Faz 2 servislerini çalıştırır, telefonun configure
ekranıyla end-to-end test edebilirsin.

Çalıştırmak için:
    pip install fastapi "uvicorn[standard]" zeroconf pydantic
    python dev_server.py
"""

import os
import socket
import time

from funcs import discovery, env, server


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    _env = env.Environment(os.path.join(base, "data/env.json"))

    name = _env.get("robot.name") or f"Rosellea-{socket.gethostname()}"
    port = 8000

    http = server.Server(env=_env, name=name, port=port)
    mdns = discovery.Discovery(name=name, port=port)

    http.start()
    mdns.start()
    print(f"[dev_server] up. http://127.0.0.1:{port}/health  service={name}")
    print("Ctrl+C ile durdur.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        http.stop()
        mdns.stop()
        print("\n[dev_server] kapatıldı.")


if __name__ == "__main__":
    main()
