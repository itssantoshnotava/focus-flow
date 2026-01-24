export type ExamId = 'boards' | 'jee' | 'bitsat' | 'viteee';

export interface Chapter {
  id: string;
  name: string;
}

export interface Subject {
  id: string;
  name: string;
  chapters: Chapter[];
}

export interface ExamSession {
  label: string;
  date: string;
}

export interface Exam {
  id: ExamId;
  name: string;
  date: string | null; // ISO string or null if TBD
  sessions?: ExamSession[]; // For exams with multiple sessions
  subjects: Subject[];
}

export interface ChapterProgress {
  completed: boolean;
  pyqs: boolean;
}

export type ProgressMap = Record<string, ChapterProgress>; // Key: "examId-subjectId-chapterId"

export enum TimerMode {
  STOPWATCH = 'STOPWATCH',
  POMODORO = 'POMODORO',
  COUNTDOWN = 'COUNTDOWN',
}