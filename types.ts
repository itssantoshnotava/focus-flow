export type ExamId = 'boards' | 'jee' | 'bitsat' | 'viteee' | 'eamcet';

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
  id: string; // Changed from ExamId to string to support dynamic/commerce exams
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

export interface StudySession {
  id: string;
  date: string; // ISO string
  duration: number; // seconds
  mode: string;
  roomCode?: string;
  completed?: boolean;
}

export type StreamType = 'PCM' | 'IIT' | 'Commerce';

export interface UserProfile {
    uid: string;
    name: string;
    photoURL?: string;
    bio?: string;
    dob?: string;
    zodiacSign?: string;
    stream?: StreamType;
    selectedExams?: string[]; // IDs of selected competitive exams
    selectedSubjects?: string[]; // IDs of selected commerce subjects
    elective?: 'ip' | 'pe'; // Elective subject selection
    onboardingCompleted?: boolean;
    accessGranted?: boolean;
    eamcetPrompted?: boolean; // Tracking for one-time EAMCET prompt
    electiveSelected?: boolean; // Tracking for one-time elective prompt
    preparingForComp?: boolean; // For PCM users: whether they prepare for entrance exams
}