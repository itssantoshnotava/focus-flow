import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, update, get, set, remove, query, limitToLast, onChildAdded, onChildChanged, onChildRemoved } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    Send, MessageCircle, ArrowLeft, Users, Plus, CheckCircle2, 
    Circle, Settings, Camera, Trash2, UserPlus, 
    Save, Edit2, UserMinus, Loader2, X, Check, CheckCheck, Reply, CornerUpRight,
    SmilePlus, Paperclip, Play, Image as ImageIcon, Film, MoreVertical, Smile, AlertCircle,
    VolumeX, Archive, Ban, Lock, Trash, UserCircle2, ShieldCheck, Crown
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
  members?: Record<string, any>;
}

const REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '😭', '😮', '🎉', '👀'];
const COMMON_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '🥵', '🥶', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄', '💋', '🩸', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦', '💨', '🕳', '💣', '💬', '👁️‍🗨️', '🗨', '🗯', '💭', '💤'
];

const draftsStore: Record<string, string> = {};

export const Inbox: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlChatId = searchParams.get('chatId');
  
  const [viewMode, setViewMode] = useState<'list' | 'create_group'>('list');
  const [showArchived, setShowArchived] = useState(false);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(urlChatId);
  const [tempChat, setTempChat] = useState<ChatItem | null>(null);

  const selectedChat = useMemo(() => {
    if (!activeChatId) return null;
    const fromList = chats.find(c => c.id === activeChatId);
    if (fromList) return fromList;
    if (tempChat && tempChat.id === activeChatId) return tempChat;
    return null;
  }, [chats, activeChatId, tempChat]);

  const [userProfiles, setUserProfiles] = useState<Record<string, { name: string, photoURL?: string }>>({});
  const [listPresences, setListPresences] = useState<Record<string, { online: boolean, lastSeen: number }>>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [friendPresence, setFriendPresence] = useState<{online: boolean, lastSeen: number, activeChatId?: string} | null>(null);
  const [inputText, setInputText] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [myFriends, setMyFriends] = useState<any[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [reactionPickerPos, setReactionPickerPos] = useState<{ x: number, y: number, isMe: boolean } | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [unsendConfirmId, setUnsendConfirmId] = useState<string | null>(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [listMenuId, setListMenuId] = useState<string | null>(null);
  const [listMenuPos, setListMenuPos] = useState<{ x: number, y: number } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Group Admin States
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [groupAdmins, setGroupAdmins] = useState<Record<string, boolean>>({});

  // Block & Social States
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [followers, setFollowers] = useState<Record<string, boolean>>({});
  const [iBlockedThem, setIBlockedThem] = useState<Record<string, boolean>>({}); 
  const [theyBlockedMe, setTheyBlockedMe] = useState<Record<string, boolean>>({}); 
  const [archivedChats, setArchivedChats] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node) &&
          emojiButtonRef.current && !emojiButtonRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  // Handle Input Focus for Reply
  useEffect(() => {
    if (replyingTo && messageInputRef.current) {
        messageInputRef.current.focus();
    }
  }, [replyingTo]);

  // Robust Mutual Follower (Friend) detection
  useEffect(() => {
    if (!user) return;
    
    // Listen to following and followers simultaneously to compute mutuals
    const followingRef = ref(database, `following/${user.uid}`);
    const followersRef = ref(database, `followers/${user.uid}`);

    const syncFriends = async () => {
        const [followingSnap, followersSnap] = await Promise.all([get(followingRef), get(followersRef)]);
        const followingIds = followingSnap.exists() ? Object.keys(followingSnap.val()) : [];
        const followerIds = followersSnap.exists() ? Object.keys(followersSnap.val()) : [];
        
        // Intersection = Friends
        const mutualIds = followingIds.filter(id => followerIds.includes(id));
        
        if (mutualIds.length > 0) {
            const promises = mutualIds.map(uid => get(ref(database, `users/${uid}`)).then(s => ({ uid, ...s.val() })));
            const details = await Promise.all(promises);
            setMyFriends(details.filter(d => d.name));
        } else {
            setMyFriends([]);
        }
    };

    const unsubFollowing = onValue(followingRef, syncFriends);
    const unsubFollowers = onValue(followersRef, syncFriends);
    
    return () => {
        unsubFollowing();
        unsubFollowers();
    };
  }, [user]);

  // Sync basic social state
  useEffect(() => {
    if (!user) return;
    onValue(ref(database, `following/${user.uid}`), (snap) => setFollowing(snap.val() || {}));
    onValue(ref(database, `followers/${user.uid}`), (snap) => setFollowers(snap.val() || {}));
    onValue(ref(database, `blocks/${user.uid}`), (snap) => setIBlockedThem(snap.val() || {}));
    onValue(ref(database, `archivedChats/${user.uid}`), (snap) => setArchivedChats(snap.val() || {}));
  }, [user]);

  // Inbox sync
  useEffect(() => {
    if (!user) return;
    const inboxRef = ref(database, `userInboxes/${user.uid}`);
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
            unreadCount: val.unreadCount || 0,
            members: val.members
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
    onChildAdded(inboxRef, handleInboxUpdate);
    onChildChanged(inboxRef, handleInboxUpdate);
    onChildRemoved(inboxRef, (snapshot) => {
        setChats(prev => prev.filter(c => c.id !== snapshot.key));
    });
    get(inboxRef).then(() => setLoading(false));
  }, [user]);

  // Group Admin States sync
  useEffect(() => {
    if (!activeChatId || !selectedChat || selectedChat.type !== 'group' || !user) {
        setIsAdmin(false); setIsHost(false); setGroupAdmins({});
        return;
    }
    const unsub = onValue(ref(database, `groupChats/${activeChatId}`), (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            const host = data.hostUid === user.uid;
            setIsHost(host);
            setIsAdmin(data.admins?.[user.uid] || host);
            setGroupAdmins(data.admins || {});
        }
    });
    return () => unsub();
  }, [activeChatId, selectedChat, user]);

  const currentChatId = useMemo(() => {
    if (!user || !activeChatId || !selectedChat) return null;
    return selectedChat.type === 'dm' ? [user.uid, activeChatId].sort().join('_') : activeChatId;
  }, [user, activeChatId, selectedChat]);

  // Messages sync
  useEffect(() => {
    if (!user || !activeChatId || !currentChatId) return;
    const messagesPath = selectedChat?.type === 'dm' ? `messages/${currentChatId}` : `groupMessages/${activeChatId}`;
    const unsubMessages = onValue(ref(database, messagesPath), (snapshot) => {
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([key, val]: [string, any]) => ({ id: key, ...val })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(list);
        list.forEach(m => { if (m.senderUid !== user.uid && !m.seen) update(ref(database, `${messagesPath}/${m.id}`), { seen: true }); });
        update(ref(database, `userInboxes/${user.uid}/${activeChatId}`), { unreadCount: 0 });
      } else { setMessages([]); }
    });
    return () => unsubMessages();
  }, [activeChatId, currentChatId, user, selectedChat?.type]);

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
    // Focus back to input and ensure cursor is at the end
    setTimeout(() => {
        if (messageInputRef.current) {
            messageInputRef.current.focus();
            const len = messageInputRef.current.value.length;
            messageInputRef.current.setSelectionRange(len, len);
        }
    }, 0);
  };

  const handleSelectChat = (chat: ChatItem) => {
      setActiveChatId(chat.id);
      navigate(`/inbox?chatId=${chat.id}`, { replace: true });
  };

  const handleCreateGroup = async () => {
      if (!user || !newGroupName.trim() || selectedMembers.size === 0 || creatingGroup) return;
      setCreatingGroup(true);
      try {
          const groupRef = push(ref(database, 'groupChats'));
          const groupId = groupRef.key;
          if (!groupId) return;
          const membersObj: any = { [user.uid]: true };
          selectedMembers.forEach(mid => membersObj[mid] = true);
          const groupData = { id: groupId, name: newGroupName.trim(), hostUid: user.uid, members: membersObj, admins: { [user.uid]: true }, createdAt: Date.now(), type: 'group' };
          const updates: any = {};
          updates[`groupChats/${groupId}`] = groupData;
          updates[`userInboxes/${user.uid}/${groupId}`] = { type: 'group', name: groupData.name, lastMessageAt: Date.now(), unreadCount: 0 };
          selectedMembers.forEach(mid => {
              updates[`userInboxes/${mid}/${groupId}`] = { type: 'group', name: groupData.name, lastMessageAt: Date.now(), unreadCount: 1 };
          });
          await update(ref(database), updates);
          setNewGroupName(''); setSelectedMembers(new Set()); setViewMode('list');
          handleSelectChat({ id: groupId, type: 'group', name: groupData.name, timestamp: Date.now() });
      } catch (err) { console.error(err); } finally { setCreatingGroup(false); }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !user || !activeChatId || !selectedChat || !currentChatId) return;
    const msgText = inputText.trim();
    const timestamp = Date.now();
    setInputText('');
    const msgData: any = { 
        text: msgText, 
        senderUid: user.uid, 
        senderName: user.displayName, 
        timestamp, 
        seen: false, 
        replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderName: replyingTo.senderName } : null 
    };
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    await push(ref(database, `${basePath}/${currentChatId}`), msgData);
    setReplyingTo(null);
    setShowEmojiPicker(false);
  };

  const handleUnsend = async (msgId: string) => {
    if (!currentChatId || !activeChatId || !selectedChat || !user) return;
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    const msgRef = ref(database, `${basePath}/${currentChatId}/${msgId}`);
    const snap = await get(msgRef);
    if (!snap.exists()) return;
    const data = snap.val();
    if (data.senderUid === user.uid || isAdmin || isHost) {
        await remove(msgRef);
        setUnsendConfirmId(null);
    }
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    if (!currentChatId || !activeChatId || !user) return;
    const basePath = selectedChat?.type === 'dm' ? 'messages' : 'groupMessages';
    const rRef = ref(database, `${basePath}/${currentChatId}/${msgId}/reactions/${user.uid}`);
    const snap = await get(rRef);
    if (snap.exists() && snap.val() === emoji) await remove(rRef);
    else await set(rRef, emoji);
    setActiveReactionPickerId(null); setReactionPickerPos(null);
  };

  if (loading && !chats.length) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  const filteredChats = chats.filter(c => {
    const isArchived = archivedChats[c.id];
    if (showArchived) return isArchived;
    if (isArchived) return false;
    if (c.type === 'group') return true;
    return following[c.id] && followers[c.id];
  });

  return (
    <div className="flex h-full bg-neutral-950 overflow-hidden font-sans">
      <div className={`${activeChatId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-neutral-900 bg-neutral-950 shrink-0`}>
        <div className="p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/50 backdrop-blur-xl sticky top-0 z-20">
          <h1 className="text-2xl font-black text-white tracking-tight">{showArchived ? 'Archive' : 'Messages'}</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowArchived(!showArchived)} className={`p-2 rounded-xl transition-all ${showArchived ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}><Archive size={20} /></button>
            <button onClick={() => setViewMode(viewMode === 'list' ? 'create_group' : 'list')} className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all">{viewMode === 'list' ? <Plus size={20} /> : <X size={20} />}</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {viewMode === 'list' ? (
            filteredChats.length > 0 ? (
                filteredChats.map(chat => {
                const isSelected = activeChatId === chat.id;
                return (
                  <button key={chat.id} onClick={() => handleSelectChat(chat)} className={`w-full flex items-center gap-4 p-4 rounded-[24px] transition-all ${isSelected ? 'bg-white/10 backdrop-blur-xl border border-white/10' : 'hover:bg-white/[0.04]'}`}>
                    <div className="relative shrink-0">
                      {chat.photoURL ? <img src={chat.photoURL} className="w-14 h-14 rounded-full object-cover" /> : <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center text-xl font-bold text-neutral-500">{chat.name.charAt(0)}</div>}
                      {chat.unreadCount ? <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full border-2 border-neutral-950 flex items-center justify-center text-[10px] font-black text-white">{chat.unreadCount}</div> : null}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                            <span className="font-bold text-white truncate">{chat.name}</span>
                            {chat.type === 'group' && <Users size={12} className="text-neutral-600" />}
                        </div>
                        <p className="text-sm text-neutral-500 truncate">{chat.lastMessage?.text || 'No messages'}</p>
                    </div>
                  </button>
                );
              })
            ) : ( <div className="text-center py-20 text-neutral-600 italic">No chats found.</div> )
          ) : (
            <div className="space-y-6 p-2 flex flex-col h-full overflow-hidden">
                <div className="space-y-2"><label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Group Name</label><input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Study Squad..." className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3 text-white focus:outline-none focus:border-indigo-500 font-bold" /></div>
                <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                    <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Select Members ({selectedMembers.size})</label>
                    {myFriends.length > 0 ? (
                        myFriends.map(f => (
                            <button key={f.uid} onClick={() => { const n = new Set(selectedMembers); n.has(f.uid) ? n.delete(f.uid) : n.add(f.uid); setSelectedMembers(n); }} className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${selectedMembers.has(f.uid) ? 'bg-indigo-600/10 border-indigo-500/50' : 'border-transparent hover:bg-white/5'}`}>
                                <div className="relative">
                                    {f.photoURL ? <img src={f.photoURL} className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{f.name.charAt(0)}</div>}
                                    {selectedMembers.has(f.uid) && <div className="absolute -top-1 -right-1 bg-indigo-500 rounded-full p-0.5"><Check size={10} className="text-white" /></div>}
                                </div>
                                <span className={`text-sm font-bold truncate ${selectedMembers.has(f.uid) ? 'text-white' : 'text-neutral-400'}`}>{f.name}</span>
                            </button>
                        ))
                    ) : ( <div className="p-8 text-center text-neutral-600 text-xs italic">Only mutual followers can be added to groups. Find friends to get started!</div> )}
                </div>
                <div className="space-y-2 pt-4"><button onClick={handleCreateGroup} disabled={!newGroupName.trim() || selectedMembers.size === 0 || creatingGroup} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black transition-all hover:bg-indigo-500 disabled:opacity-50">{creatingGroup ? <Loader2 className="animate-spin mx-auto" /> : 'Create Group'}</button></div>
            </div>
          )}
        </div>
      </div>

      {activeChatId && selectedChat ? (
        <div className="flex-1 flex flex-col bg-neutral-950 relative overflow-hidden">
          <div className="p-4 md:p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/80 backdrop-blur-2xl z-20">
            <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setActiveChatId(null)} className="md:hidden p-2 text-neutral-500 hover:text-white"><ArrowLeft size={24} /></button>
              <div className="cursor-pointer" onClick={() => navigate(selectedChat.type === 'dm' ? `/profile/${activeChatId}` : `/group/${activeChatId}/settings`)}>
                  {selectedChat.photoURL ? <img src={selectedChat.photoURL} className="w-11 h-11 rounded-full object-cover" /> : <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{selectedChat.name.charAt(0)}</div>}
              </div>
              <div className="flex flex-col min-w-0">
                  <span className="font-bold text-white truncate text-base md:text-lg">{selectedChat.name}</span>
                  <span className="text-[10px] uppercase font-black text-neutral-500 tracking-wider">
                      {selectedChat.type === 'dm' ? (friendPresence?.online ? 'Online' : 'Offline') : `${Object.keys(selectedChat.members || {}).length} Members ${isAdmin ? '• Admin' : ''}`}
                  </span>
              </div>
            </div>
            <button onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)} className="p-3 text-neutral-500 hover:text-white hover:bg-white/5 rounded-2xl"><MoreVertical size={20} /></button>
            {isHeaderMenuOpen && (
                <div className="absolute right-6 top-20 w-48 bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-1 z-50">
                    {selectedChat.type === 'group' && <button onClick={() => { setIsHeaderMenuOpen(false); navigate(`/group/${activeChatId}/settings`); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-xl"><Settings size={18} /> Group Details</button>}
                    <button onClick={() => { setIsHeaderMenuOpen(false); navigate(selectedChat.type === 'dm' ? `/profile/${activeChatId}` : `/group/${activeChatId}/settings`); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-xl"><UserCircle2 size={18} /> View {selectedChat.type === 'dm' ? 'Profile' : 'Members'}</button>
                </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4" ref={scrollContainerRef}>
            {messages.map((msg) => {
              const isMe = msg.senderUid === user?.uid;
              const reactions = Object.entries(msg.reactions || {});
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg relative mb-2`}>
                   <div className={`flex gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMe && <div className="shrink-0 self-end mb-1">{userProfiles[msg.senderUid]?.photoURL ? <img src={userProfiles[msg.senderUid].photoURL} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-neutral-500">?</div>}</div>}
                      <div className="flex flex-col min-w-0 relative">
                        {selectedChat.type === 'group' && !isMe && <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3 mb-1">{msg.senderName} {groupAdmins[msg.senderUid] && <ShieldCheck size={10} className="inline ml-1 text-indigo-400" />}</span>}
                        <div onDoubleClick={() => handleReaction(msg.id, '❤️')} className={`rounded-[22px] px-4 py-2.5 shadow-lg cursor-pointer ${isMe ? 'bg-indigo-600 text-white rounded-br-lg' : 'bg-[#1f1f1f] text-neutral-200 rounded-bl-lg border border-white/5'}`}>
                            {msg.replyTo && <div className="bg-black/20 rounded-xl p-2 mb-2 border-l-4 border-indigo-400 text-xs italic opacity-70 truncate">{msg.replyTo.text}</div>}
                            <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                        </div>
                        {reactions.length > 0 && <div className={`absolute -bottom-2 ${isMe ? 'right-2' : 'left-2'} flex gap-1 bg-neutral-900 border border-white/10 rounded-full px-1.5 py-0.5 shadow-xl`}>{reactions.map(([uid, emoji]) => <span key={uid} className="text-[10px]">{emoji as string}</span>)}</div>}
                        <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity ${isMe ? 'right-full mr-2' : 'left-full ml-2'}`}>
                            <button onClick={() => setReplyingTo(msg)} className="p-2 text-neutral-500 hover:text-white rounded-full"><Reply size={16} /></button>
                            <button onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setReactionPickerPos({ x: rect.left, y: rect.top, isMe }); setActiveReactionPickerId(msg.id); }} className="p-2 text-neutral-500 hover:text-white rounded-full"><SmilePlus size={16} /></button>
                            {(isMe || isAdmin || isHost) && <button onClick={() => setUnsendConfirmId(msg.id)} className="p-2 text-neutral-500 hover:text-red-400 rounded-full"><Trash size={16} /></button>}
                        </div>
                      </div>
                   </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 md:p-6 bg-neutral-950 border-t border-neutral-900">
              <div className="max-w-5xl mx-auto flex flex-col gap-2 relative">
                  {showEmojiPicker && (
                    <div ref={emojiPickerRef} className="absolute bottom-full mb-4 right-0 w-80 h-96 bg-[#1a1a1a]/60 backdrop-blur-[40px] border border-white/10 rounded-[32px] shadow-2xl flex flex-col overflow-hidden z-50">
                      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-6 gap-1">
                        {COMMON_EMOJIS.map(e => <button key={e} onClick={() => addEmoji(e)} className="p-2.5 hover:bg-white/10 rounded-2xl text-xl transition-all active:scale-90">{e}</button>)}
                      </div>
                    </div>
                  )}
                  {replyingTo && <div className="flex items-center justify-between bg-white/5 px-4 py-2 rounded-2xl mb-2"><div className="flex items-center gap-2 overflow-hidden"><Reply size={14} className="text-indigo-400" /><span className="text-xs text-neutral-400 truncate">Replying to {replyingTo.senderName}: {replyingTo.text}</span></div><button onClick={() => setReplyingTo(null)}><X size={14} /></button></div>}
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 bg-white/[0.04] border border-white/5 rounded-[28px] p-1.5 flex items-end">
                      <button onClick={() => fileInputRef.current?.click()} className="p-3 text-neutral-500 hover:text-indigo-400"><Paperclip size={20} /></button>
                      <input type="file" ref={fileInputRef} className="hidden" />
                      <textarea ref={messageInputRef} rows={1} value={inputText} onChange={e => { setInputText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Message..." className="flex-1 bg-transparent border-none text-white text-[15px] px-3 py-2.5 focus:outline-none resize-none max-h-40 overflow-y-auto" />
                      <button ref={emojiButtonRef} onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-3 rounded-full transition-all ${showEmojiPicker ? 'text-indigo-400 bg-white/10' : 'text-neutral-500 hover:text-indigo-400'}`}><Smile size={20} /></button>
                    </div>
                    <button onClick={() => sendMessage()} disabled={!inputText.trim()} className={`p-4 rounded-full transition-all ${inputText.trim() ? 'bg-indigo-600 text-white shadow-lg' : 'bg-neutral-800 text-neutral-600'}`}><Send size={20} /></button>
                  </div>
              </div>
          </div>
        </div>
      ) : ( <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-neutral-950 text-center px-12"><MessageCircle size={48} className="text-neutral-800 mb-4" /><h2 className="text-2xl font-black text-white mb-2">Select a conversation</h2><p className="text-neutral-600 text-sm">Choose a friend or group to start chatting.</p></div> )}

      {activeReactionPickerId && reactionPickerPos && createPortal(
          <div className="fixed inset-0 z-[1000]"><div className="absolute inset-0 bg-transparent" onClick={() => { setActiveReactionPickerId(null); setReactionPickerPos(null); }}></div><div style={{ position: 'fixed', top: `${reactionPickerPos.y - 50}px`, left: reactionPickerPos.isMe ? `${reactionPickerPos.x - 200}px` : `${reactionPickerPos.x}px` }} className="bg-neutral-900 border border-white/10 rounded-full p-1.5 shadow-2xl flex gap-1 animate-in zoom-in">{REACTION_EMOJIS.map(e => <button key={e} onClick={() => handleReaction(activeReactionPickerId, e)} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-xl transition-transform hover:scale-125">{e}</button>)}</div></div>, document.body
      )}
      {unsendConfirmId && (
          <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"><div className="bg-neutral-900 border border-white/10 rounded-[32px] p-8 max-w-xs w-full text-center shadow-2xl"><div className="w-16 h-16 bg-red-500/10 rounded-[24px] flex items-center justify-center mx-auto mb-6"><AlertCircle size={32} className="text-red-500" /></div><h3 className="text-xl font-black text-white mb-2">Delete message?</h3><p className="text-neutral-400 text-sm mb-8">This action cannot be undone.</p><div className="flex flex-col gap-2"><button onClick={() => handleUnsend(unsendConfirmId)} className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl">Delete</button><button onClick={() => setUnsendConfirmId(null)} className="w-full py-3.5 bg-neutral-800 text-neutral-400 rounded-2xl">Cancel</button></div></div></div>
      )}
    </div>
  );
};