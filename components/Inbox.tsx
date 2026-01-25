import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { ref, onValue, push, update, get, set, remove, runTransaction, onChildAdded, onChildChanged, onChildRemoved } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { useNavigate } from 'react-router-dom';
import { 
    Send, MessageCircle, ArrowLeft, Users, Plus, CheckCircle2, 
    Circle, Settings, Camera, Shield, ShieldAlert, Trash2, UserPlus, 
    LogOut, Save, Edit2, UserMinus, Loader2, X, Check, CheckCheck, Reply, CornerUpRight,
    SmilePlus
} from 'lucide-react';

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

const REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '😭', '😮', '🎉', '👀'];

export const Inbox: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
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
  const [allReactions, setAllReactions] = useState<Record<string, any>>({});
  
  // Typing & Seen State
  const [typingText, setTypingText] = useState('');
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, number>>({});
  
  // Inputs
  const [inputText, setInputText] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<Set<string>>(new Set());
  
  // Interaction State
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  
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
  
  // Scroll & Typing Refs
  const isAutoScrollEnabled = useRef(true);
  const isInitialLoadRef = useRef(false);
  const typingTimeoutRef = useRef<number | null>(null);

  // Helper: DM Conversation ID
  const getDmConvoId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');

  // Helper: Get Current Chat ID (Unified for DM/Group)
  const currentChatId = useMemo(() => {
    if (!user || !selectedChat) return null;
    return selectedChat.type === 'dm' ? getDmConvoId(user.uid, selectedChat.id) : selectedChat.id;
  }, [user, selectedChat]);

  // Helper: Member Lookup for Group Avatars
  const memberLookup = useMemo(() => {
      const map: Record<string, any> = {};
      groupMembersDetails.forEach(m => { map[m.uid] = m; });
      return map;
  }, [groupMembersDetails]);

  // Helper: Find index of the latest message from current user
  const latestMeIdx = useMemo(() => {
      for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].senderUid === user?.uid) return i;
      }
      return -1;
  }, [messages, user?.uid]);

  // --- 0. Migration Helper ---
  const migrateLegacyData = async () => {
      if (!user) return;
  };

  // --- 1. Real-time Inbox Listener ---
  useEffect(() => {
    if (!user) return;
    
    const inboxRef = ref(database, `userInboxes/${user.uid}`);
    get(inboxRef).then((snap) => {
        if (!snap.exists()) migrateLegacyData();
        setLoading(false);
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
            if (existingIdx >= 0) newChats[existingIdx] = newItem;
            else newChats.push(newItem);
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

    return () => { unsubAdded(); unsubChanged(); unsubRemoved(); };
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

  // --- 3. Friends Fetcher ---
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

  // --- 4. Chat Reset on Switch ---
  useEffect(() => {
      if (selectedChat) {
          isInitialLoadRef.current = true; // Mark as initial load for scroll logic
          setMessages([]); // Clear old messages instantly
          setInputText(''); // FIX: Clear input on chat switch
          setReplyingTo(null); // FIX: Clear reply on chat switch
          setActiveReactionPickerId(null);
          setTypingText('');
          setLastSeenMap({});
          isAutoScrollEnabled.current = true;
          
          // Clear Unread
          if (user) {
              update(ref(database, `userInboxes/${user.uid}/${selectedChat.id}`), { unreadCount: 0 });
          }
      }
  }, [selectedChat?.id, user]);

  // --- 5. Messages & Presence Listener ---
  useEffect(() => {
      if (!user || !selectedChat || !currentChatId) {
          setFriendPresence(null);
          return;
      }

      let messagesPath = selectedChat.type === 'dm' ? `messages/${currentChatId}` : `groupMessages/${selectedChat.id}`;
      
      if (selectedChat.type === 'dm') {
          onValue(ref(database, `presence/${selectedChat.id}`), (snap) => setFriendPresence(snap.exists() ? snap.val() : null));
      }

      const unsubMsg = onValue(ref(database, messagesPath), (snapshot) => {
          if (snapshot.exists()) {
              const list = Object.entries(snapshot.val()).map(([key, val]: [string, any]) => ({ id: key, ...val })).sort((a, b) => a.timestamp - b.timestamp);
              setMessages(list);
              update(ref(database, `chatSeen/${currentChatId}/${user.uid}`), { timestamp: Date.now() });
          } else {
              setMessages([]);
          }
      });

      // Add reactions listener
      const unsubReactions = onValue(ref(database, `reactions/${currentChatId}`), (snap) => {
          setAllReactions(snap.exists() ? snap.val() : {});
      });
      
      setTimeout(() => inputRef.current?.focus(), 100);

      const typingRef = ref(database, `typing/${currentChatId}`);
      const unsubTyping = onValue(typingRef, (snap) => {
          if (snap.exists()) {
              const data = snap.val();
              const typers = Object.entries(data)
                  .filter(([uid, isTyping]) => uid !== user.uid && isTyping === true)
                  .map(([uid]) => uid);
              
              if (typers.length === 0) setTypingText('');
              else if (selectedChat.type === 'dm') setTypingText('typing...');
              else {
                  if (typers.length === 1) {
                      const name = groupMembersDetails.find(m => m.uid === typers[0])?.name || 'Someone';
                      setTypingText(`${name} is typing...`);
                  } else {
                      setTypingText('Multiple people are typing...');
                  }
              }
          } else {
              setTypingText('');
          }
      });

      const seenRef = ref(database, `chatSeen/${currentChatId}`);
      update(ref(database, `chatSeen/${currentChatId}/${user.uid}`), { timestamp: Date.now() });
      
      const unsubSeen = onValue(seenRef, (snap) => {
          if (snap.exists()) {
              const data = snap.val();
              const map: Record<string, number> = {};
              Object.entries(data).forEach(([uid, val]: [string, any]) => {
                   map[uid] = val.timestamp || val; 
              });
              setLastSeenMap(map);
          }
      });

      return () => { unsubMsg(); unsubTyping(); unsubSeen(); unsubReactions(); };
  }, [user, selectedChat, currentChatId, groupMembersDetails]);


  // --- 6. Scroll Logic ---
  useLayoutEffect(() => {
      if (!scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      
      if (isInitialLoadRef.current && messages.length > 0) {
          container.scrollTop = container.scrollHeight;
          isInitialLoadRef.current = false;
      } 
      else if (messages.length > 0 && isAutoScrollEnabled.current) {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
  }, [messages, selectedChat?.id]);

  const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      isAutoScrollEnabled.current = (scrollHeight - scrollTop - clientHeight) < 100;
  };

  const scrollToMessage = (messageId: string) => {
      const element = document.getElementById(`msg-${messageId}`);
      if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedMessageId(messageId);
          setTimeout(() => setHighlightedMessageId(null), 2000);
      }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user || !currentChatId) return;
    const reactionRef = ref(database, `reactions/${currentChatId}/${messageId}/${emoji}/${user.uid}`);
    const snap = await get(reactionRef);
    if (snap.exists()) {
      await remove(reactionRef);
    } else {
      await set(reactionRef, true);
    }
    setActiveReactionPickerId(null);
  };

  // --- Actions ---
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputText(e.target.value);
      if (!user || !currentChatId) return;
      update(ref(database, `typing/${currentChatId}/${user.uid}`), true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
          update(ref(database, `typing/${currentChatId}/${user.uid}`), false);
      }, 1500);
  };

  const handleSend = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const text = inputText.trim();
      if (!user || !selectedChat || !currentChatId || !text) return;
      isAutoScrollEnabled.current = true;
      const timestamp = Date.now();
      const msgData: any = { 
          senderUid: user.uid, 
          senderName: user.displayName || 'Unknown', 
          text, 
          timestamp 
      };
      if (replyingTo) {
          msgData.replyTo = {
              messageId: replyingTo.id,
              senderId: replyingTo.senderUid,
              senderName: replyingTo.senderName,
              previewText: replyingTo.text
          };
      }
      try {
          if (selectedChat.type === 'dm') {
              const friendUid = selectedChat.id;
              const messagesRef = ref(database, `messages/${currentChatId}`);
              const newMessageRef = push(messagesRef);
              await set(newMessageRef, msgData);
              await update(ref(database, `conversations/${currentChatId}`), { 
                  members: { [user.uid]: true, [friendUid]: true }, 
                  lastMessage: { ...msgData, seen: false } 
              });
              await update(ref(database, `userInboxes/${user.uid}/${friendUid}`), { 
                  type: 'dm', 
                  name: selectedChat.name, 
                  photoURL: selectedChat.photoURL || null, 
                  lastMessage: msgData, 
                  lastMessageAt: timestamp 
              });
              const friendInboxRef = ref(database, `userInboxes/${friendUid}/${user.uid}`);
              await runTransaction(friendInboxRef, (currentData) => {
                  if (currentData === null) {
                      return { 
                          type: 'dm', 
                          name: user.displayName, 
                          photoURL: user.photoURL, 
                          lastMessage: msgData, 
                          lastMessageAt: timestamp, 
                          unreadCount: 1 
                      };
                  }
                  return { 
                      ...currentData, 
                      name: user.displayName, 
                      photoURL: user.photoURL, 
                      lastMessage: msgData, 
                      lastMessageAt: timestamp, 
                      unreadCount: (currentData.unreadCount || 0) + 1 
                  };
              });
          } else {
              const groupId = selectedChat.id;
              const messagesRef = ref(database, `groupMessages/${groupId}`);
              const newMessageRef = push(messagesRef);
              await set(newMessageRef, msgData);
              await update(ref(database, `groupChats/${groupId}`), { lastMessage: msgData });
              let membersToUpdate: string[] = activeGroupData?.members ? Object.keys(activeGroupData.members) : [];
              if (membersToUpdate.length === 0) {
                 const snap = await get(ref(database, `groupChats/${groupId}/members`));
                 if (snap.exists()) membersToUpdate = Object.keys(snap.val());
              }
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
              await Promise.all(membersToUpdate.map(uid => {
                  if (uid === user.uid) return Promise.resolve();
                  return runTransaction(ref(database, `userInboxes/${uid}/${groupId}/unreadCount`), (count) => (count || 0) + 1);
              }));
          }
          setInputText('');
          setReplyingTo(null);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          await update(ref(database, `typing/${currentChatId}/${user.uid}`), false);
      } catch (error) {
          console.error("Failed to send message:", error);
      }
  };

  const handleCreateGroup = async () => {
      if (!user || !newGroupName.trim() || selectedGroupMembers.size === 0) return;
      const newGroupRef = push(ref(database, 'groupChats'));
      const groupId = newGroupRef.key;
      if (groupId) {
          const membersObj: any = { [user.uid]: true };
          selectedGroupMembers.forEach(uid => membersObj[uid] = true);
          const groupData = { name: newGroupName.trim(), createdBy: user.uid, createdAt: Date.now(), members: membersObj, admins: { [user.uid]: true } };
          await set(newGroupRef, groupData);
          const updates: any = {};
          [user.uid, ...Array.from(selectedGroupMembers)].forEach(uid => {
             updates[`userInboxes/${uid}/${groupId}`] = { type: 'group', name: groupData.name, lastMessage: null, lastMessageAt: Date.now(), unreadCount: 0 };
          });
          await update(ref(database), updates);
          setViewMode('list');
          setNewGroupName('');
          setSelectedGroupMembers(new Set());
      }
  };

  const amIAdmin = useMemo(() => {
      if (!user || !activeGroupData) return false;
      return activeGroupData.admins?.[user.uid] || activeGroupData.createdBy === user.uid;
  }, [user, activeGroupData]);

  const saveGroupSettings = async () => { 
      if (!selectedChat || !activeGroupData) return;
      try {
          await update(ref(database, `groupChats/${selectedChat.id}`), { name: editGroupName });
          setIsEditingGroup(false);
      } catch (e) { console.error(e); }
  };
  const handleAvatarClick = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { 
      if (e.target.files && e.target.files[0] && selectedChat) {
          setIsUploading(true);
          try {
              const url = await uploadImageToCloudinary(e.target.files[0]);
              await update(ref(database, `groupChats/${selectedChat.id}`), { photoURL: url });
          } catch(err) { console.error(err); }
          setIsUploading(false);
      }
  };
  const promoteAdmin = async (uid: string) => { if(selectedChat && amIAdmin) await update(ref(database, `groupChats/${selectedChat.id}/admins`), { [uid]: true }); };
  const removeMember = async (uid: string) => { 
      if(selectedChat && amIAdmin) {
          const updates: any = {};
          updates[`groupChats/${selectedChat.id}/members/${uid}`] = null;
          updates[`groupChats/${selectedChat.id}/admins/${uid}`] = null;
          updates[`userInboxes/${uid}/${selectedChat.id}`] = null;
          await update(ref(database), updates);
      }
  };
  const addMemberToGroup = async (uid: string) => { 
      if(selectedChat) {
          const updates: any = {};
          updates[`groupChats/${selectedChat.id}/members/${uid}`] = true;
          updates[`userInboxes/${uid}/${selectedChat.id}`] = { 
              type: 'group', name: activeGroupData.name, lastMessage: activeGroupData.lastMessage || null, lastMessageAt: Date.now(), unreadCount: 0, photoURL: activeGroupData.photoURL || null 
          };
          await update(ref(database), updates);
      }
  };
  const deleteGroup = async () => { 
      if(selectedChat && amIAdmin) {
          await remove(ref(database, `groupChats/${selectedChat.id}`));
          setSelectedChat(null); 
      }
  };
  const leaveGroup = async () => { 
      if(selectedChat && user) {
          await remove(ref(database, `groupChats/${selectedChat.id}/members/${user.uid}`));
          await remove(ref(database, `userInboxes/${user.uid}/${selectedChat.id}`));
          setSelectedChat(null); 
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
      }
  };

  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const goToProfile = (e: React.MouseEvent, targetUid: string) => {
      e.stopPropagation();
      navigate(`/profile/${targetUid}`);
  };

  const renderMessageStatus = (msg: any) => {
      if (msg.senderUid !== user?.uid) return null;
      let isSeen = false;
      if (selectedChat?.type === 'dm') {
          const friendSeen = lastSeenMap[selectedChat.id];
          isSeen = friendSeen >= msg.timestamp;
      } else {
          if (activeGroupData?.members) {
              const otherMembers = Object.keys(activeGroupData.members).filter(id => id !== user?.uid);
              const seenCount = otherMembers.filter(id => lastSeenMap[id] >= msg.timestamp).length;
              isSeen = seenCount > 0;
          }
      }
      return isSeen 
        ? <CheckCheck size={11} className="text-indigo-200" />
        : <Check size={11} className="text-neutral-300" />;
  };

  return (
    <div className="flex h-full w-full bg-neutral-950">
        {/* LIST */}
        <div className={`w-full md:w-[350px] lg:w-[400px] border-r border-neutral-900 flex-none flex flex-col ${selectedChat ? 'hidden md:flex' : 'flex'} bg-[rgba(20,20,20,0.55)] backdrop-blur-[12px]`}>
            <div className="p-4 border-b border-neutral-900 bg-transparent flex justify-between items-center h-16 shrink-0">
                {viewMode === 'list' ? (
                    <>
                        <h2 className="text-white font-bold text-lg flex items-center gap-2"><MessageCircle size={20} className="text-indigo-500" /> Inbox</h2>
                        <button onClick={() => setViewMode('create_group')} className="p-2 bg-neutral-900/50 hover:bg-neutral-800/50 text-neutral-300 rounded-lg transition-colors border border-neutral-800/50"><Plus size={18} /></button>
                    </>
                ) : (
                    <>
                        <button onClick={() => setViewMode('list')} className="text-neutral-400 hover:text-white flex items-center gap-2 text-sm font-medium"><ArrowLeft size={16} /> Cancel</button>
                        <span className="text-white font-bold">New Group</span>
                    </>
                )}
            </div>
            {viewMode === 'list' ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? <div className="p-4 text-center text-neutral-600 text-sm">Loading...</div> : chats.length === 0 ? <div className="p-8 text-center text-neutral-600 italic text-sm">No messages yet.</div> : (
                        chats.map(chat => {
                            const displayName = (chat.id === selectedChat?.id && activeGroupData) ? activeGroupData.name : chat.name;
                            const displayPhoto = (chat.id === selectedChat?.id && activeGroupData) ? activeGroupData.photoURL : chat.photoURL;
                            const isUnread = (chat.unreadCount || 0) > 0;
                            return (
                                <button key={chat.id} onClick={() => { setSelectedChat(chat); setShowSettings(false); }} className={`w-full py-4 px-5 flex items-center gap-4 hover:bg-neutral-900/30 transition-all border-b border-neutral-900/50 text-left relative group ${selectedChat?.id === chat.id ? 'bg-neutral-900/50' : ''}`}>
                                    <div className="relative shrink-0" onClick={(e) => chat.type === 'dm' && goToProfile(e, chat.id)}>
                                        {chat.type === 'group' ? ( displayPhoto ? <img src={displayPhoto} className="w-14 h-14 rounded-2xl bg-neutral-800 object-cover shadow-sm" /> : <div className="w-14 h-14 rounded-2xl bg-neutral-800 flex items-center justify-center shadow-sm"><Users size={24} className="text-neutral-500" /></div> ) : ( displayPhoto ? <img src={displayPhoto} className="w-14 h-14 rounded-full bg-neutral-800 object-cover shadow-sm hover:opacity-80 transition-opacity" /> : <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold text-white shadow-sm hover:opacity-80 transition-opacity">{displayName.charAt(0)}</div>)}
                                        {isUnread && <span className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-500 border-[3px] border-neutral-950 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm">{chat.unreadCount}</span>}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                                        <div className="flex justify-between items-baseline">
                                            <span className={`font-semibold text-base truncate ${isUnread ? 'text-white' : 'text-neutral-300 group-hover:text-white transition-colors'}`}>{displayName}</span>
                                            <span className={`text-xs ${isUnread ? 'text-indigo-400 font-medium' : 'text-neutral-600'}`}>{chat.timestamp ? new Date(chat.timestamp).toLocaleDateString([], {month:'short', day:'numeric'}) : ''}</span>
                                        </div>
                                        <p className={`text-sm truncate leading-relaxed ${isUnread ? 'text-neutral-200 font-medium' : 'text-neutral-500 group-hover:text-neutral-400 transition-colors'}`}>{chat.lastMessage?.senderUid === user?.uid && <span className="text-neutral-600 mr-1">You:</span>}{chat.lastMessage?.text || 'No messages'}</p>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            ) : (
                <div className="flex-1 flex flex-col">
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
                                        {friend.photoURL ? <img src={friend.photoURL} className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">{friend.name?.charAt(0)}</div>}
                                        <span className={`text-base ${isSelected ? 'text-indigo-200' : 'text-neutral-300'}`}>{friend.name}</span>
                                    </div>
                                    {isSelected ? <CheckCircle2 size={20} className="text-indigo-500" /> : <Circle size={20} className="text-neutral-700" />}
                                </button>
                            );
                        })}
                    </div>
                    <div className="p-4 border-t border-neutral-900"><button onClick={handleCreateGroup} disabled={!newGroupName.trim() || selectedGroupMembers.size === 0} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-medium">Create Group</button></div>
                </div>
            )}
        </div>

        {/* CHAT AREA */}
        <div className={`flex-1 flex flex-col bg-neutral-950 min-w-0 ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
            {selectedChat ? (
                <>
                    <div className="p-3 border-b border-neutral-900/50 bg-[rgba(20,20,20,0.55)] backdrop-blur-[12px] flex items-center justify-between h-16 shrink-0 z-10">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 text-neutral-400 hover:text-white"><ArrowLeft size={20} /></button>
                            <div className="flex items-center gap-3">
                                <button onClick={(e) => selectedChat.type === 'dm' && goToProfile(e, selectedChat.id)} className={`relative ${selectedChat.type === 'dm' ? 'cursor-pointer hover:opacity-80' : ''}`}>
                                    {selectedChat.type === 'group' ? ( (activeGroupData?.photoURL || selectedChat.photoURL) ? <img src={activeGroupData?.photoURL || selectedChat.photoURL} className="w-9 h-9 rounded-2xl bg-neutral-800 object-cover" /> : <div className="w-9 h-9 rounded-2xl bg-neutral-800 flex items-center justify-center"><Users size={16} className="text-neutral-500" /></div> ) : selectedChat.photoURL ? <img src={selectedChat.photoURL} className="w-9 h-9 rounded-full bg-neutral-800" /> : <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">{selectedChat.name.charAt(0)}</div>}
                                    {friendPresence && <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-950 ${friendPresence.online ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div>}
                                </button>
                                <div className="flex flex-col">
                                    <span className="font-bold text-neutral-200 text-sm cursor-pointer hover:text-white transition-colors" onClick={(e) => selectedChat.type === 'dm' && goToProfile(e, selectedChat.id)}>{ (activeGroupData && selectedChat.type === 'group') ? activeGroupData.name : selectedChat.name }</span>
                                    {selectedChat.type === 'group' ? ( <span className="text-[10px] text-neutral-500">{Object.keys(activeGroupData?.members || {}).length} members</span> ) : ( typingText && <span className="text-[10px] text-indigo-400 animate-pulse font-medium">{typingText}</span> )}
                                </div>
                            </div>
                        </div>
                        {selectedChat.type === 'group' && <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:text-white'}`}><Settings size={20} /></button>}
                    </div>

                    {showSettings && activeGroupData ? (
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 animate-in slide-in-from-right-4">
                             <div className="flex flex-col items-center gap-4">
                                   <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" />
                                   <div className="relative group">
                                       {editGroupPhoto ? <img src={editGroupPhoto} className="w-24 h-24 rounded-3xl object-cover bg-neutral-800 border-2 border-neutral-800" /> : <div className="w-24 h-24 rounded-3xl bg-neutral-800 flex items-center justify-center border-2 border-neutral-800"><Users size={40} className="text-neutral-600" /></div>}
                                       <div className={`absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-3xl transition-opacity cursor-pointer z-10`} onClick={handleAvatarClick}><Camera className="text-white" size={24} /></div>
                                   </div>
                                   {amIAdmin ? ( isEditingGroup ? <div className="flex gap-2"><input value={editGroupName} onChange={e => setEditGroupName(e.target.value)} className="bg-neutral-800 border border-neutral-700 text-white px-3 py-1 rounded-lg text-center font-bold text-lg" /><button onClick={saveGroupSettings} className="p-2 bg-indigo-600 text-white rounded-lg"><Save size={18} /></button></div> : <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-white">{activeGroupData.name}</h1><button onClick={() => setIsEditingGroup(true)} className="p-1 text-neutral-500 hover:text-indigo-400"><Edit2 size={16} /></button></div> ) : <h1 className="text-2xl font-bold text-white">{activeGroupData.name}</h1>}
                             </div>
                             <div className="space-y-4">
                                  <div className="flex items-center justify-between"><h3 className="text-neutral-500 text-xs font-bold uppercase">Members</h3><button onClick={() => setShowAddMember(!showAddMember)} className="text-indigo-400 text-xs"><UserPlus size={14} /></button></div>
                                  {showAddMember && <div className="bg-neutral-900 p-3 rounded-xl mb-4">{myFriends.filter(f => !activeGroupData.members?.[f.uid]).map(f => <div key={f.uid} className="flex justify-between p-2 hover:bg-neutral-800"><span className="text-sm">{f.name}</span><button onClick={() => addMemberToGroup(f.uid)} className="text-indigo-400"><Plus size={14}/></button></div>)} </div>}
                                  <div className="space-y-2">{groupMembersDetails.map(member => <div key={member.uid} className="flex justify-between p-3 bg-neutral-900 rounded-xl cursor-pointer hover:bg-neutral-800 transition-colors" onClick={() => navigate(`/profile/${member.uid}`)}><div className="flex gap-3"><span className="text-sm text-neutral-200">{member.name}</span></div>{amIAdmin && member.uid !== user?.uid && <button onClick={(e) => { e.stopPropagation(); removeMember(member.uid); }} className="text-red-500"><UserMinus size={16}/></button>}</div>)}</div>
                             </div>
                             <div className="pt-8 border-t border-neutral-800 space-y-3"><button onClick={leaveGroup} className="w-full p-3 bg-neutral-900 rounded-xl text-neutral-400 hover:text-white">Leave Group</button>{amIAdmin && <button onClick={deleteGroup} className="w-full p-3 bg-red-950/20 text-red-400 rounded-xl">Delete Group</button>}</div>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1" ref={scrollContainerRef} onScroll={handleScroll}>
                                {messages.map((msg, idx) => {
                                    const isMe = msg.senderUid === user?.uid;
                                    const prevMsg = messages[idx - 1];
                                    const isChain = prevMsg && prevMsg.senderUid === msg.senderUid && (msg.timestamp - prevMsg.timestamp < 60000);
                                    const isLatestMe = idx === latestMeIdx;
                                    const isHighlighted = highlightedMessageId === msg.id;
                                    const reactions = allReactions[msg.id];

                                    let senderPhoto = null;
                                    if (selectedChat.type === 'group' && !isMe) senderPhoto = memberLookup[msg.senderUid]?.photoURL;
                                    else if (selectedChat.type === 'dm' && !isMe) senderPhoto = selectedChat.photoURL;

                                    return (
                                        <div key={msg.id} id={`msg-${msg.id}`} className={`flex flex-col group/msg transition-all duration-500 ${isMe ? 'items-end' : 'items-start'} ${isChain ? 'mt-0.5' : 'mt-4'} ${isHighlighted ? 'bg-indigo-500/10 rounded-xl py-1' : ''}`}>
                                            {!isMe && !isChain && selectedChat.type === 'group' && ( <span className="text-[10px] text-neutral-500 ml-10 mb-1 cursor-pointer hover:text-neutral-300 transition-colors" onClick={() => navigate(`/profile/${msg.senderUid}`)}>{msg.senderName}</span> )}
                                            <div className={`flex gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                                {!isMe && (
                                                    <div className="w-8 flex-shrink-0 flex items-end">
                                                        {!isChain ? ( senderPhoto ? ( <img src={senderPhoto} className="w-8 h-8 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity bg-neutral-800 border border-neutral-800/50 shadow-sm" onClick={() => navigate(`/profile/${msg.senderUid}`)} alt={msg.senderName} /> ) : ( selectedChat.type === 'group' ? ( <div className="w-8 h-8 rounded-full bg-indigo-900/30 flex items-center justify-center text-[10px] font-bold text-indigo-300 border border-indigo-500/20 cursor-pointer hover:opacity-80 transition-opacity shadow-sm" onClick={() => navigate(`/profile/${msg.senderUid}`)}>{msg.senderName?.charAt(0)}</div> ) : ( <div className="w-8 h-8 rounded-full bg-indigo-600 text-[10px] flex items-center justify-center font-bold text-white cursor-pointer hover:opacity-80 transition-opacity shadow-sm" onClick={() => navigate(`/profile/${msg.senderUid}`)}>{selectedChat.name.charAt(0)}</div> ) ) ) : <div className="w-8" />}
                                                    </div>
                                                )}
                                                <div className="flex flex-col relative group/bubble">
                                                    {msg.replyTo && (
                                                        <div onClick={() => scrollToMessage(msg.replyTo.messageId)} className={`mb-1 p-2 rounded-xl text-[11px] cursor-pointer border backdrop-blur-sm truncate max-w-[200px] ${isMe ? 'bg-white/10 border-white/10 text-indigo-100 self-end' : 'bg-neutral-900/50 border-neutral-700/50 text-neutral-400 self-start'}`}><div className="font-bold mb-0.5 flex items-center gap-1"><Reply size={10} /> {msg.replyTo.senderName}</div><div className="truncate opacity-70 italic">{msg.replyTo.previewText}</div></div>
                                                    )}
                                                    <div className={`relative px-3.5 py-1.5 rounded-2xl text-sm break-words whitespace-pre-wrap shadow-sm transition-all overflow-hidden ${isMe ? `bg-indigo-600 text-white ${isChain ? 'rounded-tr-md' : 'rounded-tr-sm'}` : `bg-neutral-800/90 text-neutral-100 border border-neutral-700/30 ${isChain ? 'rounded-tl-md' : 'rounded-tl-sm'}`}`}><div className="pr-1 inline">{msg.text}</div><div className="inline-flex items-center gap-1.5 ml-2 mt-1 -mr-1 align-bottom select-none"><span className={`text-[9px] font-medium tracking-tight ${isMe ? 'text-indigo-200/70' : 'text-neutral-400'}`}>{formatTime(msg.timestamp)}</span>{isLatestMe && renderMessageStatus(msg)}</div></div>
                                                    
                                                    {/* Reactions Pills */}
                                                    {reactions && (
                                                        <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                            {Object.entries(reactions).map(([emoji, users]: [string, any]) => {
                                                                const count = Object.keys(users).length;
                                                                const hasReacted = users[user?.uid || ''];
                                                                return (
                                                                    <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors ${hasReacted ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'}`}>
                                                                        <span>{emoji}</span>
                                                                        <span className="font-bold">{count}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* Actions Bar */}
                                                    <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-all z-20 ${isMe ? '-left-20' : '-right-20'}`}>
                                                        <button onClick={() => { setReplyingTo(msg); inputRef.current?.focus(); }} className="p-2 rounded-full bg-neutral-900/80 text-neutral-400 hover:text-white border border-neutral-800" title="Reply"><Reply size={14} /></button>
                                                        <div className="relative">
                                                            <button onClick={() => setActiveReactionPickerId(activeReactionPickerId === msg.id ? null : msg.id)} className={`p-2 rounded-full bg-neutral-900/80 border border-neutral-800 transition-colors ${activeReactionPickerId === msg.id ? 'text-indigo-400 bg-indigo-900/20 border-indigo-500/50' : 'text-neutral-400 hover:text-white'}`} title="React"><SmilePlus size={14} /></button>
                                                            {activeReactionPickerId === msg.id && (
                                                                <div className={`absolute bottom-full mb-2 p-1.5 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex gap-1 animate-in zoom-in-95 duration-200 z-50 ${isMe ? 'left-0' : 'right-0'}`}>
                                                                    {REACTION_EMOJIS.map(emoji => (
                                                                        <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} className="w-8 h-8 flex items-center justify-center text-lg hover:bg-neutral-800 rounded-lg transition-colors">{emoji}</button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>
                            {typingText && ( <div className="px-6 py-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider animate-pulse bg-neutral-950/20 backdrop-blur-sm">{typingText}</div> )}
                            {replyingTo && ( <div className="mx-3 mt-1 px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-t-xl border-b-0 flex items-center justify-between animate-in slide-in-from-bottom-2"><div className="flex-1 min-w-0 flex items-center gap-3"><div className="p-1.5 bg-indigo-500/10 rounded-lg"><CornerUpRight size={14} className="text-indigo-400" /></div><div className="flex flex-col min-w-0"><span className="text-[10px] font-bold text-indigo-400 truncate uppercase tracking-tight">Replying to {replyingTo.senderName}</span><span className="text-xs text-neutral-500 truncate italic">{replyingTo.text}</span></div></div><button onClick={() => setReplyingTo(null)} className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"><X size={14} /></button></div> )}
                            <div className="p-3 bg-neutral-950 border-t border-neutral-900">
                                <form onSubmit={handleSend} className={`flex gap-2 items-end bg-neutral-900 border border-neutral-800 px-2 py-2 focus-within:border-indigo-500/50 transition-colors ${replyingTo ? 'rounded-b-xl' : 'rounded-xl'}`}>
                                    <textarea ref={inputRef} value={inputText} onChange={handleInputChange} onKeyDown={handleKeyDown} placeholder={`Message ${selectedChat.name}...`} rows={1} className="flex-1 bg-transparent text-white px-2 py-2 focus:outline-none text-sm resize-none custom-scrollbar max-h-32 placeholder:text-neutral-600" style={{ minHeight: '40px' }} />
                                    <button type="submit" disabled={!inputText.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-neutral-800 text-white p-2.5 rounded-lg transition-colors mb-0.5"><Send size={16} /></button>
                                </form>
                            </div>
                        </>
                    )}
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 p-8 text-center bg-neutral-950">
                    <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4 border border-neutral-800"><MessageCircle size={32} className="text-indigo-500/50" /></div>
                    <h3 className="text-lg font-medium text-neutral-300 mb-2">Inbox</h3>
                    <p className="text-sm max-w-xs text-neutral-500">Select a chat or create a new group to start messaging.</p>
                </div>
            )}
        </div>
    </div>
  );
};