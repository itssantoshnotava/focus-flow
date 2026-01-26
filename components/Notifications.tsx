import React, { useState, useEffect } from 'react';
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { acceptFollowRequest, rejectFollowRequest } from '../utils/followActions';
import { Bell, Check, X, UserPlus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const requestsRef = ref(database, `followRequests/${user.uid}`);
    const unsub = onValue(requestsRef, (snapshot) => {
      if (snapshot.exists()) {
        const reqList = Object.entries(snapshot.val()).map(([key, val]: [string, any]) => ({ uid: key, ...val }));
        setRequests(reqList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      } else {
        setRequests([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleAccept = async (e: React.MouseEvent, requesterUid: string) => {
    e.stopPropagation();
    if (!user) return;
    await acceptFollowRequest(user.uid, requesterUid);
  };

  const handleReject = async (e: React.MouseEvent, requesterUid: string) => {
    e.stopPropagation();
    if (!user) return;
    await rejectFollowRequest(user.uid, requesterUid);
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 p-6 md:p-12 overflow-y-auto custom-scrollbar relative">
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/5 blur-[120px] pointer-events-none -z-0"></div>

        <div className="max-w-2xl w-full mx-auto space-y-8 relative z-10">
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <Bell size={32} className="text-indigo-500" /> Notifications
            </h1>

            <div className="space-y-4">
                {requests.length > 0 ? (
                    requests.map(req => (
                        <div key={req.uid} onClick={() => navigate(`/profile/${req.uid}`)} className="flex items-center justify-between p-6 bg-white/[0.03] border border-white/5 rounded-3xl shadow-lg cursor-pointer hover:bg-white/[0.05] transition-all group overflow-hidden relative">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600"></div>
                            <div className="flex items-center gap-4">
                                {req.photoURL ? <img src={req.photoURL} className="w-14 h-14 rounded-2xl border border-white/5 object-cover" /> : <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-xl font-bold text-white">{req.name?.charAt(0)}</div>}
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white text-lg font-bold">{req.name}</span>
                                        <UserPlus size={16} className="text-indigo-400" />
                                    </div>
                                    <span className="text-neutral-500 text-sm font-medium">requested to follow you</span>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={(e) => handleAccept(e, req.uid)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-indigo-900/20">
                                    <Check size={18} /> Accept
                                </button>
                                <button onClick={(e) => handleReject(e, req.uid)} className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 border border-white/5">
                                    <X size={18} /> Reject
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-neutral-600 space-y-4">
                        <div className="p-6 bg-neutral-900/50 rounded-full border border-white/5">
                            <Bell size={48} className="opacity-20" />
                        </div>
                        <p className="text-lg font-black uppercase tracking-widest opacity-40">No new notifications</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
