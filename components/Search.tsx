import React, { useState, useEffect } from 'react';
import { ref, get, set, onValue } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { Search as SearchIcon, UserPlus, Clock } from 'lucide-react';

export const SearchPage: React.FC = () => {
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [myFriends, setMyFriends] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());

  // Listen to Friends
  useEffect(() => {
      if (!user) return;
      const friendsRef = ref(database, `friends/${user.uid}`);
      onValue(friendsRef, async (snapshot) => {
          if (snapshot.exists()) {
              const friendIds = Object.keys(snapshot.val());
              const promises = friendIds.map(uid => get(ref(database, `users/${uid}`)).then(s => ({ uid, ...s.val() })));
              const res = await Promise.all(promises);
              setMyFriends(res);
          } else {
              setMyFriends([]);
          }
      });
  }, [user]);

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
          .map(([uid, data]: [string, any]) => ({ uid, name: data?.name, photoURL: data?.photoURL }))
          .filter(u => {
            const isMe = u.uid === user.uid;
            const matchesName = u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase());
            const isFriend = myFriends.some(f => f.uid === u.uid);
            return !isMe && matchesName && !isFriend;
          });
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error(err);
      setSearchResults([]);
    }
    setLoading(false);
  };

  const sendRequest = async (targetUid: string) => {
    if (!user) return;
    setSentRequests(prev => new Set(prev).add(targetUid));
    try {
      const targetReqRef = ref(database, `friendRequests/${targetUid}/${user.uid}`);
      const existing = await get(targetReqRef);
      if (!existing.exists()) {
        await set(targetReqRef, { name: user.displayName, photoURL: user.photoURL, timestamp: Date.now() });
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 p-6 md:p-12 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl w-full mx-auto space-y-12">
            
            {/* SEARCH SECTION */}
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                    <SearchIcon size={32} className="text-indigo-500" /> Find Friends
                </h1>
                
                <form onSubmit={handleSearch} className="flex gap-4">
                    <div className="relative flex-1">
                        <SearchIcon size={20} className="absolute left-4 top-4 text-neutral-500" />
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Enter username..."
                            className="w-full bg-neutral-900 border border-neutral-800 text-white pl-12 pr-4 py-4 rounded-xl focus:outline-none focus:border-indigo-500 transition-all placeholder:text-neutral-600 text-lg"
                        />
                    </div>
                    <button type="submit" disabled={loading} className="bg-indigo-600 text-white px-8 rounded-xl font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50">
                        Search
                    </button>
                </form>

                <div className="space-y-4">
                    {searchResults.map(result => (
                        <div key={result.uid} className="flex items-center justify-between p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                            <div className="flex items-center gap-4">
                                {result.photoURL ? <img src={result.photoURL} className="w-12 h-12 rounded-full border border-neutral-700" /> : <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-bold text-neutral-500">{result.name?.charAt(0)}</div>}
                                <span className="text-white text-lg font-medium">{result.name}</span>
                            </div>
                            {sentRequests.has(result.uid) ? (
                                <span className="text-xs text-neutral-500 flex items-center gap-2 px-4 py-2 bg-neutral-950 rounded-lg border border-neutral-800"><Clock size={14} /> Request Sent</span>
                            ) : (
                                <button onClick={() => sendRequest(result.uid)} className="flex items-center gap-2 bg-white text-black text-sm font-bold px-4 py-2 rounded-lg hover:bg-neutral-200 transition-colors"><UserPlus size={16} /> Add Friend</button>
                            )}
                        </div>
                    ))}
                    {searchResults.length === 0 && searchQuery && !loading && <div className="text-neutral-600 text-center py-4">No users found.</div>}
                </div>
            </div>

            {/* MY FRIENDS SECTION */}
            <div className="space-y-6 pt-6 border-t border-neutral-900">
                <h2 className="text-xl font-bold text-neutral-400 uppercase tracking-wide">My Friends</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {myFriends.length > 0 ? (
                        myFriends.map(friend => (
                            <div key={friend.uid} className="flex items-center gap-4 p-4 bg-neutral-900/50 border border-neutral-900 rounded-xl">
                                {friend.photoURL ? <img src={friend.photoURL} className="w-10 h-10 rounded-full border border-neutral-800" /> : <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">{friend.name?.charAt(0)}</div>}
                                <span className="text-neutral-200 font-medium">{friend.name}</span>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full text-center py-12 text-neutral-700 italic">You haven't added any friends yet.</div>
                    )}
                </div>
            </div>

        </div>
    </div>
  );
};