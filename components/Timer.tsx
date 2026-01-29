import React, { useState, useMemo } from 'react';
import { TimerMode, TreeId } from '../types';
import { 
  Play, Pause, RotateCcw, Clock, Watch, Hourglass, 
  Zap, Coffee, Leaf, ChevronRight, Check, Lock, ExternalLink
} from 'lucide-react';
import { useTimer, TimerPhase } from '../contexts/TimerContext';
import { useNavigate } from 'react-router-dom';

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

const TREE_IMAGES: Record<TreeId, string> = {
  sprout: '/trees/tree.png',                 // sprout image
  bush: '/trees/bush.png',
  bamboo: '/trees/bamboo.png',
  oak: '/trees/monk.png',                    // oak renamed to monk.png
  willow: '/trees/willow.png',
  cherry: '/trees/cherry.png',
  autumn: '/trees/autumn maple.png',         // autumn gap maple.png (space is OK)
  winter: '/trees/snow pie.png',             // snow pie.png
};


export const Timer: React.FC = () => {
  const { 
      mode, setMode, phase, isActive, toggleTimer, resetTimer, 
      seconds, dailyTotal, initialTime, pomodoroCount,
      customMinutes, setCustomMinutes, setSeconds, setInitialTime,
      selectedTreeId, setSelectedTreeId 
  } = useTimer();

  const navigate = useNavigate();
  const [showTreePicker, setShowTreePicker] = useState(false);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isFocus = phase === TimerPhase.FOCUS;
  const isPomo = mode === TimerMode.POMODORO;

  const getAccentColor = () => {
    if (!isPomo) return 'text-indigo-400';
    return isFocus ? 'text-indigo-400' : 'text-emerald-400';
  };

  const selectedTree = TREE_OPTIONS.find(t => t.id === selectedTreeId);

  // Focus Forest Growth Logic
  const growthState = useMemo(() => {
    if (!isActive) return { stage: 1, label: 'Sprout' };
    
    let duration = 0;
    if (mode === TimerMode.STOPWATCH) duration = seconds;
    else duration = initialTime - seconds;
    
    const minutes = duration / 60;
    
    if (minutes < 10) return { stage: 1, label: 'Sprout' };
    if (minutes < 15) return { stage: 2, label: 'Growing...' };
    return { stage: 3, label: 'Fully Grown' };
  }, [isActive, seconds, initialTime, mode]);

  return (
    <div className="w-full max-w-4xl bg-neutral-900 border border-white/5 rounded-[48px] p-8 md:p-12 shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col items-center">
      
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/5 rounded-full blur-[100px] pointer-events-none -z-0"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-600/5 rounded-full blur-[100px] pointer-events-none -z-0"></div>

      {/* Header Info */}
      <div className="w-full flex justify-between items-center z-10 mb-8">
          <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500">Live Session</span>
          </div>
          <button 
              onClick={() => navigate('/forest')}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-all text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-white"
          >
              <Leaf size={14} /> My Forest <ExternalLink size={12} className="opacity-50" />
          </button>
      </div>

      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center z-10">
          
          {/* TREE DISPLAY (LEFT ON LARGE) */}
          <div className="lg:col-span-4 flex flex-col items-center gap-6">
              <div className="relative w-48 h-48 md:w-56 md:h-56 bg-white/[0.02] border border-white/5 rounded-full flex items-center justify-center group">
                  {/* Tree Visualization Placeholder */}
                  <div className="w-full h-full flex items-center justify-center relative">
                      {/* Placeholder for Stage-based Tree Scaling & Fade */}
                      <div className={`transition-all duration-1000 ease-in-out flex flex-col items-center
                        ${growthState.stage === 1 ? 'scale-50 opacity-60' : ''}
                        ${growthState.stage === 2 ? 'scale-75 opacity-90' : ''}
                        ${growthState.stage === 3 ? 'scale-110 opacity-100' : ''}
                      `}>
   <img
  src={TREE_IMAGES[selectedTreeId]}
  alt={selectedTree?.name}
  className={`
    transition-all duration-1000 ease-in-out
    ${growthState.stage === 1 ? 'scale-75 opacity-70' : ''}
    ${growthState.stage === 2 ? 'scale-90 opacity-90' : ''}
    ${growthState.stage === 3 ? 'scale-110 opacity-100' : ''}
    w-32 h-32 object-contain
  `}
/>

<div className="mt-2 text-[10px] font-black text-indigo-400 uppercase tracking-widest opacity-60">
  {selectedTree?.name}
</div>


                          <div className="mt-2 text-[10px] font-black text-indigo-400 uppercase tracking-widest opacity-40">{growthState.label}</div>
                      </div>
                  </div>

                  {!isActive && (
                      <button 
                        onClick={() => setShowTreePicker(true)}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 rounded-full flex flex-col items-center justify-center transition-all duration-300"
                      >
                         <ChevronRight size={24} className="text-white mb-1" />
                         <span className="text-[10px] font-black uppercase tracking-widest text-white">Change Tree</span>
                      </button>
                  )}
              </div>

              <div className="text-center">
                  <h3 className="text-xl font-black text-white tracking-tight">{selectedTree?.name}</h3>
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em]">{selectedTree?.desc}</p>
              </div>
          </div>

          {/* TIMER DISPLAY (CENTER/RIGHT ON LARGE) */}
          <div className="lg:col-span-8 flex flex-col items-center">
              {isPomo && (
                <div className={`mb-4 transition-all duration-700 animate-in fade-in slide-in-from-bottom-2`}>
                   <div className={`px-5 py-1.5 rounded-full text-[12px] font-black uppercase tracking-[0.2em] border shadow-lg ${isFocus ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                      {isFocus ? <><Zap size={14} className="inline mr-2 -mt-1" /> Deep Work</> : <><Coffee size={14} className="inline mr-2 -mt-1" /> Recovery</>}
                   </div>
                </div>
              )}

              <div className={`text-[120px] md:text-[160px] font-mono font-extralight tracking-tighter tabular-nums leading-none mb-6 transition-colors duration-700 ${getAccentColor()}`}>
                {formatTime(seconds)}
              </div>

              {/* Controls */}
              <div className="flex gap-4 w-full max-w-md">
                  <button 
                    onClick={toggleTimer}
                    className={`flex-[2] flex items-center justify-center gap-3 py-5 rounded-[28px] font-black text-sm uppercase tracking-[0.2em] transition-all active:scale-[0.98] shadow-2xl ${
                      isActive 
                        ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-white/5' 
                        : 'bg-white text-black hover:bg-neutral-200'
                    }`}
                  >
                    {isActive ? <><Pause size={20} /> Pause</> : <><Play size={20} /> Focus Now</>}
                  </button>
                  <button 
                    onClick={resetTimer}
                    className="flex-1 p-5 bg-neutral-800 text-neutral-400 rounded-[28px] hover:bg-neutral-700 hover:text-white border border-white/5 transition-all active:scale-[0.95] flex items-center justify-center"
                    title="Save & Reset"
                  >
                    <RotateCcw size={24} />
                  </button>
              </div>

              {/* Mode Selector */}
              <div className="mt-8 flex bg-black/40 backdrop-blur-xl p-2 rounded-3xl border border-white/5 shadow-inner">
                <button 
                  onClick={() => setMode(TimerMode.STOPWATCH)} 
                  className={`px-6 py-3 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${mode === TimerMode.STOPWATCH ? 'bg-white/10 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  <Watch size={16} /> Stopwatch
                </button>
                <button 
                  onClick={() => setMode(TimerMode.POMODORO)} 
                  className={`px-6 py-3 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${mode === TimerMode.POMODORO ? 'bg-white/10 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  <Hourglass size={16} /> Pomodoro
                </button>
                <button 
                  onClick={() => setMode(TimerMode.COUNTDOWN)} 
                  className={`px-6 py-3 rounded-2xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${mode === TimerMode.COUNTDOWN ? 'bg-white/10 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  <Clock size={16} /> Timer
                </button>
              </div>

              {/* Custom Minutes Input (Only if Timer mode and not active) */}
              {mode === TimerMode.COUNTDOWN && !isActive && seconds === initialTime && (
                <div className="mt-4 flex items-center gap-3 animate-in slide-in-from-top-2">
                  <input 
                    type="number" 
                    value={customMinutes} 
                    onChange={(e) => {
                      const val = Math.min(180, Math.max(1, parseInt(e.target.value) || 0));
                      setCustomMinutes(val);
                      setSeconds(val * 60);
                      setInitialTime(val * 60);
                    }}
                    className="bg-black/40 border border-white/10 text-white px-4 py-2 rounded-xl w-24 text-center focus:outline-none focus:border-indigo-500 text-sm font-black"
                  />
                  <span className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.2em]">Minutes</span>
                </div>
              )}
          </div>
      </div>

      {/* Tree Picker Modal */}
      {showTreePicker && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in">
           <div className="bg-[#121212] border border-white/10 w-full max-w-md rounded-[40px] p-8 shadow-2xl animate-in zoom-in">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-white flex items-center gap-3">
                  <Leaf size={24} className="text-indigo-500" /> Tree Catalog
                </h3>
                <button onClick={() => setShowTreePicker(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 max-h-[450px] overflow-y-auto custom-scrollbar pr-2">
                {TREE_OPTIONS.map(tree => (
                  <button 
                    key={tree.id}
                    disabled={tree.locked}
                    onClick={() => { setSelectedTreeId(tree.id); setShowTreePicker(false); }}
                    className={`p-5 rounded-[32px] border text-left flex flex-col gap-3 transition-all relative overflow-hidden group
                      ${selectedTreeId === tree.id 
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' 
                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-400'
                      }
                      ${tree.locked ? 'opacity-40 grayscale cursor-not-allowed' : ''}
                    `}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center relative z-10 transition-colors ${selectedTreeId === tree.id ? 'bg-white/20' : 'bg-black/20'}`}>
                      {tree.locked ? (   <Lock size={18} /> ) : (   <img     src={TREE_IMAGES[tree.id]}     alt={tree.name}     className="w-10 h-10 object-contain"   /> )}
                    </div>
                    <div className="flex flex-col relative z-10">
                      <span className="text-sm font-black tracking-tight leading-tight">{tree.name}</span>
                      <span className="text-[9px] uppercase font-bold opacity-60 mt-1">{tree.desc}</span>
                    </div>
                    {selectedTreeId === tree.id && (
                      <div className="absolute top-4 right-4">
                        <Check size={18} />
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
