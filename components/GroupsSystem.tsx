import React, { useState, useEffect, useMemo } from 'react';
import { ref, push, update, remove, onValue, get, set } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { Users, Plus, X, Trophy, UserPlus, Trash2, Crown, ArrowLeft, Search, Check } from 'lucide-react';

interface GroupsSystemProps {
  onClose: () => void;
}

export const GroupsSystem: React.FC<GroupsSystemProps> = ({ onClose }) => {
  const { user } = useAuth();
  
  // Navigation State
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'create' | 'details'>('details'); // 'details' covers leaderboard/members
  const [detailsTab, setDetailsTab] = useState<'leaderboard' | 'members'>('leaderboard');
  const [showAddMember, setShowAddMember] = useState(false); // Modal/Overlay for adding members

  // Data State
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [selectedGroupData, setSelectedGroupData] = useState<any | null>(null);
  const [allUsers, setAllUsers] = useState<Record<string, any>>({});
  const [myFriends, setMyFriends] = useState<any[]>([]);

  // Form State
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  // --- 1. Fetch My Groups ---
  useEffect(() => {
    if (!user) return;
    const userGroupsRef = ref(database, `users/${user.uid}/groups`);
    
    const unsub = onValue(userGroupsRef, async (snapshot) => {
        if (snapshot.exists()) {
            const groupIds = Object.keys(snapshot.val());
            // Fetch group details
            const promises = groupIds.map(gid => get(ref(database, `groups/${gid}`)).then(s => ({ id: gid, ...s.val() })));
            const groups = await Promise.all(promises);
            // Filter out nulls (deleted groups)
            setMyGroups(groups.filter(g => g.name)); 
        } else {
            setMyGroups([]);
        }
    });
    return () => unsub();
  }, [user]);

  // --- 2. Fetch Selected Group Data ---
  useEffect(() => {
      if (!selectedGroupId) {
          setSelectedGroupData(null);
          return;
      }
      const groupRef = ref(database, `groups/${selectedGroupId}`);
      const unsub = onValue(groupRef, (snapshot) => {
          if (snapshot.exists()) {
              setSelectedGroupData({ id: selectedGroupId, ...snapshot.val() });
          } else {
              // Group deleted?
              setSelectedGroupId(null);
              setSelectedGroupData(null);
          }
      });
      return () => unsub();
  }, [selectedGroupId]);

  // --- 3. Fetch All Users (for Leaderboard/Member Details) ---
  useEffect(() => {
      const usersRef = ref(database, 'users');
      // In a real app, this should be optimized. For minimal app, this is fine.
      const unsub = onValue(usersRef, (snapshot) => {
          if (snapshot.exists()) {
              setAllUsers(snapshot.val());
          }
      });
      return () => unsub();
  }, []);

  // --- 4. Fetch My Friends (for Adding Members) ---
  useEffect(() => {
      if (!user || !showAddMember) return;
      const friendsRef = ref(database, `friends/${user.uid}`);
      get(friendsRef).then(async (snapshot) => {
          if (snapshot.exists()) {
              const fids = Object.keys(snapshot.val());
              const promises = fids.map(fid => get(ref(database, `users/${fid}`)).then(s => ({ uid: fid, ...s.val() })));
              const friends = await Promise.all(promises);
              setMyFriends(friends);
          }
      });
  }, [user, showAddMember]);


  // --- Actions ---

  const handleCreateGroup = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !newGroupName.trim()) return;
      setCreating(true);

      try {
          // 1. Create Group Entry
          const groupsRef = ref(database, 'groups');
          const newGroupRef = push(groupsRef);
          const groupId = newGroupRef.key;

          if (groupId) {
              await set(newGroupRef, {
                  name: newGroupName.trim(),
                  createdBy: user.uid,
                  createdAt: Date.now(),
                  admins: { [user.uid]: true },
                  members: { [user.uid]: true }
              });

              // 2. Add to User's Group List
              await update(ref(database, `users/${user.uid}/groups`), {
                  [groupId]: true
              });

              setNewGroupName('');
              setSelectedGroupId(groupId);
              setViewMode('details');
              setDetailsTab('leaderboard');
          }
      } catch (err) {
          console.error("Failed to create group", err);
      } finally {
          setCreating(false);
      }
  };

  const handleAddMember = async (friendUid: string) => {
      if (!selectedGroupId || !user) return;
      
      const updates: any = {};
      updates[`groups/${selectedGroupId}/members/${friendUid}`] = true;
      updates[`users/${friendUid}/groups/${selectedGroupId}`] = true;

      try {
          await update(ref(database), updates);
          // Don't close modal immediately, allow adding multiple
      } catch (err) {
          console.error("Failed to add member", err);
      }
  };

  const handleRemoveMember = async (memberUid: string) => {
      if (!selectedGroupId || !user) return;
      // Only admin can remove
      if (!selectedGroupData?.admins?.[user.uid]) return;
      
      // Confirm? (skip for minimalist)

      const updates: any = {};
      updates[`groups/${selectedGroupId}/members/${memberUid}`] = null;
      updates[`users/${memberUid}/groups/${selectedGroupId}`] = null;
      // If removing admin (self logic handled elsewhere, assume generic remove)
      updates[`groups/${selectedGroupId}/admins/${memberUid}`] = null;

      try {
          await update(ref(database), updates);
          // If I removed myself?
          if (memberUid === user.uid) {
              setSelectedGroupId(null);
          }
      } catch (err) {
          console.error("Failed to remove member", err);
      }
  };

  // --- Derived Data ---

  const leaderboard = useMemo(() => {
      if (!selectedGroupData || !allUsers) return [];
      const memberIds = Object.keys(selectedGroupData.members || {});
      
      return memberIds.map(uid => {
          const u = allUsers[uid] || {};
          return {
              uid,
              name: u.name || 'Unknown',
              photoURL: u.photoURL,
              seconds: u.totalStudySeconds || 0
          };
      }).sort((a, b) => b.seconds - a.seconds);
  }, [selectedGroupData, allUsers]);

  const isAdmin = selectedGroupData?.admins?.[user?.uid || ''];

  const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex overflow-hidden animate-in zoom-in-95 duration-200">
         
         {/* LEFT SIDEBAR: LIST */}
         <div className={`w-full md:w-1/3 border-r border-neutral-800 flex flex-col bg-neutral-900 ${selectedGroupId && viewMode !== 'create' ? 'hidden md:flex' : 'flex'}`}>
             <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                 <h2 className="text-white font-bold text-lg flex items-center gap-2">
                     <Users size={20} className="text-indigo-500" /> My Groups
                 </h2>
                 <div className="flex gap-2">
                     <button 
                        onClick={() => {
                            setSelectedGroupId(null);
                            setViewMode('create');
                        }} 
                        className="p-2 bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors"
                        title="Create Group"
                     >
                        <Plus size={18} />
                     </button>
                     <button onClick={onClose} className="md:hidden p-2 text-neutral-500 hover:text-white">
                        <X size={20} />
                     </button>
                 </div>
             </div>
             
             <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                 {myGroups.length > 0 ? (
                     myGroups.map(g => (
                         <button
                            key={g.id}
                            onClick={() => {
                                setSelectedGroupId(g.id);
                                setViewMode('details');
                                setDetailsTab('leaderboard');
                            }}
                            className={`w-full p-3 rounded-xl flex items-center justify-between transition-colors ${selectedGroupId === g.id && viewMode === 'details' ? 'bg-indigo-900/20 border border-indigo-500/20' : 'bg-transparent hover:bg-neutral-800/50 border border-transparent'}`}
                         >
                             <span className={`font-medium ${selectedGroupId === g.id && viewMode === 'details' ? 'text-indigo-300' : 'text-neutral-300'}`}>{g.name}</span>
                             <span className="text-xs text-neutral-600 bg-neutral-950 px-2 py-1 rounded-full">{Object.keys(g.members || {}).length}</span>
                         </button>
                     ))
                 ) : (
                     <div className="text-center py-8 text-neutral-600 text-sm">
                         No groups yet.
                     </div>
                 )}
             </div>
         </div>

         {/* RIGHT CONTENT */}
         <div className={`w-full md:w-2/3 flex flex-col bg-neutral-950 ${!selectedGroupId && viewMode !== 'create' ? 'hidden md:flex' : 'flex'}`}>
             
             {/* MODE: CREATE */}
             {viewMode === 'create' && (
                 <div className="flex-1 flex flex-col items-center justify-center p-8">
                     <div className="w-full max-w-sm space-y-6">
                         <div className="flex items-center gap-3 md:hidden mb-4">
                             <button onClick={() => setViewMode('details')} className="text-neutral-500"><ArrowLeft /></button>
                             <span className="text-white font-bold">New Group</span>
                         </div>
                         <div className="text-center space-y-2">
                             <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-indigo-900/20">
                                 <Plus size={24} className="text-white" />
                             </div>
                             <h2 className="text-2xl font-bold text-white">Create a Group</h2>
                             <p className="text-neutral-500 text-sm">Create a shared leaderboard for you and your friends.</p>
                         </div>
                         <form onSubmit={handleCreateGroup} className="space-y-4">
                             <input 
                                value={newGroupName}
                                onChange={e => setNewGroupName(e.target.value)}
                                placeholder="Group Name (e.g. 'Study Squad')"
                                className="w-full bg-neutral-900 border border-neutral-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
                                autoFocus
                             />
                             <button 
                                type="submit"
                                disabled={!newGroupName.trim() || creating}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
                             >
                                 {creating ? 'Creating...' : 'Create Group'}
                             </button>
                         </form>
                         <button onClick={() => setViewMode('details')} className="w-full text-neutral-500 text-sm hover:text-neutral-300">Cancel</button>
                     </div>
                 </div>
             )}

             {/* MODE: DETAILS */}
             {viewMode === 'details' && selectedGroupData ? (
                 <>
                    {/* Header */}
                    <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSelectedGroupId(null)} className="md:hidden p-1 text-neutral-500"><ArrowLeft size={20} /></button>
                                <h2 className="text-xl font-bold text-white tracking-tight">{selectedGroupData.name}</h2>
                            </div>
                            <button onClick={onClose} className="hidden md:block p-2 text-neutral-500 hover:text-white"><X size={20} /></button>
                        </div>
                        
                        {/* Tabs */}
                        <div className="flex gap-4 text-sm">
                            <button 
                                onClick={() => setDetailsTab('leaderboard')}
                                className={`pb-2 border-b-2 transition-colors flex items-center gap-2 ${detailsTab === 'leaderboard' ? 'text-indigo-400 border-indigo-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                            >
                                <Trophy size={14} /> Leaderboard
                            </button>
                            <button 
                                onClick={() => setDetailsTab('members')}
                                className={`pb-2 border-b-2 transition-colors flex items-center gap-2 ${detailsTab === 'members' ? 'text-indigo-400 border-indigo-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}
                            >
                                <Users size={14} /> Members
                            </button>
                        </div>
                    </div>

                    {/* Content: Leaderboard */}
                    {detailsTab === 'leaderboard' && (
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                            {leaderboard.map((entry, index) => (
                                <div key={entry.uid} className={`flex items-center justify-between p-3 rounded-xl border ${entry.uid === user?.uid ? 'bg-indigo-900/10 border-indigo-500/20' : 'bg-neutral-900 border-neutral-800'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 text-center font-mono text-xs text-neutral-500 font-bold">#{index + 1}</div>
                                        {entry.photoURL ? (
                                            <img src={entry.photoURL} className="w-8 h-8 rounded-full bg-neutral-800" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                                                {entry.name.charAt(0)}
                                            </div>
                                        )}
                                        <span className={`text-sm font-medium ${entry.uid === user?.uid ? 'text-white' : 'text-neutral-300'}`}>{entry.name}</span>
                                    </div>
                                    <span className="font-mono text-sm text-neutral-400">{formatTime(entry.seconds)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Content: Members */}
                    {detailsTab === 'members' && (
                        <div className="flex-1 flex flex-col">
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                                {leaderboard.map(entry => (
                                    <div key={entry.uid} className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            {entry.photoURL ? (
                                                <img src={entry.photoURL} className="w-8 h-8 rounded-full bg-neutral-800" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                                                    {entry.name.charAt(0)}
                                                </div>
                                            )}
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-neutral-200">{entry.name}</span>
                                                {selectedGroupData.admins?.[entry.uid] && <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1"><Crown size={10} /> Admin</span>}
                                            </div>
                                        </div>
                                        {isAdmin && entry.uid !== user?.uid && (
                                            <button 
                                                onClick={() => handleRemoveMember(entry.uid)}
                                                className="p-2 text-red-500 hover:bg-red-900/20 rounded-lg transition-colors"
                                                title="Remove Member"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {isAdmin && (
                                <div className="p-4 border-t border-neutral-800 bg-neutral-900/50">
                                    <button 
                                        onClick={() => setShowAddMember(true)}
                                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-medium transition-colors"
                                    >
                                        <UserPlus size={18} /> Add Member
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                 </>
             ) : (
                /* No Group Selected View (Desktop) */
                !selectedGroupId && viewMode !== 'create' && (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 p-8">
                         <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center mb-4 border border-neutral-800">
                             <Users size={32} className="text-indigo-500/50" />
                         </div>
                         <h3 className="text-lg font-medium text-neutral-300">No Group Selected</h3>
                         <p className="text-sm text-neutral-500">Select a group to view leaderboard or create a new one.</p>
                    </div>
                )
             )}

             {/* Add Member Overlay */}
             {showAddMember && (
                 <div className="absolute inset-0 bg-neutral-950 z-20 flex flex-col animate-in slide-in-from-bottom-5">
                     <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                         <h3 className="text-white font-bold flex items-center gap-2"><UserPlus size={18} /> Add Members</h3>
                         <button onClick={() => setShowAddMember(false)} className="p-2 text-neutral-500 hover:text-white"><X size={20} /></button>
                     </div>
                     <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                         {myFriends.filter(f => !selectedGroupData?.members?.[f.uid]).length > 0 ? (
                             myFriends.filter(f => !selectedGroupData?.members?.[f.uid]).map(friend => (
                                 <div key={friend.uid} className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 rounded-xl">
                                     <div className="flex items-center gap-3">
                                         {friend.photoURL ? (
                                             <img src={friend.photoURL} className="w-8 h-8 rounded-full bg-neutral-800" />
                                         ) : (
                                             <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                                                 {friend.name?.charAt(0)}
                                             </div>
                                         )}
                                         <span className="text-neutral-200 font-medium">{friend.name}</span>
                                     </div>
                                     <button 
                                        onClick={() => handleAddMember(friend.uid)}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                     >
                                         Add
                                     </button>
                                 </div>
                             ))
                         ) : (
                             <div className="text-center text-neutral-500 py-10">
                                 {myFriends.length === 0 ? "You need to add friends first." : "All your friends are already in this group."}
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