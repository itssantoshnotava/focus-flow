
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, get, remove, set } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { 
  Camera, X, ArrowLeft, Users, UserMinus, Shield, ShieldCheck, 
  Trash2, Save, MoreVertical, LogOut, ChevronRight, Check, Plus, Loader2
} from 'lucide-react';

export const GroupSettings: React.FC = () => {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [groupData, setGroupData] = useState<any>(null);
  const [membersDetails, setMembersDetails] = useState<any[]>([]);
  const [friendPresences, setFriendPresences] = useState<Record<string, any>>({});
  const [myFriends, setMyFriends] = useState<any[]>([]);
  
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);

  const isHost = groupData?.hostUid === user?.uid;
  const isAdmin = groupData?.admins?.[user?.uid || ''] || isHost;

  const activeMember = useMemo(() => 
    membersDetails.find(m => m.uid === activeMenuId),
  [activeMenuId, membersDetails]);

  // Robust Friends Sync (Intersection of following and followers)
  useEffect(() => {
    if (!user) return;
    const followingRef = ref(database, `following/${user.uid}`);
    const followersRef = ref(database, `followers/${user.uid}`);

    const syncMutualFriends = async () => {
        const [followingSnap, followersSnap] = await Promise.all([get(followingRef), get(followersRef)]);
        const followingIds = followingSnap.exists() ? Object.keys(followingSnap.val()) : [];
        const followerIds = followersSnap.exists() ? Object.keys(followersSnap.val()) : [];
        const mutualIds = followingIds.filter(id => followerIds.includes(id));
        
        if (mutualIds.length > 0) {
            const promises = mutualIds.map(uid => get(ref(database, `users/${uid}`)).then(s => ({ uid, ...s.val() })));
            const details = await Promise.all(promises);
            setMyFriends(details.filter(d => d.name));
        } else {
            setMyFriends([]);
        }
    };

    const unsubFollowing = onValue(followingRef, syncMutualFriends);
    const unsubFollowers = onValue(followersRef, syncMutualFriends);
    return () => { unsubFollowing(); unsubFollowers(); };
  }, [user]);

  useEffect(() => {
    if (!groupId) return;
    const gRef = ref(database, `groupChats/${groupId}`);
    const unsub = onValue(gRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setGroupData(data);
        setEditName(data.name);
        setEditDesc(data.description || '');

        if (data.members) {
          const mIds = Object.keys(data.members);
          const details = await Promise.all(
            mIds.map(mid => get(ref(database, `users/${mid}`)).then(s => ({ uid: mid, ...s.val() })))
          );
          setMembersDetails(details.filter(d => d.name));
          
          mIds.forEach(mid => {
              if (mid !== user?.uid) {
                  onValue(ref(database, `presence/${mid}`), (pSnap) => {
                      setFriendPresences(prev => ({ ...prev, [mid]: pSnap.val() }));
                  });
              }
          });
        }
      } else {
        navigate('/inbox');
      }
      setLoading(false);
    });
    return () => unsub();
  }, [groupId, user?.uid, navigate]);

  const handleSave = async () => {
    if (!groupId || !isAdmin) return;
    await update(ref(database, `groupChats/${groupId}`), { name: editName, description: editDesc });
    alert("Group updated!");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && groupId && isAdmin) {
      setIsUploading(true);
      try {
        const url = await uploadImageToCloudinary(e.target.files[0]);
        await update(ref(database, `groupChats/${groupId}`), { photoURL: url });
      } catch (err) { console.error(err); }
      setIsUploading(false);
    }
  };

  const addMember = async (targetUid: string) => {
    if (!groupId || !groupData) return;
    const updates: any = {};
    updates[`groupChats/${groupId}/members/${targetUid}`] = true;
    updates[`userInboxes/${targetUid}/${groupId}`] = { 
        type: 'group', 
        name: groupData.name, 
        lastMessage: groupData.lastMessage || null, 
        lastMessageAt: Date.now(), 
        unreadCount: 0, 
        photoURL: groupData.photoURL || null 
    };
    await update(ref(database), updates);
    setShowAddMember(false);
  };

  const toggleAdmin = async (targetUid: string) => {
    if (!groupId || !isAdmin) return;
    const currentlyAdmin = groupData.admins?.[targetUid];
    await update(ref(database, `groupChats/${groupId}/admins`), { [targetUid]: currentlyAdmin ? null : true });
    setActiveMenuId(null);
  };

  const removeMember = async (targetUid: string) => {
    if (!groupId || !isAdmin || targetUid === groupData.hostUid) return;
    if (window.confirm("Remove member?")) {
        const updates: any = {};
        updates[`groupChats/${groupId}/members/${targetUid}`] = null;
        updates[`groupChats/${groupId}/admins/${targetUid}`] = null;
        updates[`userInboxes/${targetUid}/${groupId}`] = null;
        await update(ref(database), updates);
        setActiveMenuId(null);
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="flex-1 h-full bg-neutral-950 overflow-y-auto custom-scrollbar relative">
      <div className="max-w-3xl mx-auto pt-12 px-6 pb-24 relative z-10">
        <button onClick={() => navigate('/inbox')} className="mb-8 flex items-center gap-2 text-neutral-400 hover:text-white transition-colors group">
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-semibold">Back to Chat</span>
        </button>

        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-[32px] p-8 mb-8 shadow-2xl flex flex-col items-center text-center">
            <div className="relative mb-6 cursor-pointer" onClick={() => isAdmin && fileInputRef.current?.click()}>
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/*" />
                <div className="w-32 h-32 rounded-[40px] p-1.5 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 shadow-xl overflow-hidden group">
                    <div className="w-full h-full rounded-[34px] overflow-hidden bg-neutral-900 relative">
                        {groupData.photoURL ? <img src={groupData.photoURL} alt="Group" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-neutral-800"><Users size={40} className="text-neutral-600" /></div>}
                        {isAdmin && <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Camera className="text-white" size={24} /></div>}
                        {isUploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10"><Loader2 className="animate-spin text-indigo-500" /></div>}
                    </div>
                </div>
            </div>
            <div className="space-y-2 mb-6">
                {isAdmin ? <input value={editName} onChange={e => setEditName(e.target.value)} className="text-3xl font-black text-white bg-transparent border-b border-transparent focus:border-indigo-500/50 text-center focus:outline-none px-4 py-1" /> : <h1 className="text-3xl font-black text-white">{groupData.name}</h1>}
                <p className="text-neutral-500 text-sm font-medium">{Object.keys(groupData.members || {}).length} members</p>
            </div>
            {isAdmin && <button onClick={handleSave} className="bg-white text-black px-8 py-3 rounded-2xl font-bold hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2"><Save size={18} /> Save</button>}
        </div>

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-[32px] p-8 shadow-xl mb-8">
            <div className="flex items-center justify-between mb-8">
                <h3 className="text-[11px] font-black text-neutral-500 uppercase tracking-widest flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> Members</h3>
                {isAdmin && <button onClick={() => setShowAddMember(!showAddMember)} className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 hover:text-indigo-300"><Plus size={14} /> Add Member</button>}
            </div>

            {showAddMember && (
                <div className="mb-8 p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-[24px] space-y-4 animate-in slide-in-from-top-4">
                    <h4 className="text-xs font-bold text-indigo-300/80 uppercase tracking-wider">Your Friends</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {myFriends.filter(f => !groupData.members?.[f.uid]).map(friend => (
                            <button key={friend.uid} onClick={() => addMember(friend.uid)} className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800">
                                <div className="flex items-center gap-3">
                                    {friend.photoURL ? <img src={friend.photoURL} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white">{friend.name.charAt(0)}</div>}
                                    <span className="text-sm font-semibold text-neutral-200 truncate max-w-[100px]">{friend.name}</span>
                                </div>
                                <Plus size={16} className="text-indigo-500" />
                            </button>
                        ))}
                        {myFriends.filter(f => !groupData.members?.[f.uid]).length === 0 && <p className="text-xs text-neutral-600 italic">No more mutual friends to add.</p>}
                    </div>
                </div>
            )}
            
            <div className="space-y-4">
                {membersDetails.map(member => {
                    const isMemberHost = member.uid === groupData.hostUid;
                    const isMemberAdmin = groupData.admins?.[member.uid] || isMemberHost;
                    return (
                        <div key={member.uid} className="flex items-center justify-between p-4 bg-white/5 border border-white/[0.03] rounded-[24px] hover:bg-white/[0.08] transition-all">
                            <div className="flex items-center gap-4">
                                {member.photoURL ? <img src={member.photoURL} className="w-12 h-12 rounded-[18px] object-cover" /> : <div className="w-12 h-12 rounded-[18px] bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{member.name.charAt(0)}</div>}
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-white">{member.name}</span>
                                        {isMemberHost ? <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[9px] rounded-full border border-amber-500/20 uppercase font-black">Host</span> : isMemberAdmin ? <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[9px] rounded-full border border-indigo-500/20 uppercase font-black">Admin</span> : null}
                                    </div>
                                </div>
                            </div>
                            {isAdmin && member.uid !== user?.uid && (
                                <button onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setMenuPos({ x: rect.right, y: rect.bottom }); setActiveMenuId(member.uid); }} className="p-2 text-neutral-500 hover:text-white"><MoreVertical size={20} /></button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        <button onClick={async () => { if(window.confirm("Leave group?")){ await remove(ref(database, `groupChats/${groupId}/members/${user?.uid}`)); navigate('/inbox'); } }} className="w-full p-5 bg-white/5 hover:bg-white/10 text-neutral-400 rounded-[24px] font-bold">Leave Group</button>

        {activeMenuId && menuPos && createPortal(
            <div className="fixed inset-0 z-[9999]" onClick={() => setActiveMenuId(null)}>
                <div style={{ position: 'fixed', top: `${menuPos.y + 8}px`, left: `${menuPos.x - 224}px` }} className="w-56 bg-neutral-900 border border-white/10 rounded-[24px] shadow-2xl p-1 animate-in zoom-in">
                    {/* Fixed 'groupAdmins' error by correctly referencing groupData.admins */}
                    <button onClick={() => toggleAdmin(activeMenuId)} className="w-full text-left px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-2xl">{groupData?.admins?.[activeMenuId] ? 'Remove Admin' : 'Make Admin'}</button>
                    <button onClick={() => removeMember(activeMenuId)} className="w-full text-left px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-400/5 rounded-2xl">Remove Member</button>
                </div>
            </div>,
            document.body
        )}
      </div>
    </div>
  );
};
