import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Timer } from './Timer';
import { ExamCountdown } from './ExamCountdown';
import { SyllabusTracker } from './SyllabusTracker';
import { FriendsLeaderboard } from './FriendsLeaderboard';
import { EXAMS, getSubjectById, PE_CHAPTERS, IP_CHAPTERS } from '../constants';
import { ProgressMap, Exam, UserProfile, StudySession } from '../types';
import { Trophy, Flame, CalendarClock, Clock, Share2, Zap, HelpCircle, BookOpen, GraduationCap, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTimer } from '../contexts/TimerContext';
import { ref, get, push, set, update } from 'firebase/database';
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

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sharing, setSharing] = useState(false);

  // New State for one-time prompts
  const [showEamcetModal, setShowEamcetModal] = useState(false);
  const [showElectiveModal, setShowElectiveModal] = useState(false);

  useEffect(() => {
    localStorage.setItem('focusflow_progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
      if (user) {
          get(ref(database, `users/${user.uid}`)).then(snap => {
              if (snap.exists()) {
                  const data = snap.val() as UserProfile;
                  setUserProfile(data);

                  // Trigger Modals for existing users
                  const shouldPromptEamcet = (data.stream === 'IIT' || (data.stream === 'PCM' && data.preparingForComp)) && !data.eamcetPrompted;
                  if (shouldPromptEamcet) {
                      setShowEamcetModal(true);
                  } else if (!data.electiveSelected) {
                      setShowElectiveModal(true);
                  }
              }
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

    const streakData = (userProfile as any)?.streaks || { current: 0, longest: 0 };

    return {
        rawTotalSeconds: totalSeconds,
        todaySeconds,
        totalHours: (totalSeconds / 3600).toFixed(1),
        todayHours: (todaySeconds / 3600).toFixed(1),
        weekHours: (weekSeconds / 3600).toFixed(1),
        pomodoros,
        streak: streakData.current || 0
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
      const { stream, selectedExams, selectedSubjects, elective, preparingForComp } = userProfile;
      const allExams = [...EXAMS];
      
      let examsToReturn: Exam[] = [];

      if (stream === 'Commerce') {
          const commerceBoard: Exam = {
              id: 'boards-commerce',
              name: 'Class 12 Boards (Commerce)',
              date: '2026-02-20',
              subjects: [
                ...(selectedSubjects || []).map(sid => getSubjectById(sid)),
                elective ? getSubjectById(elective) : getSubjectById('ip')
              ]
          };
          examsToReturn = [commerceBoard];
      } else {
          const baseBoard = allExams.find(e => e.id === 'boards');
          const customizedBoard = baseBoard ? {
              ...baseBoard,
              subjects: baseBoard.subjects.map(sub => {
                  if (sub.id === 'ip' && elective === 'pe') {
                      return getSubjectById('pe');
                  }
                  return sub;
              })
          } : null;

          // Default competitive exams that should always stay for Science students preparing for entrance
          const defaultCompIds = ['jee', 'bitsat', 'viteee'];
          const userSelectedIds = selectedExams || [];

          if (stream === 'IIT' || (stream === 'PCM' && preparingForComp)) {
              // Combine defaults with user selections (like eamcet)
              const idsToShow = new Set([...defaultCompIds, ...userSelectedIds]);
              
              examsToReturn = [
                  customizedBoard,
                  ...allExams.filter(e => e.id !== 'boards' && idsToShow.has(e.id))
              ].filter((e): e is Exam => e !== null);
          } else if (stream === 'PCM') {
              // Only Boards for non-competitive PCM users
              examsToReturn = [customizedBoard].filter((e): e is Exam => e !== null);
          } else {
              // Fallback for any other state
              examsToReturn = allExams;
          }
      }
      
      // Ensure results are unique by ID
      const seen = new Set();
      return examsToReturn.filter(exam => {
          const duplicate = seen.has(exam.id);
          seen.add(exam.id);
          return !duplicate;
      });
  }, [userProfile]);

  // Handlers for Modals
  const handleEamcetChoice = async (choice: boolean) => {
      if (!user) return;
      const updates: any = { eamcetPrompted: true };
      if (choice) {
          const currentExams = userProfile?.selectedExams || [];
          if (!currentExams.includes('eamcet')) {
              updates.selectedExams = [...currentExams, 'eamcet'];
          }
      }
      await update(ref(database, `users/${user.uid}`), updates);
      setShowEamcetModal(false);
      if (!userProfile?.electiveSelected) setShowElectiveModal(true);
  };

  const handleElectiveChoice = async (elective: 'ip' | 'pe') => {
      if (!user) return;
      await update(ref(database, `users/${user.uid}`), {
          elective,
          electiveSelected: true
      });
      setShowElectiveModal(false);
  };

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

        {/* EAMCET One-time Prompt */}
        {showEamcetModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-[32px] max-w-sm w-full text-center shadow-2xl animate-in zoom-in">
                    <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <GraduationCap size={32} className="text-indigo-400" />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2">EAMCET Prep?</h2>
                    <p className="text-neutral-500 text-sm mb-8 leading-relaxed">We noticed you're preparing for entrance exams. Are you preparing for EAMCET?</p>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleEamcetChoice(true)} className="py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-900/40 active:scale-95">Yes</button>
                        <button onClick={() => handleEamcetChoice(false)} className="py-4 bg-neutral-800 text-neutral-400 hover:text-white font-bold rounded-2xl transition-all active:scale-95">No</button>
                    </div>
                </div>
            </div>
        )}

        {/* Elective One-time Prompt */}
        {showElectiveModal && !showEamcetModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-[32px] max-w-sm w-full text-center shadow-2xl animate-in zoom-in">
                    <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <BookOpen size={32} className="text-purple-400" />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2">Select Elective</h2>
                    <p className="text-neutral-500 text-sm mb-8 leading-relaxed">Choose your optional Class 12 subject to update your syllabus tracker.</p>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleElectiveChoice('ip')} className="flex flex-col items-center gap-1 py-4 bg-white/5 border border-white/10 hover:bg-indigo-500 hover:border-indigo-400 text-neutral-300 hover:text-white font-black rounded-2xl transition-all group">
                            <span className="text-lg">IP</span>
                            <span className="text-[8px] uppercase opacity-50 font-bold tracking-widest">Informatics</span>
                        </button>
                        <button onClick={() => handleElectiveChoice('pe')} className="flex flex-col items-center gap-1 py-4 bg-white/5 border border-white/10 hover:bg-emerald-600 hover:border-emerald-500 text-neutral-300 hover:text-white font-black rounded-2xl transition-all group">
                            <span className="text-lg">PE</span>
                            <span className="text-[8px] uppercase opacity-50 font-bold tracking-widest">Physical Ed</span>
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
