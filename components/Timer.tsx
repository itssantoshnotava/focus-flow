import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TimerMode } from '../types';
import { Play, Pause, RotateCcw, Clock, Watch, Hourglass } from 'lucide-react';

interface TimerProps {
  onAddStudyTime: (seconds: number) => void;
  dailyTotal: number;
}

export const Timer: React.FC<TimerProps> = ({ onAddStudyTime, dailyTotal }) => {
  const [mode, setMode] = useState<TimerMode>(TimerMode.STOPWATCH);
  const [isActive, setIsActive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [initialTime, setInitialTime] = useState(0); // For countdown/pomodoro reference
  
  // For Pomodoro/Countdown input
  const [customMinutes, setCustomMinutes] = useState(25);

  const intervalRef = useRef<number | null>(null);

  const resetTimer = useCallback(() => {
    setIsActive(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    if (mode === TimerMode.STOPWATCH) {
      setSeconds(0);
    } else if (mode === TimerMode.POMODORO) {
      setSeconds(25 * 60);
      setInitialTime(25 * 60);
    } else {
      setSeconds(customMinutes * 60);
      setInitialTime(customMinutes * 60);
    }
  }, [mode, customMinutes]);

  // Handle mode switching
  useEffect(() => {
    resetTimer();
  }, [mode, resetTimer]);

  // Timer Tick
  useEffect(() => {
    if (isActive) {
      intervalRef.current = window.setInterval(() => {
        setSeconds((prev) => {
          if (mode === TimerMode.STOPWATCH) {
            onAddStudyTime(1);
            return prev + 1;
          } else {
            // Countdown modes
            if (prev <= 0) {
              setIsActive(false);
              if (intervalRef.current) clearInterval(intervalRef.current);
              return 0;
            }
            onAddStudyTime(1);
            return prev - 1;
          }
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, mode, onAddStudyTime]);

  const toggleTimer = () => setIsActive(!isActive);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDailyTotal = (totalSeconds: number) => {
    const h = (totalSeconds / 3600).toFixed(1);
    return `${h} hrs`;
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col items-center justify-between gap-6 shadow-lg relative overflow-hidden">
      
      {/* Background Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -z-0 pointer-events-none"></div>

      {/* Header */}
      <div className="w-full flex justify-between items-center z-10">
        <h2 className="text-neutral-400 text-sm font-medium uppercase tracking-wider">Study Timer</h2>
        <div className="text-emerald-400 text-xs font-mono bg-emerald-400/10 px-2 py-1 rounded">
          Today: {formatDailyTotal(dailyTotal)}
        </div>
      </div>

      {/* Timer Display */}
      <div className="flex flex-col items-center z-10">
        <div className="text-7xl font-mono font-light tracking-tighter text-white tabular-nums mb-2">
          {formatTime(seconds)}
        </div>
        
        {/* Mode Selector */}
        <div className="flex gap-2 mb-6">
          <button 
            onClick={() => setMode(TimerMode.STOPWATCH)} 
            className={`p-2 rounded-lg transition-colors ${mode === TimerMode.STOPWATCH ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
            title="Stopwatch"
          >
            <Watch size={18} />
          </button>
          <button 
            onClick={() => setMode(TimerMode.POMODORO)} 
            className={`p-2 rounded-lg transition-colors ${mode === TimerMode.POMODORO ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
            title="Pomodoro (25m)"
          >
            <Hourglass size={18} />
          </button>
          <button 
            onClick={() => setMode(TimerMode.COUNTDOWN)} 
            className={`p-2 rounded-lg transition-colors ${mode === TimerMode.COUNTDOWN ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
            title="Countdown"
          >
            <Clock size={18} />
          </button>
        </div>

        {/* Custom Input for Countdown */}
        {mode === TimerMode.COUNTDOWN && !isActive && seconds === initialTime && (
          <div className="flex items-center gap-2 mb-4">
            <input 
              type="number" 
              value={customMinutes} 
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setCustomMinutes(val);
                setSeconds(val * 60);
                setInitialTime(val * 60);
              }}
              className="bg-neutral-800 border border-neutral-700 text-white px-3 py-1 rounded w-20 text-center focus:outline-none focus:border-indigo-500"
            />
            <span className="text-neutral-500 text-sm">min</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-4 z-10 w-full max-w-xs justify-center">
        <button 
          onClick={toggleTimer}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${
            isActive 
              ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' 
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/20'
          }`}
        >
          {isActive ? <><Pause size={20} /> Pause</> : <><Play size={20} /> Start</>}
        </button>
        <button 
          onClick={resetTimer}
          className="p-3 bg-neutral-800 text-neutral-400 rounded-lg hover:bg-neutral-700 hover:text-white transition-colors"
          title="Reset"
        >
          <RotateCcw size={20} />
        </button>
      </div>
    </div>
  );
};
