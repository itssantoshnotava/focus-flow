import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ref, onValue, push, update, get, set, remove, runTransaction, onChildAdded, onChildChanged, onChildRemoved } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { 
    X, Send, MessageCircle, ArrowLeft, Users, Plus, CheckCircle2, 
    Circle, Settings, Camera, Shield, ShieldAlert, Trash2, UserPlus, 
    LogOut, Save, Edit2, UserMinus, Loader2
} from 'lucide-react';

interface InboxProps {
  onClose: () => void;
}

interface ChatItem {
  id: string; // uid for DM, groupId for Group
  type: 'dm' | 'group';
  name: string;
  photoURL?: string;
  lastMessage?: {
    text: string;
    timestamp: number;
    senderUid: string;
    senderName?: string;
    seen?: boolean;
  };
  timestamp: number;
  unreadCount?: number;
}

export const Inbox: React.FC<InboxProps> = ({ onClose }) => {
  const { user } = useAuth();
  
  // View State
  const [viewMode, setViewMode] = useState<'list' | 'create_group'>('list');
  const [showSettings, setShowSettings] = useState(false);
  
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  
  // Active Group Realtime Data
  const [activeGroupData, setActiveGroupData] = useState<any>(null);
  const [groupMembersDetails, setGroupMembersDetails] = useState<any[]>([]);
  
  // Data State
  const [messages, setMessages] = useState<any[]>([]);
  const [friendPresence, setFriendPresence] = useState<{online: boolean, lastSeen: number} | null>(null);
  const [myFriends, setMyFriends] = useState<any[]>([]); 
  
  // Inputs
  const [inputText, setInputText] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<Set<string>>(new Set());
  
  // Group Edit Inputs
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupPhoto, setEditGroupPhoto] = useState('');
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false); 
  const [isUploading, setIsUploading] = useState(false);

  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAutoScrollEnabled = useRef(true);

  // Helper: DM Conversation ID
  const getDmConvoId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');

  // --- 0. Migration Helper (Run once to backfill userInboxes) ---
  const migrateLegacyData = async () => {
      if (!user) return;
      
      // 1. Migrate Friends (DMs)
      const friendsRef = ref(database, `friends/${user.uid}`);
      const friendsSnap = await get(friendsRef);
      if (friendsSnap.exists()) {
          const friendIds = Object.keys(friendsSnap.val());
          for (const fid of friendIds) {
              const convoId = getDmConvoId(user.uid, fid);
              const convoSnap = await get(ref(database, `conversations/${convoId}`));
              const userSnap = await get(ref(database, `users/${fid}`));
              
              if (userSnap.exists()) {
                  const userData = userSnap.val();
                  const lastMsg = convoSnap.val()?.lastMessage;
                  
                  // Write to userInboxes
                  await update(ref(database, `userInboxes/${user.uid}/${fid}`), {
                      type: 'dm',
                      name: userData.name || 'Unknown',
                      photoURL: userData.photoURL || null,
                      lastMessage: lastMsg || null,
                      lastMessageAt: lastMsg?.timestamp || Date.now(),
                      unreadCount: 0 // Default to 0 on migration
                  });
              }
          }
      }

      // 2. Migrate Groups
      const groupsRef = ref(database, `users/${user.uid}/groupChats`);
      const groupsSnap = await get(groupsRef);
      if (groupsSnap.exists()) {
          const groupIds = Object.keys(groupsSnap.val());
          for (const gid of groupIds) {
              const gSnap = await get(ref(database, `groupChats/${gid}`));
              if (gSnap.exists()) {
                  const gData = gSnap.val();
                  await update(ref(database, `userInboxes/${user.uid}/${gid}`), {
                      type: 'group',
                      name: gData.name,
                      photoURL: gData.photoURL || null,
                      lastMessage: gData.lastMessage || null,
                      lastMessageAt: gData.lastMessage?.timestamp || gData.createdAt || Date.now(),
                      unreadCount: 0
                  });
              }
          }
      }
  };

  // --- 1. Real-time Inbox Listener (Refactored for Instant Updates) ---
  useEffect(() => {
    if (!user) return;
    
    const inboxRef = ref(database, `userInboxes/${user.uid}`);
    
    // Check if empty and migrate
    get(inboxRef).then((snap) => {
        if (!snap.exists()) {
            migrateLegacyData();
        } else {
            setLoading(false);
        }
    });

    const handleInboxUpdate = (snapshot: any) => {
        const val = snapshot.val();
        const key = snapshot.key;
        if (!key || !val) return;

        const newItem: ChatItem = {
            id: key,
            type: val.type,
            name: val.name,
            photoURL: val.photoURL,
            lastMessage: val.lastMessage,
            timestamp: val.lastMessageAt || 0,
            unreadCount: val.unreadCount || 0
        };

        setChats(prev => {
            const existingIdx = prev.findIndex(c => c.id === key);
            let newChats = [...prev];
            
            if (existingIdx >= 0) {
                newChats[existingIdx] = newItem;
            } else {
                newChats.push(newItem);
            }
            
            // Auto-sort by timestamp descending
            return newChats.sort((a, b) => b.timestamp - a.timestamp);
        });
        setLoading(false);
    };

    const handleInboxRemove = (snapshot: any) => {
        const key = snapshot.key;
        if (!key) return;
        setChats(prev => prev.filter(c => c.id !== key));
    };

    const unsubAdded = onChildAdded(inboxRef, handleInboxUpdate);
    const unsubChanged = onChildChanged(inboxRef, handleInboxUpdate);
    const unsubRemoved = onChildRemoved(inboxRef, handleInboxRemove);

    return () => {
        unsubAdded();
        unsubChanged();
        unsubRemoved();
    };
  }, [user]);

  // --- 2. Active Group Details ---
  useEffect(() => {
      if (selectedChat?.type === 'group') {
          const gRef = ref(database, `groupChats/${selectedChat.id}`);
          const unsub = onValue(gRef, async (snap) => {
              if (snap.exists()) {
                  const data = snap.val();
                  setActiveGroupData(data);
                  setEditGroupName(data.name);
                  setEditGroupPhoto(data.photoURL || '');

                  // Fetch member details
                  if (data.members) {
                      const mIds = Object.keys(data.members);
                      const mPromises = mIds.map(mid => get(ref(database, `users/${mid}`)).then(s => ({ uid: mid, ...s.val() })));
                      const members = await Promise.all(mPromises);
                      setGroupMembersDetails(members);
                  }
              } else {
                  setSelectedChat(null);
                  setActiveGroupData(null);
              }
          });
          return () => unsub();
      } else {
          setActiveGroupData(null);
          setShowSettings(false);
          setGroupMembersDetails([]);
      }
  }, [selectedChat]);

  // --- 3. Friends Fetcher (for Create Group) ---
  useEffect(() => {
      if (!user) return;
      if (viewMode === 'create_group' || showAddMember) {
          const friendsRef = ref(database, `friends/${user.uid}`);
          get(friendsRef).then(async (snap) => {
              if (snap.exists()) {
                  const ids = Object.keys(snap.val());
                  const promises = ids.map(id => get(ref(database, `users/${id}`)).then(s => ({ uid: id, ...s.val() })));
                  const res = await Promise.all(promises);
                  setMyFriends(res);
              }
          });
      }
  }, [user, viewMode, showAddMember]);

  // --- 4. Messages Listener & Unread Clearing ---
  useEffect(() => {
      if (!user || !selectedChat) {
          setFriendPresence(null);
          return;
      }

      // Clear unread count when opening a chat
      const myInboxRef = ref(database, `userInboxes/${user.uid}/${selectedChat.id}`);
      update(myInboxRef, { unreadCount: 0 });

      let messagesPath = selectedChat.type === 'dm' ? `messages/${getDmConvoId(user.uid, selectedChat.id)}` : `groupMessages/${selectedChat.id}`;
      
      if (selectedChat.type === 'dm') {
          onValue(ref(database, `presence/${selectedChat.id}`), (snap) => setFriendPresence(snap.exists() ? snap.val() : null));
      }

      const unsubMsg = onValue(ref(database, messagesPath), (snapshot) => {
          if (snapshot.exists()) {
              const list = Object.entries(snapshot.val()).map(([key, val]: [string, any]) => ({ id: key, ...val })).sort((a, b) => a.timestamp - b.timestamp);
              setMessages(list);
          } else {
              setMessages([]);
          }
      });
      
      setTimeout(() => inputRef.current?.focus(), 100);
      isAutoScrollEnabled.current = true;
      return () => unsubMsg();
  }, [user, selectedChat]);

  // --- Auto Scroll ---
  useEffect(() => {
      if (isAutoScrollEnabled.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showSettings]);

  const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      isAutoScrollEnabled.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  // --- Actions ---
  const handleSend = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!inputText.trim() || !user || !selectedChat) return;
      const text = inputText.trim();
      const timestamp = Date.now();
      
      const msgData = { 
          senderUid: user.uid, 
          senderName: user.displayName || 'Unknown', 
          text, 
          timestamp 
      };

      if (selectedChat.type === 'dm') {
          const convoId = getDmConvoId(user.uid, selectedChat.id);
          const friendUid = selectedChat.id;

          // 1. Push Message
          await push(ref(database, `messages/${convoId}`), msgData);
          
          // 2. Update Conversation Meta (Legacy support)
          await update(ref(database, `conversations/${convoId}`), { 
              members: { [user.uid]: true, [friendUid]: true }, 
              lastMessage: { ...msgData, seen: false } 
          });

          // 3. Update My Inbox (No unread increment)
          await update(ref(database, `userInboxes/${user.uid}/${friendUid}`), {
              type: 'dm',
              name: selectedChat.name,
              photoURL: selectedChat.photoURL || null,
              lastMessage: msgData,
              lastMessageAt: timestamp,
              // unreadCount: 0 // Keep as is (0)
          });

          // 4. Update Friend's Inbox (Increment unread)
          const friendInboxRef = ref(database, `userInboxes/${friendUid}/${user.uid}`);
          await runTransaction(friendInboxRef, (currentData) => {
              if (currentData === null) {
                  return {
                      type: 'dm',
                      name: user.displayName || 'Unknown',
                      photoURL: user.photoURL || null,
                      lastMessage: msgData,
                      lastMessageAt: timestamp,
                      unreadCount: 1
                  };
              }
              return {
                  ...currentData,
                  name: user.displayName || 'Unknown', // Update in case name changed
                  photoURL: user.photoURL || null,
                  lastMessage: msgData,
                  lastMessageAt: timestamp,
                  unreadCount: (currentData.unreadCount || 0) + 1
              };
          });

      } else {
          // GROUP MESSAGE
          const groupId = selectedChat.id;
          
          // 1. Push Message
          await push(ref(database, `groupMessages/${groupId}`), msgData);
          
          // 2. Update Group Meta
          await update(ref(database, `groupChats/${groupId}`), { lastMessage: msgData });

          // 3. Fan-out to all members
          // Need to fetch members first to know who to update
          let membersToUpdate: string[] = [];
          if (activeGroupData?.members) {
              membersToUpdate = Object.keys(activeGroupData.members);
          } else {
              const snap = await get(ref(database, `groupChats/${groupId}/members`));
              if (snap.exists()) membersToUpdate = Object.keys(snap.val());
          }

          // Update each member's inbox (lastMessage & timestamp)
          const updates: Record<string, any> = {};
          membersToUpdate.forEach(uid => {
             const basePath = `userInboxes/${uid}/${groupId}`;
             updates[`${basePath}/lastMessage`] = msgData;
             updates[`${basePath}/lastMessageAt`] = timestamp;
             updates[`${basePath}/type`] = 'group';
             updates[`${basePath}/name`] = selectedChat.name; 
             if (selectedChat.photoURL) updates[`${basePath}/photoURL`] = selectedChat.photoURL;
          });

          await update(ref(database), updates);

          // Increment unread count for OTHERS
          await Promise.all(membersToUpdate.map(uid => {
              if (uid === user.uid) return Promise.resolve(); // Don't increment for self
              return runTransaction(ref(database, `userInboxes/${uid}/${groupId}/unreadCount`), (count) => {
                  return (count || 0) + 1;
              });
          }));
      }

      isAutoScrollEnabled.current = true;
      setInputText('');
  };

  const handleCreateGroup = async () => {
      if (!user || !newGroupName.trim() || selectedGroupMembers.size === 0) return;
      const newGroupRef = push(ref(database, 'groupChats'));
      const groupId = newGroupRef.key;
      if (groupId) {
          const membersObj: any = { [user.uid]: true };
          selectedGroupMembers.forEach(uid => membersObj[uid] = true);
          
          const groupData = {
              name: newGroupName.trim(),
              createdBy: user.uid,
              createdAt: Date.now(),
              members: membersObj,
              admins: { [user.uid]: true }
          };

          await set(newGroupRef, groupData);
          
          // Add to userInboxes for all members immediately
          const allMembers = [user.uid, ...Array.from(selectedGroupMembers)];
          const updates: any = {};
          
          allMembers.forEach(uid => {
             updates[`users/${uid}/groupChats/${groupId}`] = true; // Legacy
             updates[`userInboxes/${uid}/${groupId}`] = {
                 type: 'group',
                 name: groupData.name,
                 lastMessage: null,
                 lastMessageAt: Date.now(),
                 unreadCount: 0
             };
          });

          await update(ref(database), updates);
          
          setViewMode('list');
          setNewGroupName('');
          setSelectedGroupMembers(new Set());
      }
  };

  // --- Group Management Handlers ---
  const amIAdmin = useMemo(() => {
      if (!user || !activeGroupData) return false;
      return activeGroupData.admins?.[user.uid] || activeGroupData.createdBy === user.uid;
  }, [user, activeGroupData]);

  const saveGroupSettings = async () => {
      if (!selectedChat || !amIAdmin) return;
      await update(ref(database, `groupChats/${selectedChat.id}`), {
          name: editGroupName,
          photoURL: editGroupPhoto || null
      });
      // Also update inbox name for self immediately for responsiveness
      // (The real sync happens on next message, but this helps)
      await update(ref(database, `userInboxes/${user.uid}/${selectedChat.id}`), {
          name: editGroupName,
          photoURL: editGroupPhoto || null
      });
      setIsEditingGroup(false);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && selectedChat) {
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        const url = await uploadImageToCloudinary(file);
        
        await update(ref(database, `groupChats/${selectedChat.id}`), {
            photoURL: url
        });
        
        // Sync local inbox entry
        await update(ref(database, `userInboxes/${user.uid}/${selectedChat.id}`), {
            photoURL: url
        });
        
        setEditGroupPhoto(url); 
      } catch (error) {
        console.error("Upload failed", error);
        alert("Failed to upload image. Please try again.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const removeGroupPhoto = async () => {
      if (!selectedChat) return;
      if (confirm("Remove group photo?")) {
          await update(ref(database, `groupChats/${selectedChat.id}`), {
              photoURL: null
          });
           // Sync local inbox entry
           await update(ref(database, `userInboxes/${user.uid}/${selectedChat.id}`), {
              photoURL: null
          });
          setEditGroupPhoto('');
      }
  };

  const promoteAdmin = async (uid: string) => {
      if (!selectedChat || !amIAdmin) return;
      await update(ref(database, `groupChats/${selectedChat.id}/admins`), { [uid]: true });
  };

  const demoteAdmin = async (uid: string) => {
      if (!selectedChat || !amIAdmin) return;
      const adminCount = Object.keys(activeGroupData.admins || {}).length;
      if (adminCount <= 1) {
          alert("Cannot remove the last admin.");
          return;
      }
      await update(ref(database, `groupChats/${selectedChat.id}/admins/${uid}`), null);
  };

  const removeMember = async (uid: string) => {
      if (!selectedChat || !amIAdmin) return;
      if (activeGroupData.admins?.[uid]) {
          const adminCount = Object.keys(activeGroupData.admins || {}).length;
          if (adminCount <= 1) {
            alert("Cannot remove the last admin. Promote someone else first.");
            return;
          }
      }
      const updates: any = {};
      updates[`groupChats/${selectedChat.id}/members/${uid}`] = null;
      updates[`groupChats/${selectedChat.id}/admins/${uid}`] = null; 
      updates[`users/${uid}/groupChats/${selectedChat.id}`] = null;
      updates[`userInboxes/${uid}/${selectedChat.id}`] = null; // Remove from their inbox
      await update(ref(database), updates);
  };

  const addMemberToGroup = async (uid: string) => {
      if (!selectedChat) return;
      const updates: any = {};
      updates[`groupChats/${selectedChat.id}/members/${uid}`] = true;
      updates[`users/${uid}/groupChats/${selectedChat.id}`] = true;
      updates[`userInboxes/${uid}/${selectedChat.id}`] = {
           type: 'group',
           name: activeGroupData.name,
           photoURL: activeGroupData.photoURL || null,
           lastMessage: activeGroupData.lastMessage || null,
           lastMessageAt: Date.now(),
           unreadCount: 0
      };
      await update(ref(database), updates);
  };

  const deleteGroup = async () => {
      if (!selectedChat || !amIAdmin) return;
      if (confirm("Are you sure you want to delete this group? This action cannot be undone.")) {
          const updates: any = {};
          if (activeGroupData.members) {
             Object.keys(activeGroupData.members).forEach(uid => {
                 updates[`users/${uid}/groupChats/${selectedChat.id}`] = null;
                 updates[`userInboxes/${uid}/${selectedChat.id}`] = null;
             });
          }
          await update(ref(database), updates);
          await remove(ref(database, `groupChats/${selectedChat.id}`));
          await remove(ref(database, `groupMessages/${selectedChat.id}`));
          setSelectedChat(null);
      }
  };

  const leaveGroup = async () => {
      if (!selectedChat || !user) return;
      if (activeGroupData.admins?.[user.uid]) {
           const adminCount = Object.keys(activeGroupData.admins || {}).length;
           if (adminCount <= 1 && Object.keys(activeGroupData.members || {}).length > 1) {
               alert("You are the only admin. Promote someone else before leaving.");
               return;
           }
      }
      if (confirm("Leave this group?")) {
        const updates: any = {};
        updates[`groupChats/${selectedChat.id}/members/${user.uid}`] = null;
        updates[`groupChats/${selectedChat.id}/admins/${user.uid}`] = null;
        updates[`users/${user.uid}/groupChats/${selectedChat.id}`] = null;
        updates[`userInboxes/${user.uid}/${selectedChat.id}`] = null;
        await update(ref(database), updates);
        setSelectedChat(null);
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
      }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
      <div 
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div 
            className="bg-neutral-900 border border-neutral-800 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
        >
           
           {/* SIDEBAR */}
           <div className={`w-full md:w-1/3 border-r border-neutral-800 flex flex-col ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
               <div className="p-4 border-b border-neutral-800 bg-neutral-900 flex justify-between items-center">
                   {viewMode === 'list' ? (
                       <>
                           <h2 className="text-white font-bold text-lg flex items-center gap-2">
                               <MessageCircle size={20} className="text-indigo-500" /> Inbox
                           </h2>
                           <div className="flex gap-2">
                               <button onClick={() => setViewMode('create_group')} className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors">
                                   <Plus size={18} />
                               </button>
                               <button onClick={onClose} className="md:hidden p-2 text-neutral-500 hover:text-white">
                                   <X size={20} />
                               </button>
                           </div>
                       </>
                   ) : (
                       <>
                           <button onClick={() => setViewMode('list')} className="text-neutral-400 hover:text-white flex items-center gap-2 text-sm font-medium">
                               <ArrowLeft size={16} /> Cancel
                           </button>
                           <span className="text-white font-bold">New Group</span>
                       </>
                   )}
               </div>
               
               {viewMode === 'list' ? (
                   <div className="flex-1 overflow-y-auto custom-scrollbar bg-neutral-950/50">
                       {loading ? (
                           <div className="p-4 text-center text-neutral-600 text-sm">Loading...</div>
                       ) : chats.length === 0 ? (
                           <div className="p-8 text-center text-neutral-600 italic text-sm">No messages yet.</div>
                       ) : (
                           chats.map(chat => {
                               // Use local inbox data or realtime if active
                               const displayName = (chat.id === selectedChat?.id && activeGroupData) ? activeGroupData.name : chat.name;
                               const displayPhoto = (chat.id === selectedChat?.id && activeGroupData) ? activeGroupData.photoURL : chat.photoURL;
                               const isUnread = (chat.unreadCount || 0) > 0;

                               return (
                                   <button 
                                       key={chat.id}
                                       onClick={() => { setSelectedChat(chat); setShowSettings(false); }}
                                       className={`w-full p-4 flex items-center gap-3 hover:bg-neutral-800/50 transition-colors border-b border-neutral-800/50 text-left group ${selectedChat?.id === chat.id ? 'bg-indigo-900/10 border-indigo-500/10' : ''}`}
                                   >
                                       <div className="relative shrink-0">
                                            {chat.type === 'group' ? (
                                                displayPhoto ? (
                                                    <img src={displayPhoto} className="w-12 h-12 rounded-2xl bg-neutral-800 object-cover border border-neutral-700" />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center border border-neutral-700">
                                                        <Users size={20} className="text-neutral-400" />
                                                    </div>
                                                )
                                            ) : displayPhoto ? (
                                                <img src={displayPhoto} className="w-12 h-12 rounded-full bg-neutral-800 object-cover border border-neutral-800" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white border border-neutral-800">
                                                    {displayName.charAt(0)}
                                                </div>
                                            )}
                                            
                                            {/* Unread Badge */}
                                            {isUnread && <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 border-2 border-neutral-900 rounded-full flex items-center justify-center text-[8px] font-bold text-white">{chat.unreadCount}</span>}
                                       </div>
                                       <div className="flex-1 min-w-0">
                                           <div className="flex justify-between items-baseline mb-0.5">
                                               <span className={`font-medium text-sm truncate ${isUnread ? 'text-white' : 'text-neutral-300'} ${selectedChat?.id === chat.id ? 'text-indigo-300' : ''}`}>{displayName}</span>
                                               <span className="text-[10px] text-neutral-600">{chat.timestamp ? new Date(chat.timestamp).toLocaleDateString([], {month:'short', day:'numeric'}) : ''}</span>
                                           </div>
                                           <p className={`text-xs truncate ${isUnread ? 'text-neutral-200 font-medium' : 'text-neutral-500'}`}>
                                               {chat.lastMessage?.text || 'No messages'}
                                           </p>
                                       </div>
                                   </button>
                               );
                           })
                       )}
                   </div>
               ) : (
                   /* CREATE GROUP FORM (Existing) */
                   <div className="flex-1 flex flex-col bg-neutral-950">
                       <div className="p-4 space-y-4">
                           <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group Name" className="w-full bg-neutral-900 border border-neutral-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500" />
                           <div className="text-xs font-bold text-neutral-500 uppercase tracking-wide">Select Members</div>
                       </div>
                       <div className="flex-1 overflow-y-auto custom-scrollbar px-2">
                           {myFriends.map(friend => {
                               const isSelected = selectedGroupMembers.has(friend.uid);
                               return (
                                   <button key={friend.uid} onClick={() => { const n = new Set(selectedGroupMembers); n.has(friend.uid) ? n.delete(friend.uid) : n.add(friend.uid); setSelectedGroupMembers(n); }} className={`w-full p-3 flex items-center justify-between rounded-xl mb-1 ${isSelected ? 'bg-indigo-900/20 border border-indigo-500/20' : 'hover:bg-neutral-900 border border-transparent'}`}>
                                       <div className="flex items-center gap-3">
                                            {friend.photoURL ? <img src={friend.photoURL} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs text-white font-bold">{friend.name?.charAt(0)}</div>}
                                            <span className={`text-sm ${isSelected ? 'text-indigo-200' : 'text-neutral-300'}`}>{friend.name}</span>
                                       </div>
                                       {isSelected ? <CheckCircle2 size={18} className="text-indigo-500" /> : <Circle size={18} className="text-neutral-700" />}
                                   </button>
                               );
                           })}
                       </div>
                       <div className="p-4 border-t border-neutral-800"><button onClick={handleCreateGroup} disabled={!newGroupName.trim() || selectedGroupMembers.size === 0} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-medium">Create Group</button></div>
                   </div>
               )}
           </div>

           {/* MAIN CONTENT AREA */}
           <div className={`w-full md:w-2/3 flex flex-col bg-neutral-950 ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
               {selectedChat ? (
                   <>
                       {/* Chat Header */}
                       <div className="p-3 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur flex items-center justify-between">
                           <div className="flex items-center gap-3">
                               <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 text-neutral-400 hover:text-white"><ArrowLeft size={20} /></button>
                               <div className="flex items-center gap-3">
                                   <div className="relative">
                                       {selectedChat.type === 'group' ? (
                                           (activeGroupData?.photoURL || selectedChat.photoURL) ? (
                                                <img src={activeGroupData?.photoURL || selectedChat.photoURL} className="w-9 h-9 rounded-2xl bg-neutral-800 object-cover" />
                                           ) : (
                                                <div className="w-9 h-9 rounded-2xl bg-neutral-800 flex items-center justify-center border border-neutral-700"><Users size={16} className="text-neutral-400" /></div>
                                           )
                                       ) : selectedChat.photoURL ? (
                                            <img src={selectedChat.photoURL} className="w-9 h-9 rounded-full bg-neutral-800" />
                                        ) : (
                                            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">{selectedChat.name.charAt(0)}</div>
                                        )}
                                        {friendPresence && <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-900 ${friendPresence.online ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div>}
                                   </div>
                                   <div className="flex flex-col">
                                       <span className="font-bold text-neutral-200 text-sm leading-tight">
                                           {(activeGroupData && selectedChat.type === 'group') ? activeGroupData.name : selectedChat.name}
                                       </span>
                                       {selectedChat.type === 'group' && <span className="text-[10px] text-neutral-500">{Object.keys(activeGroupData?.members || {}).length} members</span>}
                                   </div>
                               </div>
                           </div>
                           <div className="flex items-center gap-2">
                               {selectedChat.type === 'group' && (
                                   <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'}`}>
                                       <Settings size={20} />
                                   </button>
                               )}
                               <button onClick={onClose} className="hidden md:block p-2 text-neutral-500 hover:text-white rounded-lg hover:bg-neutral-800"><X size={20} /></button>
                           </div>
                       </div>

                       {/* VIEW: SETTINGS */}
                       {showSettings && activeGroupData ? (
                           <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 animate-in slide-in-from-right-4">
                               
                               {/* Group Header Edit */}
                               <div className="flex flex-col items-center gap-4">
                                   <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" />
                                   
                                   <div className="relative group">
                                       {editGroupPhoto ? (
                                           <img src={editGroupPhoto} className="w-24 h-24 rounded-3xl object-cover bg-neutral-800 border-2 border-neutral-800" />
                                       ) : (
                                           <div className="w-24 h-24 rounded-3xl bg-neutral-800 flex items-center justify-center border-2 border-neutral-800"><Users size={40} className="text-neutral-600" /></div>
                                       )}
                                       
                                       {/* Loading Overlay */}
                                       {isUploading && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-3xl z-20">
                                                <Loader2 size={24} className="text-indigo-500 animate-spin" />
                                            </div>
                                       )}

                                       {/* Change Photo Overlay */}
                                       <div className={`absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-3xl transition-opacity cursor-pointer z-10`} onClick={handleAvatarClick}>
                                           <Camera className="text-white" size={24} />
                                       </div>
                                   </div>
                                   
                                   {editGroupPhoto && (
                                       <button onClick={removeGroupPhoto} className="text-xs text-red-400 hover:text-red-300 hover:underline -mt-2">
                                           Remove Photo
                                       </button>
                                   )}

                                   {amIAdmin ? (
                                       isEditingGroup ? (
                                           <div className="flex gap-2">
                                               <input 
                                                    value={editGroupName} 
                                                    onChange={e => setEditGroupName(e.target.value)}
                                                    className="bg-neutral-800 border border-neutral-700 text-white px-3 py-1 rounded-lg text-center font-bold text-lg focus:outline-none focus:border-indigo-500"
                                               />
                                               <button onClick={saveGroupSettings} className="p-2 bg-indigo-600 text-white rounded-lg"><Save size={18} /></button>
                                           </div>
                                       ) : (
                                           <div className="flex items-center gap-2">
                                               <h1 className="text-2xl font-bold text-white">{activeGroupData.name}</h1>
                                               <button onClick={() => setIsEditingGroup(true)} className="p-1 text-neutral-500 hover:text-indigo-400"><Edit2 size={16} /></button>
                                           </div>
                                       )
                                   ) : (
                                       <div className="flex flex-col items-center gap-2">
                                            <h1 className="text-2xl font-bold text-white">{activeGroupData.name}</h1>
                                       </div>
                                   )}
                               </div>

                               {/* Member List */}
                               <div className="space-y-4">
                                   <div className="flex items-center justify-between">
                                       <h3 className="text-neutral-500 text-xs font-bold uppercase tracking-wider">Members ({Object.keys(activeGroupData.members || {}).length})</h3>
                                       <button onClick={() => setShowAddMember(!showAddMember)} className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 text-xs font-medium bg-indigo-400/10 px-2 py-1 rounded transition-colors">
                                           <UserPlus size={14} /> Add People
                                       </button>
                                   </div>

                                   {showAddMember && (
                                       <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 mb-4 animate-in fade-in slide-in-from-top-2">
                                           <div className="text-xs text-neutral-500 mb-2">Select friends to add:</div>
                                           <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                                               {myFriends.filter(f => !activeGroupData.members?.[f.uid]).length > 0 ? (
                                                   myFriends.filter(f => !activeGroupData.members?.[f.uid]).map(f => (
                                                       <div key={f.uid} className="flex justify-between items-center p-2 hover:bg-neutral-800 rounded-lg group">
                                                           <span className="text-sm text-neutral-300">{f.name}</span>
                                                           <button onClick={() => addMemberToGroup(f.uid)} className="text-indigo-400 hover:bg-indigo-400/20 p-1 rounded"><Plus size={14} /></button>
                                                       </div>
                                                   ))
                                               ) : (
                                                   <div className="text-neutral-600 text-xs italic p-2">No new friends to add.</div>
                                               )}
                                           </div>
                                       </div>
                                   )}

                                   <div className="space-y-2">
                                       {groupMembersDetails.map(member => {
                                           const isMemberAdmin = activeGroupData.admins?.[member.uid] || activeGroupData.createdBy === member.uid;
                                           const isMe = member.uid === user?.uid;

                                           return (
                                               <div key={member.uid} className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 rounded-xl">
                                                   <div className="flex items-center gap-3">
                                                       {member.photoURL ? <img src={member.photoURL} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">{member.name?.charAt(0)}</div>}
                                                       <div className="flex flex-col">
                                                           <span className="text-sm font-medium text-neutral-200 flex items-center gap-2">
                                                               {member.name}
                                                               {isMemberAdmin && <Shield size={12} className="text-amber-500" fill="currentColor" fillOpacity={0.2} />}
                                                           </span>
                                                           {isMemberAdmin && <span className="text-[10px] text-amber-500/80 font-medium">Admin</span>}
                                                       </div>
                                                   </div>
                                                   
                                                   {/* Actions */}
                                                   <div className="flex items-center gap-1">
                                                       {amIAdmin && !isMe && (
                                                           <>
                                                               {isMemberAdmin ? (
                                                                   <button onClick={() => demoteAdmin(member.uid)} title="Demote to Member" className="p-2 text-neutral-500 hover:text-amber-500 hover:bg-neutral-800 rounded-lg"><ShieldAlert size={16} /></button>
                                                               ) : (
                                                                   <button onClick={() => promoteAdmin(member.uid)} title="Promote to Admin" className="p-2 text-neutral-500 hover:text-emerald-500 hover:bg-neutral-800 rounded-lg"><Shield size={16} /></button>
                                                               )}
                                                               <button onClick={() => removeMember(member.uid)} title="Remove from Group" className="p-2 text-neutral-500 hover:text-red-500 hover:bg-neutral-800 rounded-lg"><UserMinus size={16} /></button>
                                                           </>
                                                       )}
                                                   </div>
                                               </div>
                                           );
                                       })}
                                   </div>
                               </div>

                               <div className="pt-8 border-t border-neutral-800 space-y-3">
                                    <button onClick={leaveGroup} className="w-full flex items-center justify-center gap-2 p-3 bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors">
                                        <LogOut size={16} /> Leave Group
                                    </button>
                                    
                                    {amIAdmin && (
                                        <button onClick={deleteGroup} className="w-full flex items-center justify-center gap-2 p-3 bg-red-950/20 border border-red-900/30 text-red-400 hover:bg-red-900/30 hover:text-red-300 rounded-xl transition-colors">
                                            <Trash2 size={16} /> Delete Group
                                        </button>
                                    )}
                               </div>

                           </div>
                       ) : (
                           /* VIEW: MESSAGES */
                           <>
                                <div 
                                    className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1"
                                    ref={scrollContainerRef}
                                    onScroll={handleScroll}
                                >
                                    {messages.map((msg, idx) => {
                                        const isMe = msg.senderUid === user?.uid;
                                        const prevMsg = messages[idx - 1];
                                        const isChain = prevMsg && prevMsg.senderUid === msg.senderUid && (msg.timestamp - prevMsg.timestamp < 60000);
                                        return (
                                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isChain ? 'mt-0.5' : 'mt-4'}`}>
                                                {selectedChat.type === 'group' && !isMe && !isChain && <span className="text-[10px] text-neutral-500 ml-10 mb-0.5">{msg.senderName}</span>}
                                                <div className={`flex gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                                    <div className="w-8 flex-shrink-0 flex flex-col items-center">
                                                        {!isMe && !isChain && (
                                                            selectedChat.type === 'group' ? (
                                                                <div className="w-8 h-8 rounded-full bg-indigo-900/50 flex items-center justify-center text-[10px] font-bold text-indigo-300 border border-indigo-500/20">{msg.senderName?.charAt(0)}</div>
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-full bg-indigo-600 text-[10px] flex items-center justify-center font-bold text-white">{selectedChat.name.charAt(0)}</div>
                                                            )
                                                        )}
                                                    </div>
                                                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                        <div className={`px-4 py-2 rounded-2xl text-sm break-words whitespace-pre-wrap leading-relaxed shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-neutral-800 text-neutral-200 rounded-tl-sm'}`}>
                                                            {msg.text}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`flex items-center gap-1 mt-1 px-11 ${isMe ? 'mr-0' : 'ml-0'}`}>
                                                        <span className="text-[10px] text-neutral-600">{formatTime(msg.timestamp)}</span>
                                                        {isMe && idx === messages.length - 1 && selectedChat.type === 'dm' && <span className="text-[10px] font-medium ml-1">{msg.seen ? <span className="text-neutral-500">Seen</span> : <span className="text-neutral-600">Sent</span>}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div ref={messagesEndRef} />
                                </div>
                                <div className="p-3 bg-neutral-900 border-t border-neutral-800">
                                    <form onSubmit={handleSend} className="flex gap-2 items-end bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-2 focus-within:border-indigo-500/50 transition-colors">
                                        <textarea ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} placeholder={`Message ${selectedChat.name}...`} rows={1} className="flex-1 bg-transparent text-white px-2 py-2 focus:outline-none text-sm resize-none custom-scrollbar max-h-32 placeholder:text-neutral-600" style={{ minHeight: '40px' }} />
                                        <button type="submit" disabled={!inputText.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-neutral-800 text-white p-2.5 rounded-lg transition-colors mb-0.5"><Send size={16} /></button>
                                    </form>
                                </div>
                           </>
                       )}
                   </>
               ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 p-8 text-center bg-neutral-950/50">
                       <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4 border border-neutral-800"><MessageCircle size={32} className="text-indigo-500/50" /></div>
                       <h3 className="text-lg font-medium text-neutral-300 mb-2">Inbox</h3>
                       <p className="text-sm max-w-xs text-neutral-500">Select a chat or create a new group to start messaging.</p>
                   </div>
               )}
           </div>
        </div>
      </div>
  );
};