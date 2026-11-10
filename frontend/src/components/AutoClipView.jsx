import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, ArrowLeft, LogOut, RefreshCw, Play, Download,
  Film, Video, Sliders, Clock, CheckCircle2, AlertTriangle,
  Monitor, Smartphone, Square, QrCode, Copy, Check, Tv, Scissors
} from 'lucide-react';

const FORMAT_OPTIONS = [
  {
    id: 'landscape',
    label: '16:9 Landscape',
    sub: 'Asli CCTV / YouTube',
    icon: Monitor,
  },
  {
    id: 'vertical',
    label: '9:16 Vertical',
    sub: 'Reels / TikTok / Shorts',
    icon: Smartphone,
  },
  {
    id: 'square',
    label: '1:1 Square',
    sub: 'Feed Instagram / Post',
    icon: Square,
  },
];

export default function AutoClipView({ navigate }) {
  const [courts, setCourts] = useState([
    { id: 1, name: 'Lapangan 1' },
    { id: 2, name: 'Lapangan 2' },
    { id: 3, name: 'Lapangan 3' },
  ]);
  const [courtId, setCourtId] = useState(1);
  const [sessions, setSessions] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [cv2Available, setCv2Available] = useState(true);

  // Settings Auto-Clip (default target = 5 sesuai permintaan)
  const [sensitivity, setSensitivity] = useState(0.5);
  const [maxClips, setMaxClips] = useState(5);
  const [preRollSec, setPreRollSec] = useState(10);
  const [postRollSec, setPostRollSec] = useState(4);
  const [minGapSec, setMinGapSec] = useState(15);
  const [outputFormat, setOutputFormat] = useState('landscape');
  const [cropFocus, setCropFocus] = useState('center');
  const [createReel, setCreateReel] = useState(true);
  const [sourceVideo, setSourceVideo] = useState('auto'); // 'auto' | 'skor' | 'raw'

  // UI & job state
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState(null);
  const [progress, setProgress] = useState({ status: 'idle', pct: 0, msg: '' });
  const [copiedUrl, setCopiedUrl] = useState(false);
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/config');
      if (res.status === 401) {
        navigate('/login?next=/auto-clip');
        return;
      }
      const data = await res.json();
      if (data.ok) {
        if (typeof data.cv2_available === 'boolean') {
          setCv2Available(data.cv2_available);
        }
        if (data.config?.courts?.length) {
          setCourts(data.config.courts.map(c => ({ id: c.id, name: c.name })));
        }
        if (data.config?.auto_clipping) {
          const ac = data.config.auto_clipping;
          if (ac.sensitivity != null) setSensitivity(Number(ac.sensitivity));
          if (ac.max_clips != null) setMaxClips(Number(ac.max_clips));
          if (ac.pre_roll_seconds != null) setPreRollSec(Number(ac.pre_roll_seconds));
          if (ac.post_roll_seconds != null) setPostRollSec(Number(ac.post_roll_seconds));
          if (ac.min_gap_seconds != null) setMinGapSec(Number(ac.min_gap_seconds));
          if (ac.output_format) setOutputFormat(ac.output_format);
          if (ac.crop_focus) setCropFocus(ac.crop_focus);
          if (ac.create_reel != null) setCreateReel(Boolean(ac.create_reel));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMedia = async (cid) => {
    setLoadingMedia(true);
    try {
      const res = await fetch(`/api/court/${cid}/media`);
      const data = await res.json();
      if (data.ok) {
        const list = data.sessions || [];
        setSessions(list);
        setSelectedFolder(prev => {
          if (prev && list.some(s => s.folder === prev)) return prev;
          return list[0]?.folder || '';
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMedia(false);
    }
  };

  const startPollingProgress = (cid) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/auto-clip-progress/${cid}`);
        if (!res.ok) return;
        const prog = await res.json();
        setProgress(prog);
        if (prog.status === 'done' || prog.status === 'error' || prog.status === 'idle') {
          stopPolling();
          if (prog.status === 'done') {
            fetchMedia(cid);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 1200);
  };

  const checkInitialProgress = async (cid) => {
    stopPolling();
    try {
      const res = await fetch(`/api/admin/auto-clip-progress/${cid}`);
      if (!res.ok) return;
      const prog = await res.json();
      if (typeof prog.cv2_available === 'boolean') {
        setCv2Available(prog.cv2_available);
      }
      setProgress(prog);
      if (prog.status === 'running') {
        startPollingProgress(cid);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchMedia(courtId);
    checkInitialProgress(courtId);
  }, [courtId]);

  const selectedSession = sessions.find(s => s.folder === selectedFolder) || sessions[0] || null;

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    setSettingsNotice(null);
    try {
      const res = await fetch('/api/admin/set-auto-clipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          sensitivity: Number(sensitivity),
          max_clips: Number(maxClips),
          pre_roll_seconds: Number(preRollSec),
          post_roll_seconds: Number(postRollSec),
          min_gap_seconds: Number(minGapSec),
          output_format: outputFormat,
          crop_focus: cropFocus,
          create_reel: Boolean(createReel),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSettingsNotice({ type: 'ok', text: 'Pengaturan default Auto-Clip AI tersimpan!' });
      } else {
        setSettingsNotice({ type: 'error', text: data.error || 'Gagal menyimpan pengaturan.' });
      }
    } catch (e) {
      setSettingsNotice({ type: 'error', text: 'Gagal terhubung ke server.' });
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleRunAutoClip = async () => {
    if (!selectedSession) return;
    setProgress({
      status: 'running',
      pct: 1,
      msg: 'Memulai analisis Auto-Clip AI...',
      folder: selectedSession.folder,
    });
    try {
      const res = await fetch(`/api/court/${courtId}/auto-clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: selectedSession.folder,
          source_video: sourceVideo === 'auto' ? '' : sourceVideo,
          sensitivity: Number(sensitivity),
          max_clips: Number(maxClips),
          pre_roll: Number(preRollSec),
          post_roll: Number(postRollSec),
          min_gap: Number(minGapSec),
          output_format: outputFormat,
          crop_focus: cropFocus,
          create_reel: Boolean(createReel),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setProgress({
          status: 'error',
          pct: 0,
          msg: data.error || 'Gagal memulai Auto-Clip AI.',
          folder: selectedSession.folder,
        });
        return;
      }
      startPollingProgress(courtId);
    } catch (e) {
      setProgress({ status: 'error', pct: 0, msg: 'Gagal terhubung ke server.' });
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/login');
  };

  const copyLink = (url) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const formatBadgeLabel = (fmt) => {
    if (fmt === 'vertical') return '📱 9:16 Vertical';
    if (fmt === 'square') return '⬜ 1:1 Square';
    return '🖥️ 16:9 Landscape';
  };

  return (
    <div className="min-h-screen bg-padel-dark text-slate-100 font-ui flex flex-col">
      {/* Top Navbar */}
      <header className="bg-padel-surface/90 border-b border-padel-border/60 sticky top-0 z-30 backdrop-blur-md px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-slate-200 text-xs font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-padel-volt to-emerald-400 flex items-center justify-center text-black shadow-md shadow-padel-volt/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-score font-black tracking-wide text-white uppercase flex items-center gap-2">
              Studio <span className="text-padel-volt">Auto-Clip AI</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              Ekstrak momen reli terbaik otomatis ke klip siap upload sosmed (tanpa memperlambat pertandingan)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Court Selector Pills */}
          <div className="flex p-1 bg-padel-dark rounded-xl border border-padel-border/60">
            {courts.map(c => (
              <button
                key={c.id}
                onClick={() => setCourtId(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  courtId === c.id
                    ? 'bg-padel-volt text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchMedia(courtId)}
            className="p-2.5 rounded-xl bg-padel-card hover:bg-padel-border/60 text-slate-300 hover:text-white transition-colors"
            title="Segarkan daftar video"
          >
            <RefreshCw className={`w-4 h-4 ${loadingMedia ? 'animate-spin text-padel-volt' : ''}`} />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-semibold transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {!cv2Available && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-sm text-amber-300 mb-1">Library OpenCV Belum Terinstall</strong>
              <p>
                Untuk menjalankan analisis Auto-Clip AI di server, jalankan perintah{' '}
                <code className="bg-black/40 px-1.5 py-0.5 rounded font-mono text-padel-volt">
                  pip install -r requirements.txt
                </code>{' '}
                lalu restart <code className="bg-black/40 px-1.5 py-0.5 rounded font-mono">main.py</code>.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT PANEL: Match Selection & Auto-Clip Configuration */}
          <div className="lg:col-span-5 bg-padel-surface/80 border border-padel-border/60 rounded-3xl p-6 flex flex-col gap-5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-score font-bold uppercase tracking-wide text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-padel-volt" />
                <span>Konfigurasi Auto-Clip</span>
              </h2>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-padel-volt/15 text-padel-volt border border-padel-volt/30">
                Lapangan {courtId}
              </span>
            </div>

            {/* 1. Pilih Sesi Video */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-padel-volt" />
                <span>1. Pilih Pertandingan</span>
              </label>
              {sessions.length === 0 ? (
                <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 text-xs text-slate-400 text-center">
                  Belum ada rekaman pertandingan di Lapangan {courtId}.
                </div>
              ) : (
                <select
                  value={selectedSession?.folder || ''}
                  onChange={e => setSelectedFolder(e.target.value)}
                  className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-padel-volt"
                >
                  {sessions.map((s) => (
                    <option key={s.folder} value={s.folder}>
                      {s.title} · {s.date} {s.auto_clips?.length ? `(${s.auto_clips.length} AI Klip)` : ''}
                    </option>
                  ))}
                </select>
              )}
              {selectedSession && (
                <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-slate-400">
                  <span className="px-2 py-0.5 rounded bg-padel-card border border-padel-border/50">
                    🎬 {selectedSession.main_video || '-'} ({selectedSession.main_size_mb || 0} MB)
                  </span>
                  {selectedSession.raw_video && selectedSession.skor_video && (
                    <div className="flex items-center gap-1.5">
                      <span>Sumber:</span>
                      {[
                        { id: 'auto', label: 'Otomatis' },
                        { id: 'skor', label: 'Video Skor' },
                        { id: 'raw', label: 'Raw Kamera' },
                      ].map(src => (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => setSourceVideo(src.id)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                            sourceVideo === src.id
                              ? 'bg-padel-volt text-black'
                              : 'bg-padel-card text-slate-300 hover:bg-padel-border/60'
                          }`}
                        >
                          {src.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Target Jumlah Klip (Default 5 + Editable) */}
            <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  2. Target Maksimal Klip
                </label>
                <span className="text-sm font-score font-black text-padel-volt">{maxClips} Klip</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={25}
                  step={1}
                  value={maxClips}
                  onChange={e => setMaxClips(Number(e.target.value))}
                  className="flex-1 accent-padel-volt cursor-pointer"
                />
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxClips}
                  onChange={e => setMaxClips(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="w-16 bg-padel-card border border-padel-border rounded-xl px-2 py-1 text-center text-sm font-bold text-white outline-none focus:border-padel-volt"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-500 font-semibold">Preset:</span>
                {[3, 5, 8, 10, 15, 20].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxClips(n)}
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                      maxClips === n
                        ? 'bg-padel-volt text-black shadow-sm'
                        : 'bg-padel-card hover:bg-padel-border/60 text-slate-300'
                    }`}
                  >
                    {n} klip
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Format Video Output */}
            <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-3">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                3. Format Rasio Video (Sosmed)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {FORMAT_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const active = outputFormat === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOutputFormat(opt.id)}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                        active
                          ? 'bg-padel-volt/15 border-padel-volt text-white shadow-sm'
                          : 'bg-padel-card/60 border-padel-border/50 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-padel-volt' : 'text-slate-400'}`} />
                      <span className="text-xs font-bold leading-tight">{opt.label}</span>
                      <span className="text-[10px] text-slate-400 leading-tight">{opt.sub}</span>
                    </button>
                  );
                })}
              </div>

              {(outputFormat === 'vertical' || outputFormat === 'square') && (
                <div className="pt-2 border-t border-padel-border/40 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-semibold">Fokus Area Crop:</span>
                  <div className="flex gap-1.5">
                    {[
                      { id: 'left', label: 'Kiri' },
                      { id: 'center', label: 'Tengah' },
                      { id: 'right', label: 'Kanan' },
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setCropFocus(f.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                          cropFocus === f.id
                            ? 'bg-cyan-500 text-black'
                            : 'bg-padel-card text-slate-300 hover:bg-padel-border/60'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Sensitivitas & Durasi Potongan */}
            <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    4. Sensitivitas Deteksi AI
                  </label>
                  <span className="text-xs font-mono text-cyan-300 font-bold">
                    {Math.round(sensitivity * 100)}% (
                    {sensitivity <= 0.3 ? 'Selektif' : sensitivity <= 0.65 ? 'Seimbang' : 'Sensitif'})
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sensitivity}
                  onChange={e => setSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-padel-border/40">
                <div>
                  <label className="block text-[10px] text-slate-400 font-semibold mb-1">Awal (s)</label>
                  <input
                    type="number"
                    min={1}
                    max={45}
                    value={preRollSec}
                    onChange={e => setPreRollSec(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-padel-card border border-padel-border rounded-xl px-2.5 py-1.5 text-center text-xs font-bold text-white outline-none focus:border-padel-volt"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-semibold mb-1">Akhir (s)</label>
                  <input
                    type="number"
                    min={1}
                    max={45}
                    value={postRollSec}
                    onChange={e => setPostRollSec(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-padel-card border border-padel-border rounded-xl px-2.5 py-1.5 text-center text-xs font-bold text-white outline-none focus:border-padel-volt"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-semibold mb-1">Jeda Min (s)</label>
                  <input
                    type="number"
                    min={3}
                    max={120}
                    value={minGapSec}
                    onChange={e => setMinGapSec(Math.max(3, Number(e.target.value) || 3))}
                    className="w-full bg-padel-card border border-padel-border rounded-xl px-2.5 py-1.5 text-center text-xs font-bold text-white outline-none focus:border-padel-volt"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={createReel}
                  onChange={e => setCreateReel(e.target.checked)}
                  className="w-4 h-4 accent-padel-volt rounded"
                />
                <span>Gabungkan menjadi 1 video Auto-Reel Highlight</span>
              </label>
            </div>

            {settingsNotice && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  settingsNotice.type === 'error'
                    ? 'bg-red-500/20 border-red-500/40 text-red-300'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                }`}
              >
                {settingsNotice.text}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleRunAutoClip}
                disabled={!selectedSession || !cv2Available || progress.status === 'running'}
                className="flex-1 py-3 px-4 rounded-xl bg-padel-volt hover:bg-padel-voltHover text-black font-score font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-padel-volt/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {progress.status === 'running' ? `Memproses (${progress.pct}%)...` : 'Proses Auto-Clip AI'}
                </span>
              </button>
              <button
                type="button"
                onClick={handleSaveDefaults}
                disabled={savingDefaults}
                className="py-3 px-4 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-xs font-bold text-slate-200 transition-colors disabled:opacity-50"
              >
                {savingDefaults ? 'Menyimpan...' : '💾 Simpan Default'}
              </button>
            </div>
          </div>

          {/* RIGHT PANEL: Progress & Generated Auto-Clips Gallery */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Live Progress Banner */}
            {progress.status === 'running' && (
              <div className="bg-padel-surface/90 border border-padel-volt/50 rounded-3xl p-6 flex flex-col gap-3 shadow-lg shadow-padel-volt/10">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-padel-volt flex items-center gap-2">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    <span>{progress.msg || 'Sedang menganalisis video...'}</span>
                  </span>
                  <span className="font-mono text-white">{progress.pct || 0}%</span>
                </div>
                <div className="w-full h-3 rounded-full bg-padel-dark overflow-hidden border border-padel-border/60">
                  <div
                    className="h-full bg-gradient-to-r from-padel-volt to-emerald-400 transition-all duration-300"
                    style={{ width: `${progress.pct || 0}%` }}
                  />
                </div>
                {progress.folder && (
                  <p className="text-[11px] text-slate-400 font-mono">Sesi: {progress.folder}</p>
                )}
              </div>
            )}

            {progress.status === 'done' && (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{progress.msg}</span>
              </div>
            )}

            {progress.status === 'error' && (
              <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{progress.msg}</span>
              </div>
            )}

            {/* Results Card */}
            <div className="bg-padel-surface/80 border border-padel-border/60 rounded-3xl p-6 flex flex-col gap-5 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-padel-border/50">
                <div>
                  <h2 className="text-lg font-score font-bold uppercase tracking-wide text-white flex items-center gap-2">
                    <Film className="w-5 h-5 text-padel-volt" />
                    <span>Hasil Klip AI Pertandingan</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    {selectedSession ? `${selectedSession.title} · ${selectedSession.date}` : 'Pilih pertandingan di sebelah kiri'}
                  </p>
                </div>

                {selectedSession?.auto_clip_settings && (
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                    <span className="px-2.5 py-1 rounded-full bg-padel-card border border-padel-border/60 text-padel-volt font-bold">
                      {formatBadgeLabel(selectedSession.auto_clip_settings.output_format)}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-padel-card border border-padel-border/60 text-slate-300">
                      Target: {selectedSession.auto_clip_settings.max_clips} klip · Sens:{' '}
                      {Math.round((selectedSession.auto_clip_settings.sensitivity ?? 0.5) * 100)}%
                    </span>
                  </div>
                )}
              </div>

              {!selectedSession ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  Pilih sesi rekaman untuk melihat atau menghasilkan Auto-Klip AI.
                </div>
              ) : (!selectedSession.auto_clips?.length && !selectedSession.auto_reel_url) ? (
                <div className="py-14 px-4 text-center flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-padel-card border border-padel-border/60 flex items-center justify-center text-3xl">
                    🤖
                  </div>
                  <h3 className="text-base font-bold text-white">Belum Ada Hasil Auto-Clip AI</h3>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    Sesuaikan target jumlah klip (default <strong>5 klip</strong>) dan format video
                    (<strong>16:9 Landscape</strong>, <strong>9:16 Vertical Reels</strong>, atau{' '}
                    <strong>1:1 Square</strong>) lalu tekan tombol <strong>Proses Auto-Clip AI</strong>.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Auto-Reel Player */}
                  {selectedSession.auto_reel_url && (
                    <div className="p-4 rounded-2xl bg-padel-dark/90 border border-padel-volt/30 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-padel-volt uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4" />
                          <span>Auto-Reel Gabungan ({selectedSession.auto_reel_size_mb} MB)</span>
                        </span>
                        <a
                          href={`${selectedSession.auto_reel_url}?download=1`}
                          download
                          className="px-3.5 py-1.5 rounded-xl bg-padel-volt hover:bg-padel-voltHover text-black text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Reel</span>
                        </a>
                      </div>
                      <video
                        key={selectedSession.auto_reel_url}
                        controls
                        className="w-full max-h-80 rounded-xl bg-black border border-padel-border/60"
                        src={selectedSession.auto_reel_url}
                      />
                    </div>
                  )}

                  {/* Individual AI Clips Grid */}
                  {selectedSession.auto_clips?.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Scissors className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Klip Momen Individu ({selectedSession.auto_clips.length} Video)</span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedSession.auto_clips.map((clip, i) => (
                          <div
                            key={clip.file || i}
                            className="p-3.5 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-2.5"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-white flex items-center gap-1.5">
                                <Video className="w-3.5 h-3.5 text-padel-volt" />
                                <span>Auto-Klip #{clip.index || i + 1}</span>
                              </span>
                              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                                {clip.time_str && (
                                  <span className="px-2 py-0.5 rounded bg-padel-card text-cyan-300 border border-padel-border/50">
                                    ⏱ {clip.time_str}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded bg-padel-card text-slate-300">
                                  {clip.duration}s
                                </span>
                              </div>
                            </div>

                            <video
                              controls
                              preload="metadata"
                              className="w-full max-h-56 rounded-xl bg-black border border-padel-border/40"
                              src={clip.url}
                            />

                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                              <span className="font-mono">
                                {formatBadgeLabel(clip.format)} · {clip.size_mb || 0} MB
                              </span>
                              <a
                                href={`${clip.url}?download=1`}
                                download
                                className="px-3 py-1 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                              >
                                <Download className="w-3 h-3" />
                                <span>Unduh</span>
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Share via QR */}
                  {selectedSession.share_url && (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-padel-dark via-padel-card/70 to-padel-dark border border-padel-border/60 flex flex-col sm:flex-row items-center gap-4">
                      <div className="bg-white p-2 rounded-xl shrink-0">
                        <img
                          src={selectedSession.qr_url}
                          alt="QR Share Auto-Clip"
                          className="w-20 h-20 block"
                        />
                      </div>
                      <div className="flex-1 flex flex-col gap-1.5 text-center sm:text-left">
                        <div className="text-xs font-bold text-padel-volt uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1.5">
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Share ke HP Admin / Pemain</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Scan QR atau salin link untuk membuka & download langsung di HP (Wi-Fi lokal).
                        </p>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => copyLink(selectedSession.share_url)}
                            className="px-3 py-1.5 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-xs font-semibold text-white flex items-center gap-1.5"
                          >
                            {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedUrl ? 'Tersalin!' : 'Salin Link Share'}</span>
                          </button>
                          <a
                            href={selectedSession.share_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-padel-volt/15 hover:bg-padel-volt/25 border border-padel-volt/40 text-padel-volt text-xs font-semibold"
                          >
                            Buka Halaman Share ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
