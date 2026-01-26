
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ref, onValue, push, update, get, set, remove, onChildAdded, onChildChanged, onChildRemoved } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    Send, MessageCircle, ArrowLeft, Users, Plus, CheckCircle2, 
    Circle, Settings, Camera, Trash2, UserPlus, 
    Save, Edit2, UserMinus, Loader2, X, Check, CheckCheck, Reply, CornerUpRight,
    SmilePlus, Paperclip, Play, Image as ImageIcon, Film, MoreVertical, Smile, AlertCircle,
    VolumeX, Archive, Ban
} from 'lucide-react';

interface ChatItem {
  id: string; 
  type: 'dm' | 'group';
  name: string;
  photoURL?: string;
  lastMessage?: {
    text: string;
    timestamp: number;
    senderUid: string;
    senderName?: string;
    seen?: boolean;
    system?: boolean;
  };
  timestamp: number;
  unreadCount?: number;
}

const REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '😭', '😮', '🎉', '👀'];

export const Inbox: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [viewMode, setViewMode] = useState<'list' | 'create_group'>('list');
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const [activeGroupData, setActiveGroupData] = useState<any>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, { name: string, photoURL?: string }>>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [friendPresence, setFriendPresence] = useState<{online: boolean, lastSeen: number, activeChatId?: string} | null>(null);
  const [myFriends, setMyFriends] = useState<any[]>([]);
  const [typingText, setTypingText] = useState('');
  const [inputText, setInputText] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unsendConfirmId, setUnsendConfirmId] = useState<string | null>(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  // Block & Social States
  const [blocks, setBlocks] = useState<Record<string, boolean>>({}); // Who I blocked
  const [blockedBy, setBlockedBy] = useState<Record<string, boolean>>({}); // Who blocked me
  const [mutedChats, setMutedChats] = useState<Record<string, boolean>>({});
  const [archivedChats, setArchivedChats] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastTypingWriteRef = useRef<number>(0);
  const stopTypingTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentChatId = useMemo(() => {
    if (!user || !selectedChat) return null;
    return selectedChat.type === 'dm' ? [user.uid, selectedChat.id].sort().join('_') : selectedChat.id;
  }, [user, selectedChat]);

  // Presence & Active Chat tracking
  useEffect(() => {
    if (!user || !currentChatId) return;
    const pRef = ref(database, `presence/${user.uid}`);
    update(pRef, { activeChatId: currentChatId });
    return () => { update(pRef, { activeChatId: null }); };
  }, [user, currentChatId]);

  // Global Listeners for Block/Mute/Archive
  useEffect(() => {
    if (!user) return;
    const blockRef = ref(database, `blocks/${user.uid}`);
    const unsubBlocks = onValue(blockRef, (snap) => setBlocks(snap.val() || {}));

    const mutedRef = ref(database, `mutedChats/${user.uid}`);
    const unsubMuted = onValue(mutedRef, (snap) => setMutedChats(snap.val() || {}));

    const archivedRef = ref(database, `archivedChats/${user.uid}`);
    const unsubArchived = onValue(archivedRef, (snap) => setArchivedChats(snap.val() || {}));

    // Listen to people who might have blocked me
    const blockedByRef = ref(database, `blockedUsers/${user.uid}`);
    const unsubBlockedBy = onValue(blockedByRef, (snap) => setBlockedBy(snap.val() || {}));

    return () => { 
      unsubBlocks(); 
      unsubMuted(); 
      unsubArchived(); 
      unsubBlockedBy();
    };
  }, [user]);

  // Listen for inbox changes
  useEffect(() => {
    if (!user) return;
    const inboxRef = ref(database, `userInboxes/${user.uid}`);
    
    const handleInboxUpdate = (snapshot: any) => {
        const val = snapshot.val();
        const key = snapshot.key;
        if (!key || !val) return;
        const newItem: ChatItem = {
            id: key, type: val.type, name: val.name, photoURL: val.photoURL,
            lastMessage: val.lastMessage, timestamp: val.lastMessageAt || 0, unreadCount: val.unreadCount || 0
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

    const unsubAdded = onChildAdded(inboxRef, handleInboxUpdate);
    const unsubChanged = onChildChanged(inboxRef, handleInboxUpdate);
    const unsubRemoved = onChildRemoved(inboxRef, (snapshot) => {
        setChats(prev => prev.filter(c => c.id !== snapshot.key));
    });

    get(inboxRef).then(() => setLoading(false));
    return () => { unsubAdded(); unsubChanged(); unsubRemoved(); };
  }, [user]);

  // Handle chatId param
  useEffect(() => {
    if (chats.length > 0) {
        const targetChatId = searchParams.get('chatId');
        if (targetChatId) {
            const targetChat = chats.find(c => c.id === targetChatId);
            if (targetChat) setSelectedChat(targetChat);
        }
    }
  }, [chats, searchParams]);

  // Sync Profiles & Block Visibility
  useEffect(() => {
    if (!selectedChat) return;
    const profileListeners: (() => void)[] = [];
    const attachListener = (uid: string) => {
      const userRef = ref(database, `users/${uid}`);
      const unsub = onValue(userRef, (snap) => {
        if (snap.exists()) {
          const data = snap.val();
          const isBlocked = blocks[uid] || blockedBy[uid];
          setUserProfiles(prev => ({
            ...prev,
            [uid]: { 
              name: isBlocked ? 'Wishp User' : data.name, 
              photoURL: isBlocked ? undefined : data.photoURL 
            }
          }));
        }
      });
      profileListeners.push(unsub);
    };

    if (selectedChat.type === 'dm') {
      attachListener(selectedChat.id);
    } else {
      const membersRef = ref(database, `groupChats/${selectedChat.id}/members`);
      get(membersRef).then(snap => {
        if (snap.exists()) {
          Object.keys(snap.val()).forEach(mid => attachListener(mid));
        }
      });
    }
    return () => profileListeners.forEach(unsub => unsub());
  }, [selectedChat, blocks, blockedBy]);

  // Messages and Presence logic
  useEffect(() => {
    if (!user || !selectedChat || !currentChatId) return;

    const messagesPath = selectedChat.type === 'dm' ? `messages/${currentChatId}` : `groupMessages/${selectedChat.id}`;
    const unsubMessages = onValue(ref(database, messagesPath), (snapshot) => {
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([key, val]: [string, any]) => ({ id: key, ...val })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(list);

        list.forEach(m => {
           if (m.senderUid !== user.uid && !m.seen) {
               update(ref(database, `${messagesPath}/${m.id}`), { seen: true });
           }
        });
      } else {
        setMessages([]);
      }
    });

    const typingRef = ref(database, `typing/${currentChatId}`);
    const unsubTyping = onValue(typingRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const typers = Object.entries(data)
          .filter(([uid, val]: [string, any]) => uid !== user.uid && val.isTyping)
          .map(([uid, val]: [string, any]) => val.name);
        
        if (typers.length === 0) setTypingText('');
        else if (typers.length === 1) setTypingText(`${typers[0]} is typing...`);
        else if (typers.length === 2) setTypingText(`${typers[0]} and ${typers[1]} are typing...`);
        else setTypingText('Several people are typing...');
      } else {
        setTypingText('');
      }
    });

    update(ref(database, `userInboxes/${user.uid}/${selectedChat.id}`), { unreadCount: 0 });

    if (selectedChat.type === 'dm') {
        onValue(ref(database, `presence/${selectedChat.id}`), (snap) => {
            setFriendPresence(snap.val());
        });
    } else {
        onValue(ref(database, `groupChats/${selectedChat.id}`), (snap) => {
            if (snap.exists()) setActiveGroupData(snap.val());
        });
    }

    return () => { unsubMessages(); unsubTyping(); };
  }, [selectedChat, currentChatId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingText]);

  // Fetch Friends for Group Creation
  useEffect(() => {
    if (!user) return;
    const friendsRef = ref(database, `friends/${user.uid}`);
    const unsub = onValue(friendsRef, async (snapshot) => {
      if (snapshot.exists()) {
        const friendIds = Object.keys(snapshot.val());
        const promises = friendIds.map(uid => get(ref(database, `users/${uid}`)).then(s => ({ uid, ...s.val() })));
        const friendsData = await Promise.all(promises);
        setMyFriends(friendsData.filter(f => f.name));
      } else {
        setMyFriends([]);
      }
    });
    return () => unsub();
  }, [user]);

  // DM Actions logic
  const handleBlock = async () => {
    if (!user || !selectedChat || selectedChat.type !== 'dm') return;
    const targetUid = selectedChat.id;
    const isCurrentlyBlocked = blocks[targetUid];
    
    if (isCurrentlyBlocked) {
        // UNBLOCK
        await remove(ref(database, `blocks/${user.uid}/${targetUid}`));
        await remove(ref(database, `blockedUsers/${targetUid}/${user.uid}`));
        alert("User unblocked. You need to send a new friend request to chat again.");
    } else {
        // BLOCK
        await set(ref(database, `blocks/${user.uid}/${targetUid}`), true);
        await set(ref(database, `blockedUsers/${targetUid}/${user.uid}`), true);
        // Remove from friends
        await remove(ref(database, `friends/${user.uid}/${targetUid}`));
        await remove(ref(database, `friends/${targetUid}/${user.uid}`));
    }
    setIsHeaderMenuOpen(false);
  };

  const handleUnfriend = async () => {
    if (!user || !selectedChat || selectedChat.type !== 'dm') return;
    const targetUid = selectedChat.id;
    await remove(ref(database, `friends/${user.uid}/${targetUid}`));
    await remove(ref(database, `friends/${targetUid}/${user.uid}`));
    alert("Friend removed.");
    setIsHeaderMenuOpen(false);
  };

  const handleMute = async () => {
    if (!user || !selectedChat) return;
    const isMuted = mutedChats[selectedChat.id];
    await set(ref(database, `mutedChats/${user.uid}/${selectedChat.id}`), isMuted ? null : true);
    setIsHeaderMenuOpen(false);
  };

  const handleArchive = async () => {
    if (!user || !selectedChat) return;
    const isArchived = archivedChats[selectedChat.id];
    await set(ref(database, `archivedChats/${user.uid}/${selectedChat.id}`), isArchived ? null : true);
    if (!isArchived) setSelectedChat(null); // Close chat when archiving
    setIsHeaderMenuOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (!user || !currentChatId) return;

    const now = Date.now();
    if (now - lastTypingWriteRef.current > 2000) {
      update(ref(database, `typing/${currentChatId}/${user.uid}`), { isTyping: true, name: user.displayName });
      lastTypingWriteRef.current = now;
    }

    if (stopTypingTimeoutRef.current) window.clearTimeout(stopTypingTimeoutRef.current);
    stopTypingTimeoutRef.current = window.setTimeout(() => {
      update(ref(database, `typing/${currentChatId}/${user.uid}`), { isTyping: false });
    }, 3000);
  };

  const sendMessage = async (e?: React.FormEvent, attachment?: { url: string, type: 'image' | 'video' }) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachment && !user || !selectedChat || !currentChatId) return;

    // BLOCK CHECK
    if (selectedChat.type === 'dm' && (blocks[selectedChat.id] || blockedBy[selectedChat.id])) {
        alert("Cannot send messages. Block relationship exists.");
        return;
    }

    const msgText = inputText.trim();
    setInputText('');
    setReplyingTo(null);
    update(ref(database, `typing/${currentChatId}/${user.uid}`), { isTyping: false });

    const isRecipientActive = selectedChat.type === 'dm' && friendPresence?.online && friendPresence?.activeChatId === currentChatId;

    const msgData: any = {
      text: msgText,
      senderUid: user?.uid,
      senderName: user?.displayName,
      timestamp: Date.now(),
      seen: isRecipientActive,
      replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderName: replyingTo.senderName } : null
    };

    if (attachment) msgData.attachment = attachment;

    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    const newMsgRef = push(ref(database, `${basePath}/${currentChatId}`));
    await set(newMsgRef, msgData);

    const updateInbox = (uid: string, chatName: string, chatPhoto?: string) => {
      const targetChatIdForInbox = selectedChat.id === uid ? user?.uid : selectedChat.id;
      const inboxPath = `userInboxes/${uid}/${targetChatIdForInbox}`;
      const inboxRef = ref(database, inboxPath);
      
      // AUTO-UNARCHIVE on new message
      remove(ref(database, `archivedChats/${uid}/${selectedChat.id}`));

      update(inboxRef, {
        lastMessage: { text: attachment ? (attachment.type === 'image' ? 'Sent an image' : 'Sent a video') : msgText, timestamp: Date.now(), senderUid: user?.uid },
        lastMessageAt: Date.now(),
        name: chatName,
        photoURL: chatPhoto || null
      });

      if (uid !== user?.uid) {
          // CHECK MUTE before incrementing unread count
          get(ref(database, `mutedChats/${uid}/${selectedChat.id}`)).then(mSnap => {
              if (!mSnap.exists()) {
                  get(inboxRef).then(snap => {
                      const currentUnread = snap.val()?.unreadCount || 0;
                      update(inboxRef, { unreadCount: currentUnread + 1 });
                  });
              }
          });
      }
    };

    if (selectedChat.type === 'dm') {
      updateInbox(user!.uid, selectedChat.name, selectedChat.photoURL);
      updateInbox(selectedChat.id, user!.displayName || 'User', user!.photoURL || undefined);
    } else if (activeGroupData) {
        const members = Object.keys(activeGroupData.members);
        members.forEach(mid => updateInbox(mid, activeGroupData.name, activeGroupData.photoURL));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedChat) return;
    setIsUploadingMedia(true);
    try {
        const url = await uploadImageToCloudinary(file);
        const type = file.type.startsWith('image/') ? 'image' : 'video';
        await sendMessage(undefined, { url, type });
    } catch (err) {
        alert("Failed to upload media.");
    } finally {
        setIsUploadingMedia(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addReaction = async (msgId: string, emoji: string) => {
    if (!user || !currentChatId || !selectedChat) return;
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    const userReactionRef = ref(database, `${basePath}/${currentChatId}/${msgId}/reactions/${user.uid}`);
    const snap = await get(userReactionRef);
    if (snap.exists() && snap.val() === emoji) await remove(userReactionRef);
    else await set(userReactionRef, emoji);
    setActiveReactionPickerId(null);
  };

  const unsendMessage = async (msgId: string) => {
    if (!user || !currentChatId || !selectedChat) return;
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    await update(ref(database, `${basePath}/${currentChatId}/${msgId}`), { deleted: true, text: "Message unsent", attachment: null, replyTo: null });
    setUnsendConfirmId(null);
  };

  const createGroup = async () => {
    if (!newGroupName.trim() || selectedGroupMembers.size === 0 || !user) return;
    setLoading(true);
    const groupId = `group_${Date.now()}`;
    const members: any = { [user.uid]: Date.now() };
    selectedGroupMembers.forEach(mid => { members[mid] = Date.now(); });
    const groupData = { id: groupId, name: newGroupName, members, admins: { [user.uid]: true }, hostUid: user.uid, createdAt: Date.now(), type: 'group' };
    await set(ref(database, `groupChats/${groupId}`), groupData);
    const systemMsg = { text: `${user.displayName} created the group`, system: true, timestamp: Date.now() };
    await push(ref(database, `groupMessages/${groupId}`), systemMsg);
    const promises = Object.keys(members).map(mid => set(ref(database, `userInboxes/${mid}/${groupId}`), { type: 'group', name: newGroupName, lastMessage: systemMsg, lastMessageAt: Date.now(), unreadCount: mid === user.uid ? 0 : 1 }));
    await Promise.all(promises);
    setViewMode('list');
    setLoading(false);
  };

  const filteredChats = useMemo(() => {
    return chats.filter(c => !archivedChats[c.id]);
  }, [chats, archivedChats]);

  const isCurrentChatBlocked = useMemo(() => {
    if (!selectedChat || selectedChat.type !== 'dm') return false;
    return blocks[selectedChat.id] || blockedBy[selectedChat.id];
  }, [selectedChat, blocks, blockedBy]);

  // Find the last message sent by current user to show 'Seen' status
  const lastSentMessageByMe = useMemo(() => {
    if (!user || !messages) return null;
    const myMessages = messages.filter(m => m.senderUid === user.uid && !m.system && !m.deleted);
    return myMessages.length > 0 ? myMessages[myMessages.length - 1] : null;
  }, [messages, user]);

  if (loading && !chats.length) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="flex h-full bg-neutral-950 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-neutral-900 bg-neutral-950 shrink-0`}>
        <div className="p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/50 backdrop-blur-xl sticky top-0 z-20">
          <h1 className="text-2xl font-black text-white tracking-tight">Messages</h1>
          <button onClick={() => setViewMode(viewMode === 'list' ? 'create_group' : 'list')} className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all active:scale-90">{viewMode === 'list' ? <Plus size={20} /> : <X size={20} />}</button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {viewMode === 'list' ? (
            filteredChats.length > 0 ? (
                filteredChats.map(chat => {
                const isSelected = selectedChat?.id === chat.id;
                return (
                  <button key={chat.id} onClick={() => setSelectedChat(chat)} className={`w-full flex items-center gap-4 p-4 rounded-[24px] group transition-opacity ${isSelected ? 'bg-white/10 backdrop-blur-xl border border-white/10 shadow-xl opacity-100' : 'hover:bg-white/[0.04] opacity-80 hover:opacity-100'}`}>
                    <div className="relative shrink-0">
                      {chat.photoURL ? <img src={chat.photoURL} className="w-14 h-14 rounded-full object-cover" /> : <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${isSelected ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'}`}>{chat.name.charAt(0)}</div>}
                      {chat.unreadCount ? chat.unreadCount > 0 && <div className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-neutral-950">{chat.unreadCount}</div> : null}
                      {mutedChats[chat.id] && <div className="absolute -bottom-1 -left-1 w-5 h-5 bg-neutral-900 rounded-full flex items-center justify-center border border-white/10"><VolumeX size={10} className="text-neutral-500" /></div>}
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className={`font-bold truncate text-base ${isSelected ? 'text-white' : 'text-neutral-200'}`}>{chat.name}</span>
                        <span className={`text-[10px] uppercase font-black shrink-0 ml-2 ${isSelected ? 'text-white/60' : 'text-neutral-500'}`}>{new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className={`text-sm truncate font-medium ${isSelected ? 'text-white/80' : 'text-neutral-500'}`}>{chat.lastMessage?.senderUid === user?.uid && 'You: '}{chat.lastMessage?.text || 'No messages yet'}</p>
                    </div>
                  </button>
                );
              })
            ) : <div className="flex flex-col items-center justify-center py-20 text-center px-6"><div className="w-16 h-16 bg-neutral-900 rounded-[20px] flex items-center justify-center mb-4 text-neutral-700"><MessageCircle size={32} /></div><h3 className="text-white font-bold mb-1">No chats yet</h3><p className="text-neutral-500 text-sm">Add friends from search to start a conversation.</p></div>
          ) : (
            <div className="space-y-6 p-2">
                <div className="space-y-2"><label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Group Name</label><input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="E.g. Study Squad" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-bold" /></div>
                <div className="space-y-3"><label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Select Members</label>{myFriends.length > 0 ? myFriends.map(friend => <button key={friend.uid} onClick={() => { const s = new Set(selectedGroupMembers); s.has(friend.uid) ? s.delete(friend.uid) : s.add(friend.uid); setSelectedGroupMembers(s); }} className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all ${selectedGroupMembers.has(friend.uid) ? 'bg-indigo-600/10 border-indigo-500/50' : 'bg-transparent border-white/5 hover:bg-white/5'}`}><div className="flex items-center gap-3">{friend.photoURL ? <img src={friend.photoURL} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs text-neutral-500">{friend.name.charAt(0)}</div>}<span className="text-sm font-bold text-neutral-300">{friend.name}</span></div>{selectedGroupMembers.has(friend.uid) ? <CheckCircle2 size={18} className="text-indigo-400" /> : <Circle size={18} className="text-neutral-700" />}</button>) : <p className="text-xs text-neutral-600 italic px-3">You need friends to create a group.</p>}</div>
                <button onClick={createGroup} disabled={!newGroupName.trim() || selectedGroupMembers.size === 0} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-900/20 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all">Create Study Group</button>
            </div>
          )}
        </div>
      </div>

      {/* CHAT VIEW */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col bg-neutral-950 relative overflow-hidden">
          {/* Header */}
          <div className="p-4 md:p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/80 backdrop-blur-2xl z-20">
            <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 text-neutral-500 hover:text-white transition-colors"><ArrowLeft size={24} /></button>
              <div className="relative cursor-pointer" onClick={() => navigate(selectedChat.type === 'dm' ? `/profile/${selectedChat.id}` : `/group/${selectedChat.id}/settings`)}>
                {((selectedChat.type === 'dm' ? userProfiles[selectedChat.id]?.photoURL : selectedChat.photoURL)) ? (
                  <img src={selectedChat.type === 'dm' ? userProfiles[selectedChat.id]?.photoURL : selectedChat.photoURL} className="w-10 h-10 md:w-11 md:h-11 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-neutral-800 flex items-center justify-center text-lg font-bold text-neutral-500">
                    {(selectedChat.type === 'dm' ? userProfiles[selectedChat.id]?.name : selectedChat.name)?.charAt(0) || '?'}
                  </div>
                )}
                {selectedChat.type === 'dm' && friendPresence?.online && !isCurrentChatBlocked && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-neutral-950"></div>}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-white truncate leading-tight text-base md:text-lg flex items-center gap-2">
                  {selectedChat.type === 'dm' ? (userProfiles[selectedChat.id]?.name || selectedChat.name) : selectedChat.name}
                  {mutedChats[selectedChat.id] && <VolumeX size={14} className="text-neutral-500" />}
                </span>
                <span className="text-[9px] md:text-[10px] uppercase font-black text-neutral-500 tracking-wider">
                  {selectedChat.type === 'dm' ? (isCurrentChatBlocked ? 'Blocked' : friendPresence?.online ? 'Online' : 'Offline') : 'Group Chat'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 relative">
                {selectedChat.type === 'group' && <button onClick={() => navigate(`/group/${selectedChat.id}/settings`)} className="p-3 text-neutral-500 hover:text-white hover:bg-white/5 rounded-2xl transition-all"><Settings size={20} /></button>}
                <button onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)} className={`p-3 rounded-2xl transition-all ${isHeaderMenuOpen ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}>
                    <MoreVertical size={20} />
                </button>

                {isHeaderMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-[24px] shadow-2xl p-1 z-[100] animate-in fade-in zoom-in-95 duration-200">
                        {selectedChat.type === 'dm' && (
                            <button onClick={handleBlock} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-500/10 rounded-2xl transition-colors">
                                <Ban size={18} /> {blocks[selectedChat.id] ? 'Unblock' : 'Block'}
                            </button>
                        )}
                        <button onClick={handleMute} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-2xl transition-colors">
                            <VolumeX size={18} /> {mutedChats[selectedChat.id] ? 'Unmute' : 'Mute'}
                        </button>
                        <button onClick={handleArchive} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-2xl transition-colors">
                            <Archive size={18} /> {archivedChats[selectedChat.id] ? 'Unarchive' : 'Archive'}
                        </button>
                        {selectedChat.type === 'dm' && (
                            <button onClick={handleUnfriend} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-2xl transition-colors">
                                <UserMinus size={18} /> Unfriend
                            </button>
                        )}
                        <div className="h-px bg-white/5 my-1" />
                        <button onClick={() => setIsHeaderMenuOpen(false)} className="w-full px-4 py-3 text-[10px] font-black text-neutral-600 uppercase tracking-widest hover:text-white text-center">Close</button>
                    </div>
                )}
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 pb-20" ref={scrollContainerRef}>
            {messages.map((msg, index) => {
              if (msg.system) return <div key={msg.id} className="w-full flex justify-center py-2 animate-in fade-in slide-in-from-top-2 duration-300"><div className="bg-white/5 border border-white/5 rounded-full px-4 py-1 text-[10px] text-neutral-500 font-bold uppercase tracking-widest">{msg.text}</div></div>;
              const isMe = msg.senderUid === user?.uid;
              const isFirstInStack = index === 0 || messages[index - 1]?.senderUid !== msg.senderUid || messages[index - 1]?.system;
              const showAvatar = !isMe && isFirstInStack;
              
              const isLastSentByMe = msg.id === lastSentMessageByMe?.id;

              const aggregatedReactions = (() => {
                  if (!msg.reactions) return {};
                  const counts: Record<string, { count: number, me: boolean }> = {};
                  Object.entries(msg.reactions).forEach(([uid, emoji]) => {
                      const e = emoji as string;
                      if (!counts[e]) counts[e] = { count: 0, me: false };
                      counts[e].count++;
                      if (uid === user?.uid) counts[e].me = true;
                  });
                  return counts;
              })();

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg relative mb-1`}>
                  {!msg.deleted && msg.replyTo && (
                    <div className={`mb-1 px-3 py-1 bg-white/[0.04] border border-white/5 rounded-2xl text-[10px] flex flex-col gap-0.5 max-w-[60%] animate-in slide-in-from-bottom-1 duration-200 ${isMe ? 'items-end' : 'items-start'}`}>
                      <span className="font-black opacity-60 uppercase tracking-widest text-[8px]">{msg.replyTo.senderName}</span>
                      <span className="truncate italic text-neutral-500">{msg.replyTo.text}</span>
                    </div>
                  )}

                  <div className={`flex gap-2 max-w-[85%] md:max-w-[70%] ${isMe ? 'flex-row-reverse' : 'items-end'}`}>
                    {!isMe && (
                      <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                        {showAvatar ? (
                          userProfiles[msg.senderUid]?.photoURL ? (
                            <img src={userProfiles[msg.senderUid]?.photoURL} className="w-7 h-7 rounded-full object-cover animate-in fade-in zoom-in-75 duration-300" alt={msg.senderName} />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-neutral-500 animate-in fade-in zoom-in-75 duration-300">
                              {userProfiles[msg.senderUid]?.name?.charAt(0) || msg.senderName?.charAt(0) || '?'}
                            </div>
                          )
                        ) : <div className="w-7 h-7" />}
                      </div>
                    )}

                    <div className="flex flex-col min-w-0 relative">
                      {showAvatar && selectedChat.type === 'group' && (
                        <span className="text-[10px] font-black text-indigo-400 mb-0.5 ml-3 uppercase tracking-wider">{msg.senderName}</span>
                      )}
                      
                      <div className="relative group/bubble flex flex-col">
                        <div className={`px-4 py-2.5 rounded-[22px] text-sm leading-relaxed transition-all break-words relative z-10 ${msg.deleted ? 'italic opacity-60 bg-neutral-900 border border-white/5 text-neutral-500 rounded-3xl' : isMe ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-3xl rounded-br-lg' : 'bg-[#1f1f1f] text-neutral-200 rounded-3xl rounded-bl-lg border border-white/5'}`}>
                          {!msg.deleted && msg.attachment && (
                            <div className="mb-2 rounded-2xl overflow-hidden bg-black/20">
                              {msg.attachment.type === 'image' ? <img src={msg.attachment.url} className="max-w-full h-auto object-cover max-h-80 block" alt="Attachment" /> : <video src={msg.attachment.url} controls className="max-w-full h-auto max-h-80 block" />}
                            </div>
                          )}
                          <p className="inline-block whitespace-pre-wrap">{msg.text}</p>
                        </div>
                        <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-all duration-200 px-3 z-0 pointer-events-none whitespace-nowrap ${isMe ? 'right-full translate-x-1' : 'left-full -translate-x-1'}`}>
                          <span className="text-[9px] font-black text-neutral-600 uppercase tracking-widest">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {Object.keys(aggregatedReactions).length > 0 && !msg.deleted && (
                          <div className={`flex gap-1 mt-1 z-20 ${isMe ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
                            {Object.entries(aggregatedReactions).map(([emoji, data]) => (
                              <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className={`flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md border shadow-sm transition-all animate-in zoom-in-75 duration-220 scale-90 ${data.me ? 'bg-indigo-600/90 border-indigo-400 text-white' : 'bg-neutral-800/90 border-white/10 text-neutral-300'}`}>
                                <span className="text-xs leading-none">{emoji}</span>
                                {data.count > 1 && <span className="text-[9px] font-black">{data.count}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        {!msg.deleted && !isCurrentChatBlocked && (
                          <div className={`absolute top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity px-2 z-20 ${isMe ? 'right-full mr-12' : 'left-full ml-12'}`}>
                             <button onClick={() => setReplyingTo(msg)} className="p-1.5 bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-full text-neutral-500 hover:text-white transition-all hover:scale-110"><Reply size={13} /></button>
                             <button onClick={() => setActiveReactionPickerId(activeReactionPickerId === msg.id ? null : msg.id)} className={`p-1.5 bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-full transition-all hover:scale-110 ${activeReactionPickerId === msg.id ? 'text-indigo-400 scale-110' : 'text-neutral-500 hover:text-white'}`}><Smile size={13} /></button>
                             {isMe && <button onClick={() => setUnsendConfirmId(msg.id)} className="p-1.5 bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-full text-neutral-500 hover:text-red-400 transition-all hover:scale-110"><Trash2 size={13} /></button>}
                          </div>
                        )}
                        {activeReactionPickerId === msg.id && (
                          <div className={`absolute bottom-full mb-3 bg-neutral-900/95 backdrop-blur-xl border border-white/10 p-1.5 rounded-[24px] shadow-2xl flex gap-1 z-[60] animate-in fade-in zoom-in-95 duration-200 ${isMe ? 'right-0' : 'left-0'}`}>
                            {REACTION_EMOJIS.map(emoji => <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="p-2 hover:bg-white/5 rounded-full transition-all hover:scale-125 text-xl leading-none">{emoji}</button>)}
                          </div>
                        )}
                      </div>
                      {isLastSentByMe && msg.seen && !isCurrentChatBlocked && (
                        <div className="mt-1 flex justify-end animate-in fade-in slide-in-from-top-1 duration-500">
                          <span className="text-[8px] font-black text-neutral-600 uppercase tracking-[0.2em] mr-2">Seen</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {typingText && !isCurrentChatBlocked && (
              <div className="flex items-center gap-2 animate-in fade-in duration-300 ml-10">
                 <div className="px-4 py-3 bg-[#1f1f1f] border border-white/5 rounded-3xl rounded-bl-sm flex items-center gap-2">
                    <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-typing-dot"></div><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-typing-dot [animation-delay:0.2s]"></div><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-typing-dot [animation-delay:0.4s]"></div></div>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 md:p-6 bg-neutral-950 border-t border-neutral-900 z-30">
            {isCurrentChatBlocked ? (
                <div className="flex items-center justify-center py-4 bg-neutral-900/50 border border-white/5 rounded-3xl">
                    <span className="text-neutral-500 text-sm font-bold uppercase tracking-widest">{blocks[selectedChat.id] ? 'You\'ve blocked this user' : 'You have been blocked'}</span>
                </div>
            ) : (
                <>
                {replyingTo && (
                  <div className="mb-4 p-4 bg-indigo-500/10 border-l-4 border-indigo-500 rounded-r-2xl flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200 max-w-5xl mx-auto">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">Replying to {replyingTo.senderName}</p>
                      <p className="text-sm text-neutral-400 truncate">{replyingTo.text}</p>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="p-2 text-neutral-500 hover:text-white transition-colors"><X size={18} /></button>
                  </div>
                )}
                
                <form onSubmit={sendMessage} className="flex gap-3 items-end max-w-5xl mx-auto">
                  <div className="flex-1 bg-white/[0.04] border border-white/5 rounded-[28px] p-1.5 flex items-end transition-all focus-within:bg-white/[0.06] focus-within:border-white/10">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploadingMedia} className="p-2.5 text-neutral-400 hover:text-indigo-400 transition-colors shrink-0 disabled:opacity-50">
                      {isUploadingMedia ? <Loader2 size={22} className="animate-spin" /> : <Plus size={22} />}
                    </button>
                    <textarea rows={1} value={inputText} onChange={handleInputChange} placeholder="Message…" className="flex-1 bg-transparent border-none text-white text-[15px] px-2 py-2.5 focus:outline-none resize-none custom-scrollbar placeholder:text-neutral-600 font-medium" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
                    <button type="button" className="p-2.5 text-neutral-400 hover:text-indigo-400 transition-colors shrink-0"><SmilePlus size={22} /></button>
                  </div>
                  <button type="submit" disabled={!inputText.trim() && !isUploadingMedia} className="bg-indigo-600 text-white p-3.5 rounded-full shadow-lg shadow-indigo-900/40 hover:bg-indigo-500 transition-all active:scale-90 disabled:opacity-30 disabled:scale-100 disabled:shadow-none shrink-0"><Send size={20} /></button>
                </form>
                </>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-neutral-950 text-center px-12 relative overflow-hidden">
           <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
           <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[150px] pointer-events-none"></div>
           <div className="w-24 h-24 bg-neutral-900 border border-white/5 rounded-[32px] flex items-center justify-center mb-8 shadow-2xl relative z-10 rotate-3"><MessageCircle size={40} className="text-indigo-500" /></div>
           <h2 className="text-3xl font-black text-white tracking-tight mb-3 relative z-10">Select a conversation</h2>
           <p className="text-neutral-500 max-w-xs leading-relaxed relative z-10 font-medium">Choose a chat from the sidebar or start a new group study session with your friends.</p>
        </div>
      )}

      {unsendConfirmId && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 px-6">
            <div className="bg-neutral-900 border border-white/10 p-6 rounded-[32px] shadow-2xl w-full max-w-[280px] text-center animate-in zoom-in-95 duration-200">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4"><Trash2 className="text-red-500" size={24} /></div>
                <h3 className="text-white font-bold text-lg mb-1 tracking-tight">Unsend message?</h3>
                <p className="text-neutral-500 text-sm mb-6 leading-relaxed">This will remove it for everyone in the chat.</p>
                <div className="flex flex-col gap-2"><button onClick={() => unsendMessage(unsendConfirmId)} className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold transition-all active:scale-95">Unsend</button><button onClick={() => setUnsendConfirmId(null)} className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-2xl font-bold transition-all">Cancel</button></div>
            </div>
        </div>
      )}
    </div>
  );
};
