"use client";

import React, { useState, useEffect } from 'react';
import { ref, set } from "firebase/database";
import { database } from "./firebase";
import { Timer } from './components/Timer';
import { ExamCountdown } from './components/ExamCountdown';
import { SyllabusTracker } from './components/SyllabusTracker';
import { EXAMS } from './constants';
import { ProgressMap } from './types';
import { LayoutDashboard } from 'lucide-react';

const App: React.FC = () => {
  // --- State: Syllabus Progress ---
  const [progress, setProgress] = useState<ProgressMap>(() => {
    const saved = localStorage.getItem('focusflow_progress');
    return saved ? JSON.parse(saved) : {};
  });

  // --- State: Daily Study Time ---
  // Keyed by date string YYYY-MM-DD to reset daily
  const [studyData, setStudyData] = useState<{date: string, seconds: number}>(() => {
    const saved = localStorage.getItem('focusflow_study_data');
    const today = new Date().toISOString().split('T')[0];
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.date === today) return parsed;
    }
    return { date: today, seconds: 0 };
  });

  // --- Effects: Firebase Test ---
  useEffect(() => {
    set(ref(database, "ping"), {
      status: "connected",
      time: Date.now()
    });
  }, []);

  // --- Effects: Persistence ---
  useEffect(() => {
    localStorage.setItem('focusflow_progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem('focusflow_study_data', JSON.stringify(studyData));
  }, [studyData]);

  // --- Handlers ---
  const handleToggleProgress = (examId: string, subjectId: string, chapterId: string, type: 'completed' | 'pyqs') => {
    const key = `${examId}-${subjectId}-${chapterId}`;
    setProgress(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [type]: !prev[key]?.[type]
      }
    }));
  };

  const handleAddStudyTime = (addedSeconds: number) => {
    const today = new Date().toISOString().split('T')[0];
    setStudyData(prev => {
      if (prev.date !== today) {
        return { date: today, seconds: addedSeconds };
      }
      return { ...prev, seconds: prev.seconds + addedSeconds };
    });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-indigo-500/30">
      
      {/* Top Navigation / Brand */}
      <header className="border-b border-neutral-900/80 bg-neutral-950/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/20">
                <LayoutDashboard size={18} className="text-white" />
             </div>
             <h1 className="font-bold text-xl tracking-tight text-white">FocusFlow</h1>
          </div>
          <div className="text-xs text-neutral-500 font-mono hidden sm:block">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Timer & Countdowns */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
            
            {/* Timer Widget */}
            <Timer 
              onAddStudyTime={handleAddStudyTime} 
              dailyTotal={studyData.seconds} 
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

export default App;
