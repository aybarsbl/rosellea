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


def scan(timeout: int = 8) -> list[dict]:
    """Yakındaki Wi-Fi ağlarını listeler. SSID başına en güçlü sinyal tutulur."""
    try:
        result = subprocess.run(
            [
                "nmcli",
                "-t",
                "-f",
                "SSID,SIGNAL,SECURITY",
                "device",
                "wifi",
                "list",
                "--rescan",
                "yes",
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

    if result.returncode != 0:
        return []

    seen: dict[str, dict] = {}
    for line in result.stdout.splitlines():
        # nmcli -t formatında alanlar ":" ile ayrılır, SSID içinde ":" varsa "\:" olur.
        fields = _split_nmcli(line)
        if len(fields) < 3:
            continue
        ssid, signal_raw, security = fields[0], fields[1], fields[2]
        if not ssid:
            continue
        try:
            signal = int(signal_raw)
        except ValueError:
            signal = 0
        secure = bool(security and security != "--")
        prev = seen.get(ssid)
        if prev is None or signal > prev["signal"]:
            seen[ssid] = {"ssid": ssid, "signal": signal, "secure": secure}

    return sorted(seen.values(), key=lambda n: n["signal"], reverse=True)


def current_ssid() -> str | None:
    """Şu an aktif olan Wi-Fi bağlantısının SSID'si (yoksa None)."""
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "NAME,TYPE", "connection", "show", "--active"],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None

    if result.returncode != 0:
        return None

    for line in result.stdout.splitlines():
        fields = _split_nmcli(line)
        if len(fields) < 2:
            continue
        name, conn_type = fields[0], fields[1]
        if conn_type == "802-11-wireless" and name:
            return name
    return None


def safe_summary(ssid: str, password: str) -> str:
    """Loglara basmak için parolayı maskele."""
    masked = "*" * len(password) if password else ""
    return f"ssid={shlex.quote(ssid)} password={masked}"


def _split_nmcli(line: str) -> list[str]:
    """nmcli -t çıktısında ':' ayraç, '\\:' kaçırılmış değer."""
    out: list[str] = []
    buf: list[str] = []
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == "\\" and i + 1 < len(line) and line[i + 1] == ":":
            buf.append(":")
            i += 2
            continue
        if ch == ":":
            out.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    out.append("".join(buf))
    return out
