"""
Mencari kamera di jaringan lokal dan menemukan alamat RTSP-nya.

- discover(): kirim permintaan ONVIF (WS-Discovery) ke jaringan, kumpulkan IP kamera yang menjawab.
- probe():    coba pola alamat RTSP yang umum (Bardi lebih dulu) sampai ada yang berhasil.
"""
import json
import re
import socket
import subprocess
import time
import uuid
from urllib.parse import quote

# (port, path, label). Urutan = urutan dicoba.
CANDIDATES = [
    (8554, "/Streaming/Channels/101", "Bardi / Tuya (utama)"),
    (8554, "/", "Bardi / Tuya"),
    (8554, "/live/ch0", "Bardi / Tuya"),
    (554, "/Streaming/Channels/101", "Hikvision / HiLook"),
    (554, "/cam/realmonitor?channel=1&subtype=0", "Dahua / Imou"),
    (554, "/h264/ch1/main/av_stream", "EZVIZ"),
    (554, "/stream1", "TP-Link Tapo"),
    (554, "/unicast/c1/s0/live", "Uniview"),
    (554, "/live/ch00_0", "Kamera generik"),
    (554, "/live/ch0", "Kamera generik"),
    (554, "/onvif1", "Kamera generik"),
    (554, "/ch0_0.264", "Kamera generik"),
    (554, "/", "Kamera generik"),
    (8000, "/Streaming/Channels/101", "Hikvision (Port 8000)"),
]

PROBE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
 xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
<e:Header><w:MessageID>uuid:{id}</w:MessageID>
<w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
<w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>
<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>"""


def parse_reply(data, addr):
    text = data.decode("utf-8", "ignore")
    xaddrs = re.findall(r"<[^>]*XAddrs>([^<]+)<", text)
    scopes = " ".join(re.findall(r"<[^>]*Scopes>([^<]+)<", text))
    name = ""
    m = re.search(r"onvif://www\.onvif\.org/name/([^\s]+)", scopes)
    if m:
        name = m.group(1).replace("%20", " ")
    hw = re.search(r"onvif://www\.onvif\.org/hardware/([^\s]+)", scopes)
    ip = addr[0]
    if xaddrs:
        m = re.search(r"https?://([0-9.]+)", xaddrs[0])
        if m:
            ip = m.group(1)
    return {"ip": ip, "name": name, "hardware": hw.group(1) if hw else ""}


def discover(timeout=3.0):
    """Cari kamera ONVIF di jaringan. Mengembalikan daftar {ip, name, hardware}."""
    found = {}
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    s.settimeout(0.5)
    msg = PROBE_XML.format(id=uuid.uuid4()).encode()
    try:
        for _ in range(2):
            s.sendto(msg, ("239.255.255.250", 3702))
        end = time.time() + timeout
        while time.time() < end:
            try:
                data, addr = s.recvfrom(65535)
            except socket.timeout:
                continue
            info = parse_reply(data, addr)
            found.setdefault(info["ip"], info)
    except OSError:
        pass
    finally:
        s.close()
    return sorted(found.values(), key=lambda d: [int(x) for x in d["ip"].split(".")])


def port_open(ip, port, timeout=1.5):
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except OSError:
        return False


def build_url(ip, port, path, user, password):
    cred = ""
    if user:
        cred = quote(user, safe="") + (":" + quote(password, safe="") if password else "") + "@"
    return f"rtsp://{cred}{ip}:{port}{path}"


def try_url(ffprobe, url, timeout=6):
    try:
        out = subprocess.run([ffprobe, "-v", "error", "-rtsp_transport", "tcp", "-select_streams", "v:0",
                              "-show_entries", "stream=codec_name,width,height", "-of", "json", url],
                             capture_output=True, text=True, timeout=timeout)
        if out.returncode != 0 and "Option -rtsp_transport" in (out.stderr or ""):
            # Fallback tanpa transport tcp jika kamera hanya support UDP
            out = subprocess.run([ffprobe, "-v", "error", "-select_streams", "v:0",
                                  "-show_entries", "stream=codec_name,width,height", "-of", "json", url],
                                 capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None, "timeout (tidak ada jawaban dari stream kamera)"
    except FileNotFoundError:
        return None, "ffprobe tidak ditemukan di sistem"
    except Exception as e:
        return None, str(e)

    if out.returncode == 0:
        st = (json.loads(out.stdout or "{}").get("streams") or [{}])[0]
        return f"{st.get('codec_name', '?')} {st.get('width', '?')}×{st.get('height', '?')}", ""
    last_line = (out.stderr.strip().splitlines() or ["gagal"])[-1]
    return None, last_line


def probe(ip, user, password, ffprobe="ffprobe", port=None):
    """Coba pola RTSP satu per satu. Mengembalikan dict hasil."""
    try:
        custom_p = int(port) if port else None
    except (ValueError, TypeError):
        custom_p = None

    if custom_p:
        target_ports = [custom_p]
        known_paths = [
            ("/Streaming/Channels/101", "Bardi / Hikvision"),
            ("/Streaming/Channels/1", "Hikvision"),
            ("/cam/realmonitor?channel=1&subtype=0", "Dahua / Imou"),
            ("/stream1", "TP-Link Tapo"),
            ("/stream2", "TP-Link Tapo (Sub)"),
            ("/h264/ch1/main/av_stream", "EZVIZ"),
            ("/unicast/c1/s0/live", "Uniview"),
            ("/live/ch00_0", "Kamera generik"),
            ("/live/ch0", "Kamera generik / V380"),
            ("/live/av0", "Kamera generik / V380"),
            ("/onvif1", "Kamera generik"),
            ("/ch0_0.264", "Kamera generik"),
            ("/video1", "Kamera generik"),
            ("/", "Kamera generik"),
        ]
        active_candidates = [(custom_p, path, f"{label} (Port {custom_p})") for path, label in known_paths]
    else:
        target_ports = sorted({c[0] for c in CANDIDATES})
        active_candidates = CANDIDATES

    ports = {p: port_open(ip, p) for p in target_ports}
    if not any(ports.values()):
        ports_str = "/".join(str(p) for p in target_ports)
        return {"ok": False, "message": f"Kamera {ip} tidak menjawab di port RTSP ({ports_str}). "
                                         "Cek IP, pastikan satu jaringan, dan ONVIF sudah aktif di aplikasi."}
    auth_fail = False
    last_errors = []
    for port, path, label in active_candidates:
        if not ports.get(port):
            continue
        url = build_url(ip, port, path, user, password)
        info, err = try_url(ffprobe, url)
        if info:
            return {"ok": True, "url": url, "label": label, "info": info}
        if err and any(w in err.lower() for w in ["401", "unauthorized", "auth", "forbidden", "403"]):
            auth_fail = True
        if err and err not in last_errors:
            last_errors.append(err)

    if auth_fail:
        return {"ok": False, "message": "Kamera menolak username/password (401/403 Unauthorized). Periksa kembali username & password kamera."}
    
    err_detail = f" (Respon kamera: {last_errors[-1][:120]})" if last_errors else ""
    return {"ok": False, "message": f"Port RTSP terbuka tetapi path stream tidak cocok{err_detail}. "
                                     "Gunakan opsi 'URL RTSP Manual' dengan format RTSP manual dari kamera kamu."}


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3:
        print(probe(sys.argv[1], "admin", sys.argv[2]))
    else:
        print("Mencari kamera ONVIF…")
        for c in discover():
            print(c)
