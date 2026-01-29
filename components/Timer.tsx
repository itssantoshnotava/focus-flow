
import React, { useState } from 'react';
import { TimerMode, TreeId } from '../types';
import { 
  Play, Pause, RotateCcw, Clock, Watch, Hourglass, 
  Zap, Coffee, Leaf, ChevronRight, Check, Lock
} from 'lucide-react';
import { useTimer, TimerPhase } from '../contexts/TimerContext';

const TREE_OPTIONS: { id: TreeId; name: string; desc: string; locked?: boolean }[] = [
  { id: 'sprout', name: 'Sprout', desc: 'Fast vertical growth' },
  { id: 'bush', name: 'Bush', desc: 'Short and steady' },
  { id: 'bamboo', name: 'Bamboo', desc: 'Rapid upward growth' },
  { id: 'oak', name: 'Oak', desc: 'Slow and strong' },
  { id: 'willow', name: 'Willow', desc: 'Graceful and calm' },
  { id: 'cherry', name: 'Cherry Blossom', desc: 'Elegant and premium' },
  { id: 'autumn', name: 'Autumn Maple', desc: 'Seasonal special', locked: true },
  { id: 'winter', name: 'Snow Pine', desc: 'Seasonal special', locked: true },
];

export const Timer: React.FC = () => {
  const { 
      mode, setMode, phase, isActive, toggleTimer, resetTimer, 
      seconds, dailyTotal, initialTime, pomodoroCount,
      customMinutes, setCustomMinutes, setSeconds, setInitialTime,
      selectedTreeId, setSelectedTreeId 
  } = useTimer();

  const [showTreePicker, setShowTreePicker] = useState(false);

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

  const selectedTree = TREE_OPTIONS.find(t => t.id === selectedTreeId);

  // Growth Progress Logic
  const getCurrentGrowth = () => {
    if (!isActive) return "0/4 Stages";
    let duration = 0;
    if (mode === TimerMode.STOPWATCH) duration = seconds;
    else duration = initialTime - seconds;
    
    const stages = Math.floor(duration / (25 * 60));
    return `${Math.min(stages, 4)}/4 Stages`;
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

      {/* Forest Integration UI */}
      {!isActive && (
        <button 
          onClick={() => setShowTreePicker(true)}
          className="w-full py-3 px-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-all z-10"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <Leaf size={20} />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Growing Tree</span>
              <span className="text-sm font-bold text-white">{selectedTree?.name}</span>
            </div>
          </div>
          <ChevronRight size={18} className="text-neutral-600 group-hover:text-white transition-colors" />
        </button>
      )}

      {isActive && (
        <div className="w-full py-3 px-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-center justify-between z-10 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center text-indigo-400 animate-pulse">
                <Leaf size={20} />
             </div>
             <div className="flex flex-col">
                <span className="text-[9px] font-black text-indigo-400/70 uppercase tracking-[0.2em]">Focus Growth</span>
                <span className="text-sm font-black text-white">{getCurrentGrowth()}</span>
             </div>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(i => {
                const duration = mode === TimerMode.STOPWATCH ? seconds : (initialTime - seconds);
                const currentStage = Math.floor(duration / (25 * 60));
                return (
                  <div key={i} className={`w-1.5 h-6 rounded-full transition-all duration-500 ${i <= currentStage ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-neutral-800'}`}></div>
                );
            })}
          </div>
        </div>
      )}

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

      {/* Tree Picker Modal */}
      {showTreePicker && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in">
           <div className="bg-[#121212] border border-white/10 w-full max-w-sm rounded-[40px] p-8 shadow-2xl animate-in zoom-in">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-white flex items-center gap-3">
                  <Leaf size={24} className="text-indigo-500" /> Choose Tree
                </h3>
                <button onClick={() => setShowTreePicker(false)} className="text-neutral-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                {TREE_OPTIONS.map(tree => (
                  <button 
                    key={tree.id}
                    disabled={tree.locked}
                    onClick={() => { setSelectedTreeId(tree.id); setShowTreePicker(false); }}
                    className={`p-4 rounded-[28px] border text-left flex flex-col gap-2 transition-all relative overflow-hidden group
                      ${selectedTreeId === tree.id 
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-400'
                      }
                      ${tree.locked ? 'opacity-50 grayscale cursor-not-allowed' : ''}
                    `}
                  >
                    <div className="w-10 h-10 bg-black/20 rounded-xl flex items-center justify-center relative z-10">
                      {tree.locked ? <Lock size={16} /> : <Leaf size={20} />}
                    </div>
                    <div className="flex flex-col relative z-10">
                      <span className="text-xs font-black tracking-tight">{tree.name}</span>
                      <span className="text-[8px] uppercase font-bold opacity-60">{tree.desc}</span>
                    </div>
                    {selectedTreeId === tree.id && (
                      <div className="absolute top-3 right-3">
                        <Check size={14} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const X = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);
