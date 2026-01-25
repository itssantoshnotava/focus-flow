import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ref, update } from "firebase/database";
import { database } from "../firebase";
import { Timer } from './Timer';
import { ExamCountdown } from './ExamCountdown';
import { SyllabusTracker } from './SyllabusTracker';
import { FriendsLeaderboard } from './FriendsLeaderboard';
import { EXAMS } from '../constants';
import { ProgressMap, StudySession, TimerMode } from '../types';
import { Trophy, Flame, CalendarClock, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Dashboard: React.FC = () => {
  const { user, isGuest } = useAuth();
  
  // --- State: Syllabus Progress ---
  const [progress, setProgress] = useState<ProgressMap>(() => {
    const saved = localStorage.getItem('focusflow_progress');
    return saved ? JSON.parse(saved) : {};
  });

  // --- State: Daily Study Time (Live) ---
  const [studyData, setStudyData] = useState<{date: string, seconds: number}>(() => {
    const saved = localStorage.getItem('focusflow_study_data');
    const today = new Date().toISOString().split('T')[0];
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.date === today) return parsed;
    }
    return { date: today, seconds: 0 };
  });

  // --- State: Session History ---
  const [sessions, setSessions] = useState<StudySession[]>(() => {
    const saved = localStorage.getItem('focusflow_sessions');
    return saved ? JSON.parse(saved) : [];
  });

  // --- Effects: Persistence ---
  useEffect(() => {
    localStorage.setItem('focusflow_progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem('focusflow_study_data', JSON.stringify(studyData));
  }, [studyData]);

  useEffect(() => {
    localStorage.setItem('focusflow_sessions', JSON.stringify(sessions));
  }, [sessions]);

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

  const handleAddStudyTime = useCallback((addedSeconds: number) => {
    const today = new Date().toISOString().split('T')[0];
    setStudyData(prev => {
      if (prev.date !== today) {
        return { date: today, seconds: addedSeconds };
      }
      return { ...prev, seconds: prev.seconds + addedSeconds };
    });
  }, []);

  const handleSessionComplete = useCallback((sessionData: { duration: number; mode: TimerMode; completed: boolean }) => {
    const newSession: StudySession = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        duration: sessionData.duration,
        mode: sessionData.mode,
        completed: sessionData.completed
    };
    setSessions(prev => [...prev, newSession]);
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

  // --- Sync Stats ---
  useEffect(() => {
    if (user && !isGuest) {
        update(ref(database, `users/${user.uid}`), {
            totalStudySeconds: stats.rawTotalSeconds
        }).catch(err => console.error("Failed to sync stats", err));
    }
  }, [user, isGuest, stats.rawTotalSeconds]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar h-full bg-neutral-950 pb-20 md:pb-0">
        <div className="max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column */}
            <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
              <Timer onAddStudyTime={handleAddStudyTime} dailyTotal={studyData.seconds} onSessionComplete={handleSessionComplete} />

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