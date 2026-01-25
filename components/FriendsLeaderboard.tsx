import React, { useEffect, useState, useMemo } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { Trophy, Medal, Users, ChevronDown } from 'lucide-react';

interface LeaderboardEntry {
  uid: string;
  name: string;
  photoURL: string;
  seconds: number;
}

interface Group {
    id: string;
    name: string;
}

export const FriendsLeaderboard: React.FC = () => {
  const { user } = useAuth();
  
  // State
  const [filterMode, setFilterMode] = useState<'friends' | 'group'>('friends');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  
  const [targetUids, setTargetUids] = useState<Set<string>>(new Set());
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // 1. Fetch User's Groups
  useEffect(() => {
      if (!user) return;
      const groupsRef = ref(database, `users/${user.uid}/groupChats`);
      
      onValue(groupsRef, async (snap) => {
          if (snap.exists()) {
              const ids = Object.keys(snap.val());
              const promises = ids.map(id => get(ref(database, `groupChats/${id}`)).then(s => ({ id, name: s.val()?.name || 'Unknown Group' })));
              const groups = await Promise.all(promises);
              setMyGroups(groups);
              if (groups.length > 0 && !selectedGroupId) {
                  setSelectedGroupId(groups[0].id);
              }
          }
      });
  }, [user]);

  // 2. Determine Target UIDs based on Filter
  useEffect(() => {
    if (!user) return;

    if (filterMode === 'friends') {
        const friendsRef = ref(database, `friends/${user.uid}`);
        onValue(friendsRef, (snapshot) => {
            const ids = new Set<string>();
            if (snapshot.exists()) {
                Object.keys(snapshot.val()).forEach(key => ids.add(key));
            }
            ids.add(user.uid); // Always include self
            setTargetUids(ids);
        });
    } else if (filterMode === 'group' && selectedGroupId) {
        const groupMembersRef = ref(database, `groupChats/${selectedGroupId}/members`);
        onValue(groupMembersRef, (snapshot) => {
            const ids = new Set<string>();
            if (snapshot.exists()) {
                Object.keys(snapshot.val()).forEach(key => ids.add(key));
            }
            setTargetUids(ids);
        });
    }
  }, [user, filterMode, selectedGroupId]);

  // 3. Listen to All Users (Global listener, filtered locally)
  useEffect(() => {
    const usersRef = ref(database, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        setUsersMap(snapshot.val());
      } else {
        setUsersMap({});
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 4. Construct Leaderboard
  const leaderboard = useMemo(() => {
    const entries: LeaderboardEntry[] = [];
    
    targetUids.forEach(uid => {
      const userData = usersMap[uid];
      if (userData) {
        entries.push({
          uid,
          name: userData.name || 'Anonymous',
          photoURL: userData.photoURL,
          seconds: userData.totalStudySeconds || 0
        });
      }
    });

    return entries.sort((a, b) => b.seconds - a.seconds);
  }, [targetUids, usersMap]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m`;
    return '0m';
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy size={16} className="text-yellow-500" />;
    if (index === 1) return <Medal size={16} className="text-gray-400" />;
    if (index === 2) return <Medal size={16} className="text-amber-700" />;
    return <span className="text-neutral-500 font-mono text-xs w-4 text-center">{index + 1}</span>;
  };

  if (loading) return null;

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl flex flex-col gap-4 relative overflow-hidden h-full">
        {/* Subtle Background Glow */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50"></div>

        {/* Header with Filter */}
        <div className="flex items-center justify-between">
            <h3 className="text-neutral-200 font-medium flex items-center gap-2">
                <Trophy size={18} className="text-indigo-500" /> Leaderboard
            </h3>
            
            <div className="relative group">
                <button className="flex items-center gap-1 text-[10px] uppercase font-bold text-neutral-500 hover:text-white transition-colors bg-neutral-950 px-2 py-1 rounded-lg border border-neutral-800">
                    {filterMode === 'friends' ? 'Friends' : 'Group'} <ChevronDown size={12} />
                </button>
                
                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-1 w-32 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-10 hidden group-hover:block p-1">
                    <button 
                        onClick={() => setFilterMode('friends')}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-neutral-800 ${filterMode === 'friends' ? 'text-indigo-400 font-medium' : 'text-neutral-400'}`}
                    >
                        Friends Only
                    </button>
                    {myGroups.length > 0 && (
                        <>
                            <div className="h-px bg-neutral-800 my-1"></div>
                            <div className="text-[9px] text-neutral-600 px-2 py-1 uppercase">Groups</div>
                            {myGroups.map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => { setFilterMode('group'); setSelectedGroupId(g.id); }}
                                    className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-neutral-800 truncate ${filterMode === 'group' && selectedGroupId === g.id ? 'text-indigo-400 font-medium' : 'text-neutral-400'}`}
                                >
                                    {g.name}
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>

        {/* Selected Group Name Indicator */}
        {filterMode === 'group' && selectedGroupId && (
            <div className="text-xs text-indigo-400 flex items-center gap-1.5 -mt-2">
                <Users size={10} /> 
                {myGroups.find(g => g.id === selectedGroupId)?.name}
            </div>
        )}

        <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar max-h-[400px]">
            {leaderboard.length > 0 ? (
                leaderboard.map((entry, index) => (
                    <div 
                        key={entry.uid} 
                        className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                            entry.uid === user?.uid 
                            ? 'bg-indigo-900/20 border border-indigo-500/20' 
                            : 'bg-neutral-950/50 border border-neutral-800/50'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-6 flex justify-center shrink-0">
                                {getRankIcon(index)}
                            </div>
                            
                            {entry.photoURL ? (
                                <img src={entry.photoURL} alt={entry.name} className="w-8 h-8 rounded-full border border-neutral-800" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-400">
                                    {entry.name?.charAt(0)}
                                </div>
                            )}
                            
                            <div className="flex flex-col">
                                <span className={`text-sm font-medium ${entry.uid === user?.uid ? 'text-white' : 'text-neutral-300'}`}>
                                    {entry.uid === user?.uid ? 'You' : entry.name.split(' ')[0]}
                                </span>
                            </div>
                        </div>
                        
                        <span className="text-xs font-mono text-neutral-400 bg-neutral-900 px-2 py-1 rounded">
                            {formatTime(entry.seconds)}
                        </span>
                    </div>
                ))
            ) : (
                <div className="text-center py-6 text-neutral-500 text-sm italic bg-neutral-950/30 rounded-lg">
                    No stats available yet.
                </div>
            )}
            
            {leaderboard.length === 1 && filterMode === 'friends' && (
                 <div className="text-center py-2 text-xs text-neutral-600">
                    Add friends to compete!
                 </div>
            )}
        </div>
    </div>
  );
};