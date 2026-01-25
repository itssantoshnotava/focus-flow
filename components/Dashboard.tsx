import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Timer } from './Timer';
import { ExamCountdown } from './ExamCountdown';
import { SyllabusTracker } from './SyllabusTracker';
import { FriendsLeaderboard } from './FriendsLeaderboard';
import { EXAMS } from '../constants';
import { ProgressMap } from '../types';
import { Trophy, Flame, CalendarClock, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTimer } from '../contexts/TimerContext';

export const Dashboard: React.FC = () => {
  const { user, isGuest } = useAuth();
  const { sessions } = useTimer();
  
  // --- State: Syllabus Progress ---
  const [progress, setProgress] = useState<ProgressMap>(() => {
    const saved = localStorage.getItem('focusflow_progress');
    return saved ? JSON.parse(saved) : {};
  });

  // --- Effects: Persistence ---
  useEffect(() => {
    localStorage.setItem('focusflow_progress', JSON.stringify(progress));
  }, [progress]);

  // --- Handlers ---
  const handleToggleProgress = useCallback((examId: string, subjectId: string, chapterId: string, type: 'completed' | 'pyqs') => {
    const key = `${examId}-${subjectId}-${chapterId}`;
    setProgress(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [type]: !prev[key]?.[type]
      }
    }));
  }, []);

  // --- Stats Calculation ---
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalSeconds = 0;
    let todaySeconds = 0;
    let weekSeconds = 0;
    let pomodoros = 0;

    sessions.forEach(s => {
        if (s.duration < 10) return;
        totalSeconds += s.duration;
        const sDate = s.date.split('T')[0];
        if (sDate === todayStr) todaySeconds += s.duration;
        if (new Date(s.date) >= oneWeekAgo) weekSeconds += s.duration;
        const isPomodoroMode = s.mode === 'POMODORO' || s.mode === '25/5' || s.mode === '50/10';
        if (isPomodoroMode && s.completed) pomodoros++;
    });

    return {
        rawTotalSeconds: totalSeconds,
        totalHours: (totalSeconds / 3600).toFixed(1),
        todayHours: (todaySeconds / 3600).toFixed(1),
        weekHours: (weekSeconds / 3600).toFixed(1),
        pomodoros
    };
  }, [sessions]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar h-full bg-neutral-950 pb-20 md:pb-0">
        <div className="max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column */}
            <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
              <Timer />

              <div className="grid grid-cols-2 gap-3">
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5"><Flame size={12} className="text-orange-500" /> Today</span>
                      <span className="text-2xl font-mono text-white">{stats.todayHours} <span className="text-xs text-neutral-600">hrs</span></span>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5"><CalendarClock size={12} className="text-blue-500" /> Week</span>
                      <span className="text-2xl font-mono text-white">{stats.weekHours} <span className="text-xs text-neutral-600">hrs</span></span>
                  </div>
                   <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5"><Clock size={12} className="text-emerald-500" /> Total</span>
                      <span className="text-2xl font-mono text-white">{stats.totalHours} <span className="text-xs text-neutral-600">hrs</span></span>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5"><Trophy size={12} className="text-yellow-500" /> Pomodoros</span>
                      <span className="text-2xl font-mono text-white">{stats.pomodoros}</span>
                  </div>
              </div>

              {!isGuest && <FriendsLeaderboard />}
            </div>

            {/* Right Column */}
            <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                 {EXAMS.map(exam => (
                   <ExamCountdown key={exam.id} name={exam.name} date={exam.date} sessions={exam.sessions} />
                 ))}
              </div>
              <div className="flex-1 min-h-[300px]">
                <SyllabusTracker exams={EXAMS} progress={progress} onToggleProgress={handleToggleProgress} />
              </div>
            </div>

          </div>
        </div>
    </div>
  );
};