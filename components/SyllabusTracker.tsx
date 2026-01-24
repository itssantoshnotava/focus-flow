import React, { useState, useMemo } from 'react';
import { Exam, ProgressMap } from '../types';
import { ChevronDown, ChevronRight, CheckCircle2, Circle, BookOpen } from 'lucide-react';

interface SyllabusTrackerProps {
  exams: Exam[];
  progress: ProgressMap;
  onToggleProgress: (examId: string, subjectId: string, chapterId: string, type: 'completed' | 'pyqs') => void;
}

export const SyllabusTracker: React.FC<SyllabusTrackerProps> = ({ exams, progress, onToggleProgress }) => {
  const [selectedExamId, setSelectedExamId] = useState<string>(exams[0].id);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set([exams[0].subjects[0].id]));

  const activeExam = exams.find(e => e.id === selectedExamId) || exams[0];

  const toggleSubject = (subjectId: string) => {
    const newSet = new Set(expandedSubjects);
    if (newSet.has(subjectId)) {
      newSet.delete(subjectId);
    } else {
      newSet.add(subjectId);
    }
    setExpandedSubjects(newSet);
  };

  const calculateProgress = (exam: Exam) => {
    let totalItems = 0;
    let completedItems = 0;

    exam.subjects.forEach(sub => {
      sub.chapters.forEach(ch => {
        const key = `${exam.id}-${sub.id}-${ch.id}`;
        totalItems += 2; // completed + pyqs
        if (progress[key]?.completed) completedItems++;
        if (progress[key]?.pyqs) completedItems++;
      });
    });

    return totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 backdrop-blur">
        <h2 className="text-neutral-300 font-medium flex items-center gap-2">
            <BookOpen size={18} /> Syllabus
        </h2>
        <div className="flex gap-2">
            {exams.map(exam => (
                <button
                    key={exam.id}
                    onClick={() => setSelectedExamId(exam.id)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                        selectedExamId === exam.id 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                >
                    {exam.name.split(' ')[0]} {/* Short name */}
                </button>
            ))}
        </div>
      </div>

      {/* Progress Bar for Active Exam */}
      <div className="px-6 py-4 bg-neutral-850 border-b border-neutral-800">
        <div className="flex justify-between items-end mb-2">
            <span className="text-sm text-neutral-400">Overall Progress</span>
            <span className="text-xl font-mono text-indigo-400">{calculateProgress(activeExam)}%</span>
        </div>
        <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
            <div 
                className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${calculateProgress(activeExam)}%` }}
            ></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {activeExam.subjects.map(subject => {
            const isExpanded = expandedSubjects.has(subject.id);
            // Calculate Subject Progress
            let subTotal = 0;
            let subDone = 0;
            subject.chapters.forEach(ch => {
                const key = `${activeExam.id}-${subject.id}-${ch.id}`;
                subTotal += 2;
                if(progress[key]?.completed) subDone++;
                if(progress[key]?.pyqs) subDone++;
            });
            const subPercent = subTotal === 0 ? 0 : Math.round((subDone / subTotal) * 100);

            return (
                <div key={subject.id} className="bg-neutral-900 rounded-lg border border-neutral-800/50 overflow-hidden">
                    <button 
                        onClick={() => toggleSubject(subject.id)}
                        className="w-full flex items-center justify-between p-3 hover:bg-neutral-800/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            {isExpanded ? <ChevronDown size={16} className="text-neutral-500" /> : <ChevronRight size={16} className="text-neutral-500" />}
                            <span className="text-neutral-300 font-medium text-sm">{subject.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`text-xs font-mono ${subPercent === 100 ? 'text-emerald-500' : 'text-neutral-500'}`}>{subPercent}%</span>
                        </div>
                    </button>

                    {isExpanded && (
                        <div className="border-t border-neutral-800/50 bg-neutral-950/30">
                            {subject.chapters.map(chapter => {
                                const key = `${activeExam.id}-${subject.id}-${chapter.id}`;
                                const p = progress[key] || { completed: false, pyqs: false };
                                return (
                                    <div key={chapter.id} className="flex items-center justify-between py-2 px-4 pl-10 hover:bg-white/5 transition-colors border-b border-neutral-800/30 last:border-0">
                                        <span className="text-sm text-neutral-400">{chapter.name}</span>
                                        <div className="flex gap-4">
                                            <button 
                                                onClick={() => onToggleProgress(activeExam.id, subject.id, chapter.id, 'completed')}
                                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-all ${
                                                    p.completed 
                                                    ? 'bg-emerald-950/30 border-emerald-900 text-emerald-500' 
                                                    : 'border-neutral-800 text-neutral-600 hover:border-neutral-700'
                                                }`}
                                            >
                                                {p.completed ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                                                Done
                                            </button>
                                            <button 
                                                onClick={() => onToggleProgress(activeExam.id, subject.id, chapter.id, 'pyqs')}
                                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-all ${
                                                    p.pyqs 
                                                    ? 'bg-amber-950/30 border-amber-900 text-amber-500' 
                                                    : 'border-neutral-800 text-neutral-600 hover:border-neutral-700'
                                                }`}
                                            >
                                                {p.pyqs ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                                                PYQs
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        })}
      </div>
    </div>
  );
};
