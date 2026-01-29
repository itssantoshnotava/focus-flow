
import React, { useMemo } from 'react';
import { useTimer } from '../contexts/TimerContext';
import { Leaf, Calendar, ChevronLeft, ChevronRight, Info } from 'lucide-react';
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

  const totalStagesToday = todayTrees.reduce((acc, t) => acc + t.stages, 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-y-auto custom-scrollbar p-6 md:p-12 relative">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-600/5 blur-[120px] pointer-events-none -z-0"></div>

      <div className="max-w-4xl w-full mx-auto space-y-10 relative z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <Leaf size={32} className="text-emerald-500" /> My Forest
            </h1>
            <p className="text-neutral-500 text-sm font-medium">Visualization of your deep work efforts.</p>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="p-3 bg-white/5 hover:bg-white/10 text-neutral-400 rounded-2xl border border-white/5 transition-all"
          >
            Back to Desk
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/[0.03] border border-white/[0.05] p-6 rounded-[32px] flex flex-col gap-1">
             <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Grown Today</span>
             <span className="text-3xl font-black text-white">{todayTrees.length} <span className="text-sm font-bold text-neutral-600 uppercase">Trees</span></span>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.05] p-6 rounded-[32px] flex flex-col gap-1">
             <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">Growth Stages</span>
             <span className="text-3xl font-black text-white">{totalStagesToday} <span className="text-sm font-bold text-neutral-600 uppercase">Points</span></span>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.05] p-6 rounded-[32px] flex flex-col gap-1">
             <span className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Total Trees</span>
             <span className="text-3xl font-black text-white">{earnedTrees.length} <span className="text-sm font-bold text-neutral-600 uppercase">Lifetime</span></span>
          </div>
        </div>

        {/* Main Forest Area (Placeholder Grid) */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-black uppercase text-neutral-400 tracking-[0.2em] flex items-center gap-2">
              <Calendar size={16} /> Today's Landscape
            </h2>
            <div className="flex items-center gap-4 text-[10px] font-black uppercase text-neutral-600">
               <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Growth</span>
               <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Bonus</span>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-[48px] p-8 min-h-[360px] relative overflow-hidden group">
            {/* Grid for "Tree Slots" */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
              {todayTrees.length > 0 ? (
                todayTrees.map(t => (
                  <div key={t.id} className="flex flex-col items-center gap-2 group/tree animate-in zoom-in duration-500">
                    <div className={`w-12 h-16 rounded-[14px] flex items-end justify-center pb-2 relative transition-all group-hover/tree:scale-110 shadow-lg
                      ${t.duration === 1 ? 'bg-indigo-500/20 border border-indigo-500/40' : 'bg-emerald-500/10 border border-emerald-500/30'}
                    `}>
                      {/* Tree Growth Placeholder (No visual assets) */}
                      <div className={`w-full bg-current opacity-30 rounded-full transition-all`} 
                           style={{ 
                             height: `${(t.stages / 4) * 100}%`,
                             color: t.duration === 1 ? '#818cf8' : '#10b981' 
                           }}>
                      </div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-black/40 rounded-full flex items-center justify-center border border-white/10 text-[6px] font-black text-white">
                        {t.stages}
                      </div>
                    </div>
                    <span className="text-[7px] font-black uppercase text-neutral-600 tracking-widest">{t.treeId}</span>
                  </div>
                ))
              ) : (
                <div className="col-span-full h-[240px] flex flex-col items-center justify-center text-center space-y-3 opacity-30">
                  <Leaf size={48} className="text-neutral-500" />
                  <p className="text-xs font-black uppercase tracking-[0.3em]">Land is currently empty</p>
                  <p className="text-[10px] font-medium max-w-[200px] text-neutral-600">Start studying to plant your first tree of the day.</p>
                </div>
              )}
            </div>

            {/* "Ground" Placeholder Overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-white/[0.02] border-t border-white/5"></div>
          </div>
        </div>

        {/* Past History */}
        <div className="space-y-6 pb-20">
          <h2 className="text-sm font-black uppercase text-neutral-400 tracking-[0.2em] px-2">History</h2>
          <div className="space-y-3">
             {pastTrees.length > 0 ? (
               pastTrees.map(([date, trees]) => (
                 <div key={date} className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-[24px] flex items-center justify-between group hover:bg-white/[0.04] transition-all">
                    <div className="flex items-center gap-6">
                       <div className="flex flex-col">
                         <span className="text-xs font-black text-white">{new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                         <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{trees.length} Trees Grown</span>
                       </div>
                       <div className="flex -space-x-3">
                          {trees.slice(0, 5).map((t, i) => (
                            <div key={t.id} className="w-8 h-8 rounded-full bg-neutral-900 border-2 border-[#0a0a0a] flex items-center justify-center overflow-hidden" style={{ zIndex: 10 - i }}>
                               <Leaf size={12} className="text-emerald-500 opacity-50" />
                            </div>
                          ))}
                          {trees.length > 5 && <div className="w-8 h-8 rounded-full bg-neutral-800 border-2 border-[#0a0a0a] flex items-center justify-center text-[8px] font-black text-neutral-400">+{trees.length - 5}</div>}
                       </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-black text-neutral-500 uppercase tracking-widest group-hover:text-white transition-colors">
                          {trees.reduce((acc, curr) => acc + curr.stages, 0)} Pts
                        </div>
                        <ChevronRight size={18} className="text-neutral-700 group-hover:text-white transition-colors" />
                    </div>
                 </div>
               ))
             ) : (
               <div className="py-12 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-[32px]">
                 <p className="text-[10px] font-black uppercase text-neutral-700 tracking-widest">No historical data found</p>
               </div>
             )}
          </div>
        </div>

      </div>
    </div>
  );
};
