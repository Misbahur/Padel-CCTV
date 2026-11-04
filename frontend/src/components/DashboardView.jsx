import React, { useState, useEffect } from 'react';
import { 
  Tv, Camera, Video, Settings, LogOut, Users, Play, Square, 
  RefreshCw, CheckCircle2, AlertTriangle, Shield, Eye, Plus, Trash2, Sliders, Clock, Lock, RotateCcw
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
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchConfig();
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
                  <div className="flex flex-col gap-2.5 mt-5 pt-3.5 border-t border-padel-border/40">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openPlayerModal(cid)}
                        className="py-2.5 px-3 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-xs font-semibold text-slate-200 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-padel-volt" />
                        <span>Pemain & Aturan</span>
                      </button>
                      <a
                        href={`/court/${cid}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2.5 px-3 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Buka Papan</span>
                      </a>
                    </div>

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
    </div>
  );
}
