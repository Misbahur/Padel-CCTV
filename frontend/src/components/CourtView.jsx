import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, RotateCcw, ArrowLeftRight, Maximize, Minimize, Users, 
  Settings, LogOut, Radio, ChevronRight, Zap, Volume2, Shield, Clock, Video
} from 'lucide-react';
import confetti from 'canvas-confetti';

const POINT_LABELS = ['0', '15', '30', '40'];

const DEF_KEYS = {
  a: [
    'ArrowLeft', 'ArrowUp', 'PageUp', 'KeyA', 'a', 'A', 'Digit1', '1', 'Numpad1',
    'AudioVolumeUp', 'VolumeUp', 'MediaTrackPrevious', 'MediaPreviousTrack'
  ],
  b: [
    'ArrowRight', 'ArrowDown', 'PageDown', 'KeyB', 'b', 'B', 'Digit2', '2', 'Numpad2',
    'AudioVolumeDown', 'VolumeDown', 'MediaTrackNext', 'MediaNextTrack'
  ],
  undo: [
    'Backspace', 'Delete', 'KeyZ', 'z', 'Z', 'MediaPlayPause', 'MediaStop'
  ],
  start: [
    'Enter', 'NumpadEnter', 'Space', 'KeyM', 'm', 'M', 'Play'
  ]
};

const NOUP_KEYS = new Set([
  'AudioVolumeUp', 'VolumeUp', 'AudioVolumeDown', 'VolumeDown',
  'MediaTrackPrevious', 'MediaPreviousTrack', 'MediaTrackNext', 'MediaNextTrack', 'MediaPlayPause'
]);

