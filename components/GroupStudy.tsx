import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Users, Plus, LogIn, LogOut, Play, Pause, Clock, Zap, Coffee, Settings, Check, RotateCcw, Trash2, MessageSquare, Send } from 'lucide-react';
import { ref, set, push, get, child, update, onValue, onDisconnect, remove } from "firebase/database";
import { database } from "../firebase";
import { StudySession } from '../types';
import { useAuth } from '../contexts/AuthContext';

export const GroupStudy: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth(); // Auth context

  const mode = location.state?.mode; // 'create' | 'join'
  const myKey = location.state?.myKey;
  
  // HOOKS MUST BE AT TOP LEVEL (Before any return statements)
  const [userName, setUserName] = useState(user?.displayName || '');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isJoinMode, setIsJoinMode] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [hostKey, setHostKey] = useState<string | null>(null);
  
  // Chat State
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Timer State
  const [timerState, setTimerState] = useState({ 
    isRunning: false, 
    startTime: 0, 
    elapsed: 0,
    mode: 'stopwatch', // 'stopwatch' | '25/5' | '50/10' | 'custom'
    phase: 'focus',    // 'focus' | 'break'
    config: { focus: 25, break: 5 }
  });
  const [displaySeconds, setDisplaySeconds] = useState(0);

  // Custom Mode Inputs (Host Local State)
  const [showCustom, setShowCustom] = useState(false);
  const [customFocus, setCustomFocus] = useState(25);
  const [customBreak, setCustomBreak] = useState(5);

  const switchLock = useRef(false);
  const isHost = myKey && hostKey && myKey === hostKey;

  // Session Tracking Refs
  const lastState = useRef(timerState);
  const sessionAccumulator = useRef(0);
  const lastTick = useRef(Date.now());

  // Helper to save session
  const saveCurrentSession = (duration: number, mode: string, phase: string) => {
      if (duration < 10) return; // Ignore very short sessions
      if (phase === 'break') return; // Do not record breaks as study sessions

      const newSession: StudySession = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          duration: Math.floor(duration),
          mode: mode,
          roomCode: roomId,
          completed: false // Group sessions are hard to mark as 'completed' definitively, default false or infer
      };
      
      // Infer completion for pomodoros if duration is close to target
      if (mode === '25/5' && duration > 20 * 60) newSession.completed = true;
      if (mode === '50/10' && duration > 45 * 60) newSession.completed = true;

      const existing = JSON.parse(localStorage.getItem('focusflow_sessions') || '[]');
      localStorage.setItem('focusflow_sessions', JSON.stringify([...existing, newSession]));
  };

  // --- EFFECT: Fetch Participants, Timer, Host & Chat Data ---
  useEffect(() => {
    if (roomId) {
      // Listen for participants
      const participantsRef = ref(database, `rooms/${roomId}/participants`);
      const unsubParticipants = onValue(participantsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          // Convert to array and preserve keys
          const pList = Object.entries(data).map(([key, val]: [string, any]) => ({
            key,
            ...val
          }));
          setParticipants(pList);
        } else {
          setParticipants([]);
        }
      });

      // Listen for timer
      const timerRef = ref(database, `rooms/${roomId}/timer`);
      const unsubTimer = onValue(timerRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const newState = {
             isRunning: val.isRunning || false,
             startTime: val.startTime || 0,
             elapsed: val.elapsed || 0,
             mode: val.mode || 'stopwatch',
             phase: val.phase || 'focus',
             config: val.config || { focus: 25, break: 5 }
          };

          // Detect Session Events (Manual Reset or Phase Change)
          // 1. Phase Change (Focus -> Break)
          if (lastState.current.phase !== newState.phase) {
              // Save accumulator
              saveCurrentSession(sessionAccumulator.current, lastState.current.mode, lastState.current.phase);
              sessionAccumulator.current = 0; // Reset
          }
          // 2. Manual Reset (Elapsed drops to 0 while previously > 0)
          else if (lastState.current.elapsed > 0 && newState.elapsed === 0) {
               saveCurrentSession(sessionAccumulator.current, lastState.current.mode, lastState.current.phase);
               sessionAccumulator.current = 0;
          }

          setTimerState(newState);
          lastState.current = newState;
        }
      });

      // Listen for hostKey
      const hostRef = ref(database, `rooms/${roomId}/hostKey`);
      const unsubHost = onValue(hostRef, (snapshot) => {
          if (snapshot.exists()) {
              setHostKey(snapshot.val());
          } else {
              setHostKey(null);
          }
      });
      
      // Listen for messages
      const messagesRef = ref(database, `rooms/${roomId}/messages`);
      const unsubMessages = onValue(messagesRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const sorted = Object.entries(data)
                .map(([key, val]: [string, any]) => ({ id: key, ...val }))
                .sort((a, b) => a.timestamp - b.timestamp);
            setMessages(sorted);
        } else {
            setMessages([]);
        }
      });
      
      // Listen for room existence (to handle deletion)
      const roomRef = ref(database, `rooms/${roomId}`);
      const unsubRoom = onValue(roomRef, (snapshot) => {
          if (!snapshot.exists()) {
              navigate('/group');
          }
      });

      return () => {
        unsubParticipants();
        unsubTimer();
        unsubHost();
        unsubRoom();
        unsubMessages();
      };
    }
  }, [roomId, navigate]);

  // --- EFFECT: Scroll Chat to Bottom ---
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- EFFECT: Host Logic (Transfer & Cleanup) ---
  useEffect(() => {
      if (!roomId || !myKey || participants.length === 0) return;

      const roomRef = ref(database, `rooms/${roomId}`);
      
      // 1. Host Transfer Logic
      // If hostKey is defined but that user is NOT in participants list
      if (hostKey) {
          const hostExists = participants.find(p => p.key === hostKey);
          if (!hostExists) {
              // Host left. Elect new host (earliest joinedAt).
              const sorted = [...participants].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
              const newHost = sorted[0];
              
              // If I am the new host, I claim it.
              if (newHost.key === myKey) {
                  update(roomRef, { hostKey: myKey, host: newHost.name });
              }
          }
      }

      // 2. Auto-Delete Logic (Last Person Standing)
      // If I am the ONLY participant, ensure room is deleted if I disconnect.
      if (participants.length === 1 && participants[0].key === myKey) {
          onDisconnect(roomRef).remove();
      } else {
          // If there are others, CANCEL the room removal on my disconnect
          onDisconnect(roomRef).cancel();
      }

  }, [participants, hostKey, myKey, roomId]);


  // --- EFFECT: Local Ticker & Auto-Switch Logic ---
  useEffect(() => {
    let interval: number;
    
    // Function to calculate and update display time
    const updateDisplay = () => {
        const now = Date.now();
        const delta = (now - lastTick.current) / 1000;
        lastTick.current = now;

        // Session Accumulation for local history
        if (timerState.isRunning) {
            sessionAccumulator.current += delta;
        }

        const currentSession = timerState.isRunning ? Math.floor((now - timerState.startTime) / 1000) : 0;
        const totalElapsed = (timerState.elapsed || 0) + currentSession;

        if (timerState.mode === 'stopwatch') {
            setDisplaySeconds(totalElapsed);
        } else {
            // Pomodoro Modes
            const targetMin = timerState.phase === 'focus' ? timerState.config.focus : timerState.config.break;
            const targetSec = targetMin * 60;
            const remaining = Math.max(0, targetSec - totalElapsed);
            
            setDisplaySeconds(remaining);

            // Host Logic: Auto-Switch Phase
            if (isHost && remaining === 0 && timerState.isRunning && !switchLock.current) {
                switchLock.current = true;
                const nextPhase = timerState.phase === 'focus' ? 'break' : 'focus';
                
                // Update Firebase
                update(ref(database, `rooms/${roomId}/timer`), {
                    phase: nextPhase,
                    startTime: Date.now(),
                    elapsed: 0,
                    // isRunning remains true
                }).then(() => {
                    // Unlock after 1s to prevent double-firing
                    setTimeout(() => { switchLock.current = false; }, 1000);
                });
            }
        }
    };

    lastTick.current = Date.now(); // Reset tick on effect start
    updateDisplay(); // Initial update

    interval = window.setInterval(updateDisplay, 1000);

    return () => clearInterval(interval);
  }, [timerState, isHost, roomId]);

  const handleCreateRoom = async () => {
    if (!userName.trim()) return;

    // Generate random 6-character code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomCode = '';
    for (let i = 0; i < 6; i++) {
      roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const roomRef = ref(database, `rooms/${roomCode}`);
    const participantsRef = ref(database, `rooms/${roomCode}/participants`);
    const newParticipantRef = push(participantsRef);
    const newParticipantKey = newParticipantRef.key;

    if (newParticipantKey) {
        // Presence: Remove user on disconnect (tab close / refresh)
        await onDisconnect(newParticipantRef).remove();

        await set(roomRef, {
            host: userName,
            hostKey: newParticipantKey, // Set initial host key
            timer: {          
                isRunning: false,
                startTime: 0,
                elapsed: 0,
                mode: 'stopwatch',
                phase: 'focus',
                config: { focus: 25, break: 5 }
            },
            participants: {
                [newParticipantKey]: {
                    name: userName,
                    joinedAt: Date.now()
                }
            }
        });
        navigate(`/group/${roomCode}`, { state: { mode: 'create', myKey: newParticipantKey } });
    }
  };

  const handleJoinRoom = async () => {
    if (!userName.trim() || !roomCodeInput.trim()) return;

    const dbRef = ref(database);
    const code = roomCodeInput.trim();

    try {
        const snapshot = await get(child(dbRef, `rooms/${code}`));
        if (snapshot.exists()) {
             const participantsRef = ref(database, `rooms/${code}/participants`);
             const newParticipantRef = push(participantsRef);
             const newParticipantKey = newParticipantRef.key;
             
             if (newParticipantKey) {
                 // Presence: Remove user on disconnect (tab close / refresh)
                 await onDisconnect(newParticipantRef).remove();

                 const updates: Record<string, any> = {};
                 updates[newParticipantKey] = {
                     name: userName,
                     joinedAt: Date.now()
                 };
                 
                 await update(participantsRef, updates);
                 navigate(`/group/${code}`, { state: { mode: 'join', myKey: newParticipantKey } });
             }
        }
    } catch (error) {
        console.error("Error joining room:", error);
    }
  };

  const handleLeaveRoom = async () => {
     // Save any pending session data
     saveCurrentSession(sessionAccumulator.current, timerState.mode, timerState.phase);

     if (roomId && myKey) {
         try {
             // If I am the last participant, delete the room
             if (participants.length <= 1) {
                 await remove(ref(database, `rooms/${roomId}`));
             } else {
                 await remove(ref(database, `rooms/${roomId}/participants/${myKey}`));
             }
         } catch (e) {
             console.error("Error leaving room:", e);
         }
     }
     navigate('/group');
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomId) return;
    
    const messagesRef = ref(database, `rooms/${roomId}/messages`);
    await push(messagesRef, {
        name: userName,
        text: chatInput.trim(),
        timestamp: Date.now()
    });
    setChatInput('');
  };

  // --- Host Controls ---
  const toggleTimer = () => {
    if (!roomId) return;
    const timerRef = ref(database, `rooms/${roomId}/timer`);

    if (timerState.isRunning) {
        // PAUSE
        const now = Date.now();
        const currentSession = Math.floor((now - timerState.startTime) / 1000);
        const totalElapsed = (timerState.elapsed || 0) + currentSession;

        update(timerRef, {
            isRunning: false,
            elapsed: totalElapsed
        });
    } else {
        // START
        update(timerRef, {
            isRunning: true,
            startTime: Date.now()
        });
    }
  };

  const resetTimer = () => {
      if (!roomId) return;
      update(ref(database, `rooms/${roomId}/timer`), {
          isRunning: false,
          elapsed: 0,
          startTime: 0,
          phase: 'focus'
      });
  };

  const deleteRoom = async () => {
      if (!roomId) return;
      await remove(ref(database, `rooms/${roomId}`));
      // Navigation handled by onValue listener
  };

  const setTimerMode = (mode: string, focus = 25, breakMins = 5) => {
    if (!roomId) return;
    update(ref(database, `rooms/${roomId}/timer`), {
        mode: mode,
        phase: 'focus',
        elapsed: 0,
        startTime: Date.now(),
        isRunning: false,
        config: { focus, break: breakMins }
    });
    if (mode !== 'custom') setShowCustom(false);
  };

  const applyCustomMode = () => {
      setTimerMode('custom', customFocus, customBreak);
      setShowCustom(false);
  };

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // --- ROOM VIEW ---
  if (roomId) {
    const isPomodoro = timerState.mode !== 'stopwatch';
    const isFocus = timerState.phase === 'focus';

    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans flex flex-col items-center p-4 md:p-8 selection:bg-indigo-500/30">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
           
           {/* LEFT COLUMN: Main Controls */}
           <div className="lg:col-span-2 flex flex-col gap-6">
               
               {/* Room Info Header */}
               <div className="flex flex-col gap-1 text-center lg:text-left">
                 <div className="flex items-center justify-center lg:justify-start gap-2 text-indigo-500">
                    <Users size={24} />
                    <h1 className="text-2xl font-bold text-white tracking-tight">Room {roomId}</h1>
                 </div>
                 <p className="text-neutral-500 text-sm">
                    {isHost ? 'You are the host.' : 'Study together.'}
                 </p>
               </div>

               {/* SHARED TIMER WIDGET */}
               <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-500">
                   {/* Glow Effect based on Phase */}
                   <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl pointer-events-none transition-all duration-1000 ${
                       timerState.isRunning 
                         ? (isPomodoro && !isFocus ? 'bg-emerald-500/20' : 'bg-indigo-500/20')
                         : 'opacity-0'
                   }`}></div>

                   <div className="relative z-10 flex flex-col items-center gap-4">
                       
                       {/* Phase Badge */}
                       {isPomodoro && (
                           <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border ${
                               isFocus 
                               ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
                               : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                           }`}>
                               {isFocus ? <Zap size={12} /> : <Coffee size={12} />}
                               {isFocus ? 'Focus Phase' : 'Break Time'}
                           </div>
                       )}

                       <div className="text-6xl font-mono font-light tracking-tighter text-white tabular-nums">
                           {formatTime(displaySeconds)}
                       </div>

                       {/* Main Timer Control */}
                       {isHost ? (
                           <div className="flex flex-col gap-4 w-full max-w-md">
                                <div className="flex gap-2 w-full">
                                    <button 
                                        onClick={toggleTimer}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                                            timerState.isRunning 
                                            ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-neutral-700' 
                                            : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/20'
                                        }`}
                                    >
                                        {timerState.isRunning ? <Pause size={18} /> : <Play size={18} />}
                                        {timerState.isRunning ? 'Pause' : 'Start'}
                                    </button>
                                    <button 
                                        onClick={resetTimer}
                                        className="px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl border border-neutral-700 transition-all"
                                        title="Reset Timer"
                                    >
                                        <RotateCcw size={18} />
                                    </button>
                                </div>

                                {/* Mode Selector */}
                                <div className="bg-neutral-950/50 p-1.5 rounded-lg grid grid-cols-4 gap-1">
                                    {[
                                        { id: 'stopwatch', label: 'Clock', icon: Clock },
                                        { id: '25/5', label: '25/5', icon: Zap },
                                        { id: '50/10', label: '50/10', icon: Zap },
                                        { id: 'custom', label: 'Set', icon: Settings },
                                    ].map((m) => (
                                        <button
                                            key={m.id}
                                            onClick={() => m.id === 'custom' ? setShowCustom(!showCustom) : setTimerMode(m.id, m.id === '25/5' ? 25 : 50, m.id === '25/5' ? 5 : 10)}
                                            className={`flex flex-col items-center justify-center py-2 rounded-md text-[10px] font-medium transition-all ${
                                                (timerState.mode === m.id && m.id !== 'custom') || (m.id === 'custom' && showCustom)
                                                ? 'bg-neutral-800 text-white shadow-sm' 
                                                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
                                            }`}
                                        >
                                            <m.icon size={14} className="mb-1" />
                                            {m.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Custom Mode Settings */}
                                {showCustom && (
                                    <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 p-2 rounded-lg animate-in slide-in-from-top-2">
                                        <div className="flex-1">
                                            <label className="text-[10px] text-neutral-500 uppercase font-bold ml-1">Focus</label>
                                            <input 
                                                type="number" 
                                                value={customFocus} 
                                                onChange={(e) => setCustomFocus(Number(e.target.value))}
                                                className="w-full bg-neutral-900 border border-neutral-800 text-white text-sm px-2 py-1 rounded focus:outline-none focus:border-indigo-500" 
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[10px] text-neutral-500 uppercase font-bold ml-1">Break</label>
                                            <input 
                                                type="number" 
                                                value={customBreak} 
                                                onChange={(e) => setCustomBreak(Number(e.target.value))}
                                                className="w-full bg-neutral-900 border border-neutral-800 text-white text-sm px-2 py-1 rounded focus:outline-none focus:border-indigo-500" 
                                            />
                                        </div>
                                        <button 
                                            onClick={applyCustomMode}
                                            className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg"
                                        >
                                            <Check size={16} />
                                        </button>
                                    </div>
                                )}
                           </div>
                       ) : (
                           <div className="flex items-center gap-2 text-neutral-500 text-sm bg-neutral-950/50 px-3 py-1.5 rounded-full border border-neutral-800">
                               <Clock size={14} className={timerState.isRunning ? "text-indigo-400 animate-pulse" : ""} />
                               <span>
                                   {timerState.isRunning 
                                   ? (isPomodoro ? `${isFocus ? 'Focus' : 'Break'} time in progress` : "Session in progress") 
                                   : "Timer paused by host"}
                               </span>
                           </div>
                       )}
                   </div>
               </div>

               {/* Participants List */}
               <div className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 text-left">
                  <h3 className="text-neutral-500 text-xs font-medium uppercase tracking-wider mb-3 flex items-center justify-between">
                      <span>Participants</span>
                      <span className="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded text-[10px]">{participants.length}</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {participants.length > 0 ? (
                      participants.map((p, index) => (
                        <div key={index} className="flex items-center gap-3 p-2 bg-neutral-900 border border-neutral-800/50 rounded-lg justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${
                                p.key === hostKey 
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                            }`}>
                                {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <span className="text-neutral-300 font-medium truncate">{p.name || 'Unknown'}</span>
                          </div>
                          {p.key === hostKey && (
                              <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Host</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-neutral-600 text-sm italic col-span-full">Waiting for others...</div>
                    )}
                  </div>
               </div>

               {/* Host Danger Zone or Leave */}
               <div className="flex gap-4">
                   <button 
                      onClick={handleLeaveRoom}
                      className="flex-1 flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 text-sm font-medium py-2 transition-colors bg-neutral-900 border border-neutral-800 rounded-lg hover:bg-neutral-800"
                  >
                      <LogOut size={16} />
                      <span>Leave Room</span>
                  </button>
                  
                  {isHost && (
                      <button 
                        onClick={deleteRoom}
                        className="flex-1 flex items-center justify-center gap-2 text-red-900/70 hover:text-red-500 text-sm font-medium py-2 transition-colors bg-neutral-900 border border-neutral-800 rounded-lg hover:bg-red-950/10 hover:border-red-900/30"
                      >
                          <Trash2 size={16} />
                          <span>Delete Room</span>
                      </button>
                  )}
               </div>

           </div>

           {/* RIGHT COLUMN: Chat */}
           <div className="lg:col-span-1 h-[500px] lg:h-auto flex flex-col bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur">
                  <h3 className="text-neutral-500 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                     <MessageSquare size={12} /> Chat
                  </h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-neutral-900/20">
                 {messages.length > 0 ? (
                    messages.map(msg => (
                      <div key={msg.id} className="text-sm break-words flex flex-col gap-0.5">
                         <div className="flex items-baseline gap-2">
                             <span className={`font-bold text-xs ${msg.name === userName ? 'text-indigo-400' : 'text-neutral-400'}`}>
                                {msg.name}
                             </span>
                             <span className="text-[10px] text-neutral-600">
                                {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                             </span>
                         </div>
                         <span className="text-neutral-300 leading-relaxed">{msg.text}</span>
                      </div>
                    ))
                 ) : (
                    <div className="text-neutral-600 text-sm italic text-center py-10 flex flex-col items-center gap-2">
                        <MessageSquare size={24} className="opacity-20" />
                        <span>No messages yet.</span>
                    </div>
                 )}
                 <div ref={chatEndRef} />
              </div>
              <div className="p-3 bg-neutral-900 border-t border-neutral-800">
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                     <input 
                        value={chatInput} 
                        onChange={e => setChatInput(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 bg-neutral-950 border border-neutral-800 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-neutral-700"
                     />
                     <button type="submit" disabled={!chatInput.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed">
                        <Send size={16} />
                     </button>
                  </form>
              </div>
           </div>

        </div>
      </div>
    );
  }

  // --- LOBBY VIEW ---
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans flex flex-col items-center justify-center relative p-6 selection:bg-indigo-500/30">
      <button 
        onClick={() => navigate('/')} 
        className="absolute top-6 left-6 p-2 text-neutral-500 hover:text-white hover:bg-neutral-900 rounded-lg transition-all"
        title="Back to Dashboard"
      >
        <ArrowLeft size={24} />
      </button>
      
      <div className="w-full max-w-sm flex flex-col gap-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-neutral-900 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-neutral-800 shadow-xl">
                <Users size={24} className="text-indigo-500" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Group Study</h1>
            <p className="text-neutral-500">Collaborate with peers in real-time</p>
        </div>

        {/* Controls */}
        <div className="space-y-4">
            
            <div className="space-y-2">
                <label className="text-xs font-medium text-neutral-500 ml-1 uppercase tracking-wide">Display Name</label>
                <input 
                    type="text" 
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-neutral-900/50 border border-neutral-800 text-white px-4 py-3.5 rounded-xl focus:outline-none focus:border-indigo-500/50 focus:bg-neutral-900 transition-all placeholder:text-neutral-700"
                />
            </div>

            {isJoinMode && (
                <div className="space-y-2">
                    <label className="text-xs font-medium text-neutral-500 ml-1 uppercase tracking-wide">Room Code</label>
                    <input 
                        type="text" 
                        value={roomCodeInput}
                        onChange={(e) => setRoomCodeInput(e.target.value)}
                        placeholder="Enter room code"
                        className="w-full bg-neutral-900/50 border border-neutral-800 text-white px-4 py-3.5 rounded-xl focus:outline-none focus:border-indigo-500/50 focus:bg-neutral-900 transition-all placeholder:text-neutral-700"
                    />
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
                {!isJoinMode ? (
                    <>
                        <button 
                            onClick={handleCreateRoom}
                            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-[0.98]"
                        >
                            <Plus size={18} />
                            <span>Create Room</span>
                        </button>
                        <button 
                            onClick={() => setIsJoinMode(true)}
                            className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-medium py-3.5 rounded-xl border border-neutral-700 hover:border-neutral-600 transition-all active:scale-[0.98]"
                        >
                            <LogIn size={18} />
                            <span>Join Room</span>
                        </button>
                    </>
                ) : (
                    <>
                        <button 
                            onClick={() => setIsJoinMode(false)}
                            className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-medium py-3.5 rounded-xl border border-neutral-700 hover:border-neutral-600 transition-all active:scale-[0.98]"
                        >
                            <ArrowLeft size={18} />
                            <span>Back</span>
                        </button>
                         <button 
                            onClick={handleJoinRoom}
                            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-[0.98]"
                        >
                            <LogIn size={18} />
                            <span>Enter Room</span>
                        </button>
                    </>
                )}
            </div>

        </div>

      </div>
    </div>
  );
};