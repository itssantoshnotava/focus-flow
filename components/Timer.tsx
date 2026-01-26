import React from 'react';
import { TimerMode } from '../types';
import { Play, Pause, RotateCcw, Clock, Watch, Hourglass, Zap, Coffee } from 'lucide-react';
import { useTimer, TimerPhase } from '../contexts/TimerContext';

export const Timer: React.FC = () => {
  const { 
      mode, setMode, phase, isActive, toggleTimer, resetTimer, 
      seconds, dailyTotal, initialTime, pomodoroCount,
      customMinutes, setCustomMinutes, setSeconds, setInitialTime 
  } = useTimer();

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDailyTotal = (totalSeconds: number) => {
    const h = (totalSeconds / 3600).toFixed(1);
    return `${h} hrs`;
  };

  const isFocus = phase === TimerPhase.FOCUS;
  const isPomo = mode === TimerMode.POMODORO;

  const getAccentColor = () => {
    if (!isPomo) return 'text-indigo-400';
    return isFocus ? 'text-indigo-400' : 'text-emerald-400';
  };

  const getBgAccent = () => {
    if (!isPomo) return 'bg-indigo-500/5';
    return isFocus ? 'bg-indigo-500/5' : 'bg-emerald-500/5';
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-[32px] p-8 flex flex-col items-center gap-6 shadow-2xl relative transition-all duration-700 overflow-hidden">
      
      {/* Background Liquid Accents */}
      <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute -top-10 -right-10 w-48 h-48 ${getBgAccent()} rounded-full blur-[80px] transition-colors duration-1000 opacity-60`}></div>
          <div className={`absolute -bottom-10 -left-10 w-48 h-48 ${getBgAccent()} rounded-full blur-[80px] transition-colors duration-1000 opacity-40`}></div>
      </div>

      {/* Header Info */}
      <div className="w-full flex justify-between items-center z-10">
        <div className="flex flex-col">
            <h2 className="text-neutral-500 text-[10px] uppercase font-black tracking-[0.25em]">Session Timer</h2>
            {isPomo && (
              <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest mt-0.5">
                Cycle #{pomodoroCount + 1}
              </span>
            )}
        </div>
        <div className="text-emerald-400 text-[10px] font-black uppercase tracking-widest bg-emerald-400/10 px-3 py-1.5 rounded-full border border-emerald-400/20 shadow-sm">
          {formatDailyTotal(dailyTotal)}
        </div>
      </div>

      {/* Main Display */}
      <div className="flex flex-col items-center z-10 w-full py-4">
        {isPomo && (
          <div className={`flex items-center gap-2 mb-6 animate-in fade-in slide-in-from-top-4 duration-700`}>
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border transition-all duration-700 shadow-lg ${isFocus ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
              {isFocus ? <Zap size={10} className="fill-current" /> : <Coffee size={10} className="fill-current" />}
              {isFocus ? 'Focus Phase' : 'Break Phase'}
            </div>
          </div>
        )}

        <div className={`text-8xl font-mono font-extralight tracking-tighter tabular-nums mb-8 transition-colors duration-1000 drop-shadow-sm ${getAccentColor()}`}>
          {formatTime(seconds)}
        </div>
        
        {/* Modern Mode Switcher */}
        <div className="flex bg-neutral-950/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/5 shadow-2xl mb-2">
          <button 
            onClick={() => setMode(TimerMode.STOPWATCH)} 
            className={`p-3 rounded-xl transition-all duration-300 ${mode === TimerMode.STOPWATCH ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-neutral-500 hover:text-neutral-300'}`}
            title="Stopwatch"
          >
            <Watch size={20} />
          </button>
          <button 
            onClick={() => setMode(TimerMode.POMODORO)} 
            className={`p-3 rounded-xl transition-all duration-300 ${mode === TimerMode.POMODORO ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-neutral-500 hover:text-neutral-300'}`}
            title="Pomodoro (25/5 Loop)"
          >
            <Hourglass size={20} />
          </button>
          <button 
            onClick={() => setMode(TimerMode.COUNTDOWN)} 
            className={`p-3 rounded-xl transition-all duration-300 ${mode === TimerMode.COUNTDOWN ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-neutral-500 hover:text-neutral-300'}`}
            title="Single Countdown"
          >
            <Clock size={20} />
          </button>
        </div>

        {mode === TimerMode.COUNTDOWN && !isActive && seconds === initialTime && (
          <div className="flex items-center gap-3 mt-4 animate-in fade-in slide-in-from-top-2">
            <input 
              type="number" 
              value={customMinutes} 
              onChange={(e) => {
                const val = Math.min(999, Math.max(1, parseInt(e.target.value) || 1));
                setCustomMinutes(val);
                setSeconds(val * 60);
                setInitialTime(val * 60);
              }}
              className="bg-neutral-950 border border-neutral-800 text-white px-4 py-2 rounded-xl w-24 text-center focus:outline-none focus:border-indigo-500 text-lg font-mono shadow-inner"
            />
            <span className="text-neutral-600 text-[10px] font-black uppercase tracking-widest">minutes</span>
          </div>
        )}
      </div>

      {/* Main Controls */}
      <div className="flex gap-4 z-10 w-full max-w-xs justify-center pt-2">
        <button 
          onClick={toggleTimer}
          className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-2xl ${
            isActive 
              ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-white/5' 
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-900/40'
          }`}
        >
          {isActive ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          {isActive ? 'Pause' : 'Focus'}
        </button>
        <button 
          onClick={resetTimer}
          className="p-4 bg-neutral-800 text-neutral-500 rounded-2xl hover:bg-neutral-700 hover:text-white border border-white/5 transition-all active:scale-90 shadow-xl"
          title="Reset Session"
        >
          <RotateCcw size={20} />
        </button>
      </div>
    </div>
  );
};
