import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { ExamSession } from '../types';

interface ExamCountdownProps {
  name: string;
  date: string | null;
  sessions?: ExamSession[];
}

export const ExamCountdown: React.FC<ExamCountdownProps> = ({ name, date, sessions }) => {
  const [sessionIndex, setSessionIndex] = useState(0);
  
  const hasSessions = sessions && sessions.length > 0;
  const targetDate = hasSessions ? sessions![sessionIndex].date : date;
  const currentSessionLabel = hasSessions ? sessions![sessionIndex].label : null;

  const [timeLeft, setTimeLeft] = useState<{days: number, hours: number, minutes: number} | null>(null);

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const difference = new Date(targetDate).getTime() - new Date().getTime();
      
      if (difference > 0) {
        return {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
        };
      }
      return { days: 0, hours: 0, minutes: 0 };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 60000); // Update every minute is enough for D/H/M

    return () => clearInterval(timer);
  }, [targetDate]);

  const isTBD = !targetDate;

  const toggleSession = (e: React.MouseEvent) => {
    e.preventDefault();
    if (hasSessions) {
      setSessionIndex((prev) => (prev + 1) % sessions!.length);
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl flex flex-col justify-between h-full min-h-[140px] relative overflow-hidden group hover:border-neutral-700 transition-colors">
      <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-full blur-2xl -mr-8 -mt-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
      
      <div className="flex justify-between items-start mb-2">
        <div className="flex flex-col items-start gap-1">
            <h3 className="font-medium text-neutral-200 text-lg leading-tight">{name}</h3>
            {hasSessions && (
                <button 
                    onClick={toggleSession}
                    className="text-[10px] uppercase tracking-wider font-bold text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded hover:bg-indigo-400/20 transition-colors"
                >
                    {currentSessionLabel} <span className="opacity-50 text-[9px] ml-1">↻</span>
                </button>
            )}
        </div>
        {isTBD ? (
           <span className="text-xs bg-neutral-800 text-neutral-500 px-2 py-1 rounded">TBD</span>
        ) : (
           <Calendar size={16} className="text-neutral-500" />
        )}
      </div>

      <div className="mt-auto">
        {isTBD ? (
          <div className="text-neutral-500 text-sm italic">Date to be added</div>
        ) : (
          <div className="flex gap-3 text-center">
            <div className="flex flex-col items-start">
              <span className="text-2xl font-mono text-indigo-400 font-medium">{timeLeft?.days}</span>
              <span className="text-[10px] uppercase text-neutral-500 tracking-wide">Days</span>
            </div>
            <div className="h-8 w-[1px] bg-neutral-800 self-center"></div>
            <div className="flex flex-col items-start">
              <span className="text-2xl font-mono text-white font-medium">{timeLeft?.hours}</span>
              <span className="text-[10px] uppercase text-neutral-500 tracking-wide">Hrs</span>
            </div>
             <div className="h-8 w-[1px] bg-neutral-800 self-center"></div>
            <div className="flex flex-col items-start">
              <span className="text-2xl font-mono text-white font-medium">{timeLeft?.minutes}</span>
              <span className="text-[10px] uppercase text-neutral-500 tracking-wide">Mins</span>
            </div>
          </div>
        )}
      </div>
      
      {targetDate && (
        <div className="mt-2 text-xs text-neutral-600 font-mono">
            Target: {new Date(targetDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </div>
      )}
    </div>
  );
};