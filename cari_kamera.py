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
import urllib.request
import uuid
from urllib.parse import quote

# (port, path, label). Urutan = urutan dicoba.
CANDIDATES = [
    (8554, "/Streaming/Channels/101", "Bardi / Tuya (utama)"),
    (8554, "/", "Bardi / Tuya"),
    (554, "/Streaming/Channels/101", "Hikvision / HiLook"),
    (554, "/cam/realmonitor?channel=1&subtype=0", "Dahua / Imou"),
    (554, "/h264/ch1/main/av_stream", "EZVIZ"),
    (554, "/stream1", "TP-Link Tapo"),
    (554, "/unicast/c1/s0/live", "Uniview"),
    (554, "/live/ch00_0", "Kamera generik"),
    (554, "/onvif1", "Kamera generik"),
    (554, "/", "Kamera generik"),
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


def try_url(ffprobe, url, timeout=8):
    try:
        out = subprocess.run([ffprobe, "-v", "error", "-rtsp_transport", "tcp", "-select_streams", "v:0",
                              "-show_entries", "stream=codec_name,width,height", "-of", "json", url],
                             capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None, "tidak ada jawaban"
    if out.returncode == 0:
        st = (json.loads(out.stdout or "{}").get("streams") or [{}])[0]
        return f"{st.get('codec_name', '?')} {st.get('width', '?')}×{st.get('height', '?')}", ""
    return None, (out.stderr.strip().splitlines() or ["gagal"])[-1]


def probe_onvif(ip, user, password, ffprobe="ffprobe"):
    """Query ONVIF Media Service secara langsung untuk mendapatkan URL RTSP persis."""
    for port in (8000, 80, 8080, 5000, 554, 8554):
        if not port_open(ip, port, timeout=1.0):
            continue
        base_url = f"http://{ip}:{port}"
        device_url = f"{base_url}/onvif/device_service"
        passman = urllib.request.HTTPPasswordMgrWithDefaultRealm()
        passman.add_password(None, base_url, user, password)
        opener = urllib.request.build_opener(urllib.request.HTTPDigestAuthHandler(passman))

        def soap(url, body):
            env = (
                f'<?xml version="1.0" encoding="UTF-8"?>'
                f'<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">'
                f'<s:Body>{body}</s:Body></s:Envelope>'
            ).encode("utf-8")
            req = urllib.request.Request(
                url, data=env, headers={"Content-Type": "application/soap+xml; charset=utf-8"}
            )
            return opener.open(req, timeout=3).read().decode("utf-8", "ignore")

        try:
            resp = soap(
                device_url,
                '<GetCapabilities xmlns="http://www.onvif.org/ver10/device/wsdl">'
                "<Category>All</Category></GetCapabilities>",
            )
        except Exception:
            continue

        m = re.search(r"<[^:]+:Media>\s*<[^:]+:XAddr>([^<]+)<", resp) or re.search(
            r"XAddr>([^<]*media[^<]*)<", resp, re.I
        )
        media_url = m.group(1).strip() if m else f"{base_url}/onvif/media_service"

        try:
            resp_prof = soap(media_url, '<GetProfiles xmlns="http://www.onvif.org/ver10/media/wsdl"/>')
        except Exception:
            continue

        tokens = re.findall(r'token="([^"\s]+)"', resp_prof)
        for tok in tokens:
            uri_body = (
                f'<GetStreamUri xmlns="http://www.onvif.org/ver10/media/wsdl">'
                f"<StreamSetup>"
                f'<Stream xmlns="http://www.onvif.org/ver10/schema">RTP-Unicast</Stream>'
                f'<Transport xmlns="http://www.onvif.org/ver10/schema"><Protocol>RTSP</Protocol></Transport>'
                f"</StreamSetup><ProfileToken>{tok}</ProfileToken></GetStreamUri>"
            )
            try:
                resp_uri = soap(media_url, uri_body)
                m_uri = re.search(r"<[^:]+:Uri>([^<]+)<", resp_uri)
                if not m_uri:
                    continue
                raw_rtsp = m_uri.group(1).strip()
                # Sisipkan user & password jika belum ada di URL
                if "://" in raw_rtsp and "@" not in raw_rtsp and user:
                    proto, rest = raw_rtsp.split("://", 1)
                    cred = quote(user, safe="") + (":" + quote(password, safe="") if password else "")
                    rtsp_url = f"{proto}://{cred}@{rest}"
                else:
                    rtsp_url = raw_rtsp
                info, err = try_url(ffprobe, rtsp_url)
                if info:
                    return {"ok": True, "url": rtsp_url, "label": "ONVIF Auto-Detect", "info": info}
            except Exception:
                pass
    return None


def probe(ip, user, password, ffprobe="ffprobe"):
    """Coba pola RTSP satu per satu. Mengembalikan dict hasil."""
    # Coba ONVIF query terlebih dahulu
    onvif_res = probe_onvif(ip, user, password, ffprobe)
    if onvif_res:
        return onvif_res

    ports = {p: port_open(ip, p) for p in sorted({c[0] for c in CANDIDATES})}
    if not any(ports.values()):
        return {"ok": False, "message": f"Kamera {ip} tidak menjawab di port RTSP (554/8554). "
                                         "Cek IP, pastikan satu jaringan, dan ONVIF sudah aktif di aplikasi."}
    auth_fail = False
    for port, path, label in CANDIDATES:
        if not ports.get(port):
            continue
        url = build_url(ip, port, path, user, password)
        info, err = try_url(ffprobe, url)
        if info:
            return {"ok": True, "url": url, "label": label, "info": info}
        if "401" in err or "Unauthorized" in err:
            auth_fail = True
    if auth_fail:
        return {"ok": False, "message": "Kamera menolak username/password. Untuk Bardi, gunakan username admin dan "
                                         "password ONVIF yang dibuat di aplikasi Bardi."}
    return {"ok": False, "message": "Port RTSP terbuka tapi alamat streamnya tidak cocok dengan pola yang dikenal. "
                                     "Masukkan alamat RTSP manual di config.json (lihat manual kamera)."}


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3:
        print(probe(sys.argv[1], "admin", sys.argv[2]))
    else:
        print("Mencari kamera ONVIF…")
        for c in discover():
            print(c)
