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
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col items-center gap-6 shadow-lg relative transition-all duration-500">
      
      {/* Background Accent */}
      <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
          <div className={`absolute top-0 right-0 w-32 h-32 ${getBgAccent()} rounded-full blur-3xl -z-0 transition-colors duration-700`}></div>
      </div>

      {/* Header */}
      <div className="w-full flex justify-between items-center z-10">
        <h2 className="text-neutral-400 text-[10px] uppercase font-bold tracking-[0.2em]">Steady Timer</h2>
        <div className="text-emerald-400 text-[10px] font-black uppercase tracking-widest bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-400/20">
          Today: {formatDailyTotal(dailyTotal)}
        </div>
      </div>

      {/* Timer Display */}
      <div className="flex flex-col items-center z-10 w-full">
        {isPomo && (
          <div className={`flex items-center gap-2 mb-2 animate-in fade-in slide-in-from-top-2 duration-500`}>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-500 ${isFocus ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
              {isFocus ? <><Zap size={10} /> Focus</> : <><Coffee size={10} /> Break</>}
            </div>
            {pomodoroCount > 0 && (
              <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
                Cycle #{pomodoroCount + 1}
              </span>
            )}
          </div>
        )}

        <div className={`text-7xl font-mono font-light tracking-tighter tabular-nums mb-4 transition-colors duration-700 ${getAccentColor()}`}>
          {formatTime(seconds)}
        </div>
        
        {/* Mode Selector */}
        <div className="flex bg-neutral-950 p-1.5 rounded-2xl border border-white/5 shadow-inner mb-6">
          <button 
            onClick={() => setMode(TimerMode.STOPWATCH)} 
            className={`p-2.5 rounded-xl transition-all ${mode === TimerMode.STOPWATCH ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
            title="Stopwatch"
          >
            <Watch size={18} />
          </button>
          <button 
            onClick={() => setMode(TimerMode.POMODORO)} 
            className={`p-2.5 rounded-xl transition-all ${mode === TimerMode.POMODORO ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
            title="Pomodoro (25/5 Loop)"
          >
            <Hourglass size={18} />
          </button>
          <button 
            onClick={() => setMode(TimerMode.COUNTDOWN)} 
            className={`p-2.5 rounded-xl transition-all ${mode === TimerMode.COUNTDOWN ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
            title="Single Countdown"
          >
            <Clock size={18} />
          </button>
        </div>

        {/* Custom Input for Countdown */}
        {mode === TimerMode.COUNTDOWN && !isActive && seconds === initialTime && (
          <div className="flex items-center gap-2 mb-4 animate-in fade-in slide-in-from-top-2">
            <input 
              type="number" 
              value={customMinutes} 
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setCustomMinutes(val);
                setSeconds(val * 60);
                setInitialTime(val * 60);
              }}
              className="bg-neutral-950 border border-neutral-800 text-white px-3 py-1.5 rounded-xl w-20 text-center focus:outline-none focus:border-indigo-500 text-sm font-bold"
            />
            <span className="text-neutral-500 text-[10px] font-black uppercase tracking-widest">min</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3 z-10 w-full max-w-xs justify-center pb-1">
        <button 
          onClick={toggleTimer}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 ${
            isActive 
              ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-white/5' 
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/40'
          }`}
        >
          {isActive ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Start</>}
        </button>
        <button 
          onClick={resetTimer}
          className="p-3.5 bg-neutral-800 text-neutral-400 rounded-2xl hover:bg-neutral-700 hover:text-white border border-white/5 transition-all active:scale-90"
          title="Save & Reset"
        >
          <RotateCcw size={20} />
        </button>
      </div>
    </div>
  );
};
