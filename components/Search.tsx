import React, { useState, useEffect, useMemo } from 'react';
import { ref, get, set, onValue } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { Search as SearchIcon, UserPlus, Clock, Sparkles, Users, ArrowRight, Loader2, UserCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const SearchPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'search' | 'discover'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<any[]>([]);
  const [myFriends, setMyFriends] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [discoverLimit, setDiscoverLimit] = useState(5);

  // --- Data Sync ---

  // 1. Listen to Friends
  useEffect(() => {
    if (!user) return;
    const friendsRef = ref(database, `friends/${user.uid}`);
    const unsub = onValue(friendsRef, async (snapshot) => {
      if (snapshot.exists()) {
        const friendIds = Object.keys(snapshot.val());
        const promises = friendIds.map(uid => get(ref(database, `users/${uid}`)).then(s => ({ uid, ...s.val() })));
        const res = await Promise.all(promises);
        setMyFriends(res.filter(f => f.name));
      } else {
        setMyFriends([]);
      }
    });
    return () => unsub();
  }, [user]);

  // 2. Listen to Incoming Friend Requests (to filter out)
  useEffect(() => {
    if (!user) return;
    const requestsRef = ref(database, `friendRequests/${user.uid}`);
    const unsub = onValue(requestsRef, (snapshot) => {
      if (snapshot.exists()) {
        setIncomingRequests(new Set(Object.keys(snapshot.val())));
      } else {
        setIncomingRequests(new Set());
      }
    });
    return () => unsub();
  }, [user]);

  // 3. Discovery Logic
  useEffect(() => {
    if (!user || activeTab !== 'discover') return;
    
    const fetchDiscoverable = async () => {
      setLoading(true);
      try {
        const usersSnap = await get(ref(database, 'users'));
        if (usersSnap.exists()) {
          const allUsers = usersSnap.val();
          const friendUids = new Set(myFriends.map(f => f.uid));
          
          const filtered = Object.entries(allUsers)
            .map(([uid, data]: [string, any]) => ({ uid, ...data }))
            .filter(u => {
              const isMe = u.uid === user.uid;
              const isFriend = friendUids.has(u.uid);
              const hasIncoming = incomingRequests.has(u.uid);
              const hasSent = sentRequests.has(u.uid);
              return !isMe && !isFriend && !hasIncoming && !hasSent && u.name;
            })
            // Simple session-based shuffle
            .sort(() => 0.5 - Math.random());
            
          setDiscoverUsers(filtered);
        }
      } catch (err) {
        console.error("Discovery failed", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiscoverable();
  }, [user, activeTab, myFriends.length, incomingRequests.size]);

  // --- Handlers ---

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !user) return;

    setLoading(true);
    try {
      const snapshot = await get(ref(database, 'users'));
      if (snapshot.exists()) {
        const friendUids = new Set(myFriends.map(f => f.uid));
        const results = Object.entries(snapshot.val())
          .map(([uid, data]: [string, any]) => ({ uid, ...data }))
          .filter(u => {
            const isMe = u.uid === user.uid;
            const matchesName = u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase());
            const isFriend = friendUids.has(u.uid);
            return !isMe && matchesName && !isFriend;
          });
        setSearchResults(results);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendRequest = async (e: React.MouseEvent, targetUid: string) => {
    e.stopPropagation();
    if (!user) return;
    
    // Optimistic UI
    setSentRequests(prev => new Set(prev).add(targetUid));
    
    try {
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
      // Rollback if needed, but for simplicity we keep it
    }
  };

  // Fixed: Added 'key' to props type to satisfy TypeScript when mapping in JSX
  const UserCard = ({ u, showAdd = true }: { u: any; showAdd?: boolean; key?: React.Key }) => {
    const isSent = sentRequests.has(u.uid);
    
    return (
      <div 
        onClick={() => navigate(`/profile/${u.uid}`)}
        className="group relative flex items-center justify-between p-4 bg-neutral-900/40 backdrop-blur-xl border border-white/5 rounded-2xl cursor-pointer hover:bg-neutral-800/60 hover:border-white/10 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
      >
        {/* Glow Effect on Hover */}
        <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="relative">
            {u.photoURL ? (
              <img src={u.photoURL} className="w-12 h-12 rounded-xl object-cover border border-white/10" alt={u.name} />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center text-sm font-bold text-neutral-500 border border-white/5">
                {u.name?.charAt(0)}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-neutral-950 border-2 border-neutral-950">
               <div className="w-full h-full rounded-full bg-neutral-700" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-white font-semibold tracking-tight">{u.name}</span>
            {u.stream && <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">{u.stream}</span>}
          </div>
        </div>

        {showAdd && (
          <div className="relative z-10">
            {isSent ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-950/50 rounded-lg text-neutral-500 text-xs font-bold border border-white/5">
                <Clock size={12} />
                <span>Sent</span>
              </div>
            ) : (
              <button 
                onClick={(e) => sendRequest(e, u.uid)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all active:scale-95 shadow-lg shadow-indigo-900/20"
              >
                <UserPlus size={14} />
                <span>Add</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 p-4 md:p-8 overflow-y-auto custom-scrollbar relative">
      {/* Ambient background accent */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/5 blur-[120px] pointer-events-none -z-0"></div>

      <div className="max-w-4xl w-full mx-auto space-y-8 relative z-10">
        
        {/* Header Section */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <SearchIcon size={32} className="text-indigo-500" /> Community
            </h1>
            
            {/* Tab Switcher */}
            <div className="flex bg-neutral-900/60 backdrop-blur-md p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setActiveTab('search')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'search' ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                <SearchIcon size={14} /> Search
              </button>
              <button 
                onClick={() => setActiveTab('discover')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'discover' ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                <Sparkles size={14} /> Make Friends
              </button>
            </div>
          </div>

          {/* Search Bar (Only for Search Tab) */}
          {activeTab === 'search' && (
            <div className="bg-neutral-900/40 backdrop-blur-2xl border border-white/5 p-2 rounded-[24px] shadow-2xl">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <SearchIcon size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Find users by name..."
                    className="w-full bg-transparent text-white pl-12 pr-4 py-4 rounded-2xl focus:outline-none placeholder:text-neutral-700 text-lg font-medium"
                  />
                </div>
                <button type="submit" disabled={loading} className="bg-white text-black px-8 rounded-2xl font-bold hover:bg-neutral-200 transition-all disabled:opacity-50 active:scale-95">
                  {loading ? <Loader2 size={20} className="animate-spin" /> : 'Search'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="space-y-10">
          
          {/* SEARCH TAB RESULTS */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              {searchResults.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResults.map(u => <UserCard key={u.uid} u={u} />)}
                </div>
              ) : searchQuery && !loading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-neutral-900/20 rounded-[32px] border border-dashed border-white/5">
                   <UserCircle2 size={48} className="text-neutral-800 mb-4" />
                   <p className="text-neutral-600 font-medium">No users found matching "{searchQuery}"</p>
                </div>
              ) : !searchQuery && (
                <div className="flex flex-col items-center justify-center py-20">
                   <Users size={64} className="text-neutral-900 mb-4" />
                   <p className="text-neutral-700 font-medium text-center max-w-xs">Enter a name above to search for specific people in FocusFlow.</p>
                </div>
              )}
            </div>
          )}

          {/* DISCOVER TAB */}
          {activeTab === 'discover' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-neutral-400">
                 <Sparkles size={16} className="text-indigo-400" />
                 <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Suggested for you</h2>
              </div>

              {loading && discoverUsers.length === 0 ? (
                <div className="flex justify-center py-20">
                  <Loader2 size={32} className="animate-spin text-indigo-500" />
                </div>
              ) : discoverUsers.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {discoverUsers.slice(0, discoverLimit).map(u => <UserCard key={u.uid} u={u} />)}
                  </div>
                  
                  {discoverLimit < discoverUsers.length && (
                    <div className="flex justify-center pt-4">
                      <button 
                        onClick={() => setDiscoverLimit(prev => prev + 5)}
                        className="flex items-center gap-2 px-6 py-3 bg-neutral-900 border border-white/5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all font-bold text-sm"
                      >
                        Load more people <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-neutral-900/20 rounded-[32px] border border-dashed border-white/5">
                   <Sparkles size={48} className="text-neutral-800 mb-4" />
                   <p className="text-neutral-600 font-medium">No new people to discover right now.</p>
                   <button 
                     onClick={() => setActiveTab('search')}
                     className="mt-4 text-indigo-500 text-sm font-bold hover:underline"
                   >
                     Try searching manually
                   </button>
                </div>
              )}
            </div>
          )}

          {/* MY FRIENDS (Always Visible Footer section on Search page) */}
          <div className="pt-10 border-t border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-white tracking-tight">Your Circle</h2>
              <span className="px-3 py-1 bg-neutral-900 rounded-full text-[10px] font-black text-neutral-500 uppercase tracking-widest border border-white/5">
                {myFriends.length} Friends
              </span>
            </div>

            {myFriends.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {myFriends.map(friend => (
                  <div 
                    key={friend.uid} 
                    onClick={() => navigate(`/profile/${friend.uid}`)}
                    className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    {friend.photoURL ? (
                      <img src={friend.photoURL} className="w-10 h-10 rounded-xl object-cover border border-white/10" alt={friend.name} />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                        {friend.name?.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm font-semibold text-neutral-200 truncate">{friend.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 bg-neutral-900/20 rounded-[28px] border border-dashed border-white/5 text-center">
                 <p className="text-neutral-600 text-sm font-medium italic">Your friend list is empty. Start adding people to see them here!</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};