
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { TimerMode, StudySession, TreeId, EarnedTree } from '../types';
import { useAuth } from './AuthContext';
import { ref, update, get, push, set, remove } from "firebase/database";
import { database } from "../firebase";

export enum TimerPhase {
  FOCUS = 'FOCUS',
  BREAK = 'BREAK',
}

interface TimerContextType {
  mode: TimerMode;
  setMode: (mode: TimerMode) => void;
  phase: TimerPhase;
  isActive: boolean;
  toggleTimer: () => void;
  resetTimer: () => void;
  seconds: number;
  initialTime: number;
  dailyTotal: number;
  sessions: StudySession[];
  pomodoroCount: number;
  customMinutes: number;
  setCustomMinutes: (m: number) => void;
  setSeconds: (s: number) => void;
  setInitialTime: (t: number) => void;
  // --- Forest Additions ---
  selectedTreeId: TreeId;
  setSelectedTreeId: (id: TreeId) => void;
  earnedTrees: EarnedTree[];
}

const TimerContext = createContext<TimerContextType | null>(null);

export const useTimer = () => {
  const context = useContext(TimerContext);
  if (!context) throw new Error('useTimer must be used within a TimerProvider');
  return context;
};

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [mode, setModeState] = useState<TimerMode>(() => {
    const saved = localStorage.getItem('focusflow_timer_mode');
    return (saved as TimerMode) || TimerMode.STOPWATCH;
  });

  const [phase, setPhase] = useState<TimerPhase>(() => {
    const saved = localStorage.getItem('focusflow_timer_phase');
    return (saved as TimerPhase) || TimerPhase.FOCUS;
  });

  const [pomodoroCount, setPomodoroCount] = useState(() => {
    return parseInt(localStorage.getItem('focusflow_pomo_count') || '0');
  });

  const [isActive, setIsActive] = useState(() => {
    return localStorage.getItem('focusflow_timer_active') === 'true';
  });

  const [seconds, setSeconds] = useState(() => {
    return parseInt(localStorage.getItem('focusflow_timer_seconds') || '0');
  });

  const [initialTime, setInitialTime] = useState(() => {
    return parseInt(localStorage.getItem('focusflow_timer_initial') || '0');
  });

  const [customMinutes, setCustomMinutes] = useState(25);

  const [dailyTotal, setDailyTotal] = useState(() => {
    const saved = localStorage.getItem('focusflow_study_data');
    const today = new Date().toISOString().split('T')[0];
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.date === today) return parsed.seconds;
    }
    return 0;
  });

  const [sessions, setSessions] = useState<StudySession[]>(() => {
    const saved = localStorage.getItem('focusflow_sessions');
    return saved ? JSON.parse(saved) : [];
  });

  // --- FOREST STATE ---
  const [selectedTreeId, setSelectedTreeId] = useState<TreeId>(() => {
    return (localStorage.getItem('focusflow_selected_tree') as TreeId) || 'sprout';
  });

  const [earnedTrees, setEarnedTrees] = useState<EarnedTree[]>(() => {
    const saved = localStorage.getItem('focusflow_earned_trees');
    return saved ? JSON.parse(saved) : [];
  });

  const intervalRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  // --- SIGNALS SYNC LOGIC ---
  useEffect(() => {
    if (!user) return;

    const signalRef = ref(database, `signals/${user.uid}`);
    
    if (isActive) {
      let text = "Focusing 📚";
      let statusType = "focus";
      
      if (mode === TimerMode.POMODORO) {
        text = phase === TimerPhase.FOCUS ? "Studying 🧠" : "Break ☕";
        statusType = phase === TimerPhase.FOCUS ? "pomodoro" : "break";
      } else if (mode === TimerMode.COUNTDOWN) {
        text = "Countdown ⏱️";
        statusType = "focus";
      } else {
        text = "Deep Focus ⚡";
        statusType = "focus";
      }

      set(signalRef, {
        text,
        type: 'auto',
        statusType,
        userUid: user.uid,
        userName: user.displayName || 'User',
        photoURL: user.photoURL || null,
        timestamp: Date.now(),
        targetTimestamp: mode !== TimerMode.STOPWATCH ? Date.now() + (seconds * 1000) : null,
        expiresAt: Date.now() + 7200000, 
        isActive: true
      });
    } else {
      get(signalRef).then(snap => {
        if (snap.exists() && snap.val().type === 'auto') {
          update(signalRef, {
            isActive: false,
            targetTimestamp: null,
            expiresAt: Date.now() + 7200000 // Persist for 2 hours post-session
          });
        }
      });
    }
  }, [isActive, mode, phase, user, seconds]); 

  const calculateStreak = useCallback((sessionList: StudySession[]) => {
    const STREAK_THRESHOLD = 30 * 60; 
    const dayTotals: Record<string, number> = {};
    sessionList.forEach(s => {
      const date = s.date.split('T')[0];
      dayTotals[date] = (dayTotals[date] || 0) + s.duration;
    });

    const activeDays = Object.keys(dayTotals)
      .filter(date => dayTotals[date] >= STREAK_THRESHOLD)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    if (activeDays.length === 0) return { current: 0, longest: 0 };

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let longest = 0;
    let currentCount = 0;
    const sortedAsc = [...activeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    if (sortedAsc.length > 0) {
      currentCount = 1;
      longest = 1;
      for (let i = 1; i < sortedAsc.length; i++) {
        const prev = new Date(sortedAsc[i - 1]);
        const curr = new Date(sortedAsc[i]);
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (Math.round(diff) === 1) currentCount++;
        else currentCount = 1;
        longest = Math.max(longest, currentCount);
      }
    }

    let currentStreak = 0;
    if (activeDays[0] === today || activeDays[0] === yesterday) {
      currentStreak = 1;
      for (let i = 1; i < activeDays.length; i++) {
        const curr = new Date(activeDays[i - 1]);
        const prev = new Date(activeDays[i]);
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (Math.round(diff) === 1) currentStreak++;
        else break;
      }
    }
    return { current: currentStreak, longest };
  }, []);

  useEffect(() => {
    localStorage.setItem('focusflow_timer_mode', mode);
    localStorage.setItem('focusflow_timer_phase', phase);
    localStorage.setItem('focusflow_pomo_count', String(pomodoroCount));
    localStorage.setItem('focusflow_timer_active', String(isActive));
    localStorage.setItem('focusflow_timer_seconds', String(seconds));
    localStorage.setItem('focusflow_timer_initial', String(initialTime));
    localStorage.setItem('focusflow_selected_tree', selectedTreeId);
    localStorage.setItem('focusflow_earned_trees', JSON.stringify(earnedTrees));
    
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('focusflow_study_data', JSON.stringify({ date: today, seconds: dailyTotal }));
    localStorage.setItem('focusflow_sessions', JSON.stringify(sessions));
  }, [mode, phase, pomodoroCount, isActive, seconds, initialTime, dailyTotal, sessions, selectedTreeId, earnedTrees]);

  useEffect(() => {
      if (user) {
          const { current, longest } = calculateStreak(sessions);
          let totalSeconds = 0;
          sessions.forEach(s => totalSeconds += s.duration);
          
          update(ref(database, `users/${user.uid}`), {
              totalStudySeconds: totalSeconds,
              streak: current,
              streaks: { current, longest }
          }).catch(err => console.error("Failed to sync stats", err));

          // Sync earned trees to DB
          update(ref(database, `forest/${user.uid}`), {
            trees: earnedTrees
          }).catch(err => console.error("Failed to sync forest", err));
      }
  }, [sessions, user, calculateStreak, earnedTrees]);

  const postStudyUpdate = useCallback(async (duration: number, timerMode: string) => {
    if (!user || duration < 600) return;

    const mins = Math.floor(duration / 60);
    const hrs = Math.floor(mins / 60);
    const rMins = mins % 60;
    const durStr = hrs > 0 ? `${hrs}h ${rMins}m` : `${mins} min`;
    const isPomo = timerMode === TimerMode.POMODORO;
    const emoji = isPomo ? '💪🔥' : '📚⏱️';
    const text = isPomo 
        ? `${user.displayName} completed a ${durStr} Pomodoro ${emoji}`
        : `${user.displayName} studied for ${durStr} ${emoji}`;

    try {
        const inboxRef = ref(database, `userInboxes/${user.uid}`);
        const snap = await get(inboxRef);
        if (snap.exists()) {
            const groups = Object.entries(snap.val())
                .filter(([_, val]: any) => val.type === 'group')
                .sort((a: any, b: any) => (b[1].lastMessageAt || 0) - (a[1].lastMessageAt || 0));
            
            if (groups.length > 0) {
                const targetGroupId = groups[0][0];
                const msgData = { type: 'system', text, senderUid: user.uid, timestamp: Date.now(), system: true };
                await set(push(ref(database, `groupMessages/${targetGroupId}`)), msgData);
                await update(ref(database, `groupChats/${targetGroupId}`), { lastMessage: msgData });
            }
        }
    } catch (e) { console.error("Auto-post failed", e); }
  }, [user]);

  const recordTreeGrowth = useCallback((duration: number) => {
    const stages = Math.floor(duration / (25 * 60));
    if (stages >= 1) {
      const newTree: EarnedTree = {
        id: crypto.randomUUID(),
        treeId: selectedTreeId,
        timestamp: Date.now(),
        stages: Math.min(stages, 4), // Max stage 4
        duration
      };
      setEarnedTrees(prev => [...prev, newTree]);

      // Daily Bonus Logic
      const today = new Date().toISOString().split('T')[0];
      const todayTotalFocus = dailyTotal + duration;
      const alreadyEarnedBonus = earnedTrees.some(t => {
          const d = new Date(t.timestamp).toISOString().split('T')[0];
          return d === today && t.treeId === 'sprout' && t.duration === 1; // Mark bonus uniquely
      });

      if (todayTotalFocus >= 120 * 60 && !alreadyEarnedBonus) {
          const bonusTree: EarnedTree = {
              id: crypto.randomUUID(),
              treeId: 'sprout',
              timestamp: Date.now(),
              stages: 4,
              duration: 1 // Flag as bonus
          };
          setEarnedTrees(prev => [...prev, bonusTree]);
      }
    }
  }, [selectedTreeId, dailyTotal, earnedTrees]);

  const saveSession = useCallback((forceDuration?: number) => {
      let duration = forceDuration !== undefined ? forceDuration : 0;
      let completed = false;

      if (forceDuration === undefined) {
          if (mode === TimerMode.STOPWATCH) {
              duration = seconds;
          } else {
              duration = initialTime - seconds;
              completed = seconds <= 0;
          }
      }

      if (duration > 10 && (mode !== TimerMode.POMODORO || phase === TimerPhase.FOCUS)) {
          const newSession: StudySession = {
              id: crypto.randomUUID(),
              date: new Date().toISOString(),
              duration: duration,
              mode: mode,
              completed: completed
          };
          setSessions(prev => [...prev, newSession]);
          recordTreeGrowth(duration);
          postStudyUpdate(duration, mode);
      }
  }, [mode, phase, seconds, initialTime, postStudyUpdate, recordTreeGrowth]);

  const handlePhaseTransition = useCallback(() => {
    if (mode !== TimerMode.POMODORO) return;

    if (phase === TimerPhase.FOCUS) {
      saveSession(initialTime);
      setPomodoroCount(c => c + 1);
      setPhase(TimerPhase.BREAK);
      setSeconds(5 * 60);
      setInitialTime(5 * 60);
    } else {
      setPhase(TimerPhase.FOCUS);
      setSeconds(25 * 60);
      setInitialTime(25 * 60);
    }
  }, [mode, phase, initialTime, saveSession]);

  const setMode = (newMode: TimerMode) => {
      if (mode === newMode) return;
      setIsActive(false);
      setModeState(newMode);
      setPhase(TimerPhase.FOCUS);
      if (newMode === TimerMode.STOPWATCH) {
          setSeconds(0);
          setInitialTime(0);
      } else if (newMode === TimerMode.POMODORO) {
          setSeconds(25 * 60);
          setInitialTime(25 * 60);
      } else {
          setSeconds(customMinutes * 60);
          setInitialTime(customMinutes * 60);
      }
  };

  const toggleTimer = () => {
      setIsActive(!isActive);
      lastTickRef.current = Date.now();
  };

  const resetTimer = () => {
      if (isActive || (mode === TimerMode.STOPWATCH && seconds > 0) || (mode !== TimerMode.STOPWATCH && seconds !== initialTime)) {
          saveSession();
      }
      setIsActive(false);
      setPhase(TimerPhase.FOCUS);
      if (mode === TimerMode.STOPWATCH) {
          setSeconds(0);
      } else if (mode === TimerMode.POMODORO) {
          setSeconds(25 * 60);
          setInitialTime(25 * 60);
      } else {
          setSeconds(customMinutes * 60);
          setInitialTime(customMinutes * 60);
      }
  };

  useEffect(() => {
    if (isActive) {
      intervalRef.current = window.setInterval(() => {
        setSeconds(prev => {
          if (mode === TimerMode.STOPWATCH) {
            setDailyTotal(d => d + 1);
            return prev + 1;
          } else {
            if (prev <= 1) {
              setTimeout(handlePhaseTransition, 0);
              return 0;
            }
            if (mode === TimerMode.POMODORO && phase === TimerPhase.FOCUS) {
              setDailyTotal(d => d + 1);
            } else if (mode === TimerMode.COUNTDOWN) {
              setDailyTotal(d => d + 1);
            }
            return prev - 1;
          }
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActive, mode, phase, handlePhaseTransition]);

  return (
    <TimerContext.Provider value={{
      mode, setMode, phase, isActive, toggleTimer, resetTimer,
      seconds, initialTime, dailyTotal, sessions, pomodoroCount,
      customMinutes, setCustomMinutes, setSeconds, setInitialTime,
      selectedTreeId, setSelectedTreeId, earnedTrees
    }}>
      {children}
    </TimerContext.Provider>
  );
};
