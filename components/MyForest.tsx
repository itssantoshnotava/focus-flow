import React, { useMemo } from 'react';
import { useTimer } from '../contexts/TimerContext';
import { Leaf, Calendar, ChevronLeft, ChevronRight, Trophy, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const MyForest: React.FC = () => {
  const { earnedTrees } = useTimer();
  const navigate = useNavigate();

  const todayStr = new Date().toISOString().split('T')[0];
  
  const todayTrees = useMemo(() => {
    return earnedTrees.filter(t => new Date(t.timestamp).toISOString().split('T')[0] === todayStr);
  }, [earnedTrees, todayStr]);

  const pastTrees = useMemo(() => {
    const grouped: Record<string, typeof earnedTrees> = {};
    earnedTrees.forEach(t => {
      const d = new Date(t.timestamp).toISOString().split('T')[0];
      if (d !== todayStr) {
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(t);
      }
    });
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
  }, [earnedTrees, todayStr]);

  const totalPointsToday = todayTrees.reduce((acc, t) => acc + t.stages, 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-y-auto custom-scrollbar p-6 md:p-12 relative pb-24">
      {/* Immersive Background Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-emerald-600/5 blur-[150px] pointer-events-none -z-0"></div>

      <div className="max-w-5xl w-full mx-auto space-y-12 relative z-10">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
              <div className="p-3 bg-emerald-500/10 rounded-3xl border border-emerald-500/20"><Leaf size={32} className="text-emerald-500" /></div> Focus Forest
            </h1>
            <p className="text-neutral-500 text-sm font-medium tracking-wide">Every minute of focus breathes life into your landscape.</p>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="group flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-2xl border border-white/5 transition-all shadow-xl active:scale-95"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-bold uppercase tracking-widest text-[11px]">Back to Desk</span>
          </button>
        </div>

        {/* Highlight Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/[0.03] border border-white/5 p-8 rounded-[40px] flex flex-col gap-2 shadow-2xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors"></div>
             <span className="text-[11px] font-black uppercase text-emerald-500 tracking-[0.2em] flex items-center gap-2"><Leaf size={14} /> Grown Today</span>
             <span className="text-4xl font-black text-white leading-none">{todayTrees.length} <span className="text-xs font-bold text-neutral-600 uppercase tracking-widest ml-1">Varieties</span></span>
          </div>
          <div className="bg-white/[0.03] border border-white/5 p-8 rounded-[40px] flex flex-col gap-2 shadow-2xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors"></div>
             <span className="text-[11px] font-black uppercase text-indigo-500 tracking-[0.2em] flex items-center gap-2"><Sparkles size={14} /> Growth Points</span>
             <span className="text-4xl font-black text-white leading-none">{totalPointsToday} <span className="text-xs font-bold text-neutral-600 uppercase tracking-widest ml-1">Stages</span></span>
          </div>
          <div className="bg-white/[0.03] border border-white/5 p-8 rounded-[40px] flex flex-col gap-2 shadow-2xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-colors"></div>
             <span className="text-[11px] font-black uppercase text-amber-500 tracking-[0.2em] flex items-center gap-2"><Trophy size={14} /> Total Forest</span>
             <span className="text-4xl font-black text-white leading-none">{earnedTrees.length} <span className="text-xs font-bold text-neutral-600 uppercase tracking-widest ml-1">Lifetime</span></span>
          </div>
        </div>

        {/* Today's Landscape Visualization */}
        <div className="space-y-8">
          <div className="flex items-center justify-between px-4">
            <h2 className="text-lg font-black uppercase text-white tracking-[0.2em] flex items-center gap-3">
              <Calendar size={20} className="text-neutral-500" /> Current Landscape
            </h2>
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2 text-[10px] font-black uppercase text-neutral-500 tracking-widest"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40"></div> Normal Growth</div>
               <div className="flex items-center gap-2 text-[10px] font-black uppercase text-neutral-500 tracking-widest"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500/40"></div> Focus Bonus</div>
            </div>
          </div>

          <div className="bg-[#0f0f0f] border border-white/5 rounded-[64px] p-12 min-h-[480px] relative overflow-hidden shadow-inner group">
            {/* Grid for Tree Slots */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-8 relative z-10">
              {todayTrees.length > 0 ? (
                todayTrees.map(t => (
                  <div key={t.id} className="flex flex-col items-center gap-4 group/tree animate-in zoom-in duration-700">
                    <div className={`w-16 h-24 rounded-[28px] flex items-end justify-center pb-4 relative transition-all group-hover/tree:-translate-y-2 shadow-[0_10px_20px_rgba(0,0,0,0.3)]
                      ${t.duration === 1 ? 'bg-indigo-500/10 border border-indigo-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}
                    `}>
                      {/* Tree Height Placeholder based on stages */}
                      <div className={`w-2.5 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.3)]`} 
                           style={{ 
                             height: `${(t.stages / 4) * 100}%`,
                             backgroundColor: t.duration === 1 ? '#818cf8' : '#10b981' 
                           }}>
                      </div>
                      {/* Growth Level Badge */}
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center border border-white/10 text-[9px] font-black text-white backdrop-blur-md">
                        {t.stages}
                      </div>
                    </div>
                    <span className="text-[9px] font-black uppercase text-neutral-600 tracking-[0.2em] text-center max-w-full truncate">{t.treeId}</span>
                  </div>
                ))
              ) : (
                <div className="col-span-full h-[360px] flex flex-col items-center justify-center text-center space-y-5 opacity-40">
                  <div className="p-8 bg-white/5 rounded-full border border-dashed border-white/10"><Leaf size={64} className="text-neutral-500" /></div>
                  <div className="space-y-1">
                      <p className="text-xl font-black uppercase tracking-[0.3em] text-white">Land is Empty</p>
                      <p className="text-xs font-medium text-neutral-500">Your efforts have yet to take root today.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Ground / Horizon Decorative Overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white/[0.03] to-transparent border-t border-white/[0.04]"></div>
          </div>
        </div>

        {/* History Feed */}
        <div className="space-y-8">
          <h2 className="text-lg font-black uppercase text-white tracking-[0.2em] px-4">Historical Growth</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {pastTrees.length > 0 ? (
               pastTrees.map(([date, trees]) => (
                 <div key={date} className="bg-white/[0.02] border border-white/[0.04] p-6 rounded-[32px] flex items-center justify-between group hover:bg-white/[0.04] hover:border-white/10 transition-all shadow-lg">
                    <div className="flex items-center gap-6">
                       <div className="flex flex-col">
                         <span className="text-sm font-black text-white">{new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                         <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-1">{trees.length} Trees Successfully Grown</span>
                       </div>
                       <div className="hidden sm:flex -space-x-4">
                          {trees.slice(0, 4).map((t, i) => (
                            <div key={t.id} className="w-10 h-10 rounded-full bg-neutral-900 border-2 border-[#0a0a0a] flex items-center justify-center overflow-hidden shadow-lg" style={{ zIndex: 10 - i }}>
                               <Leaf size={14} className="text-emerald-500 opacity-40" />
                            </div>
                          ))}
                          {trees.length > 4 && <div className="w-10 h-10 rounded-full bg-neutral-800 border-2 border-[#0a0a0a] flex items-center justify-center text-[10px] font-black text-neutral-400 z-0">+{trees.length - 4}</div>}
                       </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                          {trees.reduce((acc, curr) => acc + curr.stages, 0)} Pts
                        </div>
                        <ChevronRight size={20} className="text-neutral-700 group-hover:text-white transition-colors" />
                    </div>
                 </div>
               ))
             ) : (
               <div className="col-span-full py-16 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-[40px]">
                 <p className="text-[11px] font-black uppercase text-neutral-700 tracking-[0.3em]">No records in the archives</p>
               </div>
             )}
          </div>
        </div>

      </div>
    </div>
  );
};

const ArrowLeft = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
);
