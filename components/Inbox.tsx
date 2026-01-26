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
    VolumeX, Archive, Ban, Lock
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

  // Follower/Following logic for mutual check
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [followers, setFollowers] = useState<Record<string, boolean>>({});

  // Block & Social States
  const [blocks, setBlocks] = useState<Record<string, boolean>>({}); 
  const [blockedBy, setBlockedBy] = useState<Record<string, boolean>>({}); 
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

  // Global Listeners for Mutual Follows, Block/Mute/Archive
  useEffect(() => {
    if (!user) return;
    
    // Following
    const followingRef = ref(database, `following/${user.uid}`);
    const unsubFollowing = onValue(followingRef, (snap) => setFollowing(snap.val() || {}));

    // Followers
    const followersRef = ref(database, `followers/${user.uid}`);
    const unsubFollowers = onValue(followersRef, (snap) => setFollowers(snap.val() || {}));

    const blockRef = ref(database, `blocks/${user.uid}`);
    const unsubBlocks = onValue(blockRef, (snap) => setBlocks(snap.val() || {}));

    const mutedRef = ref(database, `mutedChats/${user.uid}`);
    const unsubMuted = onValue(mutedRef, (snap) => setMutedChats(snap.val() || {}));

    const archivedRef = ref(database, `archivedChats/${user.uid}`);
    const unsubArchived = onValue(archivedRef, (snap) => setArchivedChats(snap.val() || {}));

    const blockedByRef = ref(database, `blockedUsers/${user.uid}`);
    const unsubBlockedBy = onValue(blockedByRef, (snap) => setBlockedBy(snap.val() || {}));

    return () => { 
      unsubFollowing();
      unsubFollowers();
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

  // Filter chats: Only mutual DMs and Groups
  const filteredChats = useMemo(() => {
    return chats.filter(c => {
        if (archivedChats[c.id]) return false;
        if (c.type === 'group') return true;
        // DM: Must be mutual follow
        return following[c.id] && followers[c.id];
    });
  }, [chats, archivedChats, following, followers]);

  const isCurrentChatBlocked = useMemo(() => {
    if (!selectedChat || selectedChat.type !== 'dm') return false;
    return blocks[selectedChat.id] || blockedBy[selectedChat.id];
  }, [selectedChat, blocks, blockedBy]);

  const isCurrentChatMutual = useMemo(() => {
    if (!selectedChat || selectedChat.type !== 'dm') return true;
    return following[selectedChat.id] && followers[selectedChat.id];
  }, [selectedChat, following, followers]);

  // Messages logic
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

  const handleBlock = async () => {
    if (!user || !selectedChat || selectedChat.type !== 'dm') return;
    const targetUid = selectedChat.id;
    const isCurrentlyBlocked = blocks[targetUid];
    
    if (isCurrentlyBlocked) {
        await remove(ref(database, `blocks/${user.uid}/${targetUid}`));
        await remove(ref(database, `blockedUsers/${targetUid}/${user.uid}`));
    } else {
        await set(ref(database, `blocks/${user.uid}/${targetUid}`), true);
        await set(ref(database, `blockedUsers/${targetUid}/${user.uid}`), true);
    }
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
    if (!isArchived) setSelectedChat(null);
    setIsHeaderMenuOpen(false);
  };

  const sendMessage = async (e?: React.FormEvent, attachment?: { url: string, type: 'image' | 'video' }) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachment && !user || !selectedChat || !currentChatId) return;

    // BLOCK & MUTUAL CHECK
    if (selectedChat.type === 'dm' && (isCurrentChatBlocked || !isCurrentChatMutual)) {
        alert("Cannot send messages. Mutual follow required.");
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
      
      remove(ref(database, `archivedChats/${uid}/${selectedChat.id}`));

      update(inboxRef, {
        lastMessage: { text: attachment ? (attachment.type === 'image' ? 'Sent an image' : 'Sent a video') : msgText, timestamp: Date.now(), senderUid: user?.uid },
        lastMessageAt: Date.now(),
        name: chatName,
        photoURL: chatPhoto || null
      });

      if (uid !== user?.uid) {
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
            ) : <div className="flex flex-col items-center justify-center py-20 text-center px-6"><div className="w-16 h-16 bg-neutral-900 rounded-[20px] flex items-center justify-center mb-4 text-neutral-700"><MessageCircle size={32} /></div><h3 className="text-white font-bold mb-1">No chats yet</h3><p className="text-neutral-500 text-sm">Mutual followers will appear here.</p></div>
          ) : (
            <div className="space-y-6 p-2">
                <div className="space-y-2"><label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Group Name</label><input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="E.g. Study Squad" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-bold" /></div>
                <div className="space-y-3"><label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Select Members</label><p className="text-xs text-neutral-600 px-3 italic">Invite mutual followers to groups.</p></div>
                <button onClick={() => setViewMode('list')} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black transition-all">Back</button>
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
                {(selectedChat.type === 'dm' ? userProfiles[selectedChat.id]?.photoURL : selectedChat.photoURL) ? (
                  <img src={selectedChat.type === 'dm' ? userProfiles[selectedChat.id]?.photoURL : selectedChat.photoURL} className="w-10 h-10 md:w-11 md:h-11 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-neutral-800 flex items-center justify-center text-lg font-bold text-neutral-500">
                    {(selectedChat.type === 'dm' ? userProfiles[selectedChat.id]?.name : selectedChat.name)?.charAt(0) || '?'}
                  </div>
                )}
                {selectedChat.type === 'dm' && friendPresence?.online && !isCurrentChatBlocked && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-neutral-950"></div>}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-white truncate leading-tight text-base md:text-lg">
                  {selectedChat.type === 'dm' ? (userProfiles[selectedChat.id]?.name || selectedChat.name) : selectedChat.name}
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
                        <div className="h-px bg-white/5 my-1" />
                        <button onClick={() => setIsHeaderMenuOpen(false)} className="w-full px-4 py-3 text-[10px] font-black text-neutral-600 uppercase tracking-widest hover:text-white text-center">Close</button>
                    </div>
                )}
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 pb-20" ref={scrollContainerRef}>
            {messages.map((msg, index) => {
              const isMe = msg.senderUid === user?.uid;
              const isFirstInStack = index === 0 || messages[index - 1]?.senderUid !== msg.senderUid || messages[index - 1]?.system;
              const showAvatar = !isMe && isFirstInStack;
              const isLastSentByMe = msg.id === lastSentMessageByMe?.id;

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg relative mb-1`}>
                  <div className={`flex gap-2 max-w-[85%] md:max-w-[70%] ${isMe ? 'flex-row-reverse' : 'items-end'}`}>
                    <div className="flex flex-col min-w-0 relative">
                        <div className={`px-4 py-2.5 rounded-[22px] text-sm leading-relaxed transition-all break-words ${msg.deleted ? 'italic opacity-60 bg-neutral-900 border border-white/5 text-neutral-500 rounded-3xl' : isMe ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-3xl rounded-br-lg' : 'bg-[#1f1f1f] text-neutral-200 rounded-3xl rounded-bl-lg border border-white/5'}`}>
                          <p className="inline-block whitespace-pre-wrap">{msg.text}</p>
                        </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 md:p-6 bg-neutral-950 border-t border-neutral-900 z-30">
            {isCurrentChatBlocked || !isCurrentChatMutual ? (
                <div className="flex items-center justify-center py-4 bg-neutral-900/50 border border-white/5 rounded-3xl gap-3">
                    <Lock size={16} className="text-neutral-500" />
                    <span className="text-neutral-500 text-sm font-bold uppercase tracking-widest">
                        {isCurrentChatBlocked ? 'Blocked Relationship' : 'Mutual Follow Required to Message'}
                    </span>
                </div>
            ) : (
                <form onSubmit={sendMessage} className="flex gap-3 items-end max-w-5xl mx-auto">
                  <div className="flex-1 bg-white/[0.04] border border-white/5 rounded-[28px] p-1.5 flex items-end">
                    <textarea rows={1} value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Message…" className="flex-1 bg-transparent border-none text-white text-[15px] px-4 py-2.5 focus:outline-none resize-none custom-scrollbar" />
                  </div>
                  <button type="submit" className="bg-indigo-600 text-white p-3.5 rounded-full"><Send size={20} /></button>
                </form>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-neutral-950 text-center px-12">
           <div className="w-24 h-24 bg-neutral-900 border border-white/5 rounded-[32px] flex items-center justify-center mb-8"><MessageCircle size={40} className="text-indigo-500" /></div>
           <h2 className="text-3xl font-black text-white tracking-tight mb-3">Select a conversation</h2>
           <p className="text-neutral-500 max-w-xs leading-relaxed">Choose a mutual follower to start chatting.</p>
        </div>
      )}
    </div>
  );
};