import shlex
import socket
import subprocess


def is_connected() -> bool:
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "STATE", "general"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        return result.stdout.strip() == "connected"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def local_ip() -> str | None:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def connect(ssid: str, password: str, timeout: int = 30) -> bool:
    if not ssid or not password:
        return False
    cmd = [
        "nmcli",
        "device",
        "wifi",
        "connect",
        ssid,
        "password",
        password,
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def safe_summary(ssid: str, password: str) -> str:
    """Loglara basmak için parolayı maskele."""
    masked = "*" * len(password) if password else ""
    return f"ssid={shlex.quote(ssid)} password={masked}"
