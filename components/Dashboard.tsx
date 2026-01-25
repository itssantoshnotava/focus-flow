import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set } from "firebase/database";
import { database } from "../firebase";
import { Timer } from './Timer';
import { ExamCountdown } from './ExamCountdown';
import { SyllabusTracker } from './SyllabusTracker';
import { FriendsSystem } from './FriendsSystem';
import { EXAMS } from '../constants';
import { ProgressMap, StudySession, TimerMode } from '../types';
import { LayoutDashboard, Users, Trophy, Flame, CalendarClock, Clock, LogOut, Shield, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, isGuest } = useAuth();
  const [showFriends, setShowFriends] = useState(false);

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

  // --- Effects: Firebase Test (Skip for guest) ---
  useEffect(() => {
    if (!isGuest) {
        set(ref(database, "ping"), {
          status: "connected",
          time: Date.now(),
          uid: user?.uid
        });
    }
  }, [isGuest, user]);

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
        // Filter out very short sessions if needed
        if (s.duration < 10) return;

        totalSeconds += s.duration;

        const sDate = s.date.split('T')[0];
        if (sDate === todayStr) {
            todaySeconds += s.duration;
        }

        if (new Date(s.date) >= oneWeekAgo) {
            weekSeconds += s.duration;
        }

        // Count completed pomodoros (Dashboard 'POMODORO' or Group '25/5'/'50/10')
        const isPomodoroMode = s.mode === 'POMODORO' || s.mode === '25/5' || s.mode === '50/10';
        if (isPomodoroMode && s.completed) {
            pomodoros++;
        }
    });

    return {
        totalHours: (totalSeconds / 3600).toFixed(1),
        todayHours: (todaySeconds / 3600).toFixed(1),
        weekHours: (weekSeconds / 3600).toFixed(1),
        pomodoros
    };
  }, [sessions]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-indigo-500/30">
      
      {/* Friends System Overlay */}
      {showFriends && <FriendsSystem onClose={() => setShowFriends(false)} />}

      {/* Top Navigation / Brand */}
      <header className="border-b border-neutral-900/80 bg-neutral-950/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/20">
                <LayoutDashboard size={18} className="text-white" />
             </div>
             <h1 className="font-bold text-xl tracking-tight text-white">FocusFlow</h1>
          </div>
          
          <div className="flex items-center gap-4">
            
            {!isGuest && (
               <button 
                  onClick={() => setShowFriends(true)}
                  className="hidden sm:flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
               >
                  <UserPlus size={14} />
                  <span>Friends</span>
               </button>
            )}

             <button 
                onClick={() => navigate('/group')}
                className="hidden sm:flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            >
                <Users size={14} />
                <span>Group Study</span>
            </button>
            
            <div className="h-6 w-[1px] bg-neutral-800 mx-1 hidden sm:block"></div>

            <div className="flex items-center gap-3">
               {isGuest && (
                 <div className="flex items-center gap-1.5 bg-neutral-800/50 border border-neutral-700/50 text-neutral-400 px-2 py-1 rounded text-xs">
                    <Shield size={10} />
                    <span>Guest Mode</span>
                 </div>
               )}
               {user?.photoURL ? (
                 <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-neutral-800" />
               ) : (
                 <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                   {user?.displayName?.charAt(0) || 'G'}
                 </div>
               )}
               <span className="text-sm font-medium text-white hidden md:block">{user?.displayName?.split(' ')[0]}</span>
               <button 
                  onClick={() => logout()}
                  className="p-1.5 text-neutral-500 hover:text-white transition-colors"
                  title={isGuest ? "Exit Guest Mode" : "Sign Out"}
               >
                 <LogOut size={16} />
               </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Stats, Timer & Countdowns */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                    <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                        <Flame size={12} className="text-orange-500" /> Today
                    </span>
                    <span className="text-2xl font-mono text-white">{stats.todayHours} <span className="text-xs text-neutral-600">hrs</span></span>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                    <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                        <CalendarClock size={12} className="text-blue-500" /> Week
                    </span>
                    <span className="text-2xl font-mono text-white">{stats.weekHours} <span className="text-xs text-neutral-600">hrs</span></span>
                </div>
                 <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                    <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                        <Clock size={12} className="text-emerald-500" /> Total
                    </span>
                    <span className="text-2xl font-mono text-white">{stats.totalHours} <span className="text-xs text-neutral-600">hrs</span></span>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                    <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                        <Trophy size={12} className="text-yellow-500" /> Pomodoros
                    </span>
                    <span className="text-2xl font-mono text-white">{stats.pomodoros}</span>
                </div>
            </div>

            {/* Timer Widget */}
            <Timer 
              onAddStudyTime={handleAddStudyTime} 
              dailyTotal={studyData.seconds} 
              onSessionComplete={handleSessionComplete}
            />

            {/* Exam Countdowns Grid */}
            <div>
               <h3 className="text-neutral-500 text-xs uppercase font-medium tracking-wider mb-3">Exam Countdowns</h3>
               <div className="grid grid-cols-2 gap-3">
                  {EXAMS.map(exam => (
                    <ExamCountdown 
                      key={exam.id} 
                      name={exam.name} 
                      date={exam.date}
                      sessions={exam.sessions}
                    />
                  ))}
               </div>
            </div>
          </div>

          {/* Right Column: Syllabus Tracker */}
          <div className="lg:col-span-7 xl:col-span-8 h-[calc(100vh-12rem)] min-h-[500px]">
            <SyllabusTracker 
              exams={EXAMS} 
              progress={progress} 
              onToggleProgress={handleToggleProgress} 
            />
          </div>

        </div>
      </main>

    </div>
  );
};