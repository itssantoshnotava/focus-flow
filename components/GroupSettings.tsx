
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
        console.warn("Group does not exist or was deleted.");
        navigate('/inbox');
      }
      setLoading(false);
    });

    const friendsRef = ref(database, `friends/${user?.uid}`);
    get(friendsRef).then(async (snap) => {
      if (snap.exists()) {
          const ids = Object.keys(snap.val());
          const res = await Promise.all(
            ids.map(id => get(ref(database, `users/${id}`)).then(s => ({ uid: id, ...s.val() })))
          );
          setMyFriends(res.filter(r => r.name));
      }
    });

    return () => unsub();
  }, [groupId, user?.uid, navigate]);

  const handleSave = async () => {
    if (!groupId || !isAdmin) return;
    try {
        await update(ref(database, `groupChats/${groupId}`), { name: editName, description: editDesc });
        // Sync inbox names for all members if name changed
        if (editName !== groupData.name) {
            const updates: any = {};
            Object.keys(groupData.members).forEach(mid => {
                updates[`userInboxes/${mid}/${groupId}/name`] = editName;
            });
            await update(ref(database), updates);
        }
        alert("Group updated successfully!");
    } catch (err) {
        console.error("Save failed", err);
    }
  };

  const handleAvatarClick = () => {
    if (isAdmin) fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && groupId && isAdmin) {
      setIsUploading(true);
      try {
        const url = await uploadImageToCloudinary(e.target.files[0]);
        const updates: any = { photoURL: url };
        await update(ref(database, `groupChats/${groupId}`), updates);
        
        // Sync inbox photos
        const inboxUpdates: any = {};
        Object.keys(groupData.members).forEach(mid => {
            inboxUpdates[`userInboxes/${mid}/${groupId}/photoURL`] = url;
        });
        await update(ref(database), inboxUpdates);
      } catch (err) {
        console.error(err);
      }
      setIsUploading(false);
    }
  };

  const closeMenu = () => {
    setActiveMenuId(null);
    setMenuPos(null);
  };

  const toggleAdmin = async (targetUid: string) => {
    if (!groupId || !isAdmin) return;
    const currentlyAdmin = groupData.admins?.[targetUid];
    await update(ref(database, `groupChats/${groupId}/admins`), { [targetUid]: currentlyAdmin ? null : true });
    closeMenu();
  };

  const removeMember = async (targetUid: string) => {
    if (!groupId || !isAdmin) return;
    if (targetUid === groupData.hostUid) return;
    
    if (window.confirm("Remove this member from the group?")) {
        const updates: any = {};
        updates[`groupChats/${groupId}/members/${targetUid}`] = null;
        updates[`groupChats/${groupId}/admins/${targetUid}`] = null;
        updates[`userInboxes/${targetUid}/${groupId}`] = null;
        updates[`users/${targetUid}/groupChats/${groupId}`] = null;
        await update(ref(database), updates);
        closeMenu();
    }
  };

  const transferHost = async (targetUid: string) => {
    if (!groupId || !isHost) return;
    if (window.confirm("Transfer group ownership to this member?")) {
        await update(ref(database, `groupChats/${groupId}`), { hostUid: targetUid });
        await update(ref(database, `groupChats/${groupId}/admins`), { [targetUid]: true });
        closeMenu();
    }
  };

  const deleteGroup = async () => {
    if (!groupId || !isHost) return;
    if (window.confirm("Are you absolutely sure you want to delete this group? All history will be lost for everyone.")) {
      const mIds = Object.keys(groupData.members);
      const updates: any = {};
      mIds.forEach(mid => { 
        updates[`userInboxes/${mid}/${groupId}`] = null; 
        updates[`users/${mid}/groupChats/${groupId}`] = null;
      });
      updates[`groupChats/${groupId}`] = null;
      updates[`groupMessages/${groupId}`] = null;
      await update(ref(database), updates);
      navigate('/inbox');
    }
  };

  const leaveGroup = async () => {
      if (!groupId || !user) return;
      if (isHost && Object.keys(groupData.members).length > 1) {
          alert("Please transfer host ownership before leaving.");
          return;
      }
      if (window.confirm("Leave group?")) {
          const updates: any = {};
          updates[`groupChats/${groupId}/members/${user.uid}`] = null;
          updates[`groupChats/${groupId}/admins/${user.uid}`] = null;
          updates[`userInboxes/${user.uid}/${groupId}`] = null;
          updates[`users/${user.uid}/groupChats/${groupId}`] = null;
          
          if (Object.keys(groupData.members).length === 1) {
              updates[`groupChats/${groupId}`] = null;
              updates[`groupMessages/${groupId}`] = null;
          }
          await update(ref(database), updates);
          navigate('/inbox');
      }
  };

  const addMember = async (targetUid: string, name: string, photoURL: string) => {
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
    updates[`users/${targetUid}/groupChats/${groupId}`] = true;
    await update(ref(database), updates);
    setShowAddMember(false);
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="flex-1 h-full bg-neutral-950 overflow-y-auto custom-scrollbar relative">
      <div className="absolute top-0 left-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-3xl mx-auto pt-12 px-6 pb-24 relative z-10">
        <button onClick={() => navigate('/inbox')} className="mb-8 flex items-center gap-2 text-neutral-400 hover:text-white transition-colors group">
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-semibold">Back to Chat</span>
        </button>

        {/* HEADER SECTION */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-[32px] p-8 mb-8 shadow-2xl flex flex-col items-center text-center">
            <div className="relative mb-6">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/*" />
                <div 
                    className={`w-32 h-32 rounded-[40px] p-1.5 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 shadow-xl overflow-hidden group ${isAdmin ? 'cursor-pointer' : ''}`}
                    onClick={handleAvatarClick}
                >
                    <div className="w-full h-full rounded-[34px] overflow-hidden bg-neutral-900 relative">
                        {groupData.photoURL ? (
                            <img src={groupData.photoURL} alt="Group" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-neutral-800">
                                <Users size={40} className="text-neutral-600" />
                            </div>
                        )}
                        {isAdmin && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Camera className="text-white" size={24} />
                            </div>
                        )}
                        {isUploading && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 backdrop-blur-sm">
                                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-2 mb-6">
                {isAdmin ? (
                    <input 
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="text-3xl font-black text-white bg-transparent border-b border-transparent focus:border-indigo-500/50 text-center focus:outline-none px-4 py-1"
                        placeholder="Group Name"
                    />
                ) : (
                    <h1 className="text-3xl font-black text-white">{groupData.name}</h1>
                )}
                <p className="text-neutral-500 text-sm font-medium">
                    {Object.keys(groupData.members || {}).length} members · Created by <span className="text-indigo-400">{membersDetails.find(m => m.uid === groupData.hostUid)?.name || 'Unknown'}</span>
                </p>
            </div>

            {isAdmin && (
                <div className="w-full max-w-md space-y-4">
                    <textarea 
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        className="w-full bg-neutral-950/50 border border-white/10 rounded-2xl px-5 py-3 text-sm text-neutral-300 focus:outline-none focus:border-indigo-500 min-h-[80px] text-center resize-none transition-all placeholder:text-neutral-600"
                        placeholder="Add a group description..."
                    />
                    <button 
                        onClick={handleSave}
                        disabled={editName === groupData.name && editDesc === (groupData.description || '')}
                        className="bg-white text-black px-8 py-3 rounded-2xl font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 mx-auto disabled:opacity-50 disabled:scale-100 active:scale-95"
                    >
                        <Save size={18} /> Save Details
                    </button>
                </div>
            )}
        </div>

        {/* MEMBERS LIST */}
        <div className="bg-white/[0.02] backdrop-blur-lg border border-white/[0.06] rounded-[32px] p-8 shadow-xl mb-8">
            <div className="flex items-center justify-between mb-8">
                <h3 className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    Group Members
                </h3>
                {isAdmin && (
                    <button 
                        onClick={() => setShowAddMember(!showAddMember)}
                        className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 hover:text-indigo-300 transition-colors"
                    >
                        <Plus size={14} /> Add Member
                    </button>
                )}
            </div>

            {showAddMember && (
                <div className="mb-8 p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-[24px] space-y-4 animate-in slide-in-from-top-4 duration-300">
                    <h4 className="text-xs font-bold text-indigo-300/80 uppercase tracking-wider">Your Friends</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {myFriends.filter(f => !groupData.members?.[f.uid]).map(friend => (
                            <button 
                                key={friend.uid}
                                onClick={() => addMember(friend.uid, friend.name, friend.photoURL)}
                                className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    {friend.photoURL ? <img src={friend.photoURL} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">{friend.name.charAt(0)}</div>}
                                    <span className="text-sm font-semibold text-neutral-200">{friend.name}</span>
                                </div>
                                <Plus size={16} className="text-indigo-500" />
                            </button>
                        ))}
                        {myFriends.filter(f => !groupData.members?.[f.uid]).length === 0 && (
                            <p className="text-xs text-neutral-600 italic">All your friends are already in this group.</p>
                        )}
                    </div>
                </div>
            )}
            
            <div className="space-y-4">
                {membersDetails.sort((a,b) => {
                    if (a.uid === groupData.hostUid) return -1;
                    if (b.uid === groupData.hostUid) return 1;
                    if (groupData.admins?.[a.uid] && !groupData.admins?.[b.uid]) return -1;
                    if (!groupData.admins?.[a.uid] && groupData.admins?.[b.uid]) return 1;
                    return 0;
                }).map(member => {
                    const isMemberHost = member.uid === groupData.hostUid;
                    const isMemberAdmin = groupData.admins?.[member.uid] || isMemberHost;
                    const presence = friendPresences[member.uid];
                    const isOnline = presence?.online;

                    return (
                        <div key={member.uid} className="relative">
                            <div 
                                onClick={() => navigate(`/profile/${member.uid}`)}
                                className="flex items-center justify-between p-4 bg-white/5 border border-white/[0.03] rounded-[24px] hover:bg-white/[0.08] transition-all cursor-pointer group/item"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        {member.photoURL ? (
                                            <img src={member.photoURL} className="w-12 h-12 rounded-[18px] object-cover" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-[18px] bg-neutral-800 flex items-center justify-center text-sm font-bold text-neutral-500">
                                                {member.name.charAt(0)}
                                            </div>
                                        )}
                                        {isOnline && (
                                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-[3px] border-neutral-900 shadow-sm"></div>
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white">{member.name} {member.uid === user?.uid && '(You)'}</span>
                                            {isMemberHost ? (
                                                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[9px] rounded-full border border-amber-500/20 uppercase font-black">Host</span>
                                            ) : isMemberAdmin ? (
                                                <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[9px] rounded-full border border-indigo-500/20 uppercase font-black">Admin</span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-neutral-500/10 text-neutral-500 text-[9px] rounded-full border border-neutral-500/20 uppercase font-black">Member</span>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter">Joined {new Date(groupData.members[member.uid] === true ? groupData.createdAt : (groupData.members[member.uid] || groupData.createdAt)).toLocaleDateString([], { month: 'short', year: 'numeric' })}</span>
                                    </div>
                                </div>

                                {isAdmin && member.uid !== user?.uid && (
                                    <button 
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          setMenuPos({ x: rect.right, y: rect.bottom });
                                          setActiveMenuId(member.uid);
                                        }}
                                        className={`p-2 rounded-xl transition-colors relative z-10 ${activeMenuId === member.uid ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:text-white hover:bg-white/10'}`}
                                    >
                                        <MoreVertical size={20} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="space-y-4">
            <button 
                onClick={leaveGroup}
                className="w-full p-5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border border-white/5 rounded-[24px] font-bold transition-all backdrop-blur-sm"
            >
                Leave Group
            </button>
            {isHost && (
                <button 
                    onClick={deleteGroup}
                    className="w-full p-5 bg-red-950/20 text-red-500 hover:bg-red-900/30 border border-red-900/10 rounded-[24px] font-bold transition-all"
                >
                    <Trash2 size={18} className="inline mr-2" />
                    Delete Group
                </button>
            )}
        </div>

        {/* Member Action Menu Portal */}
        {activeMenuId && menuPos && createPortal(
            <div className="fixed inset-0 z-[9999] pointer-events-none">
                <div className="fixed inset-0 bg-transparent pointer-events-auto cursor-default" onClick={closeMenu} />
                <div 
                    style={{ position: 'fixed', top: `${menuPos.y + 8}px`, left: `${menuPos.x - 224}px`, zIndex: 10000 }}
                    className="w-56 bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 pointer-events-auto"
                >
                    <div className="p-1 flex flex-col h-auto">
                        {activeMember && (
                            <>
                                {!(activeMember.uid === groupData.hostUid) && (
                                    <button onClick={() => toggleAdmin(activeMember.uid)} className="w-full flex items-center justify-between px-4 py-3 text-neutral-300 hover:bg-white/5 rounded-2xl text-sm font-bold transition-colors">
                                        <div className="flex items-center gap-3">
                                            {groupData.admins?.[activeMember.uid] ? <Shield size={18} /> : <ShieldCheck size={18} />}
                                            {groupData.admins?.[activeMember.uid] ? 'Remove Admin' : 'Make Admin'}
                                        </div>
                                        <ChevronRight size={14} className="opacity-50" />
                                    </button>
                                )}
                                {isHost && !(activeMember.uid === groupData.hostUid) && (
                                    <button onClick={() => transferHost(activeMember.uid)} className="w-full flex items-center justify-between px-4 py-3 text-amber-400 hover:bg-amber-400/5 rounded-2xl text-sm font-bold transition-colors">
                                        <div className="flex items-center gap-3"><LogOut size={18} />Transfer Host</div>
                                        <ChevronRight size={14} className="opacity-50" />
                                    </button>
                                )}
                                {!(activeMember.uid === groupData.hostUid) && (
                                    <button onClick={() => removeMember(activeMember.uid)} className="w-full flex items-center justify-between px-4 py-3 text-red-400 hover:bg-red-400/5 rounded-2xl text-sm font-bold transition-colors">
                                        <div className="flex items-center gap-3"><UserMinus size={18} />Remove Member</div>
                                        <ChevronRight size={14} className="opacity-50" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        )}
      </div>
    </div>
  );
};
