
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
  id: string; 
  name: string;
  date: string | null; 
  sessions?: ExamSession[]; 
  subjects: Subject[];
}

export interface ChapterProgress {
  completed: boolean;
  pyqs: boolean;
}

export type ProgressMap = Record<string, ChapterProgress>; 

export enum TimerMode {
  STOPWATCH = 'STOPWATCH',
  POMODORO = 'POMODORO',
  COUNTDOWN = 'COUNTDOWN',
}

export interface StudySession {
  id: string;
  date: string; 
  duration: number; 
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
    selectedExams?: string[]; 
    selectedSubjects?: string[]; 
    elective?: 'ip' | 'pe'; 
    onboardingCompleted?: boolean;
    accessGranted?: boolean;
    eamcetPrompted?: boolean; 
    electiveSelected?: boolean; 
    preparingForComp?: boolean; 
    totalStudySeconds?: number;
    streak?: number;
    streaks?: { current: number, longest: number };
}

export interface MomentOverlay {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  size: number;
}

export interface Moment {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  url: string;
  type: 'image' | 'video';
  timestamp: number;
  expiresAt: number;
  overlays?: MomentOverlay[];
}

// Global Post interface for Pulse and Feed
export interface Post {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  type: 'text' | 'image' | 'session' | 'video';
  content: string;
  images?: string[];
  media?: { url: string; type: 'image' | 'video' }[];
  music?: {
    trackName: string;
    artistName: string;
    previewUrl: string;
    artworkUrl: string;
  };
  timestamp: number;
  sessionData?: {
    duration: number;
    mode: string;
    roomCode?: string;
  };
}

// Global Comment interface
export interface Comment {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  timestamp: number;
  parentId?: string | null;
}
