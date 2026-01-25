import React, { useState, useEffect } from 'react';
import { ref, update, remove, onValue } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { Bell, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const requestsRef = ref(database, `friendRequests/${user.uid}`);
    const unsub = onValue(requestsRef, (snapshot) => {
      if (snapshot.exists()) {
        const reqList = Object.entries(snapshot.val()).map(([key, val]: [string, any]) => ({ uid: key, ...val }));
        setRequests(reqList);
      } else {
        setRequests([]);
      }
    });
    return () => unsub();
  }, [user]);

  const acceptRequest = async (e: React.MouseEvent, requesterUid: string) => {
    e.stopPropagation();
    if (!user) return;
    const updates: any = {};
    updates[`friends/${user.uid}/${requesterUid}`] = true;
    updates[`friends/${requesterUid}/${user.uid}`] = true;
    updates[`friendRequests/${user.uid}/${requesterUid}`] = null;
    await update(ref(database), updates);
  };

  const rejectRequest = async (e: React.MouseEvent, requesterUid: string) => {
    e.stopPropagation();
    if (!user) return;
    await remove(ref(database, `friendRequests/${user.uid}/${requesterUid}`));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 p-6 md:p-12 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl w-full mx-auto space-y-8">
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                <Bell size={32} className="text-orange-500" /> Notifications
            </h1>

            <div className="space-y-4">
                {requests.length > 0 ? (
                    requests.map(req => (
                        <div key={req.uid} onClick={() => navigate(`/profile/${req.uid}`)} className="flex items-center justify-between p-6 bg-neutral-900 border border-neutral-800 rounded-xl shadow-lg cursor-pointer hover:bg-neutral-800 transition-colors">
                            <div className="flex items-center gap-4">
                                {req.photoURL ? <img src={req.photoURL} className="w-14 h-14 rounded-full border border-neutral-700" /> : <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-xl font-bold text-white">{req.name?.charAt(0)}</div>}
                                <div className="flex flex-col">
                                    <span className="text-white text-lg font-bold">{req.name}</span>
                                    <span className="text-neutral-500 text-sm">wants to be friends</span>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={(e) => acceptRequest(e, req.uid)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                                    <Check size={18} /> Accept
                                </button>
                                <button onClick={(e) => rejectRequest(e, req.uid)} className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-lg font-medium transition-colors">
                                    <X size={18} /> Decline
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-neutral-600 space-y-4">
                        <Bell size={48} className="opacity-20" />
                        <p className="text-lg">No new notifications</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};