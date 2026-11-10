"""
Utilitas deteksi alamat IP LAN dan pembentuk Base URL untuk share QR Code.
"""
import socket

from backend.config import CFG


def _is_valid_lan_ip(ip: str) -> bool:
    return bool(ip) and not ip.startswith("127.") and not ip.startswith("169.254.")


def get_all_lan_ips() -> list:
    """Mendapatkan seluruh daftar IP LAN lokal yang valid (non-loopback, non-APIPA)."""
    ips = []

    # 1. Metode UDP connect (menentukan interface default)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if _is_valid_lan_ip(ip) and ip not in ips:
            ips.append(ip)
    except Exception:
        pass

    # 2. Hostname DNS resolution (andal saat offline / tanpa internet)
    try:
        host = socket.gethostname()
        for ip in socket.gethostbyname_ex(host)[2]:
            if _is_valid_lan_ip(ip) and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    # 3. getaddrinfo
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = item[4][0]
            if _is_valid_lan_ip(ip) and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    return ips


def get_local_ip() -> str:
    """Mendapatkan IP LAN utama server agar halaman share dapat dibuka dari HP via Wi-Fi."""
    cfg_ip = CFG.get("server_ip")
    if cfg_ip and str(cfg_ip).strip() and not str(cfg_ip).startswith("127.") and "localhost" not in str(cfg_ip):
        return str(cfg_ip).strip()

    all_ips = get_all_lan_ips()
    for ip in all_ips:
        if ip.startswith("192.168.") or ip.startswith("10."):
            return ip
    for ip in all_ips:
        if ip.startswith("172."):
            parts = ip.split(".")
            if len(parts) >= 2 and 16 <= int(parts[1]) <= 31:
                return ip

    if all_ips:
        return all_ips[0]

    return "127.0.0.1"


def get_base_url() -> str:
    """Menghasilkan base URL lengkap (http://IP:PORT) untuk QR Code."""
    custom = CFG.get("base_url")
    if custom and "localhost" not in custom and "127.0.0.1" not in custom:
        return custom.rstrip("/")

    cfg_ip = CFG.get("server_ip")
    if cfg_ip and (str(cfg_ip).startswith("http://") or str(cfg_ip).startswith("https://")):
        return str(cfg_ip).rstrip("/")

    ip = get_local_ip()
    port = int(CFG.get("port", 8080))
    if cfg_ip and ":" in str(cfg_ip) and not str(cfg_ip).startswith("http"):
        return f"http://{cfg_ip}"

    return f"http://{ip}:{port}"


def local_ips() -> list:
    """Kembalikan daftar IP LAN atau fallback IP lokal tunggal."""
    ips = get_all_lan_ips()
    return ips if ips else [get_local_ip()]
