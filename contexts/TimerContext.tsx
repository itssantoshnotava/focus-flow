import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { TimerMode, StudySession } from '../types';
import { useAuth } from './AuthContext';
import { ref, update, get, push, set } from "firebase/database";
import { database } from "../firebase";

interface TimerContextType {
  mode: TimerMode;
  setMode: (mode: TimerMode) => void;
  isActive: boolean;
  toggleTimer: () => void;
  resetTimer: () => void;
  seconds: number;
  initialTime: number;
  dailyTotal: number;
  sessions: StudySession[];
  customMinutes: number;
  setCustomMinutes: (m: number) => void;
  setSeconds: (s: number) => void;
  setInitialTime: (t: number) => void;
}

const TimerContext = createContext<TimerContextType | null>(null);

export const useTimer = () => {
  const context = useContext(TimerContext);
  if (!context) throw new Error('useTimer must be used within a TimerProvider');
  return context;
};

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isGuest } = useAuth();

  // --- State Initialization (Load from LocalStorage) ---
  const [mode, setModeState] = useState<TimerMode>(() => {
    const saved = localStorage.getItem('focusflow_timer_mode');
    return (saved as TimerMode) || TimerMode.STOPWATCH;
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

  const intervalRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  // --- Streak Logic ---
  const calculateStreak = useCallback((sessionList: StudySession[]) => {
    const STREAK_THRESHOLD = 30 * 60; // 30 minutes in seconds
    
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
        if (Math.round(diff) === 1) {
          currentCount++;
        } else {
          currentCount = 1;
        }
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
        if (Math.round(diff) === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    return { current: currentStreak, longest };
  }, []);

  // --- Persistence Wrappers ---
  useEffect(() => {
    localStorage.setItem('focusflow_timer_mode', mode);
    localStorage.setItem('focusflow_timer_active', String(isActive));
    localStorage.setItem('focusflow_timer_seconds', String(seconds));
    localStorage.setItem('focusflow_timer_initial', String(initialTime));
    
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('focusflow_study_data', JSON.stringify({ date: today, seconds: dailyTotal }));
    localStorage.setItem('focusflow_sessions', JSON.stringify(sessions));
  }, [mode, isActive, seconds, initialTime, dailyTotal, sessions]);

  // --- Sync Stats & Streaks to Firebase ---
  useEffect(() => {
      if (user && !isGuest) {
          const { current, longest } = calculateStreak(sessions);
          let totalSeconds = 0;
          sessions.forEach(s => totalSeconds += s.duration);
          
          update(ref(database, `users/${user.uid}`), {
              totalStudySeconds: totalSeconds,
              streak: current,
              streaks: { current, longest }
          }).catch(err => console.error("Failed to sync stats", err));
      }
  }, [sessions, user, isGuest, calculateStreak]);

  // --- Social Auto-Post Logic ---
  const postStudyUpdate = useCallback(async (duration: number, timerMode: string) => {
    if (!user || isGuest || duration < 600) return; // Minimum 10 minutes

    const mins = Math.floor(duration / 60);
    const hrs = Math.floor(mins / 60);
    const rMins = mins % 60;
    const durStr = hrs > 0 ? `${hrs}h ${rMins}m` : `${mins} min`;
    const isPomo = timerMode.toLowerCase().includes('pomodoro') || timerMode.includes('25/') || timerMode.includes('50/');
    const emoji = isPomo ? '💪🔥' : '📚⏱️';
    const text = isPomo 
        ? `${user.displayName} completed a ${durStr} Pomodoro ${emoji}`
        : `${user.displayName} studied for ${durStr} ${emoji}`;

    // Find first available group to post to (Priority: Default/Most Recent Group)
    try {
        const inboxRef = ref(database, `userInboxes/${user.uid}`);
        const snap = await get(inboxRef);
        if (snap.exists()) {
            const groups = Object.entries(snap.val())
                .filter(([_, val]: any) => val.type === 'group')
                .sort((a: any, b: any) => (b[1].lastMessageAt || 0) - (a[1].lastMessageAt || 0));
            
            if (groups.length > 0) {
                const targetGroupId = groups[0][0];
                const msgData = {
                    type: 'system',
                    text,
                    senderUid: user.uid,
                    timestamp: Date.now(),
                    system: true
                };
                
                await set(push(ref(database, `groupMessages/${targetGroupId}`)), msgData);
                await update(ref(database, `groupChats/${targetGroupId}`), { lastMessage: msgData });
            }
        }
    } catch (e) {
        console.error("Auto-post failed", e);
    }
  }, [user, isGuest]);

  // --- Session Management ---
  const saveSession = useCallback(() => {
      let duration = 0;
      let completed = false;

      if (mode === TimerMode.STOPWATCH) {
          duration = seconds;
      } else {
          duration = initialTime - seconds;
          completed = seconds <= 0;
      }

      if (duration > 10) {
          const newSession: StudySession = {
              id: crypto.randomUUID(),
              date: new Date().toISOString(),
              duration: duration,
              mode: mode,
              completed: completed
          };
          setSessions(prev => [...prev, newSession]);
          postStudyUpdate(duration, mode);
      }
  }, [mode, seconds, initialTime, postStudyUpdate]);

  // --- Actions ---
  const setMode = (newMode: TimerMode) => {
      if (mode === newMode) return;
      setIsActive(false);
      setModeState(newMode);
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
      if (isActive || (mode !== TimerMode.STOPWATCH && seconds !== initialTime) || (mode === TimerMode.STOPWATCH && seconds > 0)) {
          saveSession();
      }
      setIsActive(false);
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

  // --- Tick Logic ---
  useEffect(() => {
      const lastSavedTime = parseInt(localStorage.getItem('focusflow_last_tick') || '0');
      const wasActive = localStorage.getItem('focusflow_timer_active') === 'true';
      if (wasActive && lastSavedTime > 0) {
          const now = Date.now();
          const diff = Math.floor((now - lastSavedTime) / 1000);
          if (diff > 0) {
              if (mode === TimerMode.STOPWATCH) {
                  setSeconds(s => s + diff);
                  setDailyTotal(d => d + diff);
              } else {
                  setSeconds(s => {
                      const next = s - diff;
                      if (next <= 0) {
                          setIsActive(false);
                          saveSession(); 
                          return 0;
                      }
                      return next;
                  });
                  setDailyTotal(d => d + diff); 
              }
          }
      }
  }, []);

  useEffect(() => {
    if (isActive) {
      intervalRef.current = window.setInterval(() => {
        const now = Date.now();
        localStorage.setItem('focusflow_last_tick', String(now));
        setSeconds(prev => {
          if (mode === TimerMode.STOPWATCH) {
            setDailyTotal(d => d + 1);
            return prev + 1;
          } else {
            if (prev <= 0) {
              setIsActive(false);
              saveSession();
              return 0;
            }
            setDailyTotal(d => d + 1);
            return prev - 1;
          }
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      localStorage.setItem('focusflow_last_tick', '0');
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActive, mode, saveSession]);

  return (
    <TimerContext.Provider value={{
      mode, setMode, isActive, toggleTimer, resetTimer,
      seconds, initialTime, dailyTotal, sessions,
      customMinutes, setCustomMinutes, setSeconds, setInitialTime
    }}>
      {children}
    </TimerContext.Provider>
  );
};