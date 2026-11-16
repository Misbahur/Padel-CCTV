import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, ArrowLeft, LogOut, RefreshCw, Play, Download,
  Film, Video, Sliders, Clock, CheckCircle2, AlertTriangle,
  Monitor, Smartphone, Square, QrCode, Copy, Check, Tv, Scissors,
  UploadCloud, Volume2, Activity, Trash2, FileVideo
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

const DETECTION_MODES = [
  {
    id: 'motion_audio',
    label: 'Gerakan + Suara',
    badge: 'Rekomendasi',
    sub: 'Analisis visual reli OpenCV + hentakan audio FFmpeg (smash & sorak)',
    icon: Activity,
    available: true,
  },
  {
    id: 'motion',
    label: 'Gerakan Saja',
    badge: 'Offline',
    sub: 'Murni analisis pergerakan visual piksel (cocok bila CCTV tanpa mic)',
    icon: Video,
    available: true,
  },
  {
    id: 'audio',
    label: 'Suara Saja',
    badge: 'Offline',
    sub: 'Murni analisis lonjakan volume smash keras & sorakan penonton',
    icon: Volume2,
    available: true,
  },
  {
    id: 'ai',
    label: 'Cloud AI (Gemini)',
    badge: 'Fase 3',
    sub: 'Pemilihan momen dramatis & auto-caption via Google Gemini API',
    icon: Sparkles,
    available: false,
  },
];

