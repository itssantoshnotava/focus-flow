import React, { useState, useEffect, useMemo } from 'react';
import { ref, get, set, onValue, remove } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { Search as SearchIcon, Sparkles, Users, ArrowRight, Loader2, UserCircle2, Check, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const SearchPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'search' | 'discover'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [discoverLimit, setDiscoverLimit] = useState(5);

  // --- Data Sync ---

  // 1. Listen to My Following
  useEffect(() => {
    if (!user) return;
    const followingRef = ref(database, `following/${user.uid}`);
    const unsub = onValue(followingRef, (snapshot) => {
        setFollowing(snapshot.val() || {});
    });
    return () => unsub();
  }, [user]);

  // 2. Discovery Logic
  useEffect(() => {
    if (!user || activeTab !== 'discover') return;
    
    const fetchDiscoverable = async () => {
      setLoading(true);
      try {
        const usersSnap = await get(ref(database, 'users'));
        if (usersSnap.exists()) {
          const allUsers = usersSnap.val();
          
          const filtered = Object.entries(allUsers)
            .map(([uid, data]: [string, any]) => ({ uid, ...data }))
            .filter(u => {
              const isMe = u.uid === user.uid;
              const isFollowingAlready = following[u.uid];
              return !isMe && !isFollowingAlready && u.name;
            })
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
  }, [user, activeTab, Object.keys(following).length]);

  // --- Handlers ---

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !user) return;

    setLoading(true);
    try {
      const snapshot = await get(ref(database, 'users'));
      if (snapshot.exists()) {
        const results = Object.entries(snapshot.val())
          .map(([uid, data]: [string, any]) => ({ uid, ...data }))
          .filter(u => {
            const isMe = u.uid === user.uid;
            const matchesName = u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase());
            return !isMe && matchesName;
          });
        setSearchResults(results);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async (e: React.MouseEvent, targetUid: string) => {
    e.stopPropagation();
    if (!user) return;
    
    const isCurrentlyFollowing = following[targetUid];
    const myFollowingRef = ref(database, `following/${user.uid}/${targetUid}`);
    const theirFollowersRef = ref(database, `followers/${targetUid}/${user.uid}`);

    if (isCurrentlyFollowing) {
        await remove(myFollowingRef);
        await remove(theirFollowersRef);
    } else {
        await set(myFollowingRef, true);
        await set(theirFollowersRef, true);
    }
  };

  // Fixed: Typing sub-component as React.FC ensures React handles the reserved 'key' prop correctly in list iterations
  const UserCard: React.FC<{ u: any }> = ({ u }) => {
    const isFollowed = following[u.uid];
    
    return (
      <div 
        onClick={() => navigate(`/profile/${u.uid}`)}
        className="group relative flex items-center justify-between p-4 bg-neutral-900/40 backdrop-blur-xl border border-white/5 rounded-2xl cursor-pointer hover:bg-neutral-800/60 transition-all duration-300 overflow-hidden"
      >
        <div className="flex items-center gap-4 relative z-10">
          <div className="relative">
            {u.photoURL ? (
              <img src={u.photoURL} className="w-12 h-12 rounded-xl object-cover border border-white/10" alt={u.name} />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center text-sm font-bold text-neutral-500 border border-white/5">
                {u.name?.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-white font-semibold tracking-tight">{u.name}</span>
            {u.stream && <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">{u.stream}</span>}
          </div>
        </div>

        <button 
            onClick={(e) => handleFollowToggle(e, u.uid)}
            className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-all active:scale-95 relative z-10 ${isFollowed ? 'bg-neutral-800 text-neutral-400 border border-white/5' : 'bg-indigo-600 text-white shadow-lg'}`}
        >
            {isFollowed ? <Check size={14} /> : <UserPlus size={14} />}
            <span>{isFollowed ? 'Following' : 'Follow'}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 p-4 md:p-8 overflow-y-auto custom-scrollbar relative">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/5 blur-[120px] pointer-events-none -z-0"></div>

      <div className="max-w-4xl w-full mx-auto space-y-8 relative z-10">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <SearchIcon size={32} className="text-indigo-500" /> Community
            </h1>
            
            <div className="flex bg-neutral-900/60 backdrop-blur-md p-1 rounded-xl border border-white/5">
              <button onClick={() => setActiveTab('search')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'search' ? 'bg-indigo-600 text-white' : 'text-neutral-500'}`}>Search</button>
              <button onClick={() => setActiveTab('discover')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'discover' ? 'bg-indigo-600 text-white' : 'text-neutral-500'}`}>Discover</button>
            </div>
          </div>

          {activeTab === 'search' && (
            <div className="bg-neutral-900/40 backdrop-blur-2xl border border-white/5 p-2 rounded-[24px]">
              <form onSubmit={handleSearch} className="flex gap-2">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find creators..."
                  className="w-full bg-transparent text-white pl-4 pr-4 py-4 rounded-2xl focus:outline-none"
                />
                <button type="submit" disabled={loading} className="bg-white text-black px-8 rounded-2xl font-bold">Search</button>
              </form>
            </div>
          )}
        </div>

        <div className="space-y-10">
          {activeTab === 'search' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchResults.map(u => <UserCard key={u.uid} u={u} />)}
            </div>
          )}

          {activeTab === 'discover' && (
            <div className="space-y-6">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-neutral-400">Discover Creators</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {discoverUsers.slice(0, discoverLimit).map(u => <UserCard key={u.uid} u={u} />)}
              </div>
              {discoverLimit < discoverUsers.length && (
                <button onClick={() => setDiscoverLimit(l => l + 5)} className="w-full py-3 bg-neutral-900 border border-white/5 rounded-xl text-neutral-400 font-bold text-sm">Load more</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};