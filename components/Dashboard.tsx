import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, update, onDisconnect, onValue } from "firebase/database";
import { updateProfile } from "firebase/auth";
import { database, auth } from "../firebase";
import { Timer } from './Timer';
import { ExamCountdown } from './ExamCountdown';
import { SyllabusTracker } from './SyllabusTracker';
import { FriendsSystem } from './FriendsSystem';
import { FriendsLeaderboard } from './FriendsLeaderboard';
import { Inbox } from './Inbox';
import { EXAMS } from '../constants';
import { ProgressMap, StudySession, TimerMode } from '../types';
import { LayoutDashboard, Users, Trophy, Flame, CalendarClock, Clock, LogOut, Shield, UserPlus, MessageCircle, Camera, Loader2, Home, Globe, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, isGuest } = useAuth();
  
  // Navigation State
  const [showFriends, setShowFriends] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Profile Upload State
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [profileImage, setProfileImage] = useState(user?.photoURL);
  const profileInputRef = useRef<HTMLInputElement>(null);

  // --- State: Syllabus Progress ---
  const [progress, setProgress] = useState<ProgressMap>(() => {
    const saved = localStorage.getItem('focusflow_progress');
    return saved ? JSON.parse(saved) : {};
  });

  // --- State: Daily Study Time (Live) ---
  const [studyData, setStudyData] = useState<{date: string, seconds: number}>(() => {
    const saved = localStorage.getItem('focusflow_study_data');
    const today = new Date().toISOString().split('T')[0];
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.date === today) return parsed;
    }
    return { date: today, seconds: 0 };
  });

  // --- State: Session History ---
  const [sessions, setSessions] = useState<StudySession[]>(() => {
    const saved = localStorage.getItem('focusflow_sessions');
    return saved ? JSON.parse(saved) : [];
  });

  // Sync profile image state when user loads
  useEffect(() => {
    if (user) setProfileImage(user.photoURL);
  }, [user]);

  // --- Effects: Presence System & Connection Test ---
  useEffect(() => {
    if (user && !isGuest) {
        // 1. Connection Ping
        set(ref(database, "ping"), {
          status: "connected",
          time: Date.now(),
          uid: user.uid
        });

        // 2. Presence System
        const presenceRef = ref(database, `presence/${user.uid}`);
        
        // When I disconnect, set online to false
        onDisconnect(presenceRef).update({
            online: false,
            lastSeen: Date.now()
        });

        // I am currently online
        update(presenceRef, {
            online: true,
            lastSeen: Date.now()
        });
    }
  }, [isGuest, user]);

  // --- Effects: Real-time Unread Badge Logic ---
  useEffect(() => {
      if(!user) return;
      
      const inboxRef = ref(database, `userInboxes/${user.uid}`);
      const unsub = onValue(inboxRef, (snapshot) => {
          let totalUnread = 0;
          if (snapshot.exists()) {
              snapshot.forEach((child) => {
                  const data = child.val();
                  if (data.unreadCount) {
                      totalUnread += data.unreadCount;
                  }
              });
          }
          setUnreadCount(totalUnread);
      });

      return () => unsub();
  }, [user]);

  // --- Effects: Persistence ---
  useEffect(() => {
    localStorage.setItem('focusflow_progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem('focusflow_study_data', JSON.stringify(studyData));
  }, [studyData]);

  useEffect(() => {
    localStorage.setItem('focusflow_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // --- Handlers ---
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

  const handleAddStudyTime = useCallback((addedSeconds: number) => {
    const today = new Date().toISOString().split('T')[0];
    setStudyData(prev => {
      if (prev.date !== today) {
        return { date: today, seconds: addedSeconds };
      }
      return { ...prev, seconds: prev.seconds + addedSeconds };
    });
  }, []);

  const handleSessionComplete = useCallback((sessionData: { duration: number; mode: TimerMode; completed: boolean }) => {
    const newSession: StudySession = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        duration: sessionData.duration,
        mode: sessionData.mode,
        completed: sessionData.completed
    };
    setSessions(prev => [...prev, newSession]);
  }, []);

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && user && !isGuest) {
      setIsUploadingProfile(true);
      try {
        const file = e.target.files[0];
        const url = await uploadImageToCloudinary(file);
        
        // 1. Update Auth Profile
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { photoURL: url });
        }
        
        // 2. Update Database User
        await update(ref(database, `users/${user.uid}`), {
          photoURL: url
        });

        // 3. Update Local State
        setProfileImage(url);

      } catch (err) {
        console.error("Profile upload failed", err);
        alert("Failed to upload profile picture.");
      } finally {
        setIsUploadingProfile(false);
        if (profileInputRef.current) profileInputRef.current.value = '';
      }
    }
  };

  // --- Stats Calculation ---
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalSeconds = 0;
    let todaySeconds = 0;
    let weekSeconds = 0;
    let pomodoros = 0;

    sessions.forEach(s => {
        // Filter out very short sessions if needed
        if (s.duration < 10) return;

        totalSeconds += s.duration;

        const sDate = s.date.split('T')[0];
        if (sDate === todayStr) {
            todaySeconds += s.duration;
        }

        if (new Date(s.date) >= oneWeekAgo) {
            weekSeconds += s.duration;
        }

        // Count completed pomodoros (Dashboard 'POMODORO' or Group '25/5'/'50/10')
        const isPomodoroMode = s.mode === 'POMODORO' || s.mode === '25/5' || s.mode === '50/10';
        if (isPomodoroMode && s.completed) {
            pomodoros++;
        }
    });

    return {
        rawTotalSeconds: totalSeconds,
        totalHours: (totalSeconds / 3600).toFixed(1),
        todayHours: (todaySeconds / 3600).toFixed(1),
        weekHours: (weekSeconds / 3600).toFixed(1),
        pomodoros
    };
  }, [sessions]);

  // --- Effects: Sync Stats to Firebase ---
  useEffect(() => {
    if (user && !isGuest) {
        const userStatsRef = ref(database, `users/${user.uid}`);
        update(userStatsRef, {
            totalStudySeconds: stats.rawTotalSeconds
        }).catch(err => console.error("Failed to sync stats", err));
    }
  }, [user, isGuest, stats.rawTotalSeconds]);

  // --- UI Components ---
  const NavItem = ({ icon: Icon, label, active, onClick, badge }: { icon: any, label: string, active?: boolean, onClick: () => void, badge?: number }) => (
    <button 
        onClick={onClick} 
        className={`relative p-3 rounded-xl transition-all group ${active ? 'bg-neutral-800' : 'hover:bg-neutral-900'}`}
        title={label}
    >
        <Icon size={24} className={active ? "text-indigo-500" : "text-neutral-500 group-hover:text-neutral-300 transition-colors"} />
        {badge !== undefined && badge > 0 && (
            <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-neutral-950 animate-in zoom-in">
                {badge > 99 ? '99' : badge}
            </span>
        )}
        <span className="sr-only">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* Modals */}
      {showFriends && <FriendsSystem onClose={() => setShowFriends(false)} />}
      {showInbox && <Inbox onClose={() => setShowInbox(false)} />}

      {/* --- LEFT SIDEBAR (Desktop) --- */}
      <aside className="hidden md:flex w-20 flex-col items-center py-6 border-r border-neutral-900 bg-neutral-950 z-50 shrink-0">
        
        {/* Brand */}
        <div className="mb-8">
           <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/20">
              <LayoutDashboard size={20} className="text-white" />
           </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-4 flex-1 w-full items-center">
           <NavItem 
              icon={Home} 
              label="Home" 
              active={!showInbox && !showFriends} 
              onClick={() => {setShowInbox(false); setShowFriends(false);}} 
           />
           {!isGuest && (
             <>
               <NavItem 
                  icon={MessageCircle} 
                  label="Inbox" 
                  badge={unreadCount} 
                  active={showInbox} 
                  onClick={() => setShowInbox(true)} 
               />
               <NavItem 
                  icon={Users} 
                  label="Friends" 
                  active={showFriends} 
                  onClick={() => setShowFriends(true)} 
               />
             </>
           )}
           <NavItem 
              icon={Globe} 
              label="Group Study" 
              onClick={() => navigate('/group')} 
           />
        </div>

        {/* Bottom Actions */}
        <div className="mt-auto flex flex-col gap-4 items-center">
            {/* Profile / Upload */}
            {!isGuest && (
               <div className="relative group">
                   <input 
                      type="file" 
                      ref={profileInputRef} 
                      onChange={handleProfileUpload} 
                      className="hidden" 
                      accept="image/*"
                   />
                   <button 
                      className="relative cursor-pointer w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-800 hover:border-neutral-600 transition-colors overflow-hidden"
                      onClick={() => profileInputRef.current?.click()}
                      title="Change Profile Picture"
                   >
                       {profileImage ? (
                         <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                       ) : (
                         <div className="text-xs font-bold text-neutral-400">
                           {user?.displayName?.charAt(0) || <User size={16} />}
                         </div>
                       )}
                       
                       {/* Upload Indicator */}
                       <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                           <Camera size={14} className="text-white" />
                       </div>
                       
                       {/* Loader */}
                       {isUploadingProfile && (
                           <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                               <Loader2 size={14} className="text-indigo-400 animate-spin" />
                           </div>
                       )}
                   </button>
               </div>
            )}

            <button 
                onClick={() => logout()}
                className="p-3 text-neutral-600 hover:text-red-400 transition-colors rounded-xl hover:bg-neutral-900"
                title={isGuest ? "Exit Guest Mode" : "Sign Out"}
            >
                <LogOut size={20} />
            </button>
        </div>
      </aside>


      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-neutral-950 relative custom-scrollbar">
        <div className="max-w-7xl w-full mx-auto px-4 py-8 pb-24 md:pb-8 flex-1 flex flex-col">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-full">
            
            {/* Left Column: Timer, Stats, Leaderboard */}
            <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
              
              {/* Timer Widget */}
              <Timer 
                onAddStudyTime={handleAddStudyTime} 
                dailyTotal={studyData.seconds} 
                onSessionComplete={handleSessionComplete}
              />

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                          <Flame size={12} className="text-orange-500" /> Today
                      </span>
                      <span className="text-2xl font-mono text-white">{stats.todayHours} <span className="text-xs text-neutral-600">hrs</span></span>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                          <CalendarClock size={12} className="text-blue-500" /> Week
                      </span>
                      <span className="text-2xl font-mono text-white">{stats.weekHours} <span className="text-xs text-neutral-600">hrs</span></span>
                  </div>
                   <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                          <Clock size={12} className="text-emerald-500" /> Total
                      </span>
                      <span className="text-2xl font-mono text-white">{stats.totalHours} <span className="text-xs text-neutral-600">hrs</span></span>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col items-start gap-1">
                      <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                          <Trophy size={12} className="text-yellow-500" /> Pomodoros
                      </span>
                      <span className="text-2xl font-mono text-white">{stats.pomodoros}</span>
                  </div>
              </div>

              {/* Friends Leaderboard */}
              {!isGuest && <FriendsLeaderboard />}
            </div>

            {/* Right Column: Exam Countdowns & Syllabus Tracker */}
            <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4">
              
              {/* Exam Countdowns Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                 {EXAMS.map(exam => (
                   <ExamCountdown 
                     key={exam.id} 
                     name={exam.name} 
                     date={exam.date}
                     sessions={exam.sessions}
                   />
                 ))}
              </div>

              {/* Syllabus Tracker */}
              <div className="flex-1 min-h-[300px]">
                <SyllabusTracker 
                  exams={EXAMS} 
                  progress={progress} 
                  onToggleProgress={handleToggleProgress} 
                />
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* --- BOTTOM NAV (Mobile) --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-neutral-950 border-t border-neutral-900 flex items-center justify-around z-50 pb-2 px-2">
         <NavItem 
            icon={Home} 
            label="Home" 
            active={!showInbox && !showFriends} 
            onClick={() => {setShowInbox(false); setShowFriends(false);}} 
         />
         {!isGuest && (
           <>
             <NavItem 
                icon={MessageCircle} 
                label="Inbox" 
                badge={unreadCount} 
                active={showInbox} 
                onClick={() => setShowInbox(true)} 
             />
             <NavItem 
                icon={Users} 
                label="Friends" 
                active={showFriends} 
                onClick={() => setShowFriends(true)} 
             />
           </>
         )}
         <NavItem 
            icon={Globe} 
            label="Group" 
            onClick={() => navigate('/group')} 
         />
         <button 
             onClick={() => logout()}
             className="relative p-3 rounded-xl transition-all text-neutral-500 hover:text-white"
         >
             <LogOut size={24} />
         </button>
      </nav>

    </div>
  );
};