import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Users, Plus, LogIn, LogOut, Play, Pause, Clock } from 'lucide-react';
import { ref, set, push, get, child, update, onValue, onDisconnect, remove } from "firebase/database";
import { database } from "../firebase";

export const GroupStudy: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const mode = location.state?.mode; // 'create' | 'join'
  const myKey = location.state?.myKey;

  // HOOKS MUST BE AT TOP LEVEL (Before any return statements)
  const [userName, setUserName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isJoinMode, setIsJoinMode] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  
  // Timer State
  const [timerState, setTimerState] = useState({ isRunning: false, startTime: 0, elapsed: 0 });
  const [displaySeconds, setDisplaySeconds] = useState(0);

  // --- EFFECT: Fetch Participants & Timer Data ---
  useEffect(() => {
    if (roomId) {
      // Listen for participants
      const participantsRef = ref(database, `rooms/${roomId}/participants`);
      const unsubParticipants = onValue(participantsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setParticipants(Object.values(data));
        } else {
          setParticipants([]);
        }
      });

      // Listen for timer
      const timerRef = ref(database, `rooms/${roomId}/timer`);
      const unsubTimer = onValue(timerRef, (snapshot) => {
        if (snapshot.exists()) {
          setTimerState(snapshot.val());
        }
      });

      return () => {
        unsubParticipants();
        unsubTimer();
      };
    }
  }, [roomId]);

  // --- EFFECT: Local Ticker ---
  useEffect(() => {
    let interval: number;
    
    // Function to calculate and update display time
    const updateDisplay = () => {
        if (timerState.isRunning) {
            const now = Date.now();
            const currentSession = Math.floor((now - timerState.startTime) / 1000);
            setDisplaySeconds((timerState.elapsed || 0) + currentSession);
        } else {
            setDisplaySeconds(timerState.elapsed || 0);
        }
    };

    updateDisplay(); // Initial update

    if (timerState.isRunning) {
      interval = window.setInterval(updateDisplay, 1000);
    }

    return () => clearInterval(interval);
  }, [timerState]);

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
            isRunning: false, // Legacy field at root (optional/deprecated by timer node)
            startTime: null,  // Legacy field at root
            timer: {          // New Shared Timer Node
                isRunning: false,
                startTime: 0,
                elapsed: 0
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
     if (roomId && myKey) {
         try {
             await remove(ref(database, `rooms/${roomId}/participants/${myKey}`));
         } catch (e) {
             console.error("Error leaving room:", e);
         }
     }
     navigate('/group');
  };

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

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // --- ROOM VIEW ---
  if (roomId) {
    const isHost = mode === 'create';

    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans flex flex-col items-center justify-center relative p-6 selection:bg-indigo-500/30">
        <div className="text-center space-y-6 max-w-md w-full animate-in fade-in duration-500">
           
           {/* Room Info Header */}
           <div className="space-y-1">
             <div className="flex items-center justify-center gap-2 text-indigo-500 mb-2">
                <Users size={24} />
             </div>
             <h1 className="text-2xl font-bold text-white tracking-tight">Room {roomId}</h1>
             <p className="text-neutral-500 text-sm">
                {isHost ? 'You are the host.' : 'Study together.'}
             </p>
           </div>

           {/* SHARED TIMER WIDGET */}
           <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
               {/* Glow Effect */}
               <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none transition-opacity duration-700 ${timerState.isRunning ? 'opacity-100' : 'opacity-0'}`}></div>

               <div className="relative z-10 flex flex-col items-center gap-4">
                   <div className="text-6xl font-mono font-light tracking-tighter text-white tabular-nums">
                       {formatTime(displaySeconds)}
                   </div>

                   {isHost ? (
                       <button 
                           onClick={toggleTimer}
                           className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all ${
                               timerState.isRunning 
                               ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-neutral-700' 
                               : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/20'
                           }`}
                       >
                           {timerState.isRunning ? <><Pause size={18} /> Pause Session</> : <><Play size={18} /> Start Session</>}
                       </button>
                   ) : (
                       <div className="flex items-center gap-2 text-neutral-500 text-sm bg-neutral-950/50 px-3 py-1.5 rounded-full border border-neutral-800">
                           <Clock size={14} className={timerState.isRunning ? "text-indigo-400 animate-pulse" : ""} />
                           <span>{timerState.isRunning ? "Session in progress" : "Timer paused by host"}</span>
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
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {participants.length > 0 ? (
                  participants.map((p, index) => (
                    <div key={index} className="flex items-center gap-3 p-2 bg-neutral-900 border border-neutral-800/50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/20 shrink-0">
                         {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <span className="text-neutral-300 font-medium truncate">{p.name || 'Unknown'}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-neutral-600 text-sm italic">Waiting for others...</div>
                )}
              </div>
           </div>

           <div className="pt-2">
               <button 
                  onClick={handleLeaveRoom}
                  className="flex items-center justify-center gap-2 w-full text-neutral-500 hover:text-neutral-300 text-sm font-medium py-2 transition-colors"
              >
                  <LogOut size={16} />
                  <span>Leave Room</span>
              </button>
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