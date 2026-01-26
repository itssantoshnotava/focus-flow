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
  const [filterMode, setFilterMode] = useState<'following' | 'group'>('following');
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

  // 2. Determine Target UIDs based on Following Filter
  useEffect(() => {
    if (!user) return;

    if (filterMode === 'following') {
        const followingRef = ref(database, `following/${user.uid}`);
        onValue(followingRef, (snapshot) => {
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

  // 3. Listen to All Users
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
    return `${mins}m`;
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
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50"></div>
        <div className="flex items-center justify-between">
            <h3 className="text-neutral-200 font-medium flex items-center gap-2">
                <Trophy size={18} className="text-indigo-500" /> Rankings
            </h3>
            
            <div className="relative group">
                <button className="flex items-center gap-1 text-[10px] uppercase font-bold text-neutral-500 hover:text-white transition-colors bg-neutral-950 px-2 py-1 rounded-lg border border-neutral-800">
                    {filterMode === 'following' ? 'Following' : 'Group'} <ChevronDown size={12} />
                </button>
                <div className="absolute right-0 top-full mt-1 w-32 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-10 hidden group-hover:block p-1">
                    <button onClick={() => setFilterMode('following')} className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-neutral-800 ${filterMode === 'following' ? 'text-indigo-400' : 'text-neutral-400'}`}>Following</button>
                    {myGroups.map(g => (
                        <button key={g.id} onClick={() => { setFilterMode('group'); setSelectedGroupId(g.id); }} className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-neutral-800 truncate ${filterMode === 'group' && selectedGroupId === g.id ? 'text-indigo-400' : 'text-neutral-400'}`}>{g.name}</button>
                    ))}
                </div>
            </div>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar max-h-[400px]">
            {leaderboard.map((entry, index) => (
                <div key={entry.uid} className={`flex items-center justify-between p-2 rounded-lg ${entry.uid === user?.uid ? 'bg-indigo-900/20 border border-indigo-500/20' : 'bg-neutral-950/50'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-6 flex justify-center">{getRankIcon(index)}</div>
                        {entry.photoURL ? <img src={entry.photoURL} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{entry.name?.charAt(0)}</div>}
                        <span className="text-sm font-medium text-neutral-300">{entry.uid === user?.uid ? 'You' : entry.name.split(' ')[0]}</span>
                    </div>
                    <span className="text-xs font-mono text-neutral-400">{formatTime(entry.seconds)}</span>
                </div>
            ))}
        </div>
    </div>
  );
};