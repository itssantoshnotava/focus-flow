import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { ref, onValue, push, update, get, set, remove, runTransaction, onChildAdded, onChildChanged, onChildRemoved } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    Send, MessageCircle, ArrowLeft, Users, Plus, CheckCircle2, 
    Circle, Settings, Camera, Trash2, UserPlus, 
    Save, Edit2, UserMinus, Loader2, X, Check, CheckCheck, Reply, CornerUpRight,
    SmilePlus, Paperclip, Play, Image as ImageIcon, Film
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
  const [groupMembersDetails, setGroupMembersDetails] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [friendPresence, setFriendPresence] = useState<{online: boolean, lastSeen: number} | null>(null);
  const [myFriends, setMyFriends] = useState<any[]>([]);
  const [allReactions, setAllReactions] = useState<Record<string, any>>({});
  const [typingText, setTypingText] = useState('');
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, number>>({});
  const [inputText, setInputText] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{ url: string, type: 'image' | 'video', duration?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Animation & Typing Refs
  const animatedMessagesRef = useRef<Set<string>>(new Set());
  const sessionStartTimeRef = useRef<number>(Date.now());
  const stopTypingTimeoutRef = useRef<number | null>(null);
  const lastTypingWriteRef = useRef<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const isAutoScrollEnabled = useRef(true);
  const isInitialLoadRef = useRef(false);

  const getDmConvoId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');
  const currentChatId = useMemo(() => {
    if (!user || !selectedChat) return null;
    return selectedChat.type === 'dm' ? getDmConvoId(user.uid, selectedChat.id) : selectedChat.id;
  }, [user, selectedChat]);

  const memberLookup = useMemo(() => {
      const map: Record<string, any> = {};
      groupMembersDetails.forEach(m => { map[m.uid] = m; });
      return map;
  }, [groupMembersDetails]);

  const latestMeIdx = useMemo(() => {
      for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].senderUid === user?.uid && !messages[i].system) return i;
      }
      return -1;
  }, [messages, user?.uid]);

  // Cleanup typing status on unmount or chat switch
  const clearMyTyping = (chatId: string | null) => {
    if (user && chatId) {
        remove(ref(database, `typing/${chatId}/${user.uid}`));
    }
  };

  useEffect(() => {
    if (!user) return;
    const inboxRef = ref(database, `userInboxes/${user.uid}`);
    get(inboxRef).then(() => setLoading(false));
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

  useEffect(() => {
    if (chats.length > 0) {
        const targetChatId = searchParams.get('chatId');
        if (targetChatId) {
            const targetChat = chats.find(c => c.id === targetChatId);
            if (targetChat && selectedChat?.id !== targetChatId) setSelectedChat(targetChat);
        }
    }
  }, [chats, searchParams, selectedChat?.id]);

  useEffect(() => {
      if (selectedChat?.type === 'group') {
          const gRef = ref(database, `groupChats/${selectedChat.id}`);
          const unsub = onValue(gRef, async (snap) => {
              if (snap.exists()) {
                  const data = snap.val();
                  setActiveGroupData(data);
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
          setGroupMembersDetails([]);
      }
  }, [selectedChat]);

  useEffect(() => {
      if (!user) return;
      if (viewMode === 'create_group') {
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
  }, [user, viewMode]);

  useEffect(() => {
      if (selectedChat) {
          isInitialLoadRef.current = true;
          setMessages([]);
          setInputText('');
          setReplyingTo(null);
          setActiveReactionPickerId(null);
          setPendingMedia(null);
          setTypingText('');
          setLastSeenMap({});
          isAutoScrollEnabled.current = true;
          
          animatedMessagesRef.current.clear();
          sessionStartTimeRef.current = Date.now();

          if (user) update(ref(database, `userInboxes/${user.uid}/${selectedChat.id}`), { unreadCount: 0 });
      }
      return () => {
          if (currentChatId) clearMyTyping(currentChatId);
      };
  }, [selectedChat?.id, user, currentChatId]);

  useEffect(() => {
      if (!user || !selectedChat || !currentChatId) {
          setFriendPresence(null);
          return;
      }
      let messagesPath = selectedChat.type === 'dm' ? `messages/${currentChatId}` : `groupMessages/${selectedChat.id}`;
      if (selectedChat.type === 'dm') onValue(ref(database, `presence/${selectedChat.id}`), (snap) => setFriendPresence(snap.exists() ? snap.val() : null));
      const unsubMsg = onValue(ref(database, messagesPath), (snapshot) => {
          if (snapshot.exists()) {
              const list = Object.entries(snapshot.val()).map(([key, val]: [string, any]) => ({ id: key, ...val })).sort((a, b) => a.timestamp - b.timestamp);
              setMessages(list);
              update(ref(database, `chatSeen/${currentChatId}/${user.uid}`), { timestamp: Date.now() });
          } else setMessages([]);
      });
      const unsubReactions = onValue(ref(database, `reactions/${currentChatId}`), (snap) => setAllReactions(snap.exists() ? snap.val() : {}));
      setTimeout(() => inputRef.current?.focus(), 100);
      
      // Improved Typing Listener
      const typingRef = ref(database, `typing/${currentChatId}`);
      const unsubTyping = onValue(typingRef, (snap) => {
          if (snap.exists()) {
              const now = Date.now();
              const typers = Object.entries(snap.val())
                  .filter(([uid, data]: [string, any]) => uid !== user.uid && (now - data.timestamp < 4000))
                  .map(([_, data]: [string, any]) => data.name);
              
              if (typers.length === 0) setTypingText('');
              else if (selectedChat.type === 'dm') setTypingText(`${selectedChat.name} is typing...`);
              else {
                  if (typers.length === 1) setTypingText(`${typers[0]} is typing...`);
                  else if (typers.length === 2) setTypingText(`${typers[0]} and ${typers[1]} are typing...`);
                  else setTypingText(`${typers.length} people are typing...`);
              }
          } else setTypingText('');
      });

      const seenRef = ref(database, `chatSeen/${currentChatId}`);
      update(ref(database, `chatSeen/${currentChatId}/${user.uid}`), { timestamp: Date.now() });
      const unsubSeen = onValue(seenRef, (snap) => {
          if (snap.exists()) {
              const data = snap.val();
              const map: Record<string, number> = {};
              Object.entries(data).forEach(([uid, val]: [string, any]) => { map[uid] = val.timestamp || val; });
              setLastSeenMap(map);
          }
      });
      return () => { unsubMsg(); unsubTyping(); unsubSeen(); unsubReactions(); };
  }, [user, selectedChat, currentChatId, groupMembersDetails]);

  useLayoutEffect(() => {
      if (!scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      if (isInitialLoadRef.current && messages.length > 0) {
          container.scrollTop = container.scrollHeight;
          isInitialLoadRef.current = false;
      } 
      else if (messages.length > 0 && isAutoScrollEnabled.current) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
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
    if (snap.exists()) await remove(reactionRef);
    else await set(reactionRef, true);
    setActiveReactionPickerId(null);
  };

  const handleUnsend = async (msgId: string) => {
    if (!user || !selectedChat || !currentChatId) return;
    const confirmUnsend = window.confirm("Unsend this message?");
    if (!confirmUnsend) return;
    const path = selectedChat.type === 'dm' ? `messages/${currentChatId}/${msgId}` : `groupMessages/${selectedChat.id}/${msgId}`;
    const updates = { isUnsent: true, text: null, media: null, reactions: null, replyTo: null };
    try {
        await update(ref(database, path), updates);
        await remove(ref(database, `reactions/${currentChatId}/${msgId}`));
    } catch (err) { console.error("Unsend failed", err); }
  };

  const handleMediaUpload = async (file: File) => {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { alert("Only images and videos are supported."); return; }
    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
          window.URL.revokeObjectURL(video.src);
          if (video.duration > 60) { alert("Videos must be less than 60 seconds."); return; }
          uploadFile(file, 'video', video.duration);
      };
      video.src = URL.createObjectURL(file);
    } else uploadFile(file, 'image');
  };

  const uploadFile = async (file: File, type: 'image' | 'video', duration?: number) => {
    setIsUploadingMedia(true);
    try {
      const url = await uploadImageToCloudinary(file);
      setPendingMedia({ url, type, duration });
    } catch (err) { console.error("Media upload failed", err); } finally { setIsUploadingMedia(false); }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) handleMediaUpload(file);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInputText(val);
      if (!user || !currentChatId) return;

      if (val.length > 0) {
          const now = Date.now();
          // Throttle writes to once every 1.5s
          if (now - lastTypingWriteRef.current > 1500) {
              set(ref(database, `typing/${currentChatId}/${user.uid}`), {
                  name: user.displayName || 'Someone',
                  timestamp: now
              });
              lastTypingWriteRef.current = now;
          }

          // Inactivity clear after 3s
          if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
          stopTypingTimeoutRef.current = window.setTimeout(() => {
              clearMyTyping(currentChatId);
          }, 3000);
      } else {
          clearMyTyping(currentChatId);
      }
  };

  const handleSend = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const text = inputText.trim();
      if (!user || !selectedChat || !currentChatId) return;
      if (!text && !pendingMedia) return;

      // Clear typing state immediately
      clearMyTyping(currentChatId);
      if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);

      isAutoScrollEnabled.current = true;
      const timestamp = Date.now();
      const msgData: any = { senderUid: user.uid, senderName: user.displayName || 'Unknown', timestamp, type: pendingMedia ? pendingMedia.type : 'text', text: text || null };
      if (pendingMedia) msgData.media = { url: pendingMedia.url, duration: pendingMedia.duration || null };
      if (replyingTo) msgData.replyTo = { messageId: replyingTo.id, senderId: replyingTo.senderUid, senderName: replyingTo.senderName, previewText: replyingTo.media ? (replyingTo.type === 'image' ? 'Image' : 'Video') : replyingTo.text };

      try {
          if (selectedChat.type === 'dm') {
              const friendUid = selectedChat.id;
              const messagesRef = ref(database, `messages/${currentChatId}`);
              const newMessageRef = push(messagesRef);
              await set(newMessageRef, msgData);
              await update(ref(database, `conversations/${currentChatId}`), { members: { [user.uid]: true, [friendUid]: true }, lastMessage: { ...msgData, seen: false } });
              await update(ref(database, `userInboxes/${user.uid}/${friendUid}`), { type: 'dm', name: selectedChat.name, photoURL: selectedChat.photoURL || null, lastMessage: msgData, lastMessageAt: timestamp });
              const friendInboxRef = ref(database, `userInboxes/${friendUid}/${user.uid}`);
              await runTransaction(friendInboxRef, (currentData) => {
                  if (currentData === null) return { type: 'dm', name: user.displayName, photoURL: user.photoURL, lastMessage: msgData, lastMessageAt: timestamp, unreadCount: 1 };
                  return { ...currentData, name: user.displayName, photoURL: user.photoURL, lastMessage: msgData, lastMessageAt: timestamp, unreadCount: (currentData.unreadCount || 0) + 1 };
              });
          } else {
              const groupId = selectedChat.id;
              const messagesRef = ref(database, `groupMessages/${groupId}`);
              const newMessageRef = push(messagesRef);
              await set(newMessageRef, msgData);
              await update(ref(database, `groupChats/${groupId}`), { lastMessage: msgData });
              let membersToUpdate: string[] = activeGroupData?.members ? Object.keys(activeGroupData.members) : [];
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
          setInputText(''); setReplyingTo(null); setPendingMedia(null);
      } catch (error) { console.error("Failed to send message:", error); }
  };

  const handleCreateGroup = async () => {
      if (!user || !newGroupName.trim() || selectedGroupMembers.size === 0) return;
      const newGroupRef = push(ref(database, 'groupChats'));
      const groupId = newGroupRef.key;
      if (groupId) {
          const membersObj: any = { [user.uid]: true };
          selectedGroupMembers.forEach(uid => membersObj[uid] = true);
          const groupData = { name: newGroupName.trim(), createdBy: user.uid, hostUid: user.uid, createdAt: Date.now(), members: membersObj, admins: { [user.uid]: true } };
          await set(newGroupRef, groupData);
          const updates: any = {};
          [user.uid, ...Array.from(selectedGroupMembers)].forEach(uid => { updates[`userInboxes/${uid}/${groupId}`] = { type: 'group', name: groupData.name, lastMessage: null, lastMessageAt: Date.now(), unreadCount: 0 }; });
          await update(ref(database), updates);
          setViewMode('list'); setNewGroupName(''); setSelectedGroupMembers(new Set());
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const goToProfile = (e: React.MouseEvent, targetUid: string) => { e.stopPropagation(); navigate(`/profile/${targetUid}`); };

  const renderReadReceipts = (msg: any) => {
      if (msg.senderUid !== user?.uid || msg.isUnsent) return null;
      
      const seenBy: string[] = [];
      if (selectedChat?.type === 'dm') {
          if (lastSeenMap[selectedChat.id] >= msg.timestamp) seenBy.push(selectedChat.id);
      } else if (activeGroupData?.members) {
          Object.keys(activeGroupData.members).forEach(uid => {
              if (uid !== user?.uid && lastSeenMap[uid] >= msg.timestamp) seenBy.push(uid);
          });
      }

      if (seenBy.length === 0) return null;

      const maxAvatars = 3;
      const showCount = Math.min(seenBy.length, maxAvatars);
      const remaining = seenBy.length - showCount;

      return (
          <div className="flex -space-x-1.5 mt-0.5 justify-end animate-in fade-in duration-300">
              {seenBy.slice(0, showCount).map(uid => {
                  const photo = selectedChat?.type === 'dm' ? selectedChat.photoURL : memberLookup[uid]?.photoURL;
                  const initial = (selectedChat?.type === 'dm' ? selectedChat.name : memberLookup[uid]?.name || '?').charAt(0);
                  return photo ? (
                      <img key={uid} src={photo} className="w-3.5 h-3.5 rounded-full border border-neutral-950 object-cover" alt="seen" />
                  ) : (
                      <div key={uid} className="w-3.5 h-3.5 rounded-full border border-neutral-950 bg-indigo-600 flex items-center justify-center text-[6px] font-bold text-white">{initial}</div>
                  );
              })}
              {remaining > 0 && (
                  <div className="w-3.5 h-3.5 rounded-full border border-neutral-950 bg-neutral-800 flex items-center justify-center text-[6px] font-bold text-neutral-400">+{remaining}</div>
              )}
          </div>
      );
  };

  return (
    <div className="flex h-full w-full bg-neutral-950">
        {activeReactionPickerId && ( <div className="fixed inset-0 z-[45] bg-transparent" onClick={() => setActiveReactionPickerId(null)} /> )}
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
                                <button key={chat.id} onClick={() => setSelectedChat(chat)} className={`w-full py-4 px-5 flex items-center gap-4 hover:bg-neutral-900/30 transition-all border-b border-neutral-900/50 text-left relative group ${selectedChat?.id === chat.id ? 'bg-neutral-900/50' : ''}`}>
                                    <div className="relative shrink-0" onClick={(e) => chat.type === 'dm' && goToProfile(e, chat.id)}>
                                        {chat.type === 'group' ? ( displayPhoto ? <img src={displayPhoto} className="w-14 h-14 rounded-2xl bg-neutral-800 object-cover shadow-sm" /> : <div className="w-14 h-14 rounded-2xl bg-neutral-800 flex items-center justify-center shadow-sm"><Users size={24} className="text-neutral-500" /></div> ) : ( displayPhoto ? <img src={displayPhoto} className="w-14 h-14 rounded-full bg-neutral-800 object-cover shadow-sm hover:opacity-80 transition-opacity" /> : <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold text-white shadow-sm hover:opacity-80 transition-opacity">{displayName.charAt(0)}</div>)}
                                        {isUnread && <span className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-500 border-[3px] border-neutral-950 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm">{chat.unreadCount}</span>}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                                        <div className="flex justify-between items-baseline">
                                            <span className={`font-semibold text-base truncate ${isUnread ? 'text-white' : 'text-neutral-300 group-hover:text-white transition-colors'}`}>{displayName}</span>
                                            <span className={`text-xs ${isUnread ? 'text-indigo-400 font-medium' : 'text-neutral-600'}`}>{chat.timestamp ? new Date(chat.timestamp).toLocaleDateString([], {month:'short', day:'numeric'}) : ''}</span>
                                        </div>
                                        <p className={`text-sm truncate leading-relaxed ${isUnread ? 'text-neutral-200 font-medium' : 'text-neutral-500 group-hover:text-neutral-400 transition-colors'}`}>{chat.lastMessage?.senderUid === user?.uid && <span className="text-neutral-600 mr-1">You:</span>}{chat.lastMessage?.isUnsent ? 'Message unsent' : (chat.lastMessage?.type === 'image' ? 'Image' : chat.lastMessage?.type === 'video' ? 'Video' : (chat.lastMessage?.text || 'No messages'))}</p>
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

        <div className={`flex-1 flex flex-col bg-neutral-950 min-w-0 ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
            {selectedChat ? (
                <>
                    <div className="p-3 border-b border-neutral-900/50 bg-[rgba(20,20,20,0.55)] backdrop-blur-[12px] flex items-center justify-between h-16 shrink-0 z-10">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 text-neutral-400 hover:text-white"><ArrowLeft size={20} /></button>
                            <div className="flex items-center gap-3">
                                <div className={`relative ${selectedChat.type === 'dm' ? 'cursor-pointer hover:opacity-80' : ''}`} onClick={(e) => selectedChat.type === 'dm' && goToProfile(e, selectedChat.id)}>
                                    {selectedChat.type === 'group' ? ( (activeGroupData?.photoURL || selectedChat.photoURL) ? <img src={activeGroupData?.photoURL || selectedChat.photoURL} className="w-9 h-9 rounded-2xl bg-neutral-800 object-cover" /> : <div className="w-9 h-9 rounded-2xl bg-neutral-800 flex items-center justify-center"><Users size={16} className="text-neutral-500" /></div> ) : selectedChat.photoURL ? <img src={selectedChat.photoURL} className="w-9 h-9 rounded-full bg-neutral-800" /> : <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">{selectedChat.name.charAt(0)}</div>}
                                    {friendPresence && <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-950 ${friendPresence.online ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div>}
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-neutral-200 text-sm cursor-pointer hover:text-white transition-colors" onClick={() => navigate(selectedChat.type === 'group' ? `/group/${selectedChat.id}/settings` : `/profile/${selectedChat.id}`)}>{ (activeGroupData && selectedChat.type === 'group') ? activeGroupData.name : selectedChat.name }</span>
                                    {selectedChat.type === 'group' ? ( <span className="text-[10px] text-neutral-500">{Object.keys(activeGroupData?.members || {}).length} members</span> ) : ( friendPresence && <span className="text-[10px] text-neutral-500">{friendPresence.online ? 'Online' : 'Offline'}</span> )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1" ref={scrollContainerRef} onScroll={handleScroll}>
                        {messages.map((msg, idx) => {
                            if (msg.system || msg.type === 'system') {
                                return (
                                    <div key={msg.id} className="w-full flex justify-center my-4 px-4 animate-in fade-in duration-500">
                                        <div className="bg-neutral-900/30 border border-neutral-800/50 rounded-full px-4 py-1.5 text-[11px] text-neutral-500 font-medium tracking-wide shadow-sm">{msg.text}</div>
                                    </div>
                                );
                            }
                            const isMe = msg.senderUid === user?.uid;
                            const prevMsg = messages[idx - 1];
                            const isChain = prevMsg && prevMsg.senderUid === msg.senderUid && (msg.timestamp - prevMsg.timestamp < 60000);
                            const isLatestMe = idx === latestMeIdx;
                            const isHighlighted = highlightedMessageId === msg.id;
                            const reactions = allReactions[msg.id];
                            const senderPhoto = selectedChat.type === 'group' && !isMe ? memberLookup[msg.senderUid]?.photoURL : (selectedChat.type === 'dm' && !isMe ? selectedChat.photoURL : null);

                            const isNewlyArrived = msg.timestamp > sessionStartTimeRef.current && !animatedMessagesRef.current.has(msg.id);
                            if (isNewlyArrived) {
                                animatedMessagesRef.current.add(msg.id);
                            }

                            return (
                                <div 
                                    key={msg.id} 
                                    id={`msg-${msg.id}`} 
                                    className={`flex flex-col group/msg transition-all duration-500 ${isMe ? 'items-end' : 'items-start'} ${isChain ? 'mt-0.5' : 'mt-4'} ${isHighlighted ? 'bg-indigo-500/10 rounded-xl py-1' : ''} ${isNewlyArrived ? (isMe ? 'animate-msg-sent' : 'animate-msg-received') : ''}`}
                                >
                                    {!isMe && !isChain && selectedChat.type === 'group' && ( <span className="text-[10px] text-neutral-500 ml-10 mb-1 cursor-pointer hover:text-neutral-300 transition-colors" onClick={() => navigate(`/profile/${msg.senderUid}`)}>{msg.senderName}</span> )}
                                    <div className={`flex gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                        {!isMe && (
                                            <div className="w-8 flex-shrink-0 flex items-end">
                                                {!isChain ? ( senderPhoto ? ( <img src={senderPhoto} className="w-8 h-8 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity bg-neutral-800 border border-neutral-800/50 shadow-sm" onClick={() => navigate(`/profile/${msg.senderUid}`)} alt={msg.senderName} /> ) : ( selectedChat.type === 'group' ? ( <div className="w-8 h-8 rounded-full bg-indigo-900/30 flex items-center justify-center text-[10px] font-bold text-indigo-300 border border-indigo-500/20 cursor-pointer hover:opacity-80 transition-opacity shadow-sm" onClick={() => navigate(`/profile/${msg.senderUid}`)}>{msg.senderName?.charAt(0)}</div> ) : ( <div className="w-8 h-8 rounded-full bg-indigo-600 text-[10px] flex items-center justify-center font-bold text-white cursor-pointer hover:opacity-80 transition-opacity shadow-sm" onClick={() => navigate(`/profile/${msg.senderUid}`)}>{selectedChat.name.charAt(0)}</div> ) ) ) : <div className="w-8" />}
                                            </div>
                                        )}
                                        <div className="flex flex-col relative group/bubble">
                                            {activeReactionPickerId === msg.id && (
                                                <div className={`absolute bottom-[calc(100%+8px)] z-[50] flex gap-1 p-1.5 bg-neutral-900/95 border border-neutral-700/50 rounded-2xl shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-200 ${isMe ? 'right-0' : 'left-0'} max-sm:left-1/2 max-sm:-translate-x-1/2`}>
                                                    {REACTION_EMOJIS.map(emoji => (
                                                        <button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); }} className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 active:scale-90 rounded-xl transition-all">{emoji}</button>
                                                    ))}
                                                </div>
                                            )}
                                            {msg.replyTo && !msg.isUnsent && (
                                                <div onClick={() => scrollToMessage(msg.replyTo.messageId)} className={`mb-1 p-2 rounded-xl text-[11px] cursor-pointer border backdrop-blur-sm truncate max-w-[200px] ${isMe ? 'bg-white/10 border-white/10 text-indigo-100 self-end' : 'bg-neutral-900/50 border-neutral-700/50 text-neutral-400 self-start'}`}><div className="font-bold mb-0.5 flex items-center gap-1"><Reply size={10} /> {msg.replyTo.senderName}</div><div className="truncate opacity-70 italic">{msg.replyTo.previewText}</div></div>
                                            )}
                                            <div className={`relative flex flex-col rounded-2xl shadow-sm transition-all overflow-hidden ${isMe ? `bg-indigo-600 text-white ${isChain ? 'rounded-tr-md' : 'rounded-tr-sm'}` : `bg-neutral-800/90 text-neutral-100 border border-neutral-700/30 ${isChain ? 'rounded-tl-md' : 'rounded-tl-sm'}`}`}>
                                                {msg.isUnsent ? ( <div className={`px-3.5 py-2 text-xs italic ${isMe ? 'text-indigo-200/50' : 'text-neutral-500'}`}>This message was unsent</div> ) : (
                                                    <>
                                                        {msg.type === 'image' && msg.media && ( <div className="cursor-pointer group/img_wrap relative max-w-sm" onClick={() => window.open(msg.media.url, '_blank')}><img src={msg.media.url} className="w-full h-auto object-cover" alt="attachment" /></div> )}
                                                        {msg.type === 'video' && msg.media && ( <div className="relative max-w-sm group/vid_wrap"><video src={msg.media.url} className="w-full h-auto max-h-[300px] object-cover" muted playsInline loop onClick={(e) => e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause()} /><div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover/vid_wrap:opacity-100 transition-opacity"><div className="p-2 bg-black/40 rounded-full text-white backdrop-blur-sm"><Play size={20} fill="white" /></div></div></div> )}
                                                        <div className="px-3.5 py-1.5 text-sm break-words whitespace-pre-wrap">
                                                            {msg.text && <div className="pr-1 inline">{msg.text}</div>}
                                                            <div className={`inline-flex flex-col items-end ml-2 -mr-1 align-bottom select-none`}>
                                                                <span className={`text-[9px] font-medium tracking-tight leading-none ${isMe ? 'text-indigo-200/70' : 'text-neutral-400'}`}>{formatTime(msg.timestamp)}</span>
                                                                {isLatestMe && renderReadReceipts(msg)}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            {reactions && !msg.isUnsent && (
                                                <div className={`flex flex-wrap gap-1 mt-1 z-10 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                    {Object.entries(reactions).map(([emoji, users]: [string, any]) => {
                                                        const count = Object.keys(users).length;
                                                        const hasReacted = users[user?.uid || ''];
                                                        return ( <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} className={`animate-reaction-bounce flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border backdrop-blur-sm transition-all active:scale-95 ${hasReacted ? 'bg-indigo-500/25 border-indigo-500/40 text-indigo-200' : 'bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:bg-neutral-800'}`}><span>{emoji}</span><span className="font-bold tabular-nums">{count}</span></button> );
                                                    })}
                                                </div>
                                            )}
                                            {!msg.isUnsent && (
                                                <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover/bubble:opacity-100 transition-all z-20 ${isMe ? '-left-[110px]' : '-right-24'}`}>
                                                    {isMe && ( <button onClick={() => handleUnsend(msg.id)} className="p-2.5 rounded-full bg-neutral-900/90 text-red-500/70 hover:text-red-400 border border-neutral-800/80 shadow-lg backdrop-blur-sm active:scale-90 transition-all" title="Unsend"><Trash2 size={15} /></button> )}
                                                    <button onClick={() => { setReplyingTo(msg); inputRef.current?.focus(); }} className="p-2.5 rounded-full bg-neutral-900/90 text-neutral-400 hover:text-white border border-neutral-800/80 shadow-lg backdrop-blur-sm active:scale-90 transition-all" title="Reply"><Reply size={15} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setActiveReactionPickerId(activeReactionPickerId === msg.id ? null : msg.id); }} className={`p-2.5 rounded-full bg-neutral-900/90 border border-neutral-800/80 shadow-lg backdrop-blur-sm active:scale-90 transition-all ${activeReactionPickerId === msg.id ? 'text-indigo-400 border-indigo-500/50' : 'text-neutral-400 hover:text-white'}`} title="React"><SmilePlus size={15} /></button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                    
                    {typingText && ( 
                        <div className="px-6 py-2 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
                            <span className="text-[11px] text-neutral-500 font-medium italic">{typingText}</span>
                            <div className="flex gap-1">
                                <div className="w-1 h-1 bg-indigo-500 rounded-full animate-typing-dot typing-dot"></div>
                                <div className="w-1 h-1 bg-indigo-500 rounded-full animate-typing-dot typing-dot"></div>
                                <div className="w-1 h-1 bg-indigo-500 rounded-full animate-typing-dot typing-dot"></div>
                            </div>
                        </div>
                    )}
                    
                    {(pendingMedia || replyingTo) && (
                        <div className="mx-3 mt-1 bg-neutral-900 border border-neutral-800 rounded-t-xl border-b-0 overflow-hidden flex flex-col animate-in slide-in-from-bottom-2">
                            {replyingTo && (
                                <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
                                    <div className="flex-1 min-w-0 flex items-center gap-3">
                                        <div className="p-1.5 bg-indigo-500/10 rounded-lg"><CornerUpRight size={14} className="text-indigo-400" /></div>
                                        <div className="flex flex-col min-w-0"><span className="text-[10px] font-bold text-indigo-400 truncate uppercase tracking-tight">Replying to {replyingTo.senderName}</span><span className="text-xs text-neutral-500 truncate italic">{replyingTo.media ? (replyingTo.type === 'image' ? 'Image' : 'Video') : replyingTo.text}</span></div>
                                    </div>
                                    <button onClick={() => setReplyingTo(null)} className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg"><X size={14} /></button>
                                </div>
                            )}
                            {pendingMedia && (
                                <div className="p-3 flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-lg bg-neutral-950 border border-neutral-800 relative overflow-hidden flex items-center justify-center shrink-0">
                                        {pendingMedia.type === 'image' ? <img src={pendingMedia.url} className="w-full h-full object-cover" alt="pending" /> : <Film size={24} className="text-neutral-500" />}
                                        {pendingMedia.type === 'video' && <div className="absolute bottom-1 right-1 px-1 bg-black/60 rounded text-[9px] text-white">Video</div>}
                                    </div>
                                    <div className="flex-1 min-w-0"><div className="text-[10px] font-bold text-indigo-400 uppercase tracking-tighter mb-0.5">Media Attachment</div><div className="text-xs text-neutral-500 truncate">Ready to send</div></div>
                                    <button onClick={() => setPendingMedia(null)} className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg"><Trash2 size={16} /></button>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="p-3 bg-neutral-950 border-t border-neutral-900">
                        <form onSubmit={handleSend} className={`flex gap-2 items-end bg-neutral-900 border border-neutral-800 px-2 py-2 focus-within:border-indigo-500/50 transition-colors ${pendingMedia || replyingTo ? 'rounded-b-xl' : 'rounded-xl'}`}>
                            <input type="file" ref={mediaInputRef} className="hidden" accept="image/*,video/*" onChange={(e) => e.target.files && handleMediaUpload(e.target.files[0])} />
                            <button type="button" onClick={() => mediaInputRef.current?.click()} className="p-2.5 text-neutral-500 hover:text-white transition-colors mb-0.5 rounded-lg active:scale-95" disabled={isUploadingMedia}>{isUploadingMedia ? <Loader2 size={18} className="animate-spin text-indigo-500" /> : <Paperclip size={18} />}</button>
                            <textarea ref={inputRef} value={inputText} onChange={handleInputChange} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder={`Message ${selectedChat.name}...`} rows={1} className="flex-1 bg-transparent text-white px-2 py-2 focus:outline-none text-sm resize-none custom-scrollbar max-h-32 placeholder:text-neutral-600" style={{ minHeight: '40px' }} />
                            <button type="submit" disabled={(!inputText.trim() && !pendingMedia) || isUploadingMedia} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-neutral-800 text-white p-2.5 rounded-lg transition-colors mb-0.5"><Send size={16} /></button>
                        </form>
                    </div>
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