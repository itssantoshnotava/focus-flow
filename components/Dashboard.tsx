import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Timer } from './Timer';
import { ExamCountdown } from './ExamCountdown';
import { SyllabusTracker } from './SyllabusTracker';
import { FriendsLeaderboard } from './FriendsLeaderboard';
import { EXAMS, getSubjectById } from '../constants';
import { ProgressMap, Exam, UserProfile, StudySession } from '../types';
import { Trophy, Flame, CalendarClock, Clock, Share2, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTimer } from '../contexts/TimerContext';
import { ref, get, push, set } from 'firebase/database';
import { database } from '../firebase';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { sessions } = useTimer();
  const navigate = useNavigate();
  
  const [progress, setProgress] = useState<ProgressMap>(() => {
    const saved = localStorage.getItem('focusflow_progress');
    return saved ? JSON.parse(saved) : {};
  });

  const [userProfile, setUserProfile] = useState<any>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    localStorage.setItem('focusflow_progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
      if (user) {
          get(ref(database, `users/${user.uid}`)).then(snap => {
              if (snap.exists()) setUserProfile(snap.val());
          });
      }
  }, [user, sessions]);

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
        todaySeconds,
        totalHours: (totalSeconds / 3600).toFixed(1),
        todayHours: (todaySeconds / 3600).toFixed(1),
        weekHours: (weekSeconds / 3600).toFixed(1),
        pomodoros,
        streak: userProfile?.streaks?.current || 0
    };
  }, [sessions, userProfile]);

  const handleShareSession = async () => {
      if (!user || stats.todaySeconds < 60) return;
      setSharing(true);
      try {
          const postRef = push(ref(database, 'posts'));
          await set(postRef, {
              authorUid: user.uid,
              authorName: user.displayName,
              authorPhoto: user.photoURL,
              type: 'session',
              content: `Just finished my study session! Feeling productive today. 🧠🔥`,
              timestamp: Date.now(),
              sessionData: {
                  duration: stats.todaySeconds,
                  mode: 'Deep Work',
              }
          });
          navigate('/pulse');
      } finally {
          setSharing(false);
      }
  };

  const filteredExams = useMemo(() => {
      if (!userProfile) return EXAMS;
      const { stream, selectedExams, selectedSubjects } = userProfile;
      const allExams = [...EXAMS];
      if (stream === 'Commerce') {
          return [{
              id: 'boards-commerce',
              name: 'Class 12 Boards (Commerce)',
              date: '2026-02-20',
              subjects: (selectedSubjects || []).map(sid => getSubjectById(sid))
          }];
      }
      if (stream === 'IIT') return allExams.filter(e => ['boards', 'jee', 'bitsat', 'viteee'].includes(e.id));
      if (stream === 'PCM') {
          const allowedIds = new Set(['boards', ...(selectedExams || [])]);
          return allExams.filter(e => allowedIds.has(e.id));
      }
      return allExams;
  }, [userProfile]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar h-full bg-neutral-950 pb-20 md:pb-0">
        <div className="max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
              <Timer />

              <button 
                onClick={handleShareSession}
                disabled={sharing || stats.todaySeconds < 60}
                className="w-full bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 p-4 rounded-xl border border-indigo-500/20 flex items-center justify-between group transition-all disabled:opacity-30"
              >
                  <div className="flex items-center gap-3">
                      <Zap size={20} className="group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-bold">Pulse Today's Work</span>
                  </div>
                  <Share2 size={16} />
              </button>

              <div className="grid grid-cols-2 gap-3">
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1 group hover:border-orange-500/30 transition-colors">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5"><Flame size={12} className="text-orange-500 animate-fire-flicker" /> Streak</span>
                      <span className="text-2xl font-mono text-white">{stats.streak} <span className="text-xs text-neutral-600 font-sans">days</span></span>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5"><Trophy size={12} className="text-yellow-500" /> Pomos</span>
                      <span className="text-2xl font-mono text-white">{stats.pomodoros}</span>
                  </div>
                   <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5"><CalendarClock size={12} className="text-blue-500" /> Week</span>
                      <span className="text-2xl font-mono text-white">{stats.weekHours} <span className="text-xs text-neutral-600 font-sans">h</span></span>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5"><Clock size={12} className="text-emerald-500" /> Total</span>
                      <span className="text-2xl font-mono text-white">{stats.totalHours} <span className="text-xs text-neutral-600 font-sans">h</span></span>
                  </div>
              </div>

              <FriendsLeaderboard />
            </div>

            <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                 {filteredExams.map(exam => (
                   <ExamCountdown key={exam.id} name={exam.name} date={exam.date} sessions={exam.sessions} />
                 ))}
              </div>
              <div className="flex-1 min-h-[300px]">
                <SyllabusTracker exams={filteredExams} progress={progress} onToggleProgress={handleToggleProgress} />
              </div>
            </div>

          </div>
        </div>
    </div>
  );
};