import React, { useState, useEffect } from 'react';
import { ref, get, set, remove, onValue, update } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { Search, UserPlus, Users, X, Check, Clock, User as UserIcon } from 'lucide-react';

interface FriendsSystemProps {
  onClose: () => void;
}

export const FriendsSystem: React.FC<FriendsSystemProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends');
  
  // Data State
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());

  // --- 1. Fetch Friends & Requests ---
  useEffect(() => {
    if (!user) return;

    // Listen to Friends
    const friendsRef = ref(database, `friends/${user.uid}`);
    const unsubFriends = onValue(friendsRef, async (snapshot) => {
      if (snapshot.exists()) {
        const friendIds = Object.keys(snapshot.val());
        // Fetch details for each friend
        const promises = friendIds.map(uid => get(ref(database, `users/${uid}`)).then(s => ({ uid, ...s.val() })));
        const friendsData = await Promise.all(promises);
        setFriends(friendsData.filter(f => f.name)); // Filter out potential nulls
      } else {
        setFriends([]);
      }
    });

    // Listen to Incoming Requests
    const requestsRef = ref(database, `friendRequests/${user.uid}`);
    const unsubRequests = onValue(requestsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const reqList = Object.entries(data).map(([key, val]: [string, any]) => ({
          uid: key,
          ...val
        }));
        setRequests(reqList);
      } else {
        setRequests([]);
      }
    });

    return () => {
      unsubFriends();
      unsubRequests();
    };
  }, [user]);

  // --- 2. Search Logic ---
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !user) return;

    setLoading(true);
    try {
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      
      if (snapshot.exists()) {
        const allUsers = snapshot.val();
        const results = Object.entries(allUsers)
          .map(([uid, data]: [string, any]) => ({ uid, ...data }))
          .filter(u => {
            // Filter conditions:
            // 1. Not myself
            // 2. Name matches query (case-insensitive)
            // 3. Not already a friend
            const isMe = u.uid === user.uid;
            const matchesName = u.name?.toLowerCase().includes(searchQuery.toLowerCase());
            const isFriend = friends.some(f => f.uid === u.uid);
            return !isMe && matchesName && !isFriend;
          });
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // --- 3. Actions ---
  const sendRequest = async (targetUid: string) => {
    if (!user) return;

    // Optimistic UI update
    setSentRequests(prev => new Set(prev).add(targetUid));

    try {
      // Check for existing request to avoid duplicates
      const targetReqRef = ref(database, `friendRequests/${targetUid}/${user.uid}`);
      const existing = await get(targetReqRef);
      
      if (!existing.exists()) {
        await set(targetReqRef, {
          name: user.displayName,
          photoURL: user.photoURL,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.error(err);
      setSentRequests(prev => {
          const next = new Set(prev);
          next.delete(targetUid);
          return next;
      });
    }
  };

  const acceptRequest = async (requesterUid: string) => {
    if (!user) return;
    try {
      const updates: any = {};
      // Add to my friends
      updates[`friends/${user.uid}/${requesterUid}`] = true;
      // Add to their friends
      updates[`friends/${requesterUid}/${user.uid}`] = true;
      // Remove request
      updates[`friendRequests/${user.uid}/${requesterUid}`] = null;

      await update(ref(database), updates);
    } catch (err) {
      console.error(err);
    }
  };

  const rejectRequest = async (requesterUid: string) => {
    if (!user) return;
    try {
      await remove(ref(database, `friendRequests/${user.uid}/${requesterUid}`));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Users size={20} className="text-indigo-500" /> Friends
          </h2>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-900/50">
          <button 
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'friends' ? 'text-indigo-400 border-indigo-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
          >
            My Friends
          </button>
          <button 
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 relative ${activeTab === 'requests' ? 'text-indigo-400 border-indigo-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
          >
            Requests
            {requests.length > 0 && (
              <span className="absolute top-2 right-4 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'search' ? 'text-indigo-400 border-indigo-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
          >
            Find
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-neutral-950/50">
          
          {/* FRIENDS TAB */}
          {activeTab === 'friends' && (
            <div className="space-y-3">
              {friends.length > 0 ? (
                friends.map(friend => (
                  <div key={friend.uid} className="flex items-center gap-3 p-3 bg-neutral-900 border border-neutral-800 rounded-xl">
                    {friend.photoURL ? (
                      <img src={friend.photoURL} alt={friend.name} className="w-10 h-10 rounded-full border border-neutral-700" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                        {friend.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <span className="text-neutral-200 font-medium">{friend.name}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-neutral-600 italic">
                  No friends yet. <br/> Use the "Find" tab to add people!
                </div>
              )}
            </div>
          )}

          {/* REQUESTS TAB */}
          {activeTab === 'requests' && (
            <div className="space-y-3">
              {requests.length > 0 ? (
                requests.map(req => (
                  <div key={req.uid} className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 rounded-xl">
                    <div className="flex items-center gap-3">
                      {req.photoURL ? (
                        <img src={req.photoURL} alt={req.name} className="w-10 h-10 rounded-full border border-neutral-700" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                          {req.name?.charAt(0) || '?'}
                        </div>
                      )}
                      <div className="flex flex-col">
                         <span className="text-neutral-200 font-medium">{req.name}</span>
                         <span className="text-neutral-600 text-xs">Requested a friend connection</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => acceptRequest(req.uid)}
                        className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500/20 transition-colors"
                        title="Accept"
                      >
                        <Check size={18} />
                      </button>
                      <button 
                        onClick={() => rejectRequest(req.uid)}
                        className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
                        title="Reject"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-neutral-600 italic">
                  No pending requests.
                </div>
              )}
            </div>
          )}

          {/* SEARCH TAB */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-3.5 text-neutral-500" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name..."
                    className="w-full bg-neutral-900 border border-neutral-800 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 placeholder:text-neutral-600 text-sm"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={loading} 
                  className="bg-indigo-600 text-white px-4 rounded-xl font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
                >
                  Search
                </button>
              </form>

              <div className="space-y-3">
                {searchResults.map(result => (
                  <div key={result.uid} className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 rounded-xl">
                    <div className="flex items-center gap-3">
                      {result.photoURL ? (
                        <img src={result.photoURL} alt={result.name} className="w-10 h-10 rounded-full border border-neutral-700" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-bold text-neutral-500">
                          {result.name?.charAt(0) || '?'}
                        </div>
                      )}
                      <span className="text-neutral-200 font-medium">{result.name}</span>
                    </div>
                    {sentRequests.has(result.uid) ? (
                       <span className="text-xs text-neutral-500 flex items-center gap-1 px-3 py-1.5 bg-neutral-800 rounded-lg">
                         <Clock size={12} /> Sent
                       </span>
                    ) : (
                      <button 
                        onClick={() => sendRequest(result.uid)}
                        className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-700 hover:text-white transition-all"
                      >
                        <UserPlus size={14} /> Add
                      </button>
                    )}
                  </div>
                ))}
                {searchResults.length === 0 && searchQuery && !loading && (
                   <div className="text-center py-4 text-neutral-600 text-sm">
                      No users found. Try a different name.
                   </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};