export default function AutoClipView({ navigate }) {
  // Navigation / Source mode: 'court' (CCTV Lapangan) | 'upload' (Upload Video Sendiri)
  const [activeTab, setActiveTab] = useState('court');

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

  // Upload video state
  const [uploads, setUploads] = useState([]);
  const [selectedUploadFolder, setSelectedUploadFolder] = useState('');
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // Settings Auto-Clip
  const [detectionMode, setDetectionMode] = useState('motion_audio');
  const [sensitivity, setSensitivity] = useState(0.5);
  const [sensitivityMotion, setSensitivityMotion] = useState(0.5);
  const [sensitivityAudio, setSensitivityAudio] = useState(0.5);
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
          if (ac.detection_mode) setDetectionMode(ac.detection_mode);
          if (ac.sensitivity != null) setSensitivity(Number(ac.sensitivity));
          if (ac.sensitivity_motion != null) setSensitivityMotion(Number(ac.sensitivity_motion));
          if (ac.sensitivity_audio != null) setSensitivityAudio(Number(ac.sensitivity_audio));
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

  const fetchUploads = async () => {
    setLoadingUploads(true);
    try {
      const res = await fetch('/api/uploads');
      const data = await res.json();
      if (data.ok) {
        const list = data.uploads || [];
        setUploads(list);
        setSelectedUploadFolder(prev => {
          if (prev && list.some(u => u.folder === prev)) return prev;
          return list[0]?.folder || '';
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUploads(false);
    }
  };

  const startPollingProgress = (targetKey, isUpload = false) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/auto-clip-progress/${targetKey}`);
        if (!res.ok) return;
        const prog = await res.json();
        setProgress(prog);
        if (prog.status === 'done' || prog.status === 'error' || prog.status === 'idle') {
          stopPolling();
          if (prog.status === 'done') {
            if (isUpload) {
              fetchUploads();
            } else {
              fetchMedia(courtId);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 1200);
  };

  const checkInitialProgress = async (targetKey, isUpload = false) => {
    stopPolling();
    try {
      const res = await fetch(`/api/admin/auto-clip-progress/${targetKey}`);
      if (!res.ok) return;
      const prog = await res.json();
      if (typeof prog.cv2_available === 'boolean') {
        setCv2Available(prog.cv2_available);
      }
      setProgress(prog);
      if (prog.status === 'running') {
        startPollingProgress(targetKey, isUpload);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchUploads();
  }, []);

  useEffect(() => {
    if (activeTab === 'court') {
      fetchMedia(courtId);
      checkInitialProgress(courtId, false);
    } else {
      fetchUploads();
      checkInitialProgress('upload', true);
    }
  }, [courtId, activeTab]);

  const selectedSession = activeTab === 'court'
    ? (sessions.find(s => s.folder === selectedFolder) || sessions[0] || null)
    : (uploads.find(u => u.folder === selectedUploadFolder) || uploads[0] || null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.mp4', '.mov', '.mkv', '.webm', '.avi'];
    const lowerName = file.name.toLowerCase();
    if (!validExtensions.some(ext => lowerName.endsWith(ext))) {
      setUploadError('Format file tidak didukung. Gunakan file video MP4, MOV, MKV, atau WebM.');
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload-video?filename=${encodeURIComponent(file.name)}`, true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(pct);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
          fetchUploads();
          if (data.folder) {
            setSelectedUploadFolder(data.folder);
          }
        } else {
          setUploadError(data.error || 'Gagal mengunggah video ke server.');
        }
      } catch (err) {
        setUploadError('Respon server tidak valid saat mengunggah.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setUploadError('Terjadi kesalahan koneksi saat mengunggah video.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    xhr.send(file);
  };

  const handleDeleteUpload = async (folder) => {
    if (!window.confirm('Yakin ingin menghapus video ini dan seluruh klip AI-nya?')) return;
    try {
      const res = await fetch('/api/upload/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchUploads();
      } else {
        alert(data.error || 'Gagal menghapus video.');
      }
    } catch (e) {
      alert('Gagal terhubung ke server.');
    }
  };

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    setSettingsNotice(null);
    try {
      const res = await fetch('/api/admin/set-auto-clipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          detection_mode: detectionMode,
          sensitivity: Number(sensitivity),
          sensitivity_motion: Number(sensitivityMotion),
          sensitivity_audio: Number(sensitivityAudio),
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

    const isUpload = activeTab === 'upload';
    const endpoint = isUpload
      ? '/api/upload/auto-clip'
      : `/api/court/${courtId}/auto-clip`;
    const targetKey = isUpload ? 'upload' : courtId;

    try {
      const payload = {
        folder: selectedSession.folder,
        detection_mode: detectionMode,
        sensitivity: Number(sensitivity),
        sensitivity_motion: Number(sensitivityMotion),
        sensitivity_audio: Number(sensitivityAudio),
        max_clips: Number(maxClips),
        pre_roll: Number(preRollSec),
        post_roll: Number(postRollSec),
        min_gap: Number(minGapSec),
        output_format: outputFormat,
        crop_focus: cropFocus,
        create_reel: Boolean(createReel),
      };
      if (!isUpload) {
        payload.source_video = sourceVideo === 'auto' ? '' : sourceVideo;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      startPollingProgress(targetKey, isUpload);
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
              <span className="text-[10px] font-sans font-extrabold uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Fase 2: Multi-Modal
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              Ekstrak momen terbaik otomatis berbasis visual reli & suara smash/sorakan (100% lokal & offline)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'court' && (
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
          )}
          <button
            onClick={() => (activeTab === 'court' ? fetchMedia(courtId) : fetchUploads())}
            className="p-2.5 rounded-xl bg-padel-card hover:bg-padel-border/60 text-slate-300 hover:text-white transition-colors"
            title="Segarkan daftar video"
          >
            <RefreshCw className={`w-4 h-4 ${(loadingMedia || loadingUploads) ? 'animate-spin text-padel-volt' : ''}`} />
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
        {/* Source Mode Tabs (Rekaman CCTV vs Upload Video Sendiri) */}
        <div className="flex items-center gap-3 border-b border-padel-border/50 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('court')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === 'court'
                ? 'bg-padel-volt text-black shadow-lg shadow-padel-volt/20'
                : 'bg-padel-card/80 border border-padel-border/60 text-slate-300 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>🏟️ Rekaman Lapangan CCTV</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === 'upload'
                ? 'bg-padel-volt text-black shadow-lg shadow-padel-volt/20'
                : 'bg-padel-card/80 border border-padel-border/60 text-slate-300 hover:text-white'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>📁 Upload Video Sendiri</span>
            {uploads.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/30 font-mono">
                {uploads.length}
              </span>
            )}
          </button>
        </div>

        {!cv2Available && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-sm text-amber-300 mb-1">Library OpenCV Belum Terinstall</strong>
              <p>
                Untuk menjalankan analisis Auto-Clip di server, jalankan perintah{' '}
                <code className="bg-black/40 px-1.5 py-0.5 rounded font-mono text-padel-volt">
                  pip install -r requirements.txt
                </code>{' '}
                lalu restart sistem.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT PANEL: Video Selection & Auto-Clip Configuration */}
          <div className="lg:col-span-5 bg-padel-surface/80 border border-padel-border/60 rounded-3xl p-6 flex flex-col gap-5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-score font-bold uppercase tracking-wide text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-padel-volt" />
                <span>Konfigurasi Auto-Clip</span>
              </h2>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-padel-volt/15 text-padel-volt border border-padel-volt/30">
                {activeTab === 'court' ? `Lapangan ${courtId}` : 'Upload Mode'}
              </span>
            </div>

            {/* 1. Pilih Video Sumber */}
            {activeTab === 'court' ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-padel-volt" />
                  <span>1. Pilih Pertandingan Lapangan</span>
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
            ) : (
              <div className="flex flex-col gap-2.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5 text-padel-volt" />
                  <span>1. Upload Video Sendiri (MP4 / MOV)</span>
                </label>

                {/* Upload Zone */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="video-upload-input"
                />
                <label
                  htmlFor="video-upload-input"
                  className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                    isUploading
                      ? 'border-padel-volt bg-padel-volt/10'
                      : 'border-padel-border/70 hover:border-padel-volt/80 bg-padel-card/50 hover:bg-padel-card/80'
                  }`}
                >
                  <UploadCloud className={`w-6 h-6 ${isUploading ? 'text-padel-volt animate-bounce' : 'text-slate-400'}`} />
                  <div className="text-center">
                    <span className="text-xs font-bold text-white block">
                      {isUploading ? `Mengunggah... (${uploadProgress}%)` : 'Klik untuk Unggah Video Baru'}
                    </span>
                    <span className="text-[10px] text-slate-400">MP4, MOV, MKV, atau WebM</span>
                  </div>
                </label>

                {isUploading && (
                  <div className="w-full bg-padel-dark rounded-full h-2 overflow-hidden border border-padel-border/60">
                    <div
                      className="bg-gradient-to-r from-padel-volt to-emerald-400 h-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}

                {uploadError && (
                  <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* List of Uploaded Videos */}
                {uploads.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 font-semibold">Video yang Telah Diunggah:</span>
                    <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 pr-1">
                      {uploads.map(u => {
                        const active = selectedUploadFolder === u.folder;
                        return (
                          <div
                            key={u.folder}
                            onClick={() => setSelectedUploadFolder(u.folder)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                              active
                                ? 'bg-padel-volt/15 border-padel-volt text-white shadow-sm'
                                : 'bg-padel-dark/70 border-padel-border/50 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileVideo className={`w-4 h-4 shrink-0 ${active ? 'text-padel-volt' : 'text-slate-400'}`} />
                              <div className="min-w-0">
                                <p className="text-xs font-bold truncate leading-tight">{u.title || u.main_video}</p>
                                <p className="text-[10px] text-slate-400 leading-tight">
                                  {u.date} · {u.main_size_mb} MB {u.auto_clips?.length ? `· ${u.auto_clips.length} Klip` : ''}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteUpload(u.folder);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Hapus video upload"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. Pilihan Mode Deteksi Momen */}
            <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  2. Mode Deteksi Momen
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-padel-card text-padel-volt border border-padel-border/50">
                  {DETECTION_MODES.find(m => m.id === detectionMode)?.label}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DETECTION_MODES.map(mode => {
                  const Icon = mode.icon;
                  const active = detectionMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      disabled={!mode.available}
                      onClick={() => mode.available && setDetectionMode(mode.id)}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                        !mode.available
                          ? 'opacity-40 cursor-not-allowed bg-padel-card/30 border-padel-border/30'
                          : active
                            ? 'bg-padel-volt/15 border-padel-volt text-white shadow-sm'
                            : 'bg-padel-card/60 border-padel-border/50 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-4 h-4 ${active ? 'text-padel-volt' : 'text-slate-400'}`} />
                          <span className="text-xs font-bold">{mode.label}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          mode.id === 'motion_audio'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : mode.id === 'ai'
                              ? 'bg-purple-500/20 text-purple-300'
                              : 'bg-padel-dark text-slate-400'
                        }`}>
                          {mode.badge}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 leading-tight">{mode.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Slider Sensitivitas Deteksi */}
            <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-3">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                3. Sensitivitas Deteksi
              </label>

              {(detectionMode === 'motion_audio' || detectionMode === 'motion') && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Sensitivitas Gerakan Visual</span>
                    </span>
                    <span className="font-mono text-cyan-300 font-bold">
                      {Math.round(sensitivityMotion * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={sensitivityMotion}
                    onChange={e => setSensitivityMotion(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              )}

              {(detectionMode === 'motion_audio' || detectionMode === 'audio') && (
                <div className="flex flex-col gap-1.5 pt-1 border-t border-padel-border/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Sensitivitas Energi Suara (Smash & Sorak)</span>
                    </span>
                    <span className="font-mono text-amber-300 font-bold">
                      {Math.round(sensitivityAudio * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={sensitivityAudio}
                    onChange={e => setSensitivityAudio(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* 4. Target Jumlah Klip */}
            <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  4. Target Maksimal Klip
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

            {/* 5. Format Video Output */}
            <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-3">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                5. Format Rasio Video (Sosmed)
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

            {/* 6. Durasi Potongan Klip */}
            <div className="p-4 rounded-2xl bg-padel-dark/80 border border-padel-border/60 flex flex-col gap-4">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                6. Durasi & Penggabungan Klip
              </label>
              <div className="grid grid-cols-3 gap-2.5">
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
                  <p className="text-[11px] text-slate-400 font-mono">Target: {progress.folder}</p>
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

            {/* Auto Fallback Notice (Bila audio tidak terdeteksi) */}
            {selectedSession?.auto_fallback_applied && (
              <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-sm text-amber-300 mb-0.5">Auto-Fallback Aktif</strong>
                  <p>{selectedSession.auto_fallback_reason || 'Audio hening atau tidak terdeteksi pada rekaman ini. Sistem secara otomatis beralih ke analisis visual gerakan tanpa error.'}</p>
                </div>
              </div>
            )}

            {/* Results Card */}
            <div className="bg-padel-surface/80 border border-padel-border/60 rounded-3xl p-6 flex flex-col gap-5 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-padel-border/50">
                <div>
                  <h2 className="text-lg font-score font-bold uppercase tracking-wide text-white flex items-center gap-2">
                    <Film className="w-5 h-5 text-padel-volt" />
                    <span>Hasil Klip AI</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    {selectedSession ? `${selectedSession.title} · ${selectedSession.date}` : 'Pilih video di sebelah kiri'}
                  </p>
                </div>

                {selectedSession?.auto_clip_settings && (
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                    <span className="px-2.5 py-1 rounded-full bg-padel-card border border-padel-border/60 text-padel-volt font-bold">
                      {formatBadgeLabel(selectedSession.auto_clip_settings.output_format)}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-padel-card border border-padel-border/60 text-cyan-300">
                      Mode: {selectedSession.auto_detection_mode_used || selectedSession.auto_clip_settings.detection_mode || 'motion_audio'}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-padel-card border border-padel-border/60 text-slate-300">
                      {selectedSession.auto_clip_settings.max_clips} klip
                    </span>
                  </div>
                )}
              </div>

              {!selectedSession ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  {activeTab === 'court'
                    ? 'Pilih sesi rekaman untuk melihat atau menghasilkan Auto-Klip AI.'
                    : 'Unggah atau pilih video untuk melihat atau menghasilkan Auto-Klip AI.'}
                </div>
              ) : (!selectedSession.auto_clips?.length && !selectedSession.auto_reel_url) ? (
                <div className="py-14 px-4 text-center flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-padel-card border border-padel-border/60 flex items-center justify-center text-3xl">
                    🤖
                  </div>
                  <h3 className="text-base font-bold text-white">Belum Ada Hasil Auto-Clip AI</h3>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    Pilih mode deteksi (<strong>Gerakan + Suara</strong>), target jumlah klip (default{' '}
                    <strong>5 klip</strong>), dan format rasio (<strong>16:9 Landscape</strong>,{' '}
                    <strong>9:16 Vertical Reels</strong>, atau <strong>1:1 Square</strong>) lalu tekan tombol{' '}
                    <strong>Proses Auto-Clip AI</strong>.
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

                  {/* Quick Share via QR (Only for court matches) */}
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
