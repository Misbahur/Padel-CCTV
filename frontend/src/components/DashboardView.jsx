import React, { useState, useEffect } from 'react';
import { 
  Tv, Camera, Video, Settings, LogOut, Users, Play, Square, 
  RefreshCw, CheckCircle2, AlertTriangle, Shield, Eye, Plus, Trash2, Sliders, Clock, Lock, RotateCcw,
  Film, QrCode, Download, ExternalLink, Scissors, Check, Copy, Heart, Sparkles
} from 'lucide-react';

const MODE_HINTS = {
  golden: 'Golden Point: di 40–40 (deuce), 1 poin langsung menentukan pemenang game. Standar turnamen padel.',
  adv: 'Advantage (Klasik Tenis): di 40–40, tim harus unggul 2 poin berturut-turut untuk memenangkan game.',
  star: 'Star Point (Aturan FIP): 2x advantage boleh dimainkan; jika deuce ketiga, 1 star point langsung penentu.',
  americano: 'Americano / Mexicano: akumulasi total poin sampai target (misal 24). Servis berganti berkala.'
};

export default function DashboardView({ navigate }) {
  const [courtsStatus, setCourtsStatus] = useState({});
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeCamTab, setActiveCamTab] = useState(1);
  const [activeRecTab, setActiveRecTab] = useState(1);
  
  // Modal Set Player & Match Settings
  const [editPlayerModal, setEditPlayerModal] = useState(null); // court_id or null
  const [pA1, setPA1] = useState('');
  const [pA2, setPA2] = useState('');
  const [pB1, setPB1] = useState('');
  const [pB2, setPB2] = useState('');
  const [selectedMode, setSelectedMode] = useState('golden');
  const [selectedBestOf, setSelectedBestOf] = useState(3);
  const [selectedGames, setSelectedGames] = useState(6);
  const [selectedSuperTb, setSelectedSuperTb] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(24);

  // Password / PIN Form
  const [newAdminPw, setNewAdminPw] = useState('');
  const [pinCourtId, setPinCourtId] = useState(1);
  const [newPin, setNewPin] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');

  // Camera Form
  const [camName, setCamName] = useState('');
  const [camIp, setCamIp] = useState('');
  const [camPort, setCamPort] = useState('554');
  const [camUser, setCamUser] = useState('admin');
  const [camPass, setCamPass] = useState('');
  const [camRtspDirect, setCamRtspDirect] = useState('');
  const [camMode, setCamMode] = useState('ip'); // 'ip' or 'rtsp'
  const [camMsg, setCamMsg] = useState('');
  const [camLoading, setCamLoading] = useState(false);
  const [foundCams, setFoundCams] = useState([]);

  // Modal Media & Highlights (QR Share & Clips)
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaCourtId, setMediaCourtId] = useState(null);
  const [mediaSessions, setMediaSessions] = useState([]);
  const [selectedMediaSession, setSelectedMediaSession] = useState(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState('reel');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [serverBaseUrl, setServerBaseUrl] = useState('');
  const [isClipping, setIsClipping] = useState(false);

  // Pengaturan IP Server untuk QR Code
  const [customServerIp, setCustomServerIp] = useState('');
  const [detectedServerIp, setDetectedServerIp] = useState('');
  const [allDetectedIps, setAllDetectedIps] = useState([]);
  const [serverIpMsg, setServerIpMsg] = useState(null);
  const [savingIp, setSavingIp] = useState(false);

  // Pengaturan Pemotongan Klip Highlight (Love ❤️)
  const [preRollSec, setPreRollSec] = useState(12);
  const [postRollSec, setPostRollSec] = useState(4);
  const [autoReel, setAutoReel] = useState(true);
  const [clippingMsg, setClippingMsg] = useState(null);
  const [savingClipping, setSavingClipping] = useState(false);
  const [modalPreRoll, setModalPreRoll] = useState(12);
  const [modalPostRoll, setModalPostRoll] = useState(4);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/status');
      if (res.status === 401) {
        navigate('/login?next=/dashboard');
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setCourtsStatus(data.courts || {});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/config');
      const data = await res.json();
      if (data.ok) {
        setConfig(data.config);
        if (data.config?.clipping) {
          if (data.config.clipping.pre_roll_seconds != null) {
            setPreRollSec(Number(data.config.clipping.pre_roll_seconds));
            setModalPreRoll(Number(data.config.clipping.pre_roll_seconds));
          }
          if (data.config.clipping.post_roll_seconds != null) {
            setPostRollSec(Number(data.config.clipping.post_roll_seconds));
            setModalPostRoll(Number(data.config.clipping.post_roll_seconds));
          }
          if (data.config.clipping.create_reel != null) {
            setAutoReel(Boolean(data.config.clipping.create_reel));
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSystemInfo = async () => {
    try {
      const res = await fetch('/api/system/info');
      const data = await res.json();
      if (data.ok) {
        if (data.base_url) setServerBaseUrl(data.base_url);
        if (data.ip) setDetectedServerIp(data.ip);
        if (data.server_ip) setCustomServerIp(data.server_ip);
        else if (data.ip && data.ip !== '127.0.0.1') setCustomServerIp(data.ip);
        if (data.all_ips) setAllDetectedIps(data.all_ips);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchConfig();
    fetchSystemInfo();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/login');
  };

  const openPlayerModal = (cid) => {
    setEditPlayerModal(cid);
    const cstatus = courtsStatus[cid] || {};
    const names = cstatus.names || ['Tim A', 'Tim B'];
    const partsA = (names[0] || '').split(' / ');
    const partsB = (names[1] || '').split(' / ');
    setPA1(partsA[0] || '');
    setPA2(partsA[1] || '');
    setPB1(partsB[0] || '');
    setPB2(partsB[1] || '');
    const setts = cstatus.settings || {};
    setSelectedMode(setts.mode || 'golden');
    setSelectedBestOf(Number(setts.bestOf) || 3);
    setSelectedGames(Number(setts.games) || 6);
    setSelectedSuperTb(Boolean(setts.superTb));
    setSelectedTarget(Number(setts.target) || 24);
  };

  const savePlayersAndSettings = async () => {
    if (!editPlayerModal) return;
    const nameA = [pA1.trim(), pA2.trim()].filter(Boolean).join(' / ') || 'Tim A';
    const nameB = [pB1.trim(), pB2.trim()].filter(Boolean).join(' / ') || 'Tim B';
    const names = [nameA, nameB];
    const isRec = Boolean(courtsStatus[editPlayerModal]?.recording);

    try {
      const payload = {
        names,
        // Proteksi Human Error: hanya kirim aturan jika match sedang tidak merekam
        ...(isRec ? {} : {
          mode: selectedMode,
          bestOf: Number(selectedBestOf),
          games: Number(selectedGames),
          superTb: Boolean(selectedSuperTb),
          target: Number(selectedTarget)
        })
      };
      const res = await fetch(`/api/court/${editPlayerModal}/set-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        setEditPlayerModal(null);
        fetchStatus();
      } else {
        alert(data.message || 'Gagal memperbarui pengaturan pertandingan');
      }
    } catch (e) {
      alert('Gagal memperbarui pengaturan pertandingan');
    }
  };

  const openMediaModal = async (cid) => {
    setMediaCourtId(cid);
    setShowMediaModal(true);
    setMediaLoading(true);
    try {
      // 1. Dapatkan info IP LAN server
      try {
        const sysRes = await fetch('/api/system/info');
        const sysData = await sysRes.json();
        if (sysData.ok && (sysData.base_url || sysData.server?.base_url)) {
          setServerBaseUrl(sysData.base_url || sysData.server.base_url);
        }
      } catch (_) {}

      // 2. Dapatkan daftar rekaman & klip lapangan
      const res = await fetch(`/api/court/${cid}/media`);
      const data = await res.json();
      if (data.ok && data.sessions) {
        setMediaSessions(data.sessions);
        if (data.sessions.length > 0) {
          const first = data.sessions[0];
          setSelectedMediaSession(first);
          if (first.clipping_settings) {
            if (first.clipping_settings.pre_roll_seconds != null) setModalPreRoll(Number(first.clipping_settings.pre_roll_seconds));
            if (first.clipping_settings.post_roll_seconds != null) setModalPostRoll(Number(first.clipping_settings.post_roll_seconds));
          } else {
            setModalPreRoll(preRollSec);
            setModalPostRoll(postRollSec);
          }
          if (first.reels_url) setActiveMediaTab('reel');
          else if (first.clips && first.clips.length > 0) setActiveMediaTab('clips');
          else setActiveMediaTab('full');
        } else {
          setSelectedMediaSession(null);
        }
      } else {
        setMediaSessions([]);
        setSelectedMediaSession(null);
      }
    } catch (e) {
      console.error('Error fetching court media:', e);
    } finally {
      setMediaLoading(false);
    }
  };

  const handleSaveServerIp = async (e) => {
    e.preventDefault();
    setSavingIp(true);
    setServerIpMsg(null);
    try {
      const res = await fetch('/api/admin/set-server-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_ip: customServerIp.trim() })
      });
      const data = await res.json();
      if (data.ok) {
        setServerBaseUrl(data.base_url);
        setServerIpMsg({ type: 'success', text: `IP Server berhasil disimpan (${data.base_url}). QR Code sekarang menggunakan alamat ini!` });
        setTimeout(() => setServerIpMsg(null), 5000);
      } else {
        setServerIpMsg({ type: 'error', text: data.message || 'Gagal menyimpan IP Server' });
      }
    } catch (err) {
      setServerIpMsg({ type: 'error', text: 'Gagal terhubung ke server' });
    } finally {
      setSavingIp(false);
    }
  };

  const handleSaveClipping = async (e) => {
    e.preventDefault();
    setSavingClipping(true);
    setClippingMsg(null);
    try {
      const res = await fetch('/api/admin/set-clipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_roll_seconds: Number(preRollSec),
          post_roll_seconds: Number(postRollSec),
          create_reel: Boolean(autoReel)
        })
      });
      const data = await res.json();
      if (data.ok) {
        setClippingMsg({
          type: 'success',
          text: `Pengaturan Klip berhasil disimpan! (${preRollSec} detik awal + ${postRollSec} detik akhir = ${preRollSec + postRollSec} detik per klip)`
        });
        setModalPreRoll(Number(preRollSec));
        setModalPostRoll(Number(postRollSec));
        setTimeout(() => setClippingMsg(null), 5000);
      } else {
        setClippingMsg({ type: 'error', text: data.message || 'Gagal menyimpan pengaturan klip' });
      }
    } catch (err) {
      setClippingMsg({ type: 'error', text: 'Gagal terhubung ke server' });
    } finally {
      setSavingClipping(false);
    }
  };

  const handleTriggerClipping = async (cid, folder = null, customPre = null, customPost = null) => {
    if (isClipping) return;
    setIsClipping(true);
    try {
      const pPre = customPre != null ? Number(customPre) : modalPreRoll;
      const pPost = customPost != null ? Number(customPost) : modalPostRoll;
      const payload = {
        folder: folder || selectedMediaSession?.folder,
        pre_roll: pPre,
        post_roll: pPost
      };
      const res = await fetch(`/api/court/${cid}/create-clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        alert(`✂️ Pemrosesan Klip dimulai dengan durasi: ${pPre}s awal + ${pPost}s akhir (Total: ${pPre + pPost}s)! Tunggu beberapa detik lalu daftar media akan dimuat ulang.`);
        setTimeout(() => openMediaModal(cid), 4000);
      } else {
        alert(data.message || 'Gagal memproses klip');
      }
    } catch (e) {
      alert('Gagal memproses klip: ' + e.message);
    } finally {
      setIsClipping(false);
    }
  };

  const copyShareLink = (url) => {
    try {
      navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (_) {}
  };

  const handleStartRec = async (cid) => {
    try {
      const st = courtsStatus[cid];
      const res = await fetch(`/api/court/${cid}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: st?.settings?.mode || 'golden' })
      });
      const data = await res.json();
      if (data.ok) {
        fetchStatus();
      } else {
        alert(data.message || 'Gagal memulai rekaman');
      }
    } catch (e) {
      alert('Gagal terhubung ke server');
    }
  };

  const handleStopRec = async (cid) => {
    if (!confirm(`Hentikan rekaman dan simpan video Lapangan ${cid}?`)) return;
    try {
      const res = await fetch(`/api/court/${cid}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      fetchStatus();
    } catch (e) {
      alert('Gagal menghentikan rekaman');
    }
  };

  const handleCancelStop = async (cid) => {
    try {
      await fetch(`/api/court/${cid}/cancel-stop`, { method: 'POST' });
      fetchStatus();
    } catch (e) {}
  };

  const handleAddCamera = async (cid) => {
    if (camMode === 'rtsp') {
      if (!camRtspDirect.trim().startsWith('rtsp://')) {
        setCamMsg('Alamat RTSP harus diawali dengan rtsp://');
        return;
      }
      setCamLoading(true);
      setCamMsg('Menyimpan kamera RTSP...');
      try {
        const res = await fetch(`/api/court/${cid}/add-camera`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: camName || `Kamera ${cid}`,
            rtsp: camRtspDirect.trim()
          })
        });
        const data = await res.json();
        if (data.ok) {
          setCamMsg(`Berhasil tersimpan: ${data.name}`);
          setCamName(''); setCamRtspDirect('');
          fetchStatus();
        } else {
          setCamMsg(data.message || 'Gagal menyimpan kamera');
        }
      } catch (e) {
        setCamMsg('Gagal terhubung ke server');
      } finally {
        setCamLoading(false);
      }
      return;
    }

    if (!camIp) {
      setCamMsg('IP Kamera wajib diisi');
      return;
    }
    setCamLoading(true);
    setCamMsg(`Mengecek alamat RTSP di port ${camPort || 554}...`);
    try {
      const res = await fetch(`/api/court/${cid}/add-camera`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: camName || `Kamera Lapangan ${cid}`,
          ip: camIp,
          port: camPort ? parseInt(camPort, 10) : 554,
          user: camUser,
          password: camPass
        })
      });
      const data = await res.json();
      if (data.ok) {
        setCamMsg(`Berhasil tersimpan: ${data.name} (${data.label || ''})`);
        setCamName(''); setCamIp(''); setCamPass('');
        fetchStatus();
      } else {
        setCamMsg(data.message || 'Gagal menyimpan kamera');
      }
    } catch (e) {
      setCamMsg('Gagal terhubung ke server');
    } finally {
      setCamLoading(false);
    }
  };

  const handleDiscoverCams = async (cid) => {
    setCamLoading(true);
    setCamMsg('Memindai jaringan untuk kamera ONVIF...');
    try {
      const res = await fetch(`/api/court/${cid}/discover`, { method: 'POST' });
      const data = await res.json();
      if (data.cameras && data.cameras.length > 0) {
        setFoundCams(data.cameras);
        setCamMsg(`Ditemukan ${data.cameras.length} kamera ONVIF.`);
      } else {
        setCamMsg('Tidak ada kamera ONVIF yang terdeteksi. Pastikan kamera menyala dan satu jaringan Wi-Fi.');
        setFoundCams([]);
      }
    } catch (e) {
      setCamMsg('Gagal memindai kamera');
    } finally {
      setCamLoading(false);
    }
  };

  const handleTestCams = async (cid) => {
    setCamLoading(true);
    setCamMsg('Mengetes koneksi kamera...');
    try {
      const res = await fetch(`/api/court/${cid}/test`, { method: 'POST' });
      const data = await res.json();
      const results = data.results || [];
      const okCount = results.filter(r => r.ok).length;
      const details = results.map(r => `${r.name}: ${r.ok ? '✓ Terhubung' : '✗ ' + (r.info || 'Gagal')}`).join(', ');
      setCamMsg(`Hasil tes: ${okCount}/${results.length} kamera aktif. ${details ? `[ ${details} ]` : ''}`);
    } catch (e) {
      setCamMsg('Gagal mengetes kamera');
    } finally {
      setCamLoading(false);
    }
  };

  const handleRemoveCamera = async (cid, camName) => {
    if (!confirm(`Hapus kamera "${camName}" dari Lapangan ${cid}?`)) return;
    try {
      await fetch(`/api/court/${cid}/remove-camera`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: camName })
      });
      fetchStatus();
    } catch (e) {
      alert('Gagal menghapus kamera');
    }
  };

  const handleUpdateAdminPassword = async (e) => {
    e.preventDefault();
    if (newAdminPw.length < 6) {
      setSettingsMsg('Password minimal 6 karakter');
      return;
    }
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'admin', new_password: newAdminPw })
      });
      const data = await res.json();
      if (data.ok) {
        setSettingsMsg('Password admin berhasil diubah!');
        setNewAdminPw('');
      } else {
        setSettingsMsg(data.message || 'Gagal mengubah password');
      }
    } catch (e) {
      setSettingsMsg('Gagal terhubung');
    }
  };

  const handleUpdateCourtPin = async (e) => {
    e.preventDefault();
    if (newPin.length !== 4) {
      setSettingsMsg('PIN harus 4 digit angka');
      return;
    }
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'court', court_id: pinCourtId, new_pin: newPin })
      });
      const data = await res.json();
      if (data.ok) {
        setSettingsMsg(`PIN Lapangan ${pinCourtId} berhasil diubah!`);
        setNewPin('');
      } else {
        setSettingsMsg(data.message || 'Gagal mengubah PIN');
      }
    } catch (e) {
      setSettingsMsg('Gagal terhubung');
    }
  };

  return (
    <div className="min-h-screen bg-padel-dark text-slate-100 font-ui flex flex-col">
      {/* Top Navbar */}
      <header className="bg-padel-surface/90 border-b border-padel-border/60 sticky top-0 z-30 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-padel-volt flex items-center justify-center text-black font-black font-score text-xl shadow-md shadow-padel-volt/20">
            🎾
          </div>
          <div>
            <h1 className="text-xl font-score font-black tracking-wide text-white uppercase flex items-center gap-2">
              Padel <span className="text-padel-volt">CCTV Hub</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Dashboard Kontrol 3 Lapangan</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/auto-clip')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-padel-volt hover:bg-padel-voltHover text-black text-xs sm:text-sm font-score font-bold uppercase tracking-wider shadow-md shadow-padel-volt/20 transition-all"
            title="Buka halaman khusus Auto-Clip AI"
          >
            <Sparkles className="w-4 h-4" />
            <span>Auto-Clip AI</span>
          </button>
          <button
            onClick={fetchStatus}
            className="p-2.5 rounded-xl bg-padel-card hover:bg-padel-border/60 text-slate-300 hover:text-white transition-colors"
            title="Segarkan data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-padel-volt' : ''}`} />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-sm font-semibold transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-8">
        
        {/* SECTION 1: STATUS 3 LAPANGAN LIVE */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-score font-bold tracking-wide uppercase text-white flex items-center gap-2">
                <Tv className="w-5 h-5 text-padel-volt" />
                <span>Monitoring Lapangan</span>
              </h2>
              <p className="text-xs text-slate-400">Status langsung siaran & rekaman di 3 lapangan</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(cid => {
              const st = courtsStatus[cid] || {};
              const isRec = st.recording;
              const cams = st.cameras || [];
              const activeCams = cams.filter(c => c.recording || !c.error).length;

              return (
                <div
                  key={cid}
                  className={`rounded-3xl border p-6 flex flex-col justify-between transition-all duration-300 backdrop-blur-sm ${
                    isRec
                      ? 'bg-gradient-to-b from-red-950/20 via-padel-surface to-padel-dark border-red-500/40 shadow-xl shadow-red-500/10'
                      : 'bg-padel-surface/80 border-padel-border/60 shadow-lg shadow-black/40'
                  }`}
                >
                  <div className="flex flex-col gap-4">
                    {/* Card Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-padel-card border border-padel-border/60 flex items-center justify-center font-score font-black text-lg text-padel-volt">
                          {cid}
                        </span>
                        <h3 className="font-score font-black text-xl text-white uppercase tracking-wider">
                          {st.court_name || `Lapangan ${cid}`}
                        </h3>
                      </div>
                      
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          isRec
                            ? 'bg-red-500/20 border border-red-500/40 text-red-400 animate-pulse'
                            : 'bg-slate-700/30 border border-slate-600/30 text-slate-400'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isRec ? 'bg-red-500 animate-ping' : 'bg-slate-500'}`} />
                        {isRec ? 'Merekam' : 'Siaga'}
                      </span>
                    </div>

                    {/* Quick Info Box */}
                    <div className="p-4 rounded-2xl bg-padel-card/60 border border-padel-border/40 flex flex-col gap-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Durasi:</span>
                        <span className="font-mono font-bold text-white">
                          {isRec ? `${Math.floor((st.elapsed || 0) / 60)}m ${(st.elapsed || 0) % 60}s` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Aturan Skor:</span>
                        <span className="font-semibold text-white uppercase">
                          {st.settings?.mode === 'americano' ? `Americano (${st.settings?.target || 24}p)` : `${st.settings?.mode || 'Golden'} (${st.settings?.bestOf || 3} Set)`}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">CCTV Terhubung:</span>
                        <span className="font-medium text-slate-200">
                          {cams.length > 0 ? `${activeCams}/${cams.length} Kamera` : 'Belum ada'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-padel-border/30">
                        <span className="text-slate-400">Pemain:</span>
                        <span className="font-semibold text-padel-volt text-right truncate max-w-[140px]" title={st.names ? `${st.names[0]} vs ${st.names[1]}` : ''}>
                          {st.names ? `${st.names[0]} vs ${st.names[1]}` : 'Tim A vs Tim B'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex flex-col gap-2 mt-5 pt-3.5 border-t border-padel-border/40">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openPlayerModal(cid)}
                        className="py-2.5 px-3 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-xs font-semibold text-slate-200 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-padel-volt" />
                        <span>Pemain & Aturan</span>
                      </button>
                      <button
                        onClick={() => openMediaModal(cid)}
                        className="py-2.5 px-3 rounded-xl bg-padel-card hover:bg-pink-500/20 border border-pink-500/30 text-xs font-semibold text-pink-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Film className="w-3.5 h-3.5 text-pink-400" />
                        <span>Video & Klip</span>
                      </button>
                    </div>
                    <a
                      href={`/court/${cid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2 px-3 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Buka Papan Skor (TV View)</span>
                    </a>

                    {/* RECORDING CONTROL BUTTON */}
                    {isRec ? (
                      st.stopping_in != null ? (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs">
                          <span className="flex items-center gap-1.5 font-semibold">
                            <Clock className="w-3.5 h-3.5 animate-spin text-amber-400" /> Berhenti dalam {st.stopping_in}s
                          </span>
                          <button
                            onClick={() => handleCancelStop(cid)}
                            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px]"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStopRec(cid)}
                          className="py-2 px-3 rounded-xl bg-red-600/20 hover:bg-red-600/40 border border-red-500/60 text-red-400 hover:text-white text-xs font-score font-black tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all shadow-md shadow-red-950/30"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>Stop Rekam Lapangan {cid}</span>
                        </button>
                      )
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStartRec(cid)}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 hover:text-white text-xs font-score font-black tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Mulai Rekam</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`Reset papan skor Lapangan ${cid} ke 0-0?`)) {
                              await fetch(`/api/court/${cid}/reset-match`, { method: 'POST' });
                              fetchStatus();
                            }
                          }}
                          className="py-2 px-3 rounded-xl bg-padel-card hover:bg-red-500/20 border border-padel-border/60 text-slate-400 hover:text-red-400 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                          title={`Reset papan skor Lapangan ${cid} ke 0-0`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset</span>
                        </button>
                      </div>
                    )}

                    {/* RECENT RECORDING SUMMARY */}
                    {st.recent && st.recent.length > 0 && (
                      <div className="mt-1 p-2 rounded-xl bg-padel-dark/70 border border-padel-border/40 text-[11px] flex flex-col gap-0.5">
                        <span className="text-slate-400 font-semibold flex items-center gap-1">
                          <Video className="w-3 h-3 text-padel-volt" /> Rekaman Terakhir:
                        </span>
                        <span className="text-slate-200 font-mono truncate" title={st.recent[0]}>
                          {st.recent[0]}
                        </span>
                      </div>
                    )}

                    {/* RENDER OVERLAY PROGRESS ON DASHBOARD */}
                    {st.renders && st.renders.length > 0 && st.renders[0].state === 'proses' && (
                      <div className="mt-1 p-2 rounded-xl bg-padel-volt/10 border border-padel-volt/40 text-[11px] flex items-center justify-between text-padel-volt animate-pulse">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 animate-spin text-padel-volt" />
                          <span>Menggabungkan CCTV + Papan Skor: {st.renders[0].progress}%</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 2: KAMERA CCTV PER LAPANGAN */}
        <section className="bg-padel-surface/70 border border-padel-border/60 rounded-3xl p-6 sm:p-8 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-score font-bold tracking-wide uppercase text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-padel-volt" />
                <span>Pengaturan Kamera CCTV</span>
              </h2>
              <p className="text-xs text-slate-400">Hubungkan stream RTSP ONVIF (Bardi, Hikvision, Dahua, dll) ke tiap lapangan</p>
            </div>

            {/* Court Tabs for Cameras */}
            <div className="flex p-1 bg-padel-dark rounded-xl border border-padel-border/50">
              {[1, 2, 3].map(cid => (
                <button
                  key={cid}
                  onClick={() => { setActiveCamTab(cid); setCamMsg(''); setFoundCams([]); }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeCamTab === cid
                      ? 'bg-padel-volt text-black shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Lapangan {cid}
                </button>
              ))}
            </div>
          </div>

          {/* Active Court Cameras List */}
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Daftar Kamera Lapangan {activeCamTab}:
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTestCams(activeCamTab)}
                    disabled={camLoading}
                    className="px-3 py-1.5 rounded-lg bg-padel-card hover:bg-padel-border/60 border border-padel-border/40 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${camLoading ? 'animate-spin' : ''}`} />
                    <span>Tes Semua Kamera</span>
                  </button>
                  <button
                    onClick={() => handleDiscoverCams(activeCamTab)}
                    disabled={camLoading}
                    className="px-3 py-1.5 rounded-lg bg-padel-card hover:bg-padel-border/60 border border-padel-border/40 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                    <span>🔍 Cari Otomatis</span>
                  </button>
                </div>
              </div>

              {camMsg && (
                <div className="mb-4 p-3 rounded-xl bg-padel-card/80 border border-padel-border/60 text-xs text-slate-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-padel-volt" />
                  <span>{camMsg}</span>
                </div>
              )}

              {/* Found Cameras Chips */}
              {foundCams.length > 0 && (
                <div className="mb-4 p-4 rounded-2xl bg-padel-card/40 border border-padel-volt/30 flex flex-col gap-2">
                  <span className="text-xs font-semibold text-padel-volt">Ketuk IP untuk mengisi otomatis:</span>
                  <div className="flex flex-wrap gap-2">
                    {foundCams.map((fc, i) => (
                      <button
                        key={i}
                        onClick={() => { setCamIp(fc.ip); setCamName(fc.name || `Kamera ${fc.ip}`); }}
                        className="px-3 py-1.5 rounded-xl bg-padel-volt/15 hover:bg-padel-volt/25 border border-padel-volt/40 text-padel-volt text-xs font-mono transition-colors"
                      >
                        {fc.ip} {fc.name ? `(${fc.name})` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cameras List Items */}
              <div className="flex flex-col gap-2.5">
                {(courtsStatus[activeCamTab]?.cameras || []).length === 0 ? (
                  <p className="text-sm text-slate-500 italic py-4">Belum ada kamera untuk lapangan ini.</p>
                ) : (
                  (courtsStatus[activeCamTab]?.cameras || []).map((c, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-2xl bg-padel-card/60 border border-padel-border/40 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full ${c.recording ? 'bg-red-500 animate-pulse' : c.error ? 'bg-amber-500' : 'bg-emerald-400'}`} />
                        <div>
                          <span className="text-sm font-semibold text-white block">{c.name}</span>
                          <span className="text-xs text-slate-400 font-mono">
                            {c.error ? `Error: ${c.error}` : c.recording ? `Merekam: ${c.file} (${c.mb} MB)` : 'Siap'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveCamera(activeCamTab, c.name)}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Hapus kamera"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Form Tambah Kamera */}
            <div className="pt-4 border-t border-padel-border/40">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Tambah Kamera Baru ke Lapangan {activeCamTab}:
                </h4>
                <div className="flex gap-1.5 p-1 bg-padel-dark rounded-xl border border-padel-border/40">
                  <button
                    type="button"
                    onClick={() => setCamMode('ip')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      camMode === 'ip' ? 'bg-padel-volt text-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Via IP &amp; Port
                  </button>
                  <button
                    type="button"
                    onClick={() => setCamMode('rtsp')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      camMode === 'rtsp' ? 'bg-padel-volt text-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    URL RTSP Manual
                  </button>
                </div>
              </div>

              {camMode === 'ip' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  <input
                    type="text"
                    placeholder="Nama Kamera"
                    value={camName}
                    onChange={e => setCamName(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-padel-volt"
                  />
                  <input
                    type="text"
                    placeholder="IP (192.168.11.103)"
                    value={camIp}
                    onChange={e => setCamIp(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-padel-volt font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Port RTSP (554 / 8554)"
                    value={camPort}
                    onChange={e => setCamPort(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-padel-volt font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Username (admin)"
                    value={camUser}
                    onChange={e => setCamUser(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-padel-volt"
                  />
                  <input
                    type="password"
                    placeholder="Password ONVIF"
                    value={camPass}
                    onChange={e => setCamPass(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-padel-volt"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Nama Kamera (misal: Kamera Lapangan 1)"
                    value={camName}
                    onChange={e => setCamName(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-padel-volt"
                  />
                  <input
                    type="text"
                    placeholder="Alamat RTSP Lengkap: rtsp://admin:pass@192.168.11.103:554/stream1"
                    value={camRtspDirect}
                    onChange={e => setCamRtspDirect(e.target.value)}
                    className="sm:col-span-2 bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-padel-volt font-mono"
                  />
                </div>
              )}

              <button
                onClick={() => handleAddCamera(activeCamTab)}
                disabled={camLoading}
                className="mt-3 px-5 py-2.5 rounded-xl bg-padel-volt hover:bg-padel-voltHover text-black font-score font-bold text-sm tracking-wider uppercase flex items-center gap-2 shadow-md shadow-padel-volt/10 transition-all disabled:opacity-50"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Simpan Kamera</span>
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: KEAMANAN & PENGATURAN PASSWORD/PIN */}
        <section className="bg-padel-surface/70 border border-padel-border/60 rounded-3xl p-6 sm:p-8 backdrop-blur-md">
          <div className="mb-6">
            <h2 className="text-xl font-score font-bold tracking-wide uppercase text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-padel-volt" />
              <span>Keamanan & Password</span>
            </h2>
            <p className="text-xs text-slate-400">Ubah password admin atau PIN 4 digit per lapangan</p>
          </div>

          {settingsMsg && (
            <div className="mb-4 p-3 rounded-xl bg-padel-card border border-padel-volt/40 text-xs text-padel-volt">
              {settingsMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Ubah Password Admin */}
            <form onSubmit={handleUpdateAdminPassword} className="flex flex-col gap-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Ubah Password Admin</h4>
              <input
                type="password"
                placeholder="Password baru (minimal 6 karakter)"
                value={newAdminPw}
                onChange={e => setNewAdminPw(e.target.value)}
                required
                className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-padel-volt"
              />
              <button
                type="submit"
                className="self-start px-4 py-2 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-xs font-semibold text-white transition-colors"
              >
                Simpan Password Admin
              </button>
            </form>

            {/* Ubah PIN Lapangan */}
            <form onSubmit={handleUpdateCourtPin} className="flex flex-col gap-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Ubah PIN 4 Digit Lapangan</h4>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={pinCourtId}
                  onChange={e => setPinCourtId(Number(e.target.value))}
                  className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-padel-volt"
                >
                  <option value={1}>Lapangan 1</option>
                  <option value={2}>Lapangan 2</option>
                  <option value={3}>Lapangan 3</option>
                </select>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="PIN baru (4 digit)"
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                  required
                  className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-padel-volt font-mono text-center tracking-widest"
                />
              </div>
              <button
                type="submit"
                className="self-start px-4 py-2 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-xs font-semibold text-white transition-colors"
              >
                Simpan PIN Lapangan
              </button>
            </form>
          </div>
        </section>

        {/* SECTION 4: PENGATURAN IP SERVER & QR CODE DOWNLOAD */}
        <section className="bg-padel-surface/70 border border-padel-border/60 rounded-3xl p-6 sm:p-8 backdrop-blur-md">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-score font-bold tracking-wide uppercase text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-padel-volt" />
                <span>Pengaturan IP Server & QR Code Download</span>
              </h2>
              <p className="text-xs text-slate-400">
                Alamat IP server Wi-Fi lokal yang ditanam ke QR Code agar smartphone pemain dapat memindai dan mengunduh video match
              </p>
            </div>
            {serverBaseUrl && (
              <span className={`px-3 py-1 rounded-full border font-mono text-xs self-start sm:self-auto font-semibold flex items-center gap-1.5 ${
                serverBaseUrl.includes('localhost') || serverBaseUrl.includes('127.0.0.1')
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}>
                <span className={`w-2 h-2 rounded-full ${serverBaseUrl.includes('localhost') || serverBaseUrl.includes('127.0.0.1') ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <span>Aktif: {serverBaseUrl}</span>
              </span>
            )}
          </div>

          {serverIpMsg && (
            <div className={`mb-4 p-3 rounded-xl border text-xs ${serverIpMsg.type === 'error' ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'}`}>
              {serverIpMsg.text}
            </div>
          )}

          <form onSubmit={handleSaveServerIp} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Alamat IP / URL Server Wi-Fi (Untuk QR Code)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 192.168.11.103 atau http://192.168.11.103:8080"
                  value={customServerIp}
                  onChange={e => setCustomServerIp(e.target.value)}
                  className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-padel-volt font-mono"
                />
                <div className="text-[11px] text-slate-400 flex flex-wrap gap-2 items-center">
                  <span>IP Otomatis Terdeteksi: <strong className="text-padel-volt">{detectedServerIp || 'Mendeteksi...'}</strong></span>
                  {allDetectedIps.length > 1 && (
                    <span>(IP lain: {allDetectedIps.join(', ')})</span>
                  )}
                  {detectedServerIp && (
                    <button
                      type="button"
                      onClick={() => setCustomServerIp(detectedServerIp)}
                      className="text-cyan-400 hover:underline font-semibold"
                    >
                      [Gunakan IP ini]
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col justify-end">
                <button
                  type="submit"
                  disabled={savingIp}
                  className="w-full py-2.5 px-4 rounded-xl bg-padel-volt hover:bg-padel-voltHover text-black font-score font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-md shadow-padel-volt/20"
                >
                  {savingIp ? 'Menyimpan...' : 'Simpan IP Server QR'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              💡 <strong>Catatan:</strong> Pastikan HP pemain terhubung ke jaringan Wi-Fi yang sama dengan PC server agar video dapat diputar dan diunduh dari QR Code.
            </p>
          </form>
        </section>

        {/* SECTION 5: PENGATURAN PEMOTONGAN KLIP HIGHLIGHT (LOVE ❤️) */}
        <section className="bg-padel-surface/70 border border-padel-border/60 rounded-3xl p-6 sm:p-8 backdrop-blur-md">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-score font-bold tracking-wide uppercase text-white flex items-center gap-2">
                <Scissors className="w-5 h-5 text-pink-400" />
                <span>Pengaturan Pemotongan Klip Highlight (Tombol Love ❤️)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Atur durasi video yang dipotong sebelum dan sesudah tombol Love ❤️ pada remote Mixio ditekan
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-pink-500/20 border border-pink-500/40 text-pink-300 font-mono text-xs self-start sm:self-auto font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Durasi Klip: {preRollSec}s awal + {postRollSec}s akhir = {preRollSec + postRollSec} Detik</span>
            </span>
          </div>

          {clippingMsg && (
            <div className={`mb-4 p-3 rounded-xl border text-xs ${clippingMsg.type === 'error' ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'}`}>
              {clippingMsg.text}
            </div>
          )}

          <form onSubmit={handleSaveClipping} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Detik Awal (Pre-roll) */}
              <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span>⏪ Durasi Reli Sebelum Tombol (Awal)</span>
                  </label>
                  <span className="text-sm font-score font-black text-padel-volt">{preRollSec} Detik</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Berapa detik mundur ke belakang sebelum tombol Love ditekan untuk merekam proses reli sebelum smash / poin.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={2}
                    max={30}
                    step={1}
                    value={preRollSec}
                    onChange={e => setPreRollSec(Number(e.target.value))}
                    className="flex-1 accent-padel-volt cursor-pointer"
                  />
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={preRollSec}
                    onChange={e => setPreRollSec(Math.max(1, Number(e.target.value)))}
                    className="w-16 bg-padel-card border border-padel-border rounded-xl px-2 py-1 text-center text-sm font-bold text-white outline-none focus:border-padel-volt"
                  />
                </div>
                {/* Preset Pills */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 font-semibold">Pilihan cepat:</span>
                  {[5, 8, 10, 12, 15, 20].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setPreRollSec(sec)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                        preRollSec === sec
                          ? 'bg-padel-volt text-black shadow-sm'
                          : 'bg-padel-card hover:bg-padel-border/60 text-slate-300'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Detik Akhir (Post-roll) */}
              <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span>⏩ Durasi Selebrasi Sesudah Tombol (Akhir)</span>
                  </label>
                  <span className="text-sm font-score font-black text-pink-400">{postRollSec} Detik</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Berapa detik maju ke depan setelah tombol Love ditekan untuk merekam selebrasi pemain atau bola mati.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={2}
                    max={30}
                    step={1}
                    value={postRollSec}
                    onChange={e => setPostRollSec(Number(e.target.value))}
                    className="flex-1 accent-pink-500 cursor-pointer"
                  />
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={postRollSec}
                    onChange={e => setPostRollSec(Math.max(1, Number(e.target.value)))}
                    className="w-16 bg-padel-card border border-padel-border rounded-xl px-2 py-1 text-center text-sm font-bold text-white outline-none focus:border-pink-500"
                  />
                </div>
                {/* Preset Pills */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 font-semibold">Pilihan cepat:</span>
                  {[3, 4, 5, 8, 10, 15].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setPostRollSec(sec)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                        postRollSec === sec
                          ? 'bg-pink-500 text-white shadow-sm'
                          : 'bg-padel-card hover:bg-padel-border/60 text-slate-300'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-padel-border/40">
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoReel}
                  onChange={e => setAutoReel(e.target.checked)}
                  className="w-4 h-4 rounded text-padel-volt bg-padel-dark border-padel-border focus:ring-0"
                />
                <span className="font-semibold text-white">
                  Otomatis gabungkan klip menjadi 1 video Reels Highlight kompilasi MP4
                </span>
              </label>

              <button
                type="submit"
                disabled={savingClipping}
                className="px-6 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-score font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-md shadow-pink-500/20 flex items-center gap-1.5 self-end sm:self-auto"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>{savingClipping ? 'Menyimpan...' : 'Simpan Pengaturan Klip'}</span>
              </button>
            </div>
          </form>
        </section>

      </main>

      {/* MODAL SET PEMAIN & FORMAT PERTANDINGAN LANGSUNG DARI RESEPSIONIS / ADMIN */}
      {editPlayerModal && (() => {
        const courtData = courtsStatus[editPlayerModal] || {};
        const isRec = Boolean(courtData.recording);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-lg bg-padel-surface border border-padel-border rounded-3xl p-6 sm:p-8 flex flex-col gap-5 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-padel-border/60 pb-3">
                <div>
                  <div className="flex items-center gap-2 text-padel-volt text-xs font-bold uppercase tracking-wider">
                    <span>Admin Resepsionis</span> · <span>Lapangan {editPlayerModal}</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-score font-black text-white uppercase tracking-wide mt-1">
                    Atur Pemain & Format Match
                  </h3>
                </div>
                {isRec && (
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-500/20 border border-red-500/40 text-red-400 flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    Sedang Merekam
                  </span>
                )}
              </div>

              {/* WARNING BANNER JIKA PERTANDINGAN SEDANG AKTIF / MEREKAM */}
              {isRec && (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-start gap-3 text-amber-200">
                  <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold text-amber-300">Format Skor Terkunci (Pertandingan Sedang Berjalan)</p>
                    <p className="text-slate-300 mt-0.5">
                      Mode skor, target, dan jumlah set dinonaktifkan untuk mencegah human error / rusaknya sinkronisasi skor rekaman CCTV. Nama pemain tetap dapat Anda edit jika ada typo.
                    </p>
                  </div>
                </div>
              )}

              {/* INPUT NAMA PEMAIN GANDA */}
              <div className="flex flex-col gap-3.5">
                {/* TIM A */}
                <div className="p-3.5 sm:p-4 rounded-2xl bg-padel-card/60 border border-padel-border/40 flex flex-col gap-2.5">
                  <span className="text-xs font-score font-bold uppercase tracking-wider text-padel-volt">
                    Tim A (Ganda)
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      placeholder="Pemain 1 (mis. Budi)"
                      value={pA1}
                      onChange={e => setPA1(e.target.value)}
                      className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-padel-volt"
                    />
                    <input
                      type="text"
                      placeholder="Pemain 2 (mis. Andi)"
                      value={pA2}
                      onChange={e => setPA2(e.target.value)}
                      className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-padel-volt"
                    />
                  </div>
                </div>

                {/* TIM B */}
                <div className="p-3.5 sm:p-4 rounded-2xl bg-padel-card/60 border border-padel-border/40 flex flex-col gap-2.5">
                  <span className="text-xs font-score font-bold uppercase tracking-wider text-cyan-400">
                    Tim B (Ganda)
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      placeholder="Pemain 3 (mis. Reza)"
                      value={pB1}
                      onChange={e => setPB1(e.target.value)}
                      className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                    />
                    <input
                      type="text"
                      placeholder="Pemain 4 (mis. Doni)"
                      value={pB2}
                      onChange={e => setPB2(e.target.value)}
                      className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              {/* FORMAT ATURAN SKOR */}
              <div className={`p-4 rounded-2xl bg-padel-card/40 border border-padel-border/50 flex flex-col gap-3 transition-opacity ${isRec ? 'opacity-65' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-score font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    {isRec ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Sliders className="w-3.5 h-3.5 text-padel-volt" />}
                    <span>Format & Aturan Pertandingan</span>
                  </span>
                  {isRec && (
                    <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                      Terkunci
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Format Poin:
                    </label>
                    <select
                      value={selectedMode}
                      disabled={isRec}
                      onChange={e => setSelectedMode(e.target.value)}
                      className="w-full bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-padel-volt disabled:cursor-not-allowed disabled:opacity-75"
                    >
                      <option value="golden">Golden Point (Padel Standar)</option>
                      <option value="adv">Advantage (Klasik Tenis)</option>
                      <option value="star">Star Point (Aturan FIP)</option>
                      <option value="americano">Americano / Mexicano</option>
                    </select>
                  </div>

                  {selectedMode === 'americano' ? (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Target Poin Americano:
                      </label>
                      <select
                        value={selectedTarget}
                        disabled={isRec}
                        onChange={e => setSelectedTarget(Number(e.target.value))}
                        className="w-full bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-padel-volt disabled:cursor-not-allowed disabled:opacity-75"
                      >
                        <option value={16}>16 Poin</option>
                        <option value={21}>21 Poin</option>
                        <option value={24}>24 Poin (Standar)</option>
                        <option value={32}>32 Poin</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Jumlah Set:
                      </label>
                      <select
                        value={selectedBestOf}
                        disabled={isRec}
                        onChange={e => setSelectedBestOf(Number(e.target.value))}
                        className="w-full bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-padel-volt disabled:cursor-not-allowed disabled:opacity-75"
                      >
                        <option value={3}>Best of 3 Set</option>
                        <option value={1}>1 Set Saja</option>
                      </select>
                    </div>
                  )}
                </div>

                {selectedMode !== 'americano' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Game per Set:
                      </label>
                      <select
                        value={selectedGames}
                        disabled={isRec}
                        onChange={e => setSelectedGames(Number(e.target.value))}
                        className="w-full bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-padel-volt disabled:cursor-not-allowed disabled:opacity-75"
                      >
                        <option value={6}>6 Game (Tiebreak 6–6)</option>
                        <option value={4}>4 Game (Set Pendek, Tiebreak 4–4)</option>
                      </select>
                    </div>

                    <div className="pt-2 sm:pt-4">
                      <label className={`flex items-center gap-2 text-xs font-semibold select-none ${isRec || selectedBestOf === 1 ? 'opacity-40 cursor-not-allowed' : 'text-slate-200 cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={selectedSuperTb && selectedBestOf !== 1}
                          disabled={isRec || selectedBestOf === 1}
                          onChange={e => setSelectedSuperTb(e.target.checked)}
                          className="w-4 h-4 rounded text-padel-volt bg-padel-dark border-padel-border focus:ring-0 disabled:cursor-not-allowed"
                        />
                        <span>Set 3 Ganti Super TB (ke 10)</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* HINT ATURAN DINAMIS */}
                <div className="p-2.5 rounded-xl bg-padel-dark/70 border border-padel-border/40 text-[11px] text-slate-300 leading-relaxed">
                  💡 <span className="font-semibold text-padel-volt">Aturan: </span>
                  {MODE_HINTS[selectedMode]}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2 border-t border-padel-border/40">
                <button
                  type="button"
                  onClick={() => setEditPlayerModal(null)}
                  className="px-5 py-2.5 rounded-xl bg-padel-card hover:bg-padel-border/50 text-slate-300 font-semibold text-sm transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={savePlayersAndSettings}
                  className="px-6 py-2.5 rounded-xl bg-padel-volt hover:bg-padel-voltHover text-black font-score font-black text-sm tracking-wider uppercase transition-all shadow-lg shadow-padel-volt/20"
                >
                  {isRec ? 'Simpan Perubahan Nama' : 'Simpan & Kirim ke TV'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL VIDEO REKAMAN, KLIP & QR SHARE (ADMIN DASHBOARD) */}
      {showMediaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-padel-surface border border-padel-border rounded-3xl p-5 sm:p-7 flex flex-col gap-5 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-padel-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-pink-500/20 text-pink-400">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-score font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <span>Rekaman & Klip Lapangan {mediaCourtId}</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Unduh video reels highlight, klip momen ❤️, dan bagikan via QR Code
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMediaModal(false)}
                className="w-8 h-8 rounded-full bg-padel-card hover:bg-padel-border/60 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {mediaLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw className="w-7 h-7 animate-spin text-padel-volt" />
                <span className="text-xs font-semibold">Memuat rekaman & klip video...</span>
              </div>
            ) : mediaSessions.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-center px-4">
                <div className="w-12 h-12 rounded-2xl bg-padel-dark border border-padel-border/80 flex items-center justify-center text-slate-500">
                  <Film className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">Belum Ada Rekaman Tersimpan</h4>
                <p className="text-xs text-slate-400 max-w-sm">
                  Rekaman video dan klip momen akan otomatis terpotong saat pertandingan di Lapangan {mediaCourtId} selesai direkam.
                </p>
              </div>
            ) : (
              <>
                {/* Session Selector & Actions */}
                <div className="flex flex-col gap-3 p-3.5 rounded-2xl bg-padel-dark/80 border border-padel-border/60">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] uppercase font-score font-bold text-slate-400 tracking-wider">
                          Pilih Sesi Pertandingan:
                        </label>
                        {selectedMediaSession?.clipping_settings && (
                          <span className="text-[10px] text-pink-300 font-mono font-semibold">
                            ✂️ Klip saat ini: {selectedMediaSession.clipping_settings.pre_roll_seconds}s awal + {selectedMediaSession.clipping_settings.post_roll_seconds}s akhir ({selectedMediaSession.clipping_settings.duration_seconds}s)
                          </span>
                        )}
                      </div>
                      <select
                        value={selectedMediaSession?.folder || ''}
                        onChange={e => {
                          const found = mediaSessions.find(s => s.folder === e.target.value);
                          if (found) {
                            setSelectedMediaSession(found);
                            if (found.clipping_settings) {
                              if (found.clipping_settings.pre_roll_seconds != null) setModalPreRoll(Number(found.clipping_settings.pre_roll_seconds));
                              if (found.clipping_settings.post_roll_seconds != null) setModalPostRoll(Number(found.clipping_settings.post_roll_seconds));
                            }
                            if (found.reels_url) setActiveMediaTab('reel');
                            else if (found.clips?.length) setActiveMediaTab('clips');
                            else setActiveMediaTab('full');
                          }
                        }}
                        className="w-full bg-padel-card border border-padel-border text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-padel-volt"
                      >
                        {mediaSessions.map((s, idx) => (
                          <option key={idx} value={s.folder}>
                            {s.title || s.folder} ({s.date || ''})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => openMediaModal(mediaCourtId)}
                      className="p-2 rounded-xl bg-padel-card hover:bg-padel-border/60 text-slate-400 hover:text-white transition-colors self-end sm:self-auto"
                      title="Refresh"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* On-the-fly Clipping Settings Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-padel-border/40 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-300 font-semibold text-[11px] flex items-center gap-1">
                        <Scissors className="w-3.5 h-3.5 text-pink-400" /> Atur Klip:
                      </span>
                      <div className="flex items-center gap-1 bg-padel-card px-2.5 py-1 rounded-xl border border-padel-border/60">
                        <span className="text-[10px] text-slate-400">Awal:</span>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={modalPreRoll}
                          onChange={e => setModalPreRoll(Math.max(1, Number(e.target.value)))}
                          className="w-10 bg-padel-dark border border-padel-border/60 rounded px-1 text-center font-bold text-padel-volt text-xs outline-none"
                        />
                        <span className="text-[10px] text-slate-400">s</span>
                      </div>
                      <div className="flex items-center gap-1 bg-padel-card px-2.5 py-1 rounded-xl border border-padel-border/60">
                        <span className="text-[10px] text-slate-400">Akhir:</span>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={modalPostRoll}
                          onChange={e => setModalPostRoll(Math.max(1, Number(e.target.value)))}
                          className="w-10 bg-padel-dark border border-padel-border/60 rounded px-1 text-center font-bold text-pink-400 text-xs outline-none"
                        />
                        <span className="text-[10px] text-slate-400">s</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        (= {modalPreRoll + modalPostRoll}s/klip)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowMediaModal(false); navigate('/auto-clip'); }}
                        className="px-3 py-1.5 rounded-xl bg-padel-volt/15 hover:bg-padel-volt/25 border border-padel-volt/40 text-padel-volt text-xs font-semibold flex items-center gap-1.5 transition-all"
                        title="Proses klip otomatis di halaman Studio Auto-Clip AI"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Studio Auto-Clip AI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTriggerClipping(mediaCourtId, selectedMediaSession?.folder, modalPreRoll, modalPostRoll)}
                        disabled={isClipping}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-md shadow-purple-600/30"
                        title={`Potong ulang dengan durasi ${modalPreRoll}s awal + ${modalPostRoll}s akhir`}
                      >
                        <Scissors className={`w-3.5 h-3.5 ${isClipping ? 'animate-spin' : ''}`} />
                        <span>{isClipping ? 'Sedang Memotong...' : 'Potong Ulang Klip'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* QR Code Share Card for Mobile Users */}
                {selectedMediaSession && (() => {
                  const sharePath = `/share/${mediaCourtId}/${selectedMediaSession.folder}`;
                  const fullShareUrl = selectedMediaSession.share_url || (serverBaseUrl ? `${serverBaseUrl}${sharePath}` : `${window.location.origin}${sharePath}`);
                  const qrImgSrc = selectedMediaSession.qr_url || `/api/qr?text=${encodeURIComponent(fullShareUrl)}`;
                  const isLocalhost = fullShareUrl.includes('localhost') || fullShareUrl.includes('127.0.0.1');

                  return (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-pink-950/20 via-padel-dark to-cyan-950/20 border border-pink-500/30 flex flex-col sm:flex-row items-center gap-4">
                      <div className="bg-white p-2.5 rounded-2xl shrink-0 shadow-lg shadow-black/50">
                        <img
                          src={qrImgSrc}
                          alt="QR Code Video Share"
                          className="w-28 h-28 sm:w-32 sm:h-32 block"
                        />
                      </div>
                      <div className="flex-1 flex flex-col gap-2 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-1.5 text-pink-400 font-bold text-xs uppercase tracking-wider">
                          <QrCode className="w-4 h-4" />
                          <span>Scan QR untuk Download di HP</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Pemain cukup scan QR ini dengan smartphone (terhubung ke Wi-Fi yang sama) untuk menonton dan mengunduh Reels Highlight atau Full Match!
                        </p>
                        <div className="text-[11px] font-mono text-padel-volt bg-black/40 px-2.5 py-1 rounded-lg border border-padel-border/60 inline-block break-all self-center sm:self-start">
                          {fullShareUrl}
                        </div>
                        {isLocalhost && (
                          <div className="text-[11px] text-amber-300 bg-amber-500/20 border border-amber-500/40 p-2 rounded-xl text-left">
                            ⚠️ <strong>Peringatan:</strong> URL saat ini mengarah ke <code>localhost</code>. HP pemain tidak akan bisa mengakses video dari jaringan luar. Masukkan IP Wi-Fi server pada pengaturan di bawah!
                          </div>
                        )}
                        <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                          <a
                            href={fullShareUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3.5 py-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/40 text-pink-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Buka Halaman Share</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => copyShareLink(fullShareUrl)}
                            className="px-3.5 py-1.5 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            {copiedUrl ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedUrl ? 'Tersalin!' : 'Salin Link'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Media Tab Header */}
                <div className="flex border-b border-padel-border/60 gap-2">
                  {selectedMediaSession?.reels_url && (
                    <button
                      type="button"
                      onClick={() => setActiveMediaTab('reel')}
                      className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
                        activeMediaTab === 'reel'
                          ? 'border-padel-volt text-padel-volt'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Reels Highlight ({selectedMediaSession.reels_size_mb} MB)</span>
                    </button>
                  )}
                  {selectedMediaSession?.clips && selectedMediaSession.clips.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveMediaTab('clips')}
                      className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
                        activeMediaTab === 'clips'
                          ? 'border-pink-400 text-pink-400'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      <Heart className="w-3.5 h-3.5" />
                      <span>Klip Momen ({selectedMediaSession.clips.length})</span>
                    </button>
                  )}
                  {selectedMediaSession?.main_url && (
                    <button
                      type="button"
                      onClick={() => setActiveMediaTab('full')}
                      className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
                        activeMediaTab === 'full'
                          ? 'border-cyan-400 text-cyan-400'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Video Lengkap ({selectedMediaSession.main_size_mb} MB)</span>
                    </button>
                  )}
                </div>

                {/* Tab 1: Reels Highlight */}
                {activeMediaTab === 'reel' && selectedMediaSession?.reels_url && (
                  <div className="flex flex-col gap-3">
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={selectedMediaSession.reels_url}
                      className="w-full max-h-[300px] rounded-2xl bg-black border border-padel-border/60"
                    />
                    <a
                      href={`${selectedMediaSession.reels_url}?download=1`}
                      download
                      className="py-3 px-4 rounded-xl bg-gradient-to-r from-padel-volt to-lime-400 text-black font-score font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-padel-volt/20 hover:brightness-105 active:scale-98 transition-all text-center"
                    >
                      <Download className="w-4 h-4 text-black" />
                      <span>Unduh Reels Highlight MP4 ({selectedMediaSession.reels_size_mb} MB)</span>
                    </a>
                  </div>
                )}

                {/* Tab 2: Klip Momen Per Poin */}
                {activeMediaTab === 'clips' && selectedMediaSession?.clips && (
                  <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {selectedMediaSession.clips.map((c, idx) => (
                      <div key={idx} className="p-3 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-full bg-pink-500/20 text-pink-300 font-bold text-xs flex items-center justify-center shrink-0">
                            #{idx + 1}
                          </span>
                          <div>
                            <span className="text-xs font-bold text-white block">
                              Momen Menit {c.time_str || `Klip ${idx + 1}`}
                            </span>
                            <span className="text-[11px] text-pink-300 font-semibold">
                              {c.skor ? `Skor: ${c.skor}` : 'Momen Seru'} · {c.duration ? `${c.duration}s` : ''} ({c.size_mb} MB)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 sm:flex-initial py-1.5 px-3 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-xs font-semibold text-white flex items-center justify-center gap-1 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Putar</span>
                          </a>
                          <a
                            href={`${c.url}?download=1`}
                            download
                            className="flex-1 sm:flex-initial py-1.5 px-3 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold flex items-center justify-center gap-1 transition-colors shadow-sm"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Unduh</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab 3: Video Lengkap Pertandingan */}
                {activeMediaTab === 'full' && selectedMediaSession?.main_url && (
                  <div className="flex flex-col gap-3">
                    <video
                      controls
                      playsInline
                      preload="none"
                      src={selectedMediaSession.main_url}
                      className="w-full max-h-[300px] rounded-2xl bg-black border border-padel-border/60"
                    />
                    <a
                      href={`${selectedMediaSession.main_url}?download=1`}
                      download
                      className="py-3 px-4 rounded-xl bg-padel-card hover:bg-padel-border/80 border border-padel-border/60 text-white font-score font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all text-center"
                    >
                      <Download className="w-4 h-4 text-padel-volt" />
                      <span>Unduh Video Lengkap MP4 ({selectedMediaSession.main_size_mb} MB)</span>
                    </a>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end pt-3 border-t border-padel-border/40">
              <button
                type="button"
                onClick={() => setShowMediaModal(false)}
                className="px-5 py-2.5 rounded-xl bg-padel-card hover:bg-padel-border/60 text-white font-semibold text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
