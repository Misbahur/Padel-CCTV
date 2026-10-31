import React, { useState } from 'react';
import { Shield, Tv, ArrowRight, Delete, CheckCircle2, AlertCircle } from 'lucide-react';

export default function LoginView({ navigate }) {
  const [tab, setTab] = useState('court'); // 'court' or 'admin'
  const [courtId, setCourtId] = useState(1);
  const [pin, setPin] = useState('');
  const [adminUser, setAdminUser] = useState('admin');
  const [adminPass, setAdminPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Extract next param
  const urlParams = new URLSearchParams(window.location.search);
  const nextUrl = urlParams.get('next');

  const handleCourtLogin = async (inputPin = pin) => {
    if (inputPin.length !== 4) {
      setError('Masukkan 4 digit PIN lapangan');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'court', court_id: courtId, pin: inputPin })
      });
      const data = await res.json();
      if (data.ok) {
        navigate(nextUrl || `/court/${courtId}`);
      } else {
        setError(data.message || 'PIN salah');
        setPin('');
      }
    } catch (e) {
      setError('Gagal terhubung ke server');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'admin', username: adminUser, password: adminPass })
      });
      const data = await res.json();
      if (data.ok) {
        navigate(nextUrl || '/dashboard');
      } else {
        setError(data.message || 'Password salah');
      }
    } catch (e) {
      setError('Gagal terhubung ke server');
    } finally {
      setLoading(false);
    }
  };

  const onNumpadPress = (val) => {
    if (loading) return;
    setError('');
    if (val === 'DEL') {
      setPin(prev => prev.slice(0, -1));
    } else if (val === 'ENTER') {
      handleCourtLogin();
    } else if (pin.length < 4) {
      const newPin = pin + val;
      setPin(newPin);
      if (newPin.length === 4) {
        handleCourtLogin(newPin);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-padel-dark via-[#091829] to-[#040C16]">
      <div className="w-full max-w-md bg-padel-surface/90 border border-padel-border/60 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-black/60 flex flex-col gap-6">
        
        {/* Header Branding */}
        <div className="text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-padel-volt flex items-center justify-center text-black shadow-lg shadow-padel-volt/30 mb-3 transform hover:rotate-6 transition-transform">
            <span className="text-3xl font-score font-black tracking-tighter">🎾</span>
          </div>
          <h1 className="text-3xl font-score font-black tracking-wider text-white uppercase flex items-center gap-2">
            Padel <span className="text-padel-volt">CCTV</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium tracking-wide uppercase mt-1">
            Sistem Papan Skor & Rekaman 3 Lapangan
          </p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 p-1 bg-padel-dark/80 rounded-2xl border border-padel-border/40">
          <button
            type="button"
            onClick={() => { setTab('court'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === 'court'
                ? 'bg-padel-volt text-black shadow-md shadow-padel-volt/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Papan Lapangan</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('admin'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === 'admin'
                ? 'bg-padel-volt text-black shadow-md shadow-padel-volt/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Admin</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm animate-shake">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* TAB COURT: PIN INPUT */}
        {tab === 'court' && (
          <div className="flex flex-col gap-5">
            {/* Court Selector */}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Pilih Lapangan:
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[1, 2, 3].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => { setCourtId(num); setPin(''); setError(''); }}
                    className={`py-3.5 px-2 rounded-2xl border flex flex-col items-center gap-1 transition-all ${
                      courtId === num
                        ? 'border-padel-volt bg-padel-volt/15 text-padel-volt shadow-lg shadow-padel-volt/10'
                        : 'border-padel-border/50 bg-padel-card/60 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span className="text-2xl font-score font-black">{num}</span>
                    <span className="text-[11px] font-medium tracking-wide">Lap {num}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* PIN Display */}
            <div className="flex flex-col items-center gap-2 my-1">
              <span className="text-xs text-slate-400 uppercase tracking-wider">
                Masukkan PIN Lapangan {courtId}
              </span>
              <div className="flex gap-4">
                {[0, 1, 2, 3].map(idx => (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                      pin.length > idx
                        ? 'bg-padel-volt border-padel-volt shadow-md shadow-padel-volt/50 scale-110'
                        : 'border-slate-600 bg-padel-dark/60'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onNumpadPress(String(n))}
                  className="h-14 rounded-2xl bg-padel-card/80 hover:bg-padel-card border border-padel-border/40 text-2xl font-score font-bold text-white flex items-center justify-center active:scale-95 transition-all shadow-sm"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onNumpadPress('DEL')}
                className="h-14 rounded-2xl bg-padel-card/40 hover:bg-padel-card border border-padel-border/30 text-slate-400 hover:text-white flex items-center justify-center active:scale-95 transition-all"
              >
                <Delete className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => onNumpadPress('0')}
                className="h-14 rounded-2xl bg-padel-card/80 hover:bg-padel-card border border-padel-border/40 text-2xl font-score font-bold text-white flex items-center justify-center active:scale-95 transition-all shadow-sm"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => onNumpadPress('ENTER')}
                disabled={pin.length !== 4 || loading}
                className="h-14 rounded-2xl bg-padel-volt hover:bg-padel-voltHover disabled:opacity-40 text-black font-score font-black text-lg flex items-center justify-center active:scale-95 transition-all shadow-md shadow-padel-volt/20"
              >
                {loading ? '...' : <ArrowRight className="w-6 h-6 stroke-[3]" />}
              </button>
            </div>
            <p className="text-[11px] text-center text-slate-400">
              Default PIN Lap 1: <code className="text-padel-volt">1111</code> · Lap 2: <code className="text-padel-volt">2222</code> · Lap 3: <code className="text-padel-volt">3333</code>
            </p>
          </div>
        )}

        {/* TAB ADMIN: USERNAME & PASSWORD */}
        {tab === 'admin' && (
          <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={adminUser}
                onChange={e => setAdminUser(e.target.value)}
                required
                className="w-full bg-padel-dark/80 border border-padel-border/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-padel-volt transition-colors"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                required
                className="w-full bg-padel-dark/80 border border-padel-border/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-padel-volt transition-colors"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full py-3.5 bg-padel-volt hover:bg-padel-voltHover text-black font-score font-black text-lg tracking-wider rounded-xl uppercase transition-all shadow-lg shadow-padel-volt/20 active:scale-98 disabled:opacity-50"
            >
              {loading ? 'Masuk...' : 'Masuk Dashboard'}
            </button>
            <p className="text-[11px] text-center text-slate-400 mt-1">
              Default password admin: <code className="text-padel-volt">admin123</code>
            </p>
          </form>
        )}

      </div>
    </div>
  );
}
