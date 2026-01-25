import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Users, Plus, LogIn, LogOut } from 'lucide-react';
import { ref, set, push, get, child, update, onValue } from "firebase/database";
import { database } from "../firebase";

export const GroupStudy: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const mode = location.state?.mode; // 'create' | 'join'

  // HOOKS MUST BE AT TOP LEVEL (Before any return statements)
  const [userName, setUserName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isJoinMode, setIsJoinMode] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);

  useEffect(() => {
    if (roomId) {
      const participantsRef = ref(database, `rooms/${roomId}/participants`);
      const unsubscribe = onValue(participantsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setParticipants(Object.values(data));
        } else {
          setParticipants([]);
        }
      });
      return () => unsubscribe();
    }
  }, [roomId]);

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
    const newParticipantKey = push(participantsRef).key;

    if (newParticipantKey) {
        await set(roomRef, {
            host: userName,
            isRunning: false,
            startTime: null,
            participants: {
                [newParticipantKey]: {
                    name: userName,
                    joinedAt: Date.now()
                }
            }
        });
        navigate(`/group/${roomCode}`, { state: { mode: 'create' } });
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
             const newParticipantKey = push(participantsRef).key;
             
             if (newParticipantKey) {
                 const updates: Record<string, any> = {};
                 updates[newParticipantKey] = {
                     name: userName,
                     joinedAt: Date.now()
                 };
                 
                 await update(participantsRef, updates);
                 navigate(`/group/${code}`, { state: { mode: 'join' } });
             }
        }
    } catch (error) {
        console.error("Error joining room:", error);
    }
  };

  // --- ROOM VIEW ---
  if (roomId) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans flex flex-col items-center justify-center relative p-6 selection:bg-indigo-500/30">
        <div className="text-center space-y-6 max-w-md w-full animate-in fade-in duration-500">
           <div className="w-20 h-20 bg-neutral-900 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-neutral-800 shadow-2xl">
              <Users size={40} className="text-indigo-500" />
           </div>
           
           <div className="space-y-2">
             <h1 className="text-4xl font-bold text-white tracking-tight">Room {roomId}</h1>
             <p className="text-neutral-500 text-lg">
                {mode === 'create' ? 'Room created successfully.' : mode === 'join' ? 'You joined the room.' : 'Welcome to the study room.'}
             </p>
           </div>

           {/* Participants List */}
           <div className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 text-left">
              <h3 className="text-neutral-500 text-xs font-medium uppercase tracking-wider mb-3">Participants</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {participants.length > 0 ? (
                  participants.map((p, index) => (
                    <div key={index} className="flex items-center gap-3 p-2 bg-neutral-900 border border-neutral-800/50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/20">
                         {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <span className="text-neutral-300 font-medium">{p.name || 'Unknown'}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-neutral-600 text-sm italic">Waiting for others...</div>
                )}
              </div>
           </div>

           <div className="pt-4">
               <button 
                  onClick={() => navigate('/group')}
                  className="flex items-center justify-center gap-2 w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-medium py-3.5 rounded-xl border border-neutral-700 hover:border-neutral-600 transition-all active:scale-[0.98]"
              >
                  <LogOut size={18} />
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