export default function CourtView({ courtId, navigate }) {
  const [courtStatus, setCourtStatus] = useState(null);
  const [courtName, setCourtName] = useState(`Lapangan ${courtId}`);
  
  // Game Configuration
  const [cfg, setCfg] = useState(() => {
    try {
      const saved = localStorage.getItem(`padel.c${courtId}.cfg`);
      return saved ? JSON.parse(saved) : {
        mode: 'golden',
        bestOf: 3,
        games: 6,
        superTb: false,
        target: 24,
        names: ['Tim A', 'Tim B']
      };
    } catch (e) {
      return { mode: 'golden', bestOf: 3, games: 6, superTb: false, target: 24, names: ['Tim A', 'Tim B'] };
    }
  });

  // Match State
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(`padel.c${courtId}.state`);
      return saved ? JSON.parse(saved) : {
        started: false,
        sets: [],
        games: [0, 0],
        pts: [0, 0],
        deuces: 0,
        tb: false,
        stb: false,
        server: 0,
        tbStart: 0,
        setsWon: [0, 0],
        winner: null,
        total: 0
      };
    } catch (e) {
      return {
        started: false, sets: [], games: [0, 0], pts: [0, 0], deuces: 0,
        tb: false, stb: false, server: 0, tbStart: 0, setsWon: [0, 0], winner: null, total: 0
      };
    }
  });

  const [history, setHistory] = useState([]);
  const [flashMsg, setFlashMsg] = useState(null);
  const [isTvMode, setIsTvMode] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);

  // Modal Inputs (Doubles Padel)
  const [pA1, setPA1] = useState('');
  const [pA2, setPA2] = useState('');
  const [pB1, setPB1] = useState('');
  const [pB2, setPB2] = useState('');
  const [selectedMode, setSelectedMode] = useState(cfg.mode || 'golden');
  const [selectedBestOf, setSelectedBestOf] = useState(cfg.bestOf || 3);
  const [selectedGames, setSelectedGames] = useState(cfg.games || 6);
  const [selectedSuperTb, setSelectedSuperTb] = useState(cfg.superTb || false);

  // Remote Bluetooth Mapping & Learning
  const [customKeys, setCustomKeys] = useState(() => {
    try {
      const saved = localStorage.getItem(`padel.c${courtId}.keys`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [showLearnModal, setShowLearnModal] = useState(false);
  const [learnStep, setLearnStep] = useState(0);
  const [learnFeedback, setLearnFeedback] = useState(null);
  const [lastRemoteAction, setLastRemoteAction] = useState(null);

  const showLearnModalRef = useRef(false);
  const learnStepRef = useRef(0);
  const tempMapRef = useRef({});
  const learnWaitingRef = useRef(false);
  const audioRef = useRef(null);
  const pendingRemoteRef = useRef({});

  useEffect(() => {
    showLearnModalRef.current = showLearnModal;
  }, [showLearnModal]);

  useEffect(() => {
    learnStepRef.current = learnStep;
  }, [learnStep]);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`padel.c${courtId}.cfg`, JSON.stringify(cfg));
      localStorage.setItem(`padel.c${courtId}.state`, JSON.stringify(state));
    } catch (e) {}
  }, [cfg, state, courtId]);

  // Status Polling from Server
  const pollStatus = async () => {
    try {
      const res = await fetch(`/api/court/${courtId}/status`);
      if (res.status === 401) {
        navigate(`/login?next=/court/${courtId}`);
        return;
      }
      const data = await res.json();
      setCourtStatus(data);
      if (data.court_name) setCourtName(data.court_name);
      if (data.names && Array.isArray(data.names) && data.names.length >= 2) {
        setCfg(prev => {
          if (!prev.names || prev.names[0] !== data.names[0] || prev.names[1] !== data.names[1]) {
            return { ...prev, names: data.names };
          }
          return prev;
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [courtId]);

  // Keep screen awake (WakeLock API)
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {}
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, []);

  // Flash Banner helper
  const triggerFlash = (msg) => {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(null), 2000);
  };

  // Winner Celebration Confetti
  useEffect(() => {
    if (state.winner !== null) {
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#D4FF00', '#00D8F6', '#FFFFFF', '#F59E0B']
      });
    }
  }, [state.winner]);

  // PADEL SCORING LOGIC
  const tbServer = (start, n) => Math.floor((n + 1) / 2) % 2 === 0 ? start : 1 - start;

  const startMatch = async (customNames = cfg.names) => {
    const updatedCfg = { ...cfg, names: customNames };
    setCfg(updatedCfg);
    const freshState = {
      started: true,
      sets: [],
      games: [0, 0],
      pts: [0, 0],
      deuces: 0,
      tb: false,
      stb: false,
      server: 0,
      tbStart: 0,
      setsWon: [0, 0],
      winner: null,
      total: 0
    };
    setState(freshState);
    setHistory([]);

    try {
      await fetch(`/api/court/${courtId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: customNames, mode: cfg.mode })
      });
      sendEvent('papan', {}, freshState);
      pollStatus();
    } catch (e) {}
  };

  const addPoint = (team) => {
    if (state.winner !== null) return;
    if (!state.started) {
      startMatch();
      return;
    }

    const s = { ...state, pts: [...state.pts], games: [...state.games], setsWon: [...state.setsWon], sets: [...state.sets] };
    const opp = 1 - team;
    setHistory(prev => [...prev.slice(-50), JSON.stringify(state)]);

    // Americano mode
    if (cfg.mode === 'americano') {
      s.pts[team]++;
      s.total++;
      if (s.total % 4 === 0) s.server = 1 - s.server;
      if (s.total >= cfg.target) {
        s.winner = s.pts[0] === s.pts[1] ? 2 : (s.pts[0] > s.pts[1] ? 0 : 1);
      }
      setState(s);
      sendEvent('poin', { tim: cfg.names[team] }, s);
      return;
    }

    // Tiebreak mode
    if (s.tb || s.stb) {
      s.pts[team]++;
      const n = s.pts[0] + s.pts[1];
      const target = s.stb ? 10 : 7;
      s.server = tbServer(s.tbStart, n);

      if (s.pts[team] >= target && s.pts[team] - s.pts[opp] >= 2) {
        if (s.stb) {
          s.sets.push({ g: [...s.pts], stb: true });
          s.setsWon[team]++;
          s.stb = false;
          s.pts = [0, 0];
          s.winner = team;
        } else {
          s.games[team]++;
          s.tb = false;
          s.pts = [0, 0];
          s.server = 1 - s.tbStart;
          endSet(team, s);
        }
      }
      setState(s);
      sendEvent('poin', { tim: cfg.names[team] }, s);
      return;
    }

    // Regular Game Points
    const isDeuce = s.pts[0] >= 3 && s.pts[1] >= 3;
    let gameWon = false;

    if (isDeuce && (cfg.mode === 'golden' || (cfg.mode === 'star' && s.deuces >= 3))) {
      // Golden Point!
      gameWon = true;
    } else {
      s.pts[team]++;
      if (s.pts[team] >= 4 && s.pts[team] - s.pts[opp] >= 2) {
        gameWon = true;
      } else if (s.pts[0] === s.pts[1] && s.pts[0] >= 3) {
        s.deuces++;
        if (cfg.mode === 'star' && s.deuces >= 3) {
          triggerFlash('★ STAR POINT! (Penentu Game)');
        }
      }
    }

    if (gameWon) {
      winGame(team, s);
    }

    setState(s);
    sendEvent('poin', { tim: cfg.names[team] }, s);
  };

  const winGame = (team, s) => {
    s.games[team]++;
    s.pts = [0, 0];
    s.deuces = 0;
    s.server = 1 - s.server;

    const G = cfg.games;
    const opp = 1 - team;

    if (s.games[team] >= G && s.games[team] - s.games[opp] >= 2) {
      endSet(team, s);
    } else if (s.games[0] === G && s.games[1] === G) {
      s.tb = true;
      s.tbStart = s.server;
      triggerFlash('TIEBREAK!');
    } else {
      triggerFlash(`GAME · ${cfg.names[team]}`);
    }
  };

  const endSet = (team, s) => {
    const need = cfg.bestOf === 3 ? 2 : 1;
    s.sets.push({ g: [...s.games] });
    s.setsWon[team]++;
    s.games = [0, 0];

    if (s.setsWon[team] >= need) {
      s.winner = team;
      triggerFlash(`PEMENANG: ${cfg.names[team]}`);
      finishMatch();
      return;
    }

    triggerFlash(`SET · ${cfg.names[team]}`);
    if (cfg.superTb && s.setsWon[0] === need - 1 && s.setsWon[1] === need - 1) {
      s.stb = true;
      s.tbStart = s.server;
      triggerFlash('SUPER TIEBREAK (Ke 10)');
    }
  };

  const getPtsLabel = (i, s = state) => {
    const p = s.pts;
    if (cfg.mode === 'americano' || s.tb || s.stb) return String(p[i]);
    if (p[0] >= 3 && p[1] >= 3) return p[i] > p[1 - i] ? 'AD' : '40';
    return POINT_LABELS[Math.min(p[i], 3)];
  };

  const getStatusText = (s = state) => {
    if (flashMsg) return flashMsg;
    if (!s.started) return 'Tekan Main';
    if (s.winner !== null) return s.winner === 2 ? 'Seri' : `${cfg.names[s.winner]} Menang`;
    if (cfg.mode === 'americano') return `Servis · ${cfg.names[s.server]}`;
    if (s.stb) return 'Super tiebreak';
    if (s.tb) return 'Tiebreak';
    const p = s.pts;
    if (p[0] >= 3 && p[1] >= 3) {
      if (p[0] === p[1]) {
        if (cfg.mode === 'golden') return 'Golden point';
        if (cfg.mode === 'star') return s.deuces >= 3 ? '★ Star point' : `Deuce ${s.deuces}/3`;
        return 'Deuce';
      }
      return 'Advantage';
    }
    return `Servis · ${cfg.names[s.server]}`;
  };

  const getLeftLabel = (s = state) => {
    if (cfg.mode === 'americano') return `Americano · ${s.total}/${cfg.target || 24}`;
    const m = { adv: 'Adv', golden: 'Golden', star: 'Star' }[cfg.mode] || 'Golden';
    return `Set ${Math.min(s.sets.length + 1, cfg.bestOf)} · ${m}`;
  };

  const getMatchSummary = (s = state) => {
    if (s.sets && s.sets.length > 0) {
      return s.sets.map(x => x.stb ? `[${x.g[0]}-${x.g[1]}]` : `${x.g[0]}-${x.g[1]}`).join(' ');
    }
    return `${s.games[0]}-${s.games[1]}`;
  };

  const createBoardSnap = (s = state, pointFlash = null) => {
    const am = cfg.mode === 'americano';
    const n = am ? 0 : cfg.bestOf;
    const sets = [], won = [];
    for (let k = 0; k < n; k++) {
      if (k < s.sets.length) {
        const g = s.sets[k].g;
        sets.push([String(g[0]), String(g[1])]);
        won.push([g[0] > g[1], g[1] > g[0]]);
      } else if (k === s.sets.length && s.winner === null) {
        sets.push(s.stb ? ['', ''] : [String(s.games[0]), String(s.games[1])]);
        won.push([false, false]);
      } else {
        sets.push(['', '']);
        won.push([false, false]);
      }
    }
    const pts = (s.winner !== null && !am) ? ['', ''] : [getPtsLabel(0, s), getPtsLabel(1, s)];
    const st = getStatusText(s);
    return {
      names: [...cfg.names],
      cols: n,
      sets,
      won,
      cur: s.winner === null ? s.sets.length : null,
      pts,
      server: s.started && s.winner === null ? s.server : null,
      left: getLeftLabel(s),
      status: st,
      flash: pointFlash,
      winner: s.winner,
      lead: am && s.pts[0] !== s.pts[1] ? (s.pts[0] > s.pts[1] ? 0 : 1) : null,
      summary: s.winner === null ? '' : (
        am ? `${s.pts[0]} – ${s.pts[1]}` : s.sets.map(x => x.stb ? `[${x.g[0]}-${x.g[1]}]` : `${x.g[0]}-${x.g[1]}`).join('   ')
      )
    };
  };

  const sendEvent = async (ev, extra = {}, s = state) => {
    try {
      const snap = createBoardSnap(s, extra.flash || null);
      await fetch(`/api/court/${courtId}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: ev,
          skor: getMatchSummary(s),
          board: snap,
          ...extra
        })
      });
    } catch (e) {}
  };

  const finishMatch = async () => {
    const summary = getMatchSummary(state);
    try {
      sendEvent('selesai', { skor: summary }, state);
      await fetch(`/api/court/${courtId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto: true, delay: 15, summary })
      });
      pollStatus();
    } catch (e) {}
  };

  const handleManualStop = async (immediate = true) => {
    const summary = getMatchSummary(state);
    if (immediate && !confirm('Hentikan rekaman sekarang dan buat video dengan skor?')) return;
    try {
      sendEvent('selesai', { skor: summary }, state);
      if (immediate) {
        await fetch(`/api/court/${courtId}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary })
        });
        triggerFlash('■ Rekaman Selesai & Sedang Diproses!');
      } else {
        await fetch(`/api/court/${courtId}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto: true, delay: 15, summary })
        });
        triggerFlash('⏱️ Rekaman akan berhenti dalam 15 detik...');
      }
      pollStatus();
    } catch (e) {
      alert('Gagal menghentikan rekaman');
    }
  };

  const handleCancelStop = async () => {
    try {
      await fetch(`/api/court/${courtId}/cancel-stop`, {
        method: 'POST'
      });
      triggerFlash('Stop Rekam Dibatalkan');
      pollStatus();
    } catch (e) {}
  };

  const undoPoint = () => {
    if (history.length === 0) return;
    const prev = JSON.parse(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    setState(prev);
    triggerFlash('Poin Dibatalkan');
    sendEvent('batal', {}, prev);
  };

  const swapServe = () => {
    setState(prev => {
      const next = { ...prev, server: 1 - prev.server };
      sendEvent('servis', {}, next);
      return next;
    });
  };

  // Remote Learning Steps
  const LEARN_STEPS = [
    { act: 'start', title: 'Tombol Main / Mulai', desc: 'Tekan tombol remote yang ingin dipakai untuk Mulai Pertandingan' },
    { act: 'a', title: `Tambah Poin ${cfg.names?.[0] || 'Tim A'}`, desc: `Tekan tombol remote untuk menambah poin ${cfg.names?.[0] || 'Tim A'}` },
    { act: 'b', title: `Tambah Poin ${cfg.names?.[1] || 'Tim B'}`, desc: `Tekan tombol remote untuk menambah poin ${cfg.names?.[1] || 'Tim B'}` },
    { act: 'undo', title: 'Batalkan Poin (Undo)', desc: 'Tekan tombol remote untuk batalkan poin (bisa juga tekan lama tombol tim)' }
  ];

  const handleLearnKey = (e) => {
    if (learnWaitingRef.current || e.repeat) return;
    const code = e.code || e.key;
    if (!code) return;
    learnWaitingRef.current = true;
    setLearnFeedback(`Terdeteksi: ${code}`);

    const currentStep = learnStepRef.current;
    const act = LEARN_STEPS[currentStep].act;
    tempMapRef.current[code] = { act };
    if (e.key && e.key !== code) {
      tempMapRef.current[e.key] = { act };
    }

    setTimeout(() => {
      learnWaitingRef.current = false;
      setLearnFeedback(null);
      if (currentStep + 1 >= LEARN_STEPS.length) {
        const merged = { ...customKeys, ...tempMapRef.current };
        setCustomKeys(merged);
        try {
          localStorage.setItem(`padel.c${courtId}.keys`, JSON.stringify(merged));
        } catch (err) {}
        setShowLearnModal(false);
        triggerFlash('Tombol Remote Berhasil Disimpan!');
      } else {
        setLearnStep(currentStep + 1);
      }
    }, 600);
  };

  const handleSkipStep = () => {
    const currentStep = learnStepRef.current;
    if (currentStep + 1 >= LEARN_STEPS.length) {
      const merged = { ...customKeys, ...tempMapRef.current };
      setCustomKeys(merged);
      try {
        localStorage.setItem(`padel.c${courtId}.keys`, JSON.stringify(merged));
      } catch (err) {}
      setShowLearnModal(false);
      triggerFlash('Pengaturan Remote Disimpan');
    } else {
      setLearnStep(currentStep + 1);
    }
  };

  const handleResetKeys = () => {
    setCustomKeys({});
    try {
      localStorage.removeItem(`padel.c${courtId}.keys`);
    } catch (err) {}
    setShowLearnModal(false);
    triggerFlash('Tombol Remote Direset ke Default');
  };

  // Media Session for Bluetooth Shutter / Headset Remotes
  const enableMediaSession = async () => {
    try {
      if (!('mediaSession' in navigator)) return;
      if (!audioRef.current) {
        const n = 8000, buf = new ArrayBuffer(44 + n), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
        for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
        const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
        audioRef.current = new Audio(blobUrl);
        audioRef.current.loop = true;
      }
      await audioRef.current.play();
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Papan Skor Padel',
        artist: 'Remote Aktif'
      });
      const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (err) {} };
      h('previoustrack', () => { addPoint(0); setLastRemoteAction({ key: '⏮ Prev', action: cfg.names[0], ok: true }); });
      h('nexttrack', () => { addPoint(1); setLastRemoteAction({ key: '⏭ Next', action: cfg.names[1], ok: true }); });
      const u = () => { undoPoint(); if (audioRef.current) audioRef.current.play().catch(() => {}); setLastRemoteAction({ key: '⏯ Play/Pause', action: 'Batalkan', ok: true }); };
      h('play', u);
      h('pause', u);
    } catch (e) {}
  };

  useEffect(() => {
    const handleFirst = () => {
      enableMediaSession();
      window.removeEventListener('click', handleFirst);
      window.removeEventListener('keydown', handleFirst);
      window.removeEventListener('touchstart', handleFirst);
    };
    window.addEventListener('click', handleFirst);
    window.addEventListener('keydown', handleFirst);
    window.addEventListener('touchstart', handleFirst);
    return () => {
      window.removeEventListener('click', handleFirst);
      window.removeEventListener('keydown', handleFirst);
      window.removeEventListener('touchstart', handleFirst);
    };
  }, [cfg]);

  // Full Keyboard & Bluetooth Remote Engine
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement;
      return el && ((el.tagName === 'INPUT' && el.type !== 'checkbox') || el.tagName === 'TEXTAREA');
    };

    const lookup = (code, key) => {
      for (const k of [code, key]) {
        if (!k) continue;
        if (customKeys[k]) {
          return { act: customKeys[k].act, up: !NOUP_KEYS.has(k), k };
        }
        for (const act in DEF_KEYS) {
          if (DEF_KEYS[act].includes(k)) {
            return { act, up: !NOUP_KEYS.has(k), k };
          }
        }
      }
      return null;
    };

    const doAct = (act) => {
      if (act === 'start') {
        if (!state.started) startMatch();
      } else if (act === 'a') {
        addPoint(0);
      } else if (act === 'b') {
        addPoint(1);
      } else if (act === 'undo') {
        undoPoint();
      }
    };

    const handleKeyDown = (e) => {
      if (showLearnModalRef.current) {
        e.preventDefault();
        handleLearnKey(e);
        return;
      }
      if (showMatchModal) return;
      if (typing()) return;

      const code = e.code;
      const key = e.key;
      const match = lookup(code, key);
      const pressed = code || key;

      const labelMap = {
        a: cfg.names?.[0] || 'Tim A',
        b: cfg.names?.[1] || 'Tim B',
        undo: 'Batalkan Poin',
        start: 'Mulai Pertandingan'
      };

      if (match) {
        setLastRemoteAction({
          key: pressed,
          action: labelMap[match.act] || match.act,
          ok: true
        });
      } else if (pressed) {
        setLastRemoteAction({
          key: pressed,
          action: 'Belum dipetakan (Klik Atur Remote)',
          ok: false
        });
      }

      if (!match) return;
      e.preventDefault();
      if (e.repeat) return;

      if (match.up && match.act !== 'undo') {
        if (pendingRemoteRef.current[pressed]) return;
        pendingRemoteRef.current[pressed] = {
          act: match.act,
          done: false,
          timer: setTimeout(() => {
            if (pendingRemoteRef.current[pressed]) {
              pendingRemoteRef.current[pressed].done = true;
              undoPoint();
              triggerFlash('Poin Dibatalkan (Tekan Lama)');
            }
          }, 700)
        };
      } else {
        doAct(match.act);
      }
    };

    const handleKeyUp = (e) => {
      const pressed = e.code || e.key;
      const p = pendingRemoteRef.current[pressed];
      if (!p) return;
      clearTimeout(p.timer);
      delete pendingRemoteRef.current[pressed];
      if (!p.done) {
        doAct(p.act);
      }
    };

    const handleBlur = () => {
      for (const k in pendingRemoteRef.current) {
        clearTimeout(pendingRemoteRef.current[k].timer);
      }
      pendingRemoteRef.current = {};
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [state, cfg, customKeys, showMatchModal]);

  // Points Label
  const getPointLabel = (idx) => {
    if (cfg.mode === 'americano' || state.tb || state.stb) {
      return String(state.pts[idx]);
    }
    const p = state.pts;
    if (p[0] >= 3 && p[1] >= 3) {
      return p[idx] > p[1 - idx] ? 'AD' : '40';
    }
    return POINT_LABELS[Math.min(p[idx], 3)];
  };

  // Status Banner Text
  const getStatusBanner = () => {
    if (flashMsg) return flashMsg;
    if (!state.started) return 'TEKAN MAIN UNTUK MEMULAI';
    if (state.winner !== null) return `PERTANDINGAN SELESAI · ${state.winner === 2 ? 'HASIL SERI' : cfg.names[state.winner] + ' MENANG'}`;
    if (state.stb) return 'SUPER TIEBREAK (TARGET 10 POIN)';
    if (state.tb) return 'TIEBREAK GAME';
    const p = state.pts;
    if (p[0] >= 3 && p[1] >= 3) {
      if (p[0] === p[1]) {
        if (cfg.mode === 'golden') return '⚡ GOLDEN POINT (PENENTU GAME)';
        if (cfg.mode === 'star') return state.deuces >= 3 ? '★ STAR POINT (PENENTU GAME)' : `DEUCE (${state.deuces}/3)`;
        return 'DEUCE';
      }
      return 'ADVANTAGE';
    }
    return `SERVIS: ${cfg.names[state.server]}`;
  };

  const openMatchModal = () => {
    const partsA = (cfg.names?.[0] || 'Tim A').split(' / ');
    const partsB = (cfg.names?.[1] || 'Tim B').split(' / ');
    setPA1(partsA[0] || '');
    setPA2(partsA[1] || '');
    setPB1(partsB[0] || '');
    setPB2(partsB[1] || '');
    setSelectedMode(cfg.mode || 'golden');
    setSelectedBestOf(cfg.bestOf || 3);
    setSelectedGames(cfg.games || 6);
    setSelectedSuperTb(cfg.superTb || false);
    setShowMatchModal(true);
  };

  const handleSaveNamesOnly = async () => {
    const nameA = [pA1.trim(), pA2.trim()].filter(Boolean).join(' / ') || 'Tim A';
    const nameB = [pB1.trim(), pB2.trim()].filter(Boolean).join(' / ') || 'Tim B';
    const names = [nameA, nameB];
    setCfg(prev => ({ ...prev, names }));
    try {
      await fetch(`/api/court/${courtId}/set-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names })
      });
      triggerFlash(`Pemain: ${nameA} vs ${nameB}`);
      pollStatus();
    } catch (e) {}
    setShowMatchModal(false);
  };

  const handleStartFromModal = (quick = false) => {
    let names;
    if (quick) {
      names = ['Tim A', 'Tim B'];
    } else {
      const nameA = [pA1.trim(), pA2.trim()].filter(Boolean).join(' / ') || 'Tim A';
      const nameB = [pB1.trim(), pB2.trim()].filter(Boolean).join(' / ') || 'Tim B';
      names = [nameA, nameB];
    }
    const newCfg = {
      ...cfg,
      names,
      mode: selectedMode,
      bestOf: selectedBestOf,
      games: selectedGames,
      superTb: selectedSuperTb
    };
    setCfg(newCfg);
    setShowMatchModal(false);
    startMatch(names);
  };

  return (
    <div className={`min-h-screen bg-padel-dark text-white font-ui flex flex-col justify-between selection:bg-padel-volt selection:text-black ${isTvMode ? 'p-2 sm:p-4' : 'p-4 sm:p-6'}`}>
      
      {/* TOP HEADER */}
      <header className="flex items-center justify-between py-2 border-b border-padel-border/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-padel-volt animate-ping" />
            <h1 className="text-xl sm:text-2xl font-score font-black tracking-wider uppercase text-white flex items-center gap-2">
              <span className="text-padel-volt">{courtName}</span>
            </h1>
          </div>
          {courtStatus?.recording && (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-400 text-xs font-bold font-score uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                REC {courtStatus.elapsed ? `${Math.floor(courtStatus.elapsed / 60)}:${String(courtStatus.elapsed % 60).padStart(2, '0')}` : ''}
              </span>
              <button
                type="button"
                onClick={() => handleManualStop(true)}
                className="px-2.5 py-1 rounded-xl bg-red-600/30 hover:bg-red-600 border border-red-500 text-white font-score text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                title="Stop Rekam Sekarang & Simpan Video"
              >
                <Square className="w-3 h-3 fill-current text-red-300" />
                <span>Stop</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openMatchModal}
            className="px-3.5 py-1.5 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-xs font-semibold text-padel-volt flex items-center gap-1.5 transition-colors"
          >
            <Users className="w-4 h-4" />
            <span>Atur Pemain</span>
          </button>
          <button
            onClick={() => setIsTvMode(!isTvMode)}
            className="p-2 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-slate-300 hover:text-white transition-colors"
            title="Mode TV / Fullscreen"
          >
            {isTvMode ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          <button
            onClick={() => navigate('/login')}
            className="p-2 rounded-xl bg-padel-card hover:bg-red-500/20 border border-padel-border/60 text-slate-400 hover:text-red-400 transition-colors"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* PREMIER PADEL BROADCAST SCOREBOARD */}
      <main className="my-auto py-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-5xl bg-gradient-to-br from-padel-surface via-[#0A1D30] to-padel-dark border-2 border-padel-border rounded-3xl overflow-hidden shadow-2xl shadow-black/80">
          
          {/* HEADER STRIP */}
          <div className="bg-padel-dark/90 px-6 py-2.5 border-b border-padel-border/60 flex items-center justify-between text-xs font-score tracking-widest text-slate-400 uppercase font-bold">
            <span>SET {Math.min(state.sets.length + 1, cfg.bestOf)} · {cfg.mode.toUpperCase()} POINT</span>
            <span className="text-padel-volt font-black animate-pulse">{getStatusBanner()}</span>
          </div>

          {/* COUNTDOWN STOPPING BANNER */}
          {courtStatus?.stopping_in != null && (
            <div className="bg-amber-500/25 border-b border-amber-500/50 px-6 py-3 flex items-center justify-between text-xs font-bold text-amber-300 animate-pulse">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>
                  Pertandingan Selesai · Rekaman akan disimpan dalam <strong className="text-white font-mono text-sm">{courtStatus.stopping_in}s</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleManualStop(true)}
                  className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-score uppercase tracking-wider text-[11px] flex items-center gap-1 shadow"
                >
                  <Square className="w-3 h-3 fill-current" /> Stop Sekarang
                </button>
                <button
                  type="button"
                  onClick={handleCancelStop}
                  className="px-3 py-1 rounded-lg bg-padel-surface hover:bg-padel-card border border-padel-border/60 text-slate-200 text-[11px]"
                >
                  Batal Stop
                </button>
              </div>
            </div>
          )}

          {/* TEAM ROWS */}
          {[0, 1].map((idx) => {
            const isServing = state.started && state.winner === null && state.server === idx;
            const isWinner = state.winner === idx;

            return (
              <div
                key={idx}
                className={`grid grid-cols-12 items-center border-b border-padel-border/40 transition-colors ${
                  isWinner ? 'bg-emerald-950/40' : idx === 1 ? 'bg-padel-surface/40' : 'bg-transparent'
                }`}
              >
                {/* SERVE BALL */}
                <div className="col-span-1 flex items-center justify-center">
                  <div
                    className={`w-4 h-4 rounded-full transition-all duration-300 ${
                      isServing
                        ? 'bg-padel-volt shadow-lg shadow-padel-volt/80 scale-125'
                        : 'bg-transparent opacity-0'
                    }`}
                  />
                </div>

                {/* TEAM NAME */}
                <div className="col-span-6 sm:col-span-7 py-5 px-3">
                  <span className={`text-2xl sm:text-4xl font-score font-black tracking-wider uppercase truncate block ${
                    isWinner ? 'text-padel-volt' : 'text-white'
                  }`}>
                    {cfg.names[idx]}
                  </span>
                </div>

                {/* SETS WON */}
                {Array.from({ length: cfg.bestOf }).map((_, sIdx) => {
                  const setObj = state.sets[sIdx];
                  const setVal = setObj ? setObj.g[idx] : (sIdx === state.sets.length && state.winner === null ? state.games[idx] : '');
                  const isCurSet = sIdx === state.sets.length && state.winner === null;

                  return (
                    <div
                      key={sIdx}
                      className={`col-span-1 h-full py-5 flex items-center justify-center font-score font-bold text-2xl sm:text-3xl border-l border-padel-border/30 ${
                        isCurSet
                          ? 'bg-padel-card text-white font-black'
                          : 'text-slate-400'
                      }`}
                    >
                      {setVal}
                    </div>
                  );
                })}

                {/* GAME POINTS (0, 15, 30, 40, AD) */}
                <div className="col-span-2 sm:col-span-2 h-full py-5 bg-padel-card/90 border-l-2 border-padel-border flex items-center justify-center">
                  <span className="font-score font-black text-4xl sm:text-5xl text-padel-volt text-glow-volt animate-score-pop">
                    {state.winner !== null ? '' : getPointLabel(idx)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* TACTILE BIG TOUCH BUTTONS */}
        {!isTvMode && (
          <div className="w-full max-w-5xl mt-6 flex flex-col gap-4">
            {!state.started ? (
              <button
                onClick={openMatchModal}
                className="w-full py-5 rounded-2xl bg-padel-volt hover:bg-padel-voltHover text-black font-score font-black text-2xl tracking-wider uppercase shadow-xl shadow-padel-volt/20 flex items-center justify-center gap-3 transition-all active:scale-98"
              >
                <Play className="w-7 h-7 fill-black" />
                <span>Mulai Pertandingan & Rekam CCTV</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => addPoint(0)}
                  className="py-6 px-4 rounded-3xl bg-padel-card hover:bg-padel-border/80 border-2 border-padel-border text-white font-score font-black text-2xl sm:text-3xl tracking-wider uppercase flex flex-col items-center justify-center gap-1 active:scale-95 shadow-xl transition-all"
                >
                  <span className="text-xs font-ui font-semibold text-padel-volt tracking-widest">+ POIN</span>
                  <span className="truncate max-w-full">{cfg.names[0]}</span>
                </button>
                <button
                  onClick={() => addPoint(1)}
                  className="py-6 px-4 rounded-3xl bg-padel-card hover:bg-padel-border/80 border-2 border-padel-border text-white font-score font-black text-2xl sm:text-3xl tracking-wider uppercase flex flex-col items-center justify-center gap-1 active:scale-95 shadow-xl transition-all"
                >
                  <span className="text-xs font-ui font-semibold text-cyan-400 tracking-widest">+ POIN</span>
                  <span className="truncate max-w-full">{cfg.names[1]}</span>
                </button>
              </div>
            )}

            {/* SECONDARY CONTROLS */}
            <div className="flex flex-wrap gap-2.5 justify-center items-center">
              <button
                onClick={undoPoint}
                className="px-4 py-2.5 rounded-xl bg-padel-surface hover:bg-padel-card border border-padel-border/60 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Batalkan Poin</span>
              </button>
              <button
                onClick={swapServe}
                className="px-4 py-2.5 rounded-xl bg-padel-surface hover:bg-padel-card border border-padel-border/60 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Ganti Servis</span>
              </button>

              {/* TOMBOL STOP REKAM / SELESAI PERTANDINGAN */}
              {courtStatus?.recording && (
                <button
                  type="button"
                  onClick={() => handleManualStop(true)}
                  className="px-5 py-2.5 rounded-xl bg-red-600/30 hover:bg-red-600/60 border border-red-500/70 text-red-200 hover:text-white font-score font-bold text-xs tracking-wider uppercase flex items-center gap-2 shadow-lg shadow-red-950/40 transition-all active:scale-95"
                  title="Hentikan rekaman dan simpan video pertandingan"
                >
                  <Square className="w-3.5 h-3.5 fill-current text-red-400" />
                  <span>Selesai & Stop Rekam</span>
                </button>
              )}

              <button
                onClick={openMatchModal}
                className="px-4 py-2.5 rounded-xl bg-padel-surface hover:bg-red-500/20 border border-padel-border/60 text-xs font-semibold text-red-400 flex items-center gap-1.5 transition-colors"
              >
                <span>Pertandingan Baru</span>
              </button>
            </div>
          </div>
        )}

        {/* RECENT SAVED VIDEO & RENDER PROGRESS */}
        {courtStatus?.renders && courtStatus.renders.length > 0 && (
          <div className="w-full max-w-5xl mt-3 flex flex-col gap-2">
            {courtStatus.renders.slice(0, 2).map((job, jIdx) => {
              if (job.state === 'proses' || job.state === 'antre') {
                return (
                  <div key={jIdx} className="p-3.5 rounded-2xl bg-padel-volt/10 border border-padel-volt/40 flex items-center justify-between text-xs text-padel-volt animate-pulse">
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4 animate-spin text-padel-volt" />
                      <span>{job.state === 'antre' ? 'Menunggu antrean video skor...' : `Sedang menggabungkan CCTV + Papan Skor: ${job.progress}%`}</span>
                    </span>
                    <span className="font-mono text-white text-[11px] truncate max-w-[200px]">{job.file}</span>
                  </div>
                );
              } else if (job.state === 'selesai') {
                return (
                  <div key={jIdx} className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-emerald-300">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Video dengan Papan Skor Siap: <strong className="font-mono text-white">{job.out || job.file}</strong></span>
                    </span>
                    <span className="text-[11px] text-slate-400">Tersimpan di folder rekaman</span>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        {courtStatus?.recent && courtStatus.recent.length > 0 && !courtStatus.recording && (!courtStatus.renders || courtStatus.renders.length === 0) && (
          <div className="w-full max-w-5xl mt-3 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-emerald-300">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Video pertandingan terakhir: <strong className="font-mono text-white">{courtStatus.recent[0]}</strong></span>
            </span>
            <span className="text-[11px] text-slate-400 font-sans">Tersimpan di folder rekaman</span>
          </div>
        )}
      </main>

      {/* FOOTER REMOTE HINT & STATUS */}
      {!isTvMode && (
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs py-2.5 px-4 rounded-2xl bg-padel-surface/70 border border-padel-border/50 mt-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Radio className={`w-3.5 h-3.5 ${lastRemoteAction?.ok ? 'text-padel-volt animate-pulse' : 'text-slate-400'}`} />
            {lastRemoteAction ? (
              <span className="flex items-center gap-1.5">
                <span className="font-mono bg-padel-dark px-2 py-0.5 rounded text-white border border-padel-border/60">
                  {lastRemoteAction.key}
                </span>
                <span className="text-slate-400">→</span>
                <span className={lastRemoteAction.ok ? 'font-bold text-padel-volt' : 'text-amber-400'}>
                  {lastRemoteAction.action}
                </span>
              </span>
            ) : (
              <span className="text-slate-400">
                Remote Bluetooth Siap (Panah, Vol +/-, PageUp/Dn, Numpad, Media Clicker)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                tempMapRef.current = {};
                setLearnStep(0);
                setLearnFeedback(null);
                setShowLearnModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-padel-volt hover:text-white font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Atur Tombol Remote</span>
            </button>
          </div>
        </footer>
      )}

      {/* MODAL PERTANDINGAN BARU (DOUBLES / QUICK START) */}
      {showMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-padel-surface border border-padel-border rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            
            <div className="flex items-center justify-between border-b border-padel-border/60 pb-4">
              <div>
                <span className="text-xs font-bold text-padel-volt uppercase tracking-wider block">Pengaturan Match</span>
                <h3 className="text-2xl font-score font-black text-white uppercase tracking-wider">
                  Mulai Pertandingan
                </h3>
              </div>
              <button
                onClick={() => setShowMatchModal(false)}
                className="text-slate-400 hover:text-white text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {/* QUICK START BUTTON */}
            <button
              onClick={() => handleStartFromModal(true)}
              className="py-3.5 px-4 rounded-2xl bg-gradient-to-r from-padel-volt to-lime-400 text-black font-score font-black text-lg tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-padel-volt/20 active:scale-98 transition-all"
            >
              <Zap className="w-5 h-5 fill-black" />
              <span>⚡ Mulai Cepat (Tim A vs Tim B)</span>
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-widest my-[-4px]">
              <div className="flex-1 h-px bg-padel-border/60" />
              <span>Atau Ketik Nama Pemain Ganda</span>
              <div className="flex-1 h-px bg-padel-border/60" />
            </div>

            {/* DOUBLES INPUT */}
            <div className="flex flex-col gap-4">
              {/* TIM A */}
              <div className="p-4 rounded-2xl bg-padel-card/60 border border-padel-border/60 flex flex-col gap-2.5">
                <span className="text-xs font-score font-bold uppercase tracking-wider text-padel-volt">
                  Tim A (Ganda)
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Pemain 1"
                    value={pA1}
                    onChange={e => setPA1(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-padel-volt"
                  />
                  <input
                    type="text"
                    placeholder="Pemain 2"
                    value={pA2}
                    onChange={e => setPA2(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-padel-volt"
                  />
                </div>
              </div>

              {/* TIM B */}
              <div className="p-4 rounded-2xl bg-padel-card/60 border border-padel-border/60 flex flex-col gap-2.5">
                <span className="text-xs font-score font-bold uppercase tracking-wider text-cyan-400">
                  Tim B (Ganda)
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Pemain 3"
                    value={pB1}
                    onChange={e => setPB1(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                  />
                  <input
                    type="text"
                    placeholder="Pemain 4"
                    value={pB2}
                    onChange={e => setPB2(e.target.value)}
                    className="bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            </div>

            {/* FORMAT ATURAN SKOR */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-padel-border/40">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Format Poin:
                </label>
                <select
                  value={selectedMode}
                  onChange={e => setSelectedMode(e.target.value)}
                  className="w-full bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-padel-volt"
                >
                  <option value="golden">Golden Point (Padel Standar)</option>
                  <option value="adv">Advantage (Klasik Tenis)</option>
                  <option value="star">Star Point (Aturan FIP)</option>
                  <option value="americano">Americano</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Jumlah Set:
                </label>
                <select
                  value={selectedBestOf}
                  onChange={e => setSelectedBestOf(Number(e.target.value))}
                  className="w-full bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-padel-volt"
                >
                  <option value={3}>Best of 3 Set</option>
                  <option value={1}>1 Set Saja</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 justify-end pt-3">
              <button
                type="button"
                onClick={() => setShowMatchModal(false)}
                className="px-4 py-2.5 rounded-xl bg-padel-card hover:bg-padel-border/60 text-slate-300 font-semibold text-xs sm:text-sm transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveNamesOnly}
                className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-score font-bold text-xs sm:text-sm tracking-wider uppercase transition-colors"
              >
                Simpan Nama Saja
              </button>
              <button
                type="button"
                onClick={() => handleStartFromModal(false)}
                className="px-5 py-2.5 rounded-xl bg-padel-volt hover:bg-padel-voltHover text-black font-score font-black text-xs sm:text-sm tracking-wider uppercase transition-all shadow-lg shadow-padel-volt/20"
              >
                Mulai Pertandingan Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ATUR TOMBOL REMOTE (WIZARD BELAJAR REMOTE) */}
      {showLearnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-padel-surface border border-padel-border rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-padel-border/60 pb-4">
              <div>
                <span className="text-xs font-bold text-padel-volt uppercase tracking-wider block">Konfigurasi Remote</span>
                <h3 className="text-xl font-score font-black text-white uppercase tracking-wider">
                  Atur Tombol Remote
                </h3>
              </div>
              <button
                onClick={() => setShowLearnModal(false)}
                className="text-slate-400 hover:text-white text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col items-center justify-center text-center py-6 px-4 rounded-2xl bg-padel-card/60 border-2 border-dashed border-padel-volt/50 gap-3">
              <Radio className="w-8 h-8 text-padel-volt animate-bounce" />
              <div className="text-xs font-bold text-padel-volt uppercase tracking-wider">
                Langkah {learnStep + 1} dari {LEARN_STEPS.length}
              </div>
              <h4 className="text-lg font-score font-black text-white uppercase">
                {LEARN_STEPS[learnStep].title}
              </h4>
              <p className="text-xs text-slate-300 max-w-xs">
                {LEARN_STEPS[learnStep].desc}
              </p>
              {learnFeedback && (
                <div className="mt-2 px-3 py-1 rounded-lg bg-padel-volt text-black font-mono font-bold text-xs animate-pulse">
                  {learnFeedback}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-padel-border/40">
              <button
                type="button"
                onClick={handleResetKeys}
                className="text-xs text-slate-400 hover:text-red-400 font-semibold underline"
              >
                Reset ke Default
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkipStep}
                  className="px-4 py-2 rounded-xl bg-padel-card hover:bg-padel-border/60 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Lewati
                </button>
                <button
                  type="button"
                  onClick={() => setShowLearnModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
