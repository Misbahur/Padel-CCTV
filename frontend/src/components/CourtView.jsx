import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, RotateCcw, ArrowLeftRight, Maximize, Minimize, Users, 
  Settings, LogOut, Radio, ChevronRight, Zap, Volume2, VolumeX, Shield, Clock, Video,
  Smartphone, Bug, Heart, Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';

const POINT_LABELS = ['0', '15', '30', '40'];

const MODE_HINTS = {
  golden: 'Golden Point: di 40–40 (deuce), 1 poin langsung menentukan pemenang game. Penerima servis memilih sisi lapangan.',
  adv: 'Advantage (Klasik Tenis): di 40–40, tim harus unggul 2 poin berturut-turut untuk memenangkan game.',
  star: 'Star Point (Aturan FIP): 2x advantage boleh dimainkan; jika deuce ketiga, 1 star point langsung menentukan game.',
  americano: 'Americano / Mexicano: hitung total poin akumulatif sampai target (misal 24). Servis berpindah setiap 4 poin.'
};

const DEF_KEYS = {
  a: [
    'ArrowLeft', 'ArrowUp', 'PageUp', 'KeyA', 'a', 'A', 'Digit1', '1', 'Numpad1',
    'AudioVolumeUp', 'VolumeUp', 'MediaTrackPrevious', 'MediaPreviousTrack'
  ],
  b: [
    'ArrowRight', 'ArrowDown', 'PageDown', 'KeyB', 'b', 'B', 'Digit2', '2', 'Numpad2',
    'AudioVolumeDown', 'VolumeDown', 'MediaTrackNext', 'MediaNextTrack'
  ],
  serve: [
    'KeyS', 's', 'S', 'Digit3', '3', 'Numpad3', 'Tab'
  ],
  mark: [
    'KeyL', 'l', 'L', 'Heart', 'Like', 'Digit5', '5', 'Numpad5', 'KeyH', 'h', 'H',
    'BrowserFavorites', 'MediaSelect', 'F12', 'F13', 'F14', 'F15'
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

// Web Audio API Synthesizer (Offline, Zero-Latency, Pure Web Audio)
class SoundFx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  _getCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq, duration = 0.12, type = 'sine', gainVal = 0.15) {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  pointTeamA() {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    } catch (e) {}
  }

  pointTeamB() {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, t);
      osc.frequency.exponentialRampToValueAtTime(783.99, t + 0.12);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    } catch (e) {}
  }

  undo() {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(550, t);
      osc.frequency.linearRampToValueAtTime(300, t + 0.14);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    } catch (e) {}
  }

  serve() {
    this.playTone(440, 0.08, 'sine', 0.15);
  }

  bookmark() {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      const startT = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startT + idx * 0.06);
        gain.gain.setValueAtTime(0.16, startT + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, startT + idx * 0.06 + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startT + idx * 0.06);
        osc.stop(startT + idx * 0.06 + 0.17);
      });
    } catch (e) {}
  }

  gameWin() {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99];
      const t = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.08);
        gain.gain.setValueAtTime(0.18, t + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.08);
        osc.stop(t + i * 0.08 + 0.23);
      });
    } catch (e) {}
  }

  matchWin() {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      const fanfare = [
        { f: 523.25, d: 0.12, w: 0 },
        { f: 659.25, d: 0.12, w: 0.12 },
        { f: 783.99, d: 0.15, w: 0.24 },
        { f: 1046.50, d: 0.45, w: 0.38 }
      ];
      const t0 = ctx.currentTime;
      fanfare.forEach(({ f, d, w }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t0 + w);
        gain.gain.setValueAtTime(0.22, t0 + w);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + w + d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0 + w);
        osc.stop(t0 + w + d);
      });
    } catch (e) {}
  }
}
const sfx = new SoundFx();

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
  const [selectedTarget, setSelectedTarget] = useState(cfg.target || 24);

  // TikTok / Touch Gesture Mode & Signal Debugger
  const [showTouchMode, setShowTouchMode] = useState(false);
  const [touchFeedback, setTouchFeedback] = useState(null);
  const [showSignalDebugger, setShowSignalDebugger] = useState(false);
  const [remoteSignals, setRemoteSignals] = useState([]);
  const pointerDownRef = useRef(null);

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

  // Sound / Audio FX Toggle (Feature 2)
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem('padel.sound') !== 'false';
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    sfx.enabled = soundOn;
  }, [soundOn]);

  // Anti-Human Error: Debounce / Throttle Remote Buttons (Feature 1)
  const lastScoreTimeRef = useRef({ 0: 0, 1: 0, any: 0 });

  // Anti-Human Error: Celebration Lock 15s (Feature 3)
  const [celebrationLockSeconds, setCelebrationLockSeconds] = useState(0);
  const celebrationLockRef = useRef(0);

  // Anti-Human Error: Undo Grace Period 6s (Feature 5)
  const [undoGraceSeconds, setUndoGraceSeconds] = useState(0);
  const undoGraceRef = useRef(0);

  // Countdown timer for Celebration Lock & Undo Grace Period
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (celebrationLockRef.current > 0) {
        const rem = Math.max(0, Math.ceil((celebrationLockRef.current - now) / 1000));
        setCelebrationLockSeconds(rem);
        if (rem === 0) celebrationLockRef.current = 0;
      }
      if (undoGraceRef.current > 0) {
        const rem = Math.max(0, Math.ceil((undoGraceRef.current - now) / 1000));
        setUndoGraceSeconds(rem);
        if (rem === 0) undoGraceRef.current = 0;
      }
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const showLearnModalRef = useRef(false);
  const learnStepRef = useRef(0);
  const tempMapRef = useRef({});
  const learnWaitingRef = useRef(false);
  const audioRef = useRef(null);
  const pendingRemoteRef = useRef({});

  const logSignal = (type, details) => {
    const entry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      ...details
    };
    setRemoteSignals(prev => [entry, ...prev.slice(0, 29)]);
    try {
      fetch(`/api/court/${courtId}/log-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      }).catch(() => {});
    } catch (e) {}
  };

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
      if (data.settings && typeof data.settings === 'object') {
        setCfg(prev => ({
          ...prev,
          mode: data.settings.mode || prev.mode || 'golden',
          bestOf: data.settings.bestOf || prev.bestOf || 3,
          games: data.settings.games || prev.games || 6,
          superTb: data.settings.superTb !== undefined ? data.settings.superTb : (prev.superTb || false),
          target: data.settings.target || prev.target || 24,
        }));
      }
      // Server State Synchronization (Feature 4 - Auto-Recovery)
      if (data.match_state && typeof data.match_state === 'object' && data.match_state.started) {
        setState(prev => {
          if (!prev.started) {
            return data.match_state;
          }
          if (data.recording) {
            const srvSummary = getMatchSummary(data.match_state);
            const locSummary = getMatchSummary(prev);
            if (srvSummary !== locSummary) {
              return data.match_state;
            }
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

  // Winner Celebration Confetti, Fanfare & Remote Lock 15s (Features 2 & 3)
  useEffect(() => {
    if (state.winner !== null) {
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#D4FF00', '#00D8F6', '#FFFFFF', '#F59E0B']
      });
      sfx.matchWin();
      celebrationLockRef.current = Date.now() + 15000;
      setCelebrationLockSeconds(15);
    }
  }, [state.winner]);

  // PADEL SCORING LOGIC
  const tbServer = (start, n) => Math.floor((n + 1) / 2) % 2 === 0 ? start : 1 - start;

  const startMatch = async (customNames = cfg.names, customCfg = null) => {
    const activeCfg = customCfg ? { ...customCfg, names: customNames } : { ...cfg, names: customNames };
    setCfg(activeCfg);
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
        body: JSON.stringify({
          names: customNames,
          mode: activeCfg.mode,
          match_rules: {
            mode: activeCfg.mode,
            bestOf: activeCfg.bestOf,
            games: activeCfg.games,
            superTb: activeCfg.superTb,
            target: activeCfg.target
          }
        })
      });
      sendEvent('papan', {}, freshState, activeCfg);
      pollStatus();
    } catch (e) {}
  };

  const addPoint = (team) => {
    if (state.winner !== null) return;
    if (celebrationLockRef.current > Date.now()) {
      const rem = Math.ceil((celebrationLockRef.current - Date.now()) / 1000);
      triggerFlash(`🔒 Remote Terkunci: ${rem}s (Perayaan Selesai)`);
      return;
    }

    // Anti-Human Error: Debounce / Throttle (Feature 1)
    const now = performance.now();
    if (now - lastScoreTimeRef.current[team] < 550 || now - lastScoreTimeRef.current.any < 350) {
      triggerFlash('⚡ Ketukan cepat diabaikan (Anti Double-Click)');
      return;
    }
    lastScoreTimeRef.current[team] = now;
    lastScoreTimeRef.current.any = now;

    if (!state.started) {
      startMatch();
      return;
    }

    // Audio Feedback (Feature 2)
    if (team === 0) sfx.pointTeamA();
    else sfx.pointTeamB();

    // Undo Grace Period (Feature 5): 6 detik
    setUndoGraceSeconds(6);
    undoGraceRef.current = Date.now() + 6000;

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
        sfx.matchWin();
        celebrationLockRef.current = Date.now() + 15000;
        setCelebrationLockSeconds(15);
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
          sfx.matchWin();
          celebrationLockRef.current = Date.now() + 15000;
          setCelebrationLockSeconds(15);
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
      sfx.gameWin();
      triggerFlash('TIEBREAK!');
    } else {
      sfx.gameWin();
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
      sfx.matchWin();
      celebrationLockRef.current = Date.now() + 15000;
      setCelebrationLockSeconds(15);
      triggerFlash(`PEMENANG: ${cfg.names[team]}`);
      finishMatch();
      return;
    }

    sfx.gameWin();
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

  const getMatchSummary = (s = state, currentCfg = cfg) => {
    if (currentCfg.mode === 'americano') {
      return `${s.pts[0]}-${s.pts[1]}`;
    }
    if (s.sets && s.sets.length > 0) {
      return s.sets.map(x => x.stb ? `[${x.g[0]}-${x.g[1]}]` : `${x.g[0]}-${x.g[1]}`).join(' ');
    }
    return `${s.games[0]}-${s.games[1]}`;
  };

  const createBoardSnap = (s = state, pointFlash = null, currentCfg = cfg) => {
    const am = currentCfg.mode === 'americano';
    const n = am ? 0 : currentCfg.bestOf;
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
      names: [...currentCfg.names],
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

  const sendEvent = async (ev, extra = {}, s = state, currentCfg = cfg) => {
    try {
      const snap = createBoardSnap(s, extra.flash || null, currentCfg);
      await fetch(`/api/court/${courtId}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: ev,
          skor: getMatchSummary(s, currentCfg),
          board: snap,
          state: s,
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
    sfx.undo();
    undoGraceRef.current = 0;
    setUndoGraceSeconds(0);
    triggerFlash('Poin Dibatalkan (Undo)');
    sendEvent('batal', {}, prev);
  };

  const swapServe = () => {
    sfx.serve();
    setState(prev => {
      const next = { ...prev, server: 1 - prev.server };
      sendEvent('servis', {}, next);
      return next;
    });
  };

  // Penanda Waktu Momen Klip (Love ❤️ / Bookmark)
  const handleBookmark = async () => {
    sfx.bookmark();
    if (!courtStatus?.recording) {
      triggerFlash('⚠️ Rekaman CCTV belum aktif (Momen klip hanya saat rekam)');
      return;
    }
    const elapsedSec = courtStatus?.elapsed || 0;
    const timeStr = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`;
    const score = getMatchSummary(state);

    // Optimistic UI update: langsung tambahkan ke list bookmarks lokal agar badge langsung bertambah
    setCourtStatus(prev => {
      if (!prev) return prev;
      const curBms = prev.bookmarks || [];
      return {
        ...prev,
        bookmarks: [...curBms, { t: elapsedSec, time_str: timeStr, skor: score }]
      };
    });

    triggerFlash(`❤️ Momen Klip Ditandai (${timeStr})`);
    setLastRemoteAction({ key: '❤️ Love / Mark', action: 'Tandai Momen Klip', ok: true });
    logSignal('bookmark', { elapsed: elapsedSec, time: timeStr, score });
    await sendEvent('bookmark', { note: 'highlight', time: timeStr, skor: score }, state);
    pollStatus();
  };

  // Remote Learning Steps
  const LEARN_STEPS = [
    { act: 'start', title: 'Tombol Main / Mulai', desc: 'Tekan tombol remote yang ingin dipakai untuk Mulai Pertandingan' },
    { act: 'a', title: `Tambah Poin ${cfg.names?.[0] || 'Tim A'}`, desc: `Tekan tombol remote untuk menambah poin ${cfg.names?.[0] || 'Tim A'}` },
    { act: 'b', title: `Tambah Poin ${cfg.names?.[1] || 'Tim B'}`, desc: `Tekan tombol remote untuk menambah poin ${cfg.names?.[1] || 'Tim B'}` },
    { act: 'serve', title: 'Ganti Servis', desc: 'Tekan tombol remote untuk Ganti Servis (atau Lewati)' },
    { act: 'mark', title: 'Penanda Momen Klip (❤️ Love)', desc: 'Tekan tombol Love / Mark pada remote untuk menandai momen klip video' },
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
      if (celebrationLockRef.current > Date.now()) {
        if (act === 'a' || act === 'b' || act === 'start') {
          const rem = Math.ceil((celebrationLockRef.current - Date.now()) / 1000);
          triggerFlash(`🔒 Remote Terkunci: ${rem}s (Perayaan Selesai)`);
          return;
        }
      }
      if (act === 'start') {
        if (!state.started) startMatch();
      } else if (act === 'a') {
        addPoint(0);
      } else if (act === 'b') {
        addPoint(1);
      } else if (act === 'serve') {
        swapServe();
      } else if (act === 'mark') {
        handleBookmark();
      } else if (act === 'undo') {
        undoPoint();
      }
    };

    const handleKeyDown = (e) => {
      logSignal('key', { key: e.key, code: e.code, which: e.which });

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
        serve: 'Ganti Servis',
        mark: 'Tandai Momen (❤️ Love)',
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
    if (cfg.mode === 'americano') return `AMERICANO · TOTAL POIN ${state.total}/${cfg.target || 24} · SERVIS: ${cfg.names[state.server]}`;
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
    setSelectedTarget(cfg.target || 24);
    setShowMatchModal(true);
  };

  const isMatchActive = Boolean(courtStatus?.recording || state.started);

  const handleSaveSettingsAndNames = async () => {
    const nameA = [pA1.trim(), pA2.trim()].filter(Boolean).join(' / ') || 'Tim A';
    const nameB = [pB1.trim(), pB2.trim()].filter(Boolean).join(' / ') || 'Tim B';
    const names = [nameA, nameB];
    const newCfg = {
      ...cfg,
      names,
      ...(isMatchActive ? {} : {
        mode: selectedMode,
        bestOf: Number(selectedBestOf),
        games: Number(selectedGames),
        superTb: Boolean(selectedSuperTb),
        target: Number(selectedTarget)
      })
    };
    setCfg(newCfg);
    try {
      await fetch(`/api/court/${courtId}/set-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          names,
          ...(isMatchActive ? {} : {
            mode: selectedMode,
            bestOf: Number(selectedBestOf),
            games: Number(selectedGames),
            superTb: Boolean(selectedSuperTb),
            target: Number(selectedTarget)
          })
        })
      });
      triggerFlash(isMatchActive ? 'Nama Pemain Disimpan' : 'Pengaturan & Pemain Disimpan');
      pollStatus();
    } catch (e) {}
    setShowMatchModal(false);
  };

  const handleStartFromModal = (quick = false) => {
    if (isMatchActive) {
      if (!window.confirm("⚠️ PERINGATAN: Pertandingan sedang berlangsung! Yakin ingin mereset pertandingan dan memulai ulang dari 0-0?")) {
        return;
      }
    }
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
      bestOf: Number(selectedBestOf),
      games: Number(selectedGames),
      superTb: Boolean(selectedSuperTb),
      target: Number(selectedTarget)
    };
    setCfg(newCfg);
    setShowMatchModal(false);
    startMatch(names, newCfg);
  };

  // Pointer Handlers for TikTok / Gesture Mode
  const handleTouchPointerDown = (e) => {
    if (e.target.closest('button')) return;
    pointerDownRef.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      id: e.pointerId
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };

  const handleTouchPointerUp = (e) => {
    if (!pointerDownRef.current || e.pointerId !== pointerDownRef.current.id) return;
    const pd = pointerDownRef.current;
    pointerDownRef.current = null;
    const dx = e.clientX - pd.x;
    const dy = e.clientY - pd.y;
    const dt = performance.now() - pd.t;
    const th = Math.max(30, Math.min(window.innerWidth, window.innerHeight) * 0.05);

    logSignal('pointer', { dx: Math.round(dx), dy: Math.round(dy), dt: Math.round(dt) });

    if (celebrationLockRef.current > Date.now()) {
      const rem = Math.ceil((celebrationLockRef.current - Date.now()) / 1000);
      setTouchFeedback(`🔒 Remote Terkunci: ${rem}s`);
      setTimeout(() => setTouchFeedback(null), 1200);
      return;
    }

    if (Math.abs(dx) < th && Math.abs(dy) < th) {
      if (dt < 700) {
        setTouchFeedback('Ketuk → Mulai Pertandingan');
        logSignal('gesture', { action: 'tap' });
        if (!state.started) startMatch();
        setTimeout(() => setTouchFeedback(null), 1200);
      }
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        setTouchFeedback(`👈 Swipe Kiri → +1 ${cfg.names[0]}`);
        logSignal('gesture', { action: 'swipe-left', team: cfg.names[0] });
        addPoint(0);
      } else {
        setTouchFeedback(`👉 Swipe Kanan → +1 ${cfg.names[1]}`);
        logSignal('gesture', { action: 'swipe-right', team: cfg.names[1] });
        addPoint(1);
      }
    } else {
      if (dy < 0) {
        setTouchFeedback('👆 Swipe Atas → Ganti Servis');
        logSignal('gesture', { action: 'swipe-up' });
        swapServe();
      } else {
        setTouchFeedback('👇 Swipe Bawah → Batalkan Poin');
        logSignal('gesture', { action: 'swipe-down' });
        undoPoint();
      }
    }
    setTimeout(() => setTouchFeedback(null), 1200);
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
              {courtStatus?.bookmarks?.length > 0 && (
                <span className="px-2 py-1 rounded-full bg-pink-500/20 border border-pink-500/50 text-pink-300 text-xs font-bold font-score uppercase tracking-wider flex items-center gap-1 shadow-sm">
                  <Heart className="w-3 h-3 fill-current text-pink-400" />
                  {courtStatus.bookmarks.length} Klip
                </span>
              )}
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
          {/* SOUND TOGGLE (FEATURE 2) */}
          <button
            type="button"
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              try { localStorage.setItem('padel.sound', String(next)); } catch (e) {}
              sfx.enabled = next;
              if (next) sfx.serve();
            }}
            className={`p-2 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              soundOn
                ? 'bg-padel-card text-padel-volt border-padel-border/60 hover:bg-padel-border/60'
                : 'bg-padel-card text-slate-500 border-padel-border/40 hover:text-slate-300'
            }`}
            title={soundOn ? 'Efek Suara TV Aktif (Klik untuk Senyap)' : 'Efek Suara TV Senyap (Klik untuk Bunyikan)'}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline text-[11px] font-score">{soundOn ? 'Suara ON' : 'Mute'}</span>
          </button>
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
            <span>
              {cfg.mode === 'americano'
                ? `AMERICANO · TARGET ${cfg.target || 24} POIN`
                : `SET ${Math.min(state.sets.length + 1, cfg.bestOf)} · ${cfg.mode.toUpperCase()} POINT`}
            </span>
            <span className="text-padel-volt font-black animate-pulse">{getStatusBanner()}</span>
          </div>

          {/* CELEBRATION LOCK BANNER (FEATURE 3) */}
          {celebrationLockSeconds > 0 && (
            <div className="bg-gradient-to-r from-amber-500/30 via-yellow-500/20 to-amber-500/30 border-b border-amber-400/50 px-6 py-3 flex items-center justify-between text-xs font-bold text-amber-200 animate-pulse shadow-lg">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  🎉 Match Selesai! Remote dikunci selama <strong className="text-white font-mono text-sm">{celebrationLockSeconds}s</strong> untuk mencegah ketukan di saku/tos.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  celebrationLockRef.current = 0;
                  setCelebrationLockSeconds(0);
                }}
                className="px-3 py-1 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white font-score uppercase tracking-wider text-[11px] shadow transition-colors"
              >
                Buka Kunci
              </button>
            </div>
          )}

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
            const isAmericano = cfg.mode === 'americano';
            const isLeading = isAmericano && state.pts[idx] > state.pts[1 - idx];

            return (
              <div
                key={idx}
                onClick={() => addPoint(idx)}
                title={`Klik / sentuh untuk tambah +1 poin ke ${cfg.names[idx]}`}
                className={`grid grid-cols-12 items-center border-b border-padel-border/40 transition-colors cursor-pointer hover:bg-padel-surface/80 active:scale-[0.99] select-none ${
                  isWinner
                    ? 'bg-emerald-950/40'
                    : isLeading
                    ? 'bg-padel-volt/10'
                    : idx === 1
                    ? 'bg-padel-surface/40'
                    : 'bg-transparent'
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
                <div className={`${isAmericano ? 'col-span-8 sm:col-span-8' : 'col-span-6 sm:col-span-7'} py-5 px-3`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl sm:text-4xl font-score font-black tracking-wider uppercase truncate block ${
                      isWinner ? 'text-padel-volt' : isLeading ? 'text-padel-volt' : 'text-white'
                    }`}>
                      {cfg.names[idx]}
                    </span>
                    {isLeading && (
                      <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded bg-padel-volt text-black uppercase">
                        Lead
                      </span>
                    )}
                  </div>
                </div>

                {/* SETS WON (HIDDEN IN AMERICANO) */}
                {!isAmericano && Array.from({ length: cfg.bestOf }).map((_, sIdx) => {
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

                {/* GAME POINTS (0, 15, 30, 40, AD or Americano Total) */}
                <div className={`${isAmericano ? 'col-span-3 sm:col-span-3' : 'col-span-2 sm:col-span-2'} h-full py-5 bg-padel-card/90 border-l-2 border-padel-border flex items-center justify-center`}>
                  <span className="font-score font-black text-4xl sm:text-5xl text-padel-volt text-glow-volt animate-score-pop">
                    {isAmericano ? state.pts[idx] : (state.winner !== null ? '' : getPointLabel(idx))}
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
              {/* TOMBOL UNDO DENGAN GRACE PERIOD HIGHLIGHT (FEATURE 5) */}
              <button
                type="button"
                onClick={undoPoint}
                disabled={history.length === 0}
                className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  undoGraceSeconds > 0
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-lg shadow-amber-500/25 animate-pulse font-bold scale-105'
                    : 'bg-padel-surface hover:bg-padel-card border-padel-border/60 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
                title="Batalkan poin terakhir jika salah pencet remote"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${undoGraceSeconds > 0 ? 'text-amber-400' : ''}`} />
                <span>Batalkan Poin {undoGraceSeconds > 0 ? `(${undoGraceSeconds}s)` : ''}</span>
              </button>
              <button
                onClick={swapServe}
                className="px-4 py-2.5 rounded-xl bg-padel-surface hover:bg-padel-card border border-padel-border/60 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Ganti Servis</span>
              </button>

              {/* TOMBOL TANDAI MOMEN KLIP (LOVE / HIGHLIGHT) */}
              {courtStatus?.recording && (
                <button
                  type="button"
                  onClick={handleBookmark}
                  className="px-4 py-2.5 rounded-xl bg-pink-500/15 hover:bg-pink-500/30 border border-pink-500/50 text-xs font-semibold text-pink-300 hover:text-white flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                  title="Tandai momen seru saat ini untuk klip video highlight (Tombol Love ❤️ pada remote MIXIO)"
                >
                  <Heart className="w-3.5 h-3.5 fill-current text-pink-400" />
                  <span>Tandai Momen</span>
                  {courtStatus?.bookmarks?.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-pink-500 text-black font-bold text-[10px]">
                      {courtStatus.bookmarks.length}
                    </span>
                  )}
                </button>
              )}

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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTouchMode(true)}
              className="px-3 py-1.5 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-padel-border/60 text-cyan-400 hover:text-white font-semibold flex items-center gap-1.5 transition-colors"
              title="Buka mode layar penuh untuk remote sentuh / TikTok seperti MIXIO"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Remote TikTok</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSignalDebugger(true)}
              className="px-3 py-1.5 rounded-xl bg-padel-card hover:bg-padel-border/60 border border-rose-500/40 text-rose-400 hover:text-white font-semibold flex items-center gap-1.5 transition-colors"
              title="Lihat sinyal mentah tombol remote yang sedang dipencet"
            >
              <Bug className="w-3.5 h-3.5" />
              <span>🔴 Debugger Sinyal</span>
            </button>
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
              <span>Atur Tombol</span>
            </button>
          </div>
        </footer>
      )}

      {/* MODAL PERTANDINGAN BARU (DOUBLES / QUICK START) */}
      {showMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-padel-surface border border-padel-border rounded-3xl p-6 sm:p-8 flex flex-col gap-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-padel-border/60 pb-3">
              <div>
                <span className="text-xs font-bold text-padel-volt uppercase tracking-wider block">Pengaturan Match</span>
                <h3 className="text-xl sm:text-2xl font-score font-black text-white uppercase tracking-wider">
                  {isMatchActive ? 'Atur Pemain (Match Aktif)' : 'Mulai Pertandingan'}
                </h3>
              </div>
              <button
                onClick={() => setShowMatchModal(false)}
                className="text-slate-400 hover:text-white text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {/* WARNING BANNER JIKA PERTANDINGAN SEDANG AKTIF / MEREKAM */}
            {isMatchActive && (
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

            {/* QUICK START BUTTON (Hanya jika belum mulai) */}
            {!isMatchActive && (
              <>
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
              </>
            )}

            {/* DOUBLES INPUT */}
            <div className="flex flex-col gap-3.5">
              {/* TIM A */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-padel-card/60 border border-padel-border/60 flex flex-col gap-2.5">
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
              <div className="p-3.5 sm:p-4 rounded-2xl bg-padel-card/60 border border-padel-border/60 flex flex-col gap-2.5">
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
            <div className={`flex flex-col gap-3 pt-2 border-t border-padel-border/40 transition-opacity ${isMatchActive ? 'opacity-65' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-score font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  {isMatchActive ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : null}
                  <span>Format & Aturan Pertandingan</span>
                </span>
                {isMatchActive && (
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
                    disabled={isMatchActive}
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
                      disabled={isMatchActive}
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
                      disabled={isMatchActive}
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
                      disabled={isMatchActive}
                      onChange={e => setSelectedGames(Number(e.target.value))}
                      className="w-full bg-padel-dark border border-padel-border/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-padel-volt disabled:cursor-not-allowed disabled:opacity-75"
                    >
                      <option value={6}>6 Game (Tiebreak 6–6)</option>
                      <option value={4}>4 Game (Set Pendek, Tiebreak 4–4)</option>
                    </select>
                  </div>

                  <div className="pt-2 sm:pt-4">
                    <label className={`flex items-center gap-2 text-xs font-semibold select-none ${isMatchActive || selectedBestOf === 1 ? 'opacity-40 cursor-not-allowed' : 'text-slate-200 cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={selectedSuperTb && selectedBestOf !== 1}
                        disabled={isMatchActive || selectedBestOf === 1}
                        onChange={e => setSelectedSuperTb(e.target.checked)}
                        className="w-4 h-4 rounded text-padel-volt bg-padel-dark border-padel-border focus:ring-0 disabled:cursor-not-allowed"
                      />
                      <span>Set 3 Ganti Super TB (ke 10)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* HINT ATURAN DINAMIS */}
              <div className="p-2.5 rounded-xl bg-padel-card/60 border border-padel-border/40 text-[11px] text-slate-300 leading-relaxed">
                💡 <span className="font-semibold text-padel-volt">Aturan: </span>
                {MODE_HINTS[selectedMode]}
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 justify-end pt-3 border-t border-padel-border/40">
              <button
                type="button"
                onClick={() => setShowMatchModal(false)}
                className="px-4 py-2.5 rounded-xl bg-padel-card hover:bg-padel-border/60 text-slate-300 font-semibold text-xs sm:text-sm transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveSettingsAndNames}
                className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-score font-bold text-xs sm:text-sm tracking-wider uppercase transition-colors"
                title="Simpan pengaturan & nama pemain tanpa mereset skor pertandingan saat ini"
              >
                {isMatchActive ? 'Simpan Nama Pemain' : 'Simpan Pengaturan & Nama'}
              </button>
              <button
                type="button"
                onClick={() => handleStartFromModal(false)}
                className="px-5 py-2.5 rounded-xl bg-padel-volt hover:bg-padel-voltHover text-black font-score font-black text-xs sm:text-sm tracking-wider uppercase transition-all shadow-lg shadow-padel-volt/20"
              >
                {isMatchActive ? 'Mulai Ulang Pertandingan' : 'Mulai Pertandingan Baru'}
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

      {/* FULLSCREEN TOUCH GESTURE MODE (TIKTOK / MIXIO RB-02 CLICKER) */}
      {showTouchMode && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 select-none touch-none animate-fade-in"
          onPointerDown={handleTouchPointerDown}
          onPointerUp={handleTouchPointerUp}
        >
          {/* TOP BAR */}
          <div className="flex items-center justify-between border-b border-padel-border/40 pb-3">
            <button
              type="button"
              onClick={() => setShowTouchMode(false)}
              className="px-4 py-2 rounded-xl bg-padel-card hover:bg-padel-border text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              ✕ Keluar Mode Gestur
            </button>
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-padel-volt tracking-wider block">Mode Remote Sentuh / TikTok</span>
              <span className="text-xs text-slate-300">MIXIO & Clicker Gestur Aktif</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBookmark}
                className="px-3.5 py-2 rounded-xl bg-pink-500/20 hover:bg-pink-500/40 border border-pink-500/60 text-pink-300 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow"
              >
                <Heart className="w-3.5 h-3.5 fill-current text-pink-400" />
                <span>❤️ Tandai Klip</span>
              </button>
              <button
                type="button"
                onClick={openMatchModal}
                className="px-4 py-2 rounded-xl bg-padel-volt text-black text-xs font-score font-bold uppercase transition-all"
              >
                Atur Match
              </button>
            </div>
          </div>

          {/* COMPACT FLOATING SCOREBOARD */}
          <div className="w-full max-w-xl mx-auto bg-padel-surface/90 border border-padel-border rounded-2xl p-4 shadow-2xl flex flex-col gap-2">
            <div className="text-center text-xs font-score font-bold text-padel-volt uppercase tracking-wider">
              {getStatusText(state)}
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className={`p-3 rounded-xl border ${state.server === 0 ? 'border-padel-volt bg-padel-volt/10' : 'border-padel-border bg-padel-dark'}`}>
                <div className="text-xs text-slate-400 font-semibold truncate">{cfg.names[0]}</div>
                <div className="text-3xl font-score font-black text-white">{getPtsLabel(0, state)}</div>
              </div>
              <div className={`p-3 rounded-xl border ${state.server === 1 ? 'border-cyan-400 bg-cyan-400/10' : 'border-padel-border bg-padel-dark'}`}>
                <div className="text-xs text-slate-400 font-semibold truncate">{cfg.names[1]}</div>
                <div className="text-3xl font-score font-black text-white">{getPtsLabel(1, state)}</div>
              </div>
            </div>
          </div>

          {/* INTERACTIVE GESTURE PAD (MASSIVE TOUCH AREA) */}
          <div className="flex-1 my-4 flex flex-col items-center justify-center border-2 border-dashed border-padel-border/40 rounded-3xl p-6 text-center gap-4 bg-padel-surface/20">
            {touchFeedback ? (
              <div className="px-6 py-3 rounded-2xl bg-padel-volt text-black font-score font-black text-xl uppercase tracking-wider shadow-lg shadow-padel-volt/30 animate-score-pop">
                {touchFeedback}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <div className="w-16 h-16 rounded-full border-2 border-padel-volt/40 flex items-center justify-center animate-pulse">
                  <span className="text-2xl">👆</span>
                </div>
                <span className="font-score font-black text-white text-lg uppercase tracking-wide">Area Sentuh & Gestur Remote</span>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Pencet tombol remote TikTok / MIXIO kamu di sini:
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300 bg-padel-dark/80 p-3 rounded-xl border border-padel-border/50 text-left">
                  <div>👈 Geser Kiri: <strong>+1 {cfg.names[0]}</strong></div>
                  <div>👉 Geser Kanan: <strong>+1 {cfg.names[1]}</strong></div>
                  <div>👆 Geser Atas: <strong>Ganti Servis</strong></div>
                  <div>👇 Geser Bawah: <strong>Batalkan Poin</strong></div>
                  <div className="col-span-2 text-center text-padel-volt">❤️ Ketuk 1x: <strong>Mulai Match</strong></div>
                </div>
                {undoGraceSeconds > 0 && (
                  <div className="w-full max-w-xs p-2.5 rounded-xl bg-amber-500/25 border border-amber-400 text-amber-200 text-xs font-bold animate-pulse text-center flex items-center justify-center gap-1.5 shadow-lg">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Salah poin? Geser Bawah (👇) untuk batal ({undoGraceSeconds}s)</span>
                  </div>
                )}
                {celebrationLockSeconds > 0 && (
                  <div className="w-full max-w-xs p-2.5 rounded-xl bg-amber-500/25 border border-amber-400 text-amber-200 text-xs font-bold animate-pulse text-center flex items-center justify-center gap-1.5 shadow-lg">
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Remote Terkunci Pasca Match ({celebrationLockSeconds}s)</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM QUICK FOOTER */}
          <div className="text-center text-[11px] text-slate-500">
            Mendeteksi gestur sentuh / pointer drag dari remote Bluetooth
          </div>
        </div>
      )}

      {/* DRAWER / MODAL PEREKAM SINYAL REMOTE (LIVE DEBUGGER) */}
      {showSignalDebugger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-padel-surface border border-rose-500/60 rounded-3xl p-6 sm:p-8 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-padel-border/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                <h3 className="text-lg font-score font-black text-rose-400 uppercase tracking-wider">
                  🔴 Perekam Sinyal Remote (Live Debugger)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSignalDebugger(false)}
                className="text-slate-400 hover:text-white text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Pencet tombol remote kamu satu per satu (Kiri, Kanan, Atas, Bawah, Hati, Kamera, Vol, dll). Semua sinyal yang masuk ke HP/Tablet langsung tercatat di bawah:
            </p>

            <div className="max-h-64 overflow-y-auto bg-padel-dark rounded-2xl p-3 border border-padel-border flex flex-col gap-2 font-mono text-xs">
              {remoteSignals.length === 0 ? (
                <div className="text-slate-500 text-center py-6 italic">
                  Belum ada sinyal masuk. Silakan pencet tombol remote kamu...
                </div>
              ) : (
                remoteSignals.map((sig) => (
                  <div key={sig.id} className="p-2 rounded-lg bg-padel-card/80 border border-padel-border/50 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 font-sans">{sig.timestamp}</span>
                    <span className="text-rose-400 font-bold uppercase">{sig.type}</span>
                    <span className="text-white truncate max-w-[200px]">
                      {sig.code ? `code="${sig.code}" key="${sig.key}"` : sig.action ? `act="${sig.action}"` : JSON.stringify(sig)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-padel-border/40">
              <button
                type="button"
                onClick={() => {
                  setRemoteSignals([]);
                  fetch(`/api/court/${courtId}/clear-log-key`, { method: 'POST' }).catch(() => {});
                }}
                className="px-3 py-1.5 rounded-xl bg-padel-card hover:bg-padel-border text-slate-300 text-xs font-semibold transition-colors"
              >
                Bersihkan Log
              </button>
              <button
                type="button"
                onClick={() => setShowSignalDebugger(false)}
                className="px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold transition-colors"
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
