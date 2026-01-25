import React, { useEffect, useState, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { Trophy, Medal, User } from 'lucide-react';

interface LeaderboardEntry {
  uid: string;
  name: string;
  photoURL: string;
  seconds: number;
}

export const FriendsLeaderboard: React.FC = () => {
  const { user } = useAuth();
  const [friendsSet, setFriendsSet] = useState<Set<string>>(new Set());
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // 1. Listen to My Friends List
  useEffect(() => {
    if (!user) return;
    const friendsRef = ref(database, `friends/${user.uid}`);
    const unsubscribe = onValue(friendsRef, (snapshot) => {
      const ids = new Set<string>();
      if (snapshot.exists()) {
        Object.keys(snapshot.val()).forEach(key => ids.add(key));
      }
      ids.add(user.uid); // Always include self
      setFriendsSet(ids);
    });
    return () => unsubscribe();
  }, [user]);

  // 2. Listen to Users Data (Global listener, filtered locally)
  // Note: For a large production app, we would fetch individual users or use Cloud Functions.
  // For this minimalist app, this provides real-time updates efficiently enough.
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

  // 3. Construct and Sort Leaderboard
  const leaderboard = useMemo(() => {
    const entries: LeaderboardEntry[] = [];
    
    friendsSet.forEach(uid => {
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
  }, [friendsSet, usersMap]);

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
    <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl flex flex-col gap-4 relative overflow-hidden">
        {/* Subtle Background Glow */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50"></div>

        <div className="flex items-center justify-between">
            <h3 className="text-neutral-200 font-medium flex items-center gap-2">
                <Trophy size={18} className="text-indigo-500" /> Leaderboard
            </h3>
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Friends Only</span>
        </div>

        <div className="flex flex-col gap-2">
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
                                    {entry.name.charAt(0)}
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
                    No stats available yet. <br/> Start the timer to rank up!
                </div>
            )}
            
            {leaderboard.length === 1 && (
                 <div className="text-center py-2 text-xs text-neutral-600">
                    Add friends to compete!
                 </div>
            )}
        </div>
    </div>
  );
};