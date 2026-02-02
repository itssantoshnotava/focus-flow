import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, update, get, set, remove, onDisconnect } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    Send, MessageCircle, ArrowLeft, Plus, X, Check, CheckCheck, Reply,
    SmilePlus, Paperclip, MoreVertical, Smile, AlertCircle, Archive, Trash, 
    Loader2, Search, Heart, Edit3, Zap, Coffee, Music, Play, Pause, Headphones,
    ArchiveRestore
} from 'lucide-react';
import { useTimer } from '../contexts/TimerContext';

// Dedicated Signal-only audio instance to ensure isolation from Posts/Feed
let signalAudioInstance: HTMLAudioElement | null = null;
let signalActiveSetPlaying: ((val: boolean) => void) | null = null;

interface MusicMetadata {
  trackName: string;
  artistName: string;
  previewUrl: string;
  artworkUrl: string;
}

interface Signal {
  id: string;
  text?: string;
  type: 'auto' | 'manual';
  statusType?: 'pomodoro' | 'break' | 'focus';
  userUid: string;
  userName: string;
  photoURL?: string;
  timestamp: number;
  expiresAt: number;
  targetTimestamp?: number | null;
  likes?: Record<string, boolean>;
  isActive?: boolean;
  music?: MusicMetadata;
}

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
  lastMessageAt: number;
  unreadCount?: number;
  members?: Record<string, any>;
}

const REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '😭', '😮', '🎉', '👀'];

const EMOJI_DATA = [
  { char: '😀', name: 'smile happy' }, { char: '😃', name: 'smile happy' }, { char: '😄', name: 'smile happy' },
  { char: '😂', name: 'laugh lol cry' }, { char: '🤣', name: 'rofl lol' }, { char: '😊', name: 'smile blush' },
  { char: '😍', name: 'love heart eyes' }, { char: '🥰', name: 'love hearts' }, { char: '😘', name: 'kiss love' },
  { char: '😋', name: 'yum tongue' }, { char: '😛', name: 'tongue' }, { char: '😜', name: 'wink tongue' },
  { char: '🤨', name: 'raised eyebrow' }, { char: '😎', name: 'cool sunglasses' }, { char: '🥳', name: 'party celebrate' },
  { char: '😒', name: 'unamused' }, { char: '😔', name: 'sad' }, { char: '😢', name: 'cry sad' },
  { char: '😭', name: 'sob cry' }, { char: '😤', name: 'angry steam' }, { char: '😠', name: 'angry' },
  { char: '🤯', name: 'mind blown' }, { char: '🥵', name: 'hot red' }, { char: '🥶', name: 'cold blue' },
  { char: '😱', name: 'scream fear' }, { char: '🤔', name: 'think' }, { char: '🤫', name: 'shh quiet' },
  { char: '🫠', name: 'melt' }, { char: '💩', name: 'poop' }, { char: '🔥', name: 'fire hot' },
  { char: '✨', name: 'sparkles' }, { char: '💖', name: 'heart sparkle' }, { char: '❤️', name: 'heart red' },
  { char: '💙', name: 'heart blue' }, { char: '👍', name: 'thumbs up' }, { char: '👎', name: 'thumbs down' },
  { char: '🙏', name: 'please pray thanks' }, { char: '👏', name: 'clap' }, { char: '🙌', name: 'praise' },
  { char: '💯', name: 'hundred 100' }, { char: '🚀', name: 'rocket' }, { char: '👀', name: 'eyes look' }
];

export const Inbox: React.FC = () => {
  const { user } = useAuth();
  const { isActive: isTimerActive } = useTimer();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlChatId = searchParams.get('chatId');
  
  const [viewMode, setViewMode] = useState<'list' | 'create_group'>('list');
  const [showArchived, setShowArchived] = useState(false);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(urlChatId);

  const [userProfiles, setUserProfiles] = useState<Record<string, { name: string, photoURL?: string }>>({});
  const [groupMetadata, setGroupMetadata] = useState<Record<string, { name: string, photoURL?: string, memberCount?: number }>>({});
  const [listPresences, setListPresences] = useState<Record<string, { online: boolean, lastSeen: number }>>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [friendPresence, setFriendPresence] = useState<{online: boolean, lastSeen: number, activeChatId?: string} | null>(null);
  
  const [typingUsers, setTypingUsers] = useState<any[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [inputText, setInputText] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [reactionPickerPos, setReactionPickerPos] = useState<{ x: number, y: number, isMe: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsendConfirmId, setUnsendConfirmId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [sidebarMenuId, setSidebarMenuId] = useState<string | null>(null);
  const [sidebarMenuPos, setSidebarMenuPos] = useState<{ x: number, y: number } | null>(null);

  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [followers, setFollowers] = useState<Record<string, boolean>>({});
  const [archivedChats, setArchivedChats] = useState<Record<string, boolean>>({});

  // --- SIGNALS STATE ---
  const [signals, setSignals] = useState<Signal[]>([]);
  const [showSignalCreator, setShowSignalCreator] = useState(false);
  const [manualSignalText, setManualSignalText] = useState('');
  const [signalMusic, setSignalMusic] = useState<MusicMetadata | null>(null);
  const [activeSignalModal, setActiveSignalModal] = useState<Signal | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  const selectedChat = useMemo(() => {
    if (!activeChatId) return null;
    return chats.find(c => c.id === activeChatId) || null;
  }, [chats, activeChatId]);

  const currentConvoId = useMemo(() => {
    if (!user || !activeChatId || !selectedChat) return null;
    return selectedChat.type === 'dm' ? [user.uid, activeChatId].sort().join('_') : activeChatId;
  }, [user, activeChatId, selectedChat]);

  const mySignal = useMemo(() => {
    return signals.find(s => s.userUid === user?.uid);
  }, [signals, user?.uid]);

  // --- SIGNALS SYNC ---
  useEffect(() => {
    if (!user) return;
    const signalsRef = ref(database, 'signals');
    const unsub = onValue(signalsRef, (snap) => {
        if (snap.exists()) {
            const now = Date.now();
            const data = snap.val();
            const list = Object.entries(data)
                .map(([id, val]: [string, any]) => ({ id, ...val }))
                .filter(s => {
                    const isFriend = following[s.userUid] && followers[s.userUid];
                    const isMe = s.userUid === user.uid;
                    const isExpired = s.expiresAt < now && !s.isActive;
                    return (isFriend || isMe) && !isExpired;
                })
                .sort((a, b) => {
                    if (a.userUid === user.uid) return -1;
                    if (b.userUid === user.uid) return 1;
                    return b.timestamp - a.timestamp;
                });
            setSignals(list);
        } else {
            setSignals([]);
        }
    });
    return () => unsub();
  }, [user, following, followers]);

  const handlePostManualSignal = async () => {
    if (!user || (!manualSignalText.trim() && !signalMusic) || isTimerActive || mySignal) return;
    const signalRef = ref(database, `signals/${user.uid}`);
    await set(signalRef, {
        text: manualSignalText.trim() || null,
        type: 'manual',
        userUid: user.uid,
        userName: user.displayName || 'User',
        photoURL: user.photoURL || null,
        timestamp: Date.now(),
        expiresAt: Date.now() + 21600000, 
        isActive: false,
        music: signalMusic || null
    });
    setManualSignalText('');
    setSignalMusic(null);
    setShowSignalCreator(false);
    setActiveSignalModal(null);
  };

  const handleDeleteSignal = async (targetUid: string) => {
    if (!user || targetUid !== user.uid) return;
    if (window.confirm("Delete your current signal?")) {
        await remove(ref(database, `signals/${user.uid}`));
        setActiveSignalModal(null);
    }
  };

  const handleLikeSignal = async (signalId: string, targetUid: string) => {
    if (!user || targetUid === user.uid) return;
    const likeRef = ref(database, `signals/${targetUid}/likes/${user.uid}`);
    const snap = await get(likeRef);
    if (snap.exists()) await remove(likeRef);
    else await set(likeRef, true);
  };

  const SignalCard: React.FC<{ signal: Signal }> = ({ signal }) => {
    const { user } = useAuth();
    const isMe = signal.userUid === user?.uid;
    const hasLikes = signal.likes && Object.keys(signal.likes).length > 0;
    const iLiked = user && signal.likes?.[user.uid];

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleLikeSignal(signal.id, signal.userUid);
    };

    return (
        <div 
            onClick={() => setActiveSignalModal(signal)}
            onDoubleClick={handleDoubleClick}
            className={`shrink-0 flex flex-col items-center gap-2 transition-all duration-300 relative group/card cursor-pointer select-none pt-4
                ${iLiked ? 'scale-105' : ''}
            `}
        >
            {/* Thought Bubble / Preview */}
            <div className="absolute top-[-8px] z-10 max-w-[80px]">
                <div className="bg-white/[0.08] backdrop-blur-xl border border-white/10 rounded-full px-2 py-1 shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-1">
                    {signal.music ? <Music size={8} className="text-indigo-400 shrink-0" /> : <div className="w-1 h-1 rounded-full bg-indigo-500 shrink-0"></div>}
                    <span className="text-[7px] font-black text-white/90 truncate uppercase tracking-tighter">
                        {signal.music ? signal.music.trackName : (signal.text || '...')}
                    </span>
                </div>
            </div>

            <div className="relative mt-2">
                {/* User Avatar Circle */}
                <div className={`w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr transition-all duration-500 shadow-xl overflow-hidden
                    ${isMe ? 'from-indigo-400 to-indigo-600' : 'from-white/20 to-transparent'}
                `}>
                    <div className="w-full h-full rounded-full bg-neutral-950 p-[2.5px]">
                        <div className="w-full h-full rounded-full overflow-hidden relative group-hover/card:scale-110 transition-transform">
                            {signal.photoURL ? (
                                <img src={signal.photoURL} className="w-full h-full object-cover" alt={signal.userName} />
                            ) : (
                                <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-sm font-black text-neutral-500 uppercase">{signal.userName.charAt(0)}</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Status Indicator Badge */}
                <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-neutral-900 border border-white/10 flex items-center justify-center shadow-lg z-10 transition-all ${isMe ? 'bg-indigo-600' : ''}`}>
                    {signal.music ? <Music size={10} className={isMe ? "text-white" : "text-indigo-400"} /> : 
                     signal.statusType === 'pomodoro' ? <Zap size={10} className="text-orange-400" /> :
                     signal.statusType === 'break' ? <Coffee size={10} className="text-emerald-400" /> :
                     <Edit3 size={10} className="text-neutral-500" />}
                </div>

                {/* Like Indicator */}
                {hasLikes && (
                  <div className="absolute -top-1 -left-1 bg-red-500 rounded-full p-1 text-white shadow-lg animate-in zoom-in duration-300">
                    <Heart size={8} className="fill-current" />
                  </div>
                )}
            </div>

            <span className={`text-[9px] font-black uppercase tracking-tight truncate max-w-[56px] text-center
                ${isMe ? 'text-indigo-400' : 'text-neutral-500 group-hover/card:text-neutral-300 transition-colors'}
            `}>
                {isMe ? 'Me' : signal.userName.split(' ')[0]}
            </span>
        </div>
    );
  };

  // --- TYPING SYNC ---
  useEffect(() => {
    if (!user || !activeChatId || !currentConvoId || !selectedChat) return;
    const typingPath = selectedChat.type === 'dm' ? `userTyping/${currentConvoId}` : `groupTyping/${activeChatId}`;
    const typingRef = ref(database, typingPath);
    const unsub = onValue(typingRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const users = Object.entries(data)
                .filter(([uid, val]: [string, any]) => uid !== user.uid && val.typing)
                .map(([uid]) => ({
                    uid,
                    name: userProfiles[uid]?.name || 'Someone',
                    photoURL: userProfiles[uid]?.photoURL
                }));
            setTypingUsers(users);
        } else {
            setTypingUsers([]);
        }
    });
    return () => unsub();
  }, [user, activeChatId, currentConvoId, selectedChat, userProfiles]);

  const setTypingStatus = (isTyping: boolean) => {
    if (!user || !activeChatId || !currentConvoId || !selectedChat) return;
    const typingPath = selectedChat.type === 'dm' ? `userTyping/${currentConvoId}/${user.uid}` : `groupTyping/${activeChatId}/${user.uid}`;
    const myTypingRef = ref(database, typingPath);
    if (isTyping) {
        update(myTypingRef, { typing: true, timestamp: Date.now() });
        onDisconnect(myTypingRef).remove();
    } else {
        remove(myTypingRef);
    }
  };

  const handleInputChange = (val: string) => {
    setInputText(val);
    if (val.trim().length > 0) {
        setTypingStatus(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingStatus(false), 2500);
    } else {
        setTypingStatus(false);
    }
  };

  // --- SCROLL MANAGEMENT ---
  const isOpeningChat = useRef(false);
  useEffect(() => { 
    if (activeChatId) {
        isOpeningChat.current = true;
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }
  }, [activeChatId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !activeChatId) return;

    const observer = new ResizeObserver(() => {
      if (isOpeningChat.current) {
        container.scrollTop = container.scrollHeight;
      }
    });

    observer.observe(container);
    
    const timeout = setTimeout(() => {
      isOpeningChat.current = false;
    }, 1200);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [activeChatId, messages.length]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (isOpeningChat.current) {
        container.style.scrollBehavior = 'auto';
        container.scrollTop = container.scrollHeight;
    } else {
        container.style.scrollBehavior = 'smooth';
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 300;
        if (isNearBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }
  }, [messages, typingUsers]);

  // --- REAL-TIME DATA SYNC ---
  useEffect(() => {
    if (!user) return;
    const unsubInbox = onValue(ref(database, `userInboxes/${user.uid}`), (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }));
            setChats(list.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)));
            list.forEach(chat => {
                if (chat.type === 'dm') {
                    onValue(ref(database, `users/${chat.id}`), (uSnap) => {
                        if (uSnap.exists()) setUserProfiles(prev => ({ ...prev, [chat.id]: uSnap.val() }));
                    });
                    onValue(ref(database, `presence/${chat.id}`), (pSnap) => {
                        if (pSnap.exists()) setListPresences(prev => ({ ...prev, [chat.id]: pSnap.val() }));
                    });
                } else {
                    onValue(ref(database, `groupChats/${chat.id}`), (gSnap) => {
                        if (gSnap.exists()) {
                            const gData = gSnap.val();
                            setGroupMetadata(prev => ({ 
                                ...prev, 
                                [chat.id]: { 
                                  name: gData.name, 
                                  photoURL: gData.photoURL,
                                  memberCount: gData.members ? Object.keys(gData.members).length : 0
                                } 
                            }));
                        }
                    });
                }
            });
        } else { setChats([]); }
        setLoading(false);
    });
    onValue(ref(database, `following/${user.uid}`), (snap) => setFollowing(snap.val() || {}));
    onValue(ref(database, `followers/${user.uid}`), (snap) => setFollowers(snap.val() || {}));
    onValue(ref(database, `archivedChats/${user.uid}`), (snap) => setArchivedChats(snap.val() || {}));
    return () => unsubInbox();
  }, [user]);

  useEffect(() => {
    if (activeChatId && selectedChat?.type === 'dm') {
        const unsub = onValue(ref(database, `presence/${activeChatId}`), (snap) => setFriendPresence(snap.val()));
        return () => unsub();
    }
  }, [activeChatId, selectedChat]);

  useEffect(() => {
    if (!user || !activeChatId || !currentConvoId || !selectedChat) return;
    const path = selectedChat.type === 'dm' ? `messages/${currentConvoId}` : `groupMessages/${activeChatId}`;
    const unsub = onValue(ref(database, path), (snapshot) => {
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([id, val]: [string, any]) => ({ id, ...val })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(list);
        
        if (selectedChat.type === 'group') {
            const lastMsg = list[list.length - 1];
            if (lastMsg && (!lastMsg.seenBy || !lastMsg.seenBy[user.uid])) {
                update(ref(database, `${path}/${lastMsg.id}/seenBy`), { [user.uid]: Date.now() });
            }
            list.forEach(m => {
              if (m.seenBy) {
                Object.keys(m.seenBy).forEach(uid => {
                  if (uid !== user.uid && !userProfiles[uid]) {
                    get(ref(database, `users/${uid}`)).then(uSnap => {
                      if (uSnap.exists()) setUserProfiles(prev => ({ ...prev, [uid]: uSnap.val() }));
                    });
                  }
                });
              }
            });
        } else {
            list.forEach(m => {
                if (m.senderUid !== user.uid && !m.seen) update(ref(database, `${path}/${m.id}`), { seen: true });
            });
        }
        update(ref(database, `userInboxes/${user.uid}/${activeChatId}`), { unreadCount: 0 });
      } else { setMessages([]); }
    });
    return () => unsub();
  }, [activeChatId, currentConvoId, user, selectedChat?.type]);

  const handleSelectChat = (chatId: string) => {
    if (activeChatId) {
        setDrafts(prev => ({ ...prev, [activeChatId]: inputText }));
        setTypingStatus(false);
    }
    const savedDraft = drafts[chatId] || '';
    setInputText(savedDraft);
    setActiveChatId(chatId);
    navigate(`/inbox?chatId=${chatId}`, { replace: true });
  };

  const addEmoji = (emoji: string) => {
    handleInputChange(inputText + emoji);
    if (messageInputRef.current) messageInputRef.current.focus();
  };

  const filteredEmojis = useMemo(() => {
    if (!emojiSearch.trim()) return EMOJI_DATA;
    return EMOJI_DATA.filter(e => e.name.toLowerCase().includes(emojiSearch.toLowerCase()));
  }, [emojiSearch]);

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !user || !activeChatId || !selectedChat || !currentConvoId) return;
    const msgText = inputText.trim();
    const ts = Date.now();
    setTypingStatus(false);
    setDrafts(prev => ({ ...prev, [activeChatId]: '' }));
    setInputText('');
    const msgData = { 
        text: msgText, senderUid: user.uid, senderName: user.displayName, timestamp: ts, seen: false,
        replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderName: replyingTo.senderName } : null 
    };
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    await push(ref(database, `${basePath}/${currentConvoId}`), msgData);
    setReplyingTo(null);
    setShowEmojiPicker(false);
    const updInbx = async (pId: string) => {
        const r = ref(database, `userInboxes/${pId}/${selectedChat.type === 'dm' ? user.uid : activeChatId}`);
        const s = await get(r);
        update(r, { lastMessage: { text: msgText, timestamp: ts, senderUid: user.uid }, lastMessageAt: ts, unreadCount: (s.val()?.unreadCount || 0) + 1 });
    };
    if (selectedChat.type === 'dm') {
        updInbx(activeChatId);
        update(ref(database, `userInboxes/${user.uid}/${activeChatId}`), { lastMessage: { text: msgText, timestamp: ts, senderUid: user.uid }, lastMessageAt: ts });
    } else {
        const g = await get(ref(database, `groupChats/${activeChatId}/members`));
        if (g.exists()) Object.keys(g.val()).forEach(mid => {
            if (mid !== user.uid) updInbx(mid);
            else update(ref(database, `userInboxes/${user.uid}/${activeChatId}`), { lastMessage: { text: msgText, timestamp: ts, senderUid: user.uid }, lastMessageAt: ts });
        });
    }
  };

  const handleUnsend = async (msgId: string) => {
    if (!currentConvoId || !selectedChat) return;
    const path = selectedChat.type === 'dm' ? `messages/${currentConvoId}/${msgId}` : `groupMessages/${activeChatId}/${msgId}`;
    await remove(ref(database, path));
    setUnsendConfirmId(null);
  };

  const handleArchive = async (chatId: string) => {
    if (!user) return;
    const currentlyArchived = archivedChats[chatId];
    await set(ref(database, `archivedChats/${user.uid}/${chatId}`), currentlyArchived ? null : true);
    setSidebarMenuId(null);
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!user || !window.confirm("Delete entire chat history?")) return;
    await remove(ref(database, `userInboxes/${user.uid}/${chatId}`));
    setSidebarMenuId(null);
    if (activeChatId === chatId) setActiveChatId(null);
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    if (!currentConvoId || !user) return;
    const path = selectedChat?.type === 'dm' ? `messages/${currentConvoId}/${msgId}/reactions/${user.uid}` : `groupMessages/${activeChatId}/${msgId}/reactions/${user.uid}`;
    const snap = await get(ref(database, path));
    if (snap.exists() && snap.val() === emoji) await remove(ref(database, path));
    else await set(ref(database, path), emoji);
    setActiveReactionPickerId(null);
  };

  const lastUserMessageId = useMemo(() => {
    const fromMe = messages.filter(m => m.senderUid === user?.uid);
    return fromMe.length > 0 ? fromMe[fromMe.length - 1].id : null;
  }, [messages, user?.uid]);

  const lastSeenByPerUser = useMemo(() => {
    const seenMap: Record<string, string> = {};
    if (selectedChat?.type === 'group') {
      messages.forEach(m => {
        if (m.seenBy) {
          Object.keys(m.seenBy).forEach(uid => {
            if (uid !== user?.uid) {
              seenMap[uid] = m.id;
            }
          });
        }
      });
    }
    return seenMap;
  }, [messages, selectedChat?.type, user?.uid]);

  const filteredChats = chats.filter(c => {
    const isArchived = archivedChats[c.id];
    if (showArchived) return isArchived;
    if (isArchived) return false;
    if (c.type === 'group') return true;
    return following[c.id] && followers[c.id];
  });

  if (loading && !chats.length) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="flex h-full bg-neutral-950 overflow-hidden font-sans">
      <div className={`${activeChatId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-neutral-900 bg-neutral-950 shrink-0`}>
        <div className="p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/50 backdrop-blur-xl sticky top-0 z-20">
          <h1 className="text-2xl font-black text-white tracking-tight">{showArchived ? 'Archive' : 'Circles'}</h1>
          <div className="flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); setShowArchived(!showArchived); }} className={`p-2 rounded-xl transition-colors ${showArchived ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}><Archive size={20} /></button>
            <button onClick={(e) => { e.stopPropagation(); setViewMode(viewMode === 'list' ? 'create_group' : 'list'); }} className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors">{viewMode === 'list' ? <Plus size={20} /> : <X size={20} />}</button>
          </div>
        </div>

        {/* --- SIGNALS SECTION (Instagram Stories Style) --- */}
        {!showArchived && (
            <div id="signals-container" className="border-b border-neutral-900 flex flex-col gap-2 py-5 bg-[#0a0a0a] shrink-0 overflow-hidden">
                <div className="flex items-center justify-between px-6 mb-1">
                    <h3 className="text-[11px] font-black uppercase text-neutral-600 tracking-[0.4em]">Signals</h3>
                    {!mySignal && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowSignalCreator(true); }}
                            className="p-1 text-neutral-500 hover:text-white transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto no-scrollbar flex items-center gap-5 px-6 pb-1">
                    {/* Signal Cards */}
                    {signals.map(s => <SignalCard key={s.id} signal={s} />)}
                    
                    {signals.length === 0 && (
                        <div className="py-4 text-center w-full bg-white/[0.02] border border-dashed border-white/5 rounded-3xl">
                            <p className="text-[9px] font-black uppercase text-neutral-800 tracking-[0.3em]">No vibes yet</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {filteredChats.map(chat => {
            const isSelected = activeChatId === chat.id;
            const profile = userProfiles[chat.id];
            const gMeta = groupMetadata[chat.id];
            const presence = listPresences[chat.id];
            const hasDraft = (drafts[chat.id]?.trim().length > 0) || (chat.id === activeChatId && inputText.trim().length > 0);
            
            const photo = chat.type === 'dm' ? profile?.photoURL : gMeta?.photoURL || chat.photoURL;
            const name = chat.type === 'dm' ? profile?.name || chat.name : gMeta?.name || chat.name;
            
            return (
              <div key={chat.id} className="group/tile relative">
                  <button onClick={() => handleSelectChat(chat.id)} className={`w-full flex items-center gap-4 p-4 rounded-[32px] relative border transition-all ${isSelected ? 'bg-white/10 backdrop-blur-xl border-white/10 shadow-xl' : 'hover:bg-white/[0.04] border-transparent'}`}>
                    <div className="relative shrink-0">
                      {photo ? <img src={photo} className="w-14 h-14 rounded-[22px] object-cover border border-white/5" /> : <div className="w-14 h-14 rounded-[22px] bg-neutral-800 flex items-center justify-center text-xl font-bold text-neutral-500">{name?.charAt(0)}</div>}
                      {chat.type === 'dm' && <div className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-neutral-950 ${presence?.online ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div>}
                      {chat.unreadCount ? <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full border-2 border-neutral-950 flex items-center justify-center text-[10px] font-black text-white">{chat.unreadCount}</div> : null}
                    </div>
                    <div className="flex-1 text-left min-w-0 pr-10">
                        <div className="flex justify-between items-center mb-0.5">
                            <span className="font-bold text-white truncate">{name}</span>
                            {hasDraft && <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded tracking-widest">Draft</span>}
                        </div>
                        <p className={`text-sm truncate ${chat.unreadCount ? 'text-neutral-200 font-medium' : 'text-neutral-500'}`}>{chat.lastMessage?.senderUid === user?.uid && 'You: '}{chat.lastMessage?.text || 'No messages'}</p>
                    </div>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setSidebarMenuPos({ x: r.right, y: r.bottom }); setSidebarMenuId(chat.id); }} className="absolute right-6 top-1/2 -translate-y-1/2 p-2 text-neutral-500 hover:text-white opacity-0 group-hover/tile:opacity-100 transition-opacity"><MoreVertical size={16} /></button>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- CHAT AREA --- */}
      {activeChatId && selectedChat ? (
        <div className="flex-1 flex flex-col bg-neutral-950 relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 md:p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/80 backdrop-blur-2xl z-20">
            <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setActiveChatId(null)} className="md:hidden p-2 text-neutral-500 hover:text-white"><ArrowLeft size={24} /></button>
              <div className="cursor-pointer relative" onClick={() => navigate(selectedChat.type === 'dm' ? `/profile/${activeChatId}` : `/group/${activeChatId}/settings`)}>
                  { (selectedChat.type === 'dm' ? userProfiles[activeChatId]?.photoURL : groupMetadata[activeChatId]?.photoURL || selectedChat.photoURL) ? <img src={selectedChat.type === 'dm' ? userProfiles[activeChatId]?.photoURL : groupMetadata[activeChatId]?.photoURL || selectedChat.photoURL} className="w-11 h-11 rounded-[16px] object-cover border border-white/5 shadow-lg" /> : <div className="w-11 h-11 rounded-[16px] bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{(selectedChat.type === 'dm' ? userProfiles[activeChatId]?.name : groupMetadata[activeChatId]?.name || selectedChat.name)?.charAt(0)}</div> }
                  {selectedChat.type === 'dm' && friendPresence?.online && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-neutral-950 shadow-sm animate-pulse"></div>}
              </div>
              <div className="flex flex-col min-w-0">
                  <span className="font-bold text-white truncate text-base md:text-lg">{selectedChat.type === 'dm' ? (userProfiles[activeChatId]?.name || selectedChat.name) : groupMetadata[activeChatId]?.name || selectedChat.name}</span>
                  <span className="text-[10px] uppercase font-black text-neutral-500 tracking-wider">
                    {selectedChat.type === 'dm' 
                      ? (friendPresence?.online ? 'Online' : 'Offline') 
                      : `${groupMetadata[activeChatId]?.memberCount || 0} members`
                    }
                  </span>
              </div>
            </div>
            <button className={`p-3 rounded-2xl transition-colors text-neutral-500 hover:text-white hover:bg-white/5`}><MoreVertical size={20} /></button>
          </div>

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
            {messages.map((msg) => {
              const isMe = msg.senderUid === user?.uid;
              const senderPfp = userProfiles[msg.senderUid]?.photoURL;
              const reactions = Object.entries(msg.reactions || {});
              const isStatusMsg = lastUserMessageId === msg.id;
              
              const groupViewers = Object.entries(lastSeenByPerUser)
                .filter(([uid, mid]) => mid === msg.id)
                .map(([uid]) => uid);

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg relative mb-2`}>
                   <div className={`flex gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMe && (
                        <div className="shrink-0 self-end mb-1">
                          {senderPfp ? <img src={senderPfp} className="w-8 h-8 rounded-lg object-cover border border-white/5 shadow-md" /> : <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-neutral-500">?</div>}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0 relative">
                        <div onDoubleClick={() => handleReaction(msg.id, '❤️')} className={`rounded-[22px] px-4 py-2.5 shadow-lg cursor-pointer relative transition-all active:scale-[0.99] ${isMe ? 'bg-indigo-600 text-white rounded-br-lg' : 'bg-[#1f1f1f] text-neutral-200 rounded-bl-lg border border-white/5'}`}>
                            {msg.replyTo && (
                                <div className="bg-white/5 rounded-lg py-1 px-2.5 mb-2 border-l-2 border-indigo-500/50 text-[11px] italic opacity-80 inline-block max-w-full truncate">
                                    <span className="block font-black uppercase text-[7px] text-indigo-400 mb-0.5">{msg.replyTo.senderName}</span>
                                    {msg.replyTo.text}
                                </div>
                            )}
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                            
                            {selectedChat.type === 'dm' && isMe && isStatusMsg && (
                                <div className="absolute -bottom-5 right-0 flex items-center gap-1 opacity-100 transition-opacity">
                                    <span className="text-[9px] font-black uppercase text-neutral-600 tracking-tighter">{msg.seen ? 'Seen' : 'Sent'}</span>
                                    {msg.seen ? <CheckCheck size={11} className="text-indigo-500" /> : <Check size={11} className="text-neutral-700" />}
                                </div>
                            )}

                            {selectedChat.type === 'group' && groupViewers.length > 0 && (
                                <div className={`absolute -bottom-5 ${isMe ? 'right-0' : 'left-0'} flex -space-x-1.5 animate-in fade-in zoom-in duration-300`}>
                                    {groupViewers.map(uid => {
                                        const p = userProfiles[uid];
                                        return (
                                            <div key={uid} className="w-4 h-4 rounded-full border border-neutral-950 bg-neutral-800 overflow-hidden ring-1 ring-white/10 transition-transform hover:scale-125 hover:z-50" title={p?.name}>
                                                {p?.photoURL ? (
                                                    <img src={p.photoURL} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[6px] font-black text-neutral-500 uppercase">{p?.name?.charAt(0)}</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        {reactions.length > 0 && <div className={`absolute -bottom-2 ${isMe ? 'right-2' : 'left-2'} flex gap-1 bg-neutral-900 border border-white/10 rounded-full px-1.5 py-0.5 shadow-xl z-10 animate-in zoom-in`}>{reactions.map(([uid, emoji]) => <span key={uid} className="text-[10px]">{emoji as string}</span>)}</div>}
                        <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-all ${isMe ? 'right-full mr-3' : 'left-full ml-3'}`}>
                            <button onClick={() => { setReplyingTo(msg); setTimeout(() => messageInputRef.current?.focus(), 50); }} className="p-2 text-neutral-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-full"><Reply size={16} /></button>
                            <button onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setReactionPickerPos({ x: rect.left, y: rect.top, isMe }); setActiveReactionPickerId(msg.id); }} className="p-2 text-neutral-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-full"><SmilePlus size={16} /></button>
                            {(isMe) && <button onClick={() => setUnsendConfirmId(msg.id)} className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-full"><Trash size={16} /></button>}
                        </div>
                      </div>
                   </div>
                </div>
              );
            })}

            {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-2">
                    <div className="flex -space-x-3 mr-1">
                        {typingUsers.slice(0, 5).map((u, i) => (
                            <div key={u.uid} className="relative transition-transform hover:translate-y-[-2px] hover:scale-110" style={{ zIndex: 10 - i }}>
                                {u.photoURL ? (
                                    <img src={u.photoURL} className="w-7 h-7 rounded-full border-2 border-neutral-950 object-cover shadow-lg" alt={u.name} />
                                ) : (
                                    <div className="w-7 h-7 rounded-full border-2 border-neutral-950 bg-neutral-800 flex items-center justify-center text-[8px] font-black text-neutral-500 uppercase">{u.name?.charAt(0)}</div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest leading-none mb-1 shadow-sm">
                            {typingUsers.length === 1 
                                ? `${typingUsers[0].name.split(' ')[0]} is typing...` 
                                : typingUsers.length <= 5 
                                    ? `${typingUsers.slice(0, -1).map(u => u.name.split(' ')[0]).join(', ')} and ${typingUsers[typingUsers.length-1].name.split(' ')[0]} are typing...`
                                    : `${typingUsers.slice(0, 3).map(u => u.name.split(' ')[0]).join(', ')} and ${typingUsers.length - 3} others are typing...`}
                        </span>
                        <div className="flex gap-1 ml-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-typing-dot"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-typing-dot [animation-delay:0.2s]"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-typing-dot [animation-delay:0.4s]"></div>
                        </div>
                    </div>
                </div>
            )}
          </div>

          <div className="p-4 md:p-6 bg-neutral-950 border-t border-neutral-900 z-30">
              <div className="max-w-5xl mx-auto flex flex-col gap-2 relative">
                  {showEmojiPicker && (
                    <div ref={emojiPickerRef} className="absolute bottom-full mb-4 right-0 w-80 h-96 bg-[#1a1a1a]/95 backdrop-blur-[30px] border border-white/10 rounded-[32px] shadow-2xl flex flex-col overflow-hidden z-50 animate-in slide-in-from-bottom-4">
                      <div className="p-4 border-b border-white/5 bg-black/20 flex items-center gap-3">
                        <Search size={16} className="text-neutral-500 shrink-0" />
                        <input value={emojiSearch} onChange={e => setEmojiSearch(e.target.value)} placeholder="Search emojis..." className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-neutral-700" />
                        {emojiSearch && <button onClick={() => setEmojiSearch('')}><X size={14} className="text-neutral-500" /></button>}
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar grid grid-cols-6 gap-1">
                        {filteredEmojis.map(e => <button key={e.char} onClick={() => addEmoji(e.char)} className="p-2 hover:bg-white/10 rounded-2xl text-xl transition-all active:scale-90">{e.char}</button>)}
                        {filteredEmojis.length === 0 && <p className="col-span-6 text-center py-10 text-[10px] font-black uppercase text-neutral-700">No emojis found</p>}
                      </div>
                    </div>
                  )}

                  {replyingTo && (
                    <div className="flex items-center justify-between bg-white/[0.04] backdrop-blur-3xl px-4 py-2 rounded-[18px] border border-white/5 mb-2 animate-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-1 h-5 bg-indigo-500 rounded-full shrink-0"></div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest leading-none mb-0.5">{replyingTo.senderName}</span>
                                <span className="text-[11px] text-neutral-400 truncate opacity-80 leading-tight">{replyingTo.text}</span>
                            </div>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="p-1 text-neutral-500 hover:text-white bg-white/5 rounded-full"><X size={12} /></button>
                    </div>
                  )}
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 bg-white/[0.04] border border-white/5 rounded-[28px] p-1.5 flex items-end shadow-inner transition-all focus-within:bg-white/[0.08]">
                      <button className="p-3 text-neutral-500 hover:text-indigo-400"><Paperclip size={20} /></button>
                      <textarea 
                        ref={messageInputRef} 
                        rows={1} 
                        value={inputText} 
                        onChange={e => { handleInputChange(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} 
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} 
                        placeholder="Type a message..." 
                        className="flex-1 bg-transparent border-none text-white text-[15px] px-3 py-2.5 focus:outline-none resize-none max-h-40 overflow-y-auto custom-scrollbar" 
                      />
                      <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setEmojiSearch(''); }} className={`p-3 rounded-full transition-colors ${showEmojiPicker ? 'text-indigo-400 bg-white/10' : 'text-neutral-500 hover:text-indigo-400'}`}><Smile size={20} /></button>
                    </div>
                    <button onClick={() => sendMessage()} disabled={!inputText.trim()} className={`p-4 rounded-full transition-all shadow-lg active:scale-95 ${inputText.trim() ? 'bg-indigo-600 text-white shadow-indigo-900/40' : 'bg-neutral-800 text-neutral-600'}`}><Send size={20} /></button>
                  </div>
              </div>
          </div>
        </div>
      ) : ( <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-neutral-950 text-center px-12"><MessageCircle size={48} className="text-neutral-800 mb-4 opacity-50" /><h2 className="text-2xl font-black text-white mb-2">Select a circle</h2><p className="text-neutral-600 text-sm">Choose a friend or group to start chatting.</p></div> )}

      {activeReactionPickerId && reactionPickerPos && createPortal(
          <div className="fixed inset-0 z-[1000]">
            <div className="absolute inset-0 bg-transparent" onClick={() => setActiveReactionPickerId(null)}></div>
            <div style={{ position: 'fixed', top: `${reactionPickerPos.y - 60}px`, left: reactionPickerPos.isMe ? `${reactionPickerPos.x - 240}px` : `${reactionPickerPos.x}px` }} className="bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-2xl flex gap-1 animate-in zoom-in">{REACTION_EMOJIS.map(e => <button key={e} onClick={() => handleReaction(activeReactionPickerId, e)} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-xl transition-transform hover:scale-125 active:scale-90">{e}</button>)}</div>
          </div>, document.body
      )}

      {unsendConfirmId && createPortal(
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
              <div className="bg-neutral-900 border border-white/10 rounded-[32px] p-8 max-w-xs w-full text-center shadow-2xl animate-in zoom-in duration-200">
                  <div className="w-16 h-16 bg-red-500/10 rounded-[24px] flex items-center justify-center mx-auto mb-6"><AlertCircle size={32} className="text-red-500" /></div>
                  <h3 className="text-xl font-black text-white mb-2">Unsend message?</h3>
                  <div className="flex flex-col gap-2 mt-8">
                      <button onClick={() => handleUnsend(unsendConfirmId)} className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-red-900/20 active:scale-95">Unsend</button>
                      <button onClick={() => setUnsendConfirmId(null)} className="w-full py-3.5 bg-neutral-800 text-neutral-400 hover:text-white rounded-2xl transition-all">Cancel</button>
                  </div>
              </div>
          </div>, document.body
      )}

      {sidebarMenuId && sidebarMenuPos && createPortal(
          <div className="fixed inset-0 z-[1000]"><div className="absolute inset-0 bg-transparent" onClick={() => setSidebarMenuId(null)}></div><div style={{ position: 'fixed', top: `${sidebarMenuPos.y + 8}px`, left: `${sidebarMenuPos.x - 160}px` }} className="w-40 bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-1 animate-in zoom-in">{archivedChats[sidebarMenuId] ? <button onClick={() => handleArchive(sidebarMenuId)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-xl"><ArchiveRestore size={16} /> Unarchive</button> : <button onClick={() => handleArchive(sidebarMenuId)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-xl"><Archive size={16} /> Archive</button>}<button onClick={() => handleDeleteChat(sidebarMenuId)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-500/5 rounded-xl"><Trash size={16} /> Delete</button></div></div>, document.body
      )}

      {showSignalCreator && createPortal(
          <SignalCreatorModal 
            onClose={() => { setShowSignalCreator(false); setManualSignalText(''); setSignalMusic(null); }} 
            onPost={handlePostManualSignal}
            text={manualSignalText}
            setText={setManualSignalText}
            music={signalMusic}
            setMusic={setSignalMusic}
          />, 
          document.body
      )}

      {activeSignalModal && (
          <SignalDetailsModal 
              signal={activeSignalModal} 
              onClose={() => setActiveSignalModal(null)} 
              onEditStatus={() => setShowSignalCreator(true)}
          />
      )}
    </div>
  );
};

const SignalDetailsModal: React.FC<{ signal: Signal, onClose: () => void, onEditStatus?: () => void }> = ({ signal, onClose, onEditStatus }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isMe = signal.userUid === user?.uid;
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(30);
    
    // Upgrade artwork quality
    const highResArtwork = useMemo(() => {
        if (!signal.music?.artworkUrl) return null;
        return signal.music.artworkUrl.replace('100x100bb', '600x600bb');
    }, [signal.music]);

    const togglePlayback = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!signal.music?.previewUrl) return;

        if (isPlaying) {
            signalAudioInstance?.pause();
            setIsPlaying(false);
            signalAudioInstance = null;
            signalActiveSetPlaying = null;
        } else {
            if (signalAudioInstance) {
                signalAudioInstance.pause();
                if (signalActiveSetPlaying) signalActiveSetPlaying(false);
            }
            const audio = new Audio(signal.music.previewUrl);
            audio.onended = () => {
                setIsPlaying(false);
                signalAudioInstance = null;
                signalActiveSetPlaying = null;
                setCurrentTime(0);
            };
            audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
            audio.onloadedmetadata = () => setDuration(audio.duration);
            audio.play().then(() => {
                setIsPlaying(true);
                signalAudioInstance = audio;
                signalActiveSetPlaying = setIsPlaying;
            }).catch(console.error);
        }
    };

    // Auto-play on mount as requested
    useEffect(() => {
        if (signal.music?.previewUrl) {
            const timer = setTimeout(() => togglePlayback(), 500);
            return () => clearTimeout(timer);
        }
    }, [signal.music]);

    useEffect(() => {
        return () => {
            if (signalAudioInstance) {
                signalAudioInstance.pause();
                if (signalActiveSetPlaying) signalActiveSetPlaying(false);
                signalAudioInstance = null;
                signalActiveSetPlaying = null;
            }
        };
    }, []);

    const progressPercent = (currentTime / duration) * 100;

    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-[#0f0f0f]/80 glass-premium rounded-[48px] p-8 max-w-[440px] w-full shadow-2xl animate-in zoom-in duration-300 relative overflow-hidden flex flex-col items-center" onClick={e => e.stopPropagation()}>
                
                {/* Header Actions */}
                <div className="absolute top-8 left-8 right-8 flex justify-between items-center z-20">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-neutral-900">
                             {signal.photoURL ? <img src={signal.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-black text-xs text-neutral-500">{signal.userName.charAt(0)}</div>}
                        </div>
                        <span className="text-xs font-black text-white/90">{signal.userName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                         {isMe && (
                            <button onClick={async (e) => { 
                                e.stopPropagation(); 
                                if (window.confirm("Delete your current signal?")) {
                                    await remove(ref(database, `signals/${user?.uid}`));
                                    onClose();
                                }
                            }} className="p-2 text-neutral-500 hover:text-red-400 bg-white/5 rounded-xl transition-all" title="Remove Signal"><Trash size={18} /></button>
                         )}
                         <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white bg-white/5 rounded-xl transition-all"><X size={18} /></button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex flex-col items-center text-center mt-10 w-full">
                    {/* Disc Visual */}
                    <div className="relative mb-10">
                        <div className={`relative w-48 h-48 md:w-56 md:h-56 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-1 bg-black overflow-hidden border border-white/5
                            ${isPlaying ? 'animate-[spin_6s_linear_infinite]' : ''}
                        `}>
                            <div className="absolute inset-0 z-10 pointer-events-none" style={{ 
                                background: 'repeating-radial-gradient(circle, #1a1a1a 0px, #1a1a1a 1px, #111 2px, #111 3px)',
                                opacity: 0.5 
                            }}></div>
                            
                            <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-neutral-900 border-[10px] border-[#0a0a0a]">
                                <div className="w-[45%] h-[45%] rounded-full overflow-hidden relative border border-[#1a1a1a]">
                                    {highResArtwork ? (
                                        <img src={highResArtwork} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-3xl font-black text-white">{signal.userName.charAt(0)}</div>
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-3 h-3 bg-neutral-950 rounded-full border border-white/10 shadow-lg"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-1 mb-8 w-full px-2">
                        <h2 className="text-xl font-black text-white tracking-tight truncate leading-tight">
                            {signal.music ? signal.music.trackName : (signal.text || 'Thinking...')}
                        </h2>
                        <p className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em] truncate opacity-80">
                            {signal.music ? signal.music.artistName : 'Currently Feeling'}
                        </p>
                    </div>

                    {/* Text Overlay if present */}
                    {signal.text && signal.music && (
                        <div className="mb-8 px-6 py-4 bg-white/5 rounded-[28px] border border-white/5 w-full">
                            <p className="text-neutral-300 font-medium italic text-sm leading-relaxed">"{signal.text}"</p>
                        </div>
                    )}

                    {/* Music Player Bar */}
                    {signal.music && (
                        <div className="w-full space-y-6 mb-10 px-4">
                            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 transition-all duration-300 ease-linear shadow-[0_0_8px_rgba(99,102,241,0.6)]" style={{ width: `${progressPercent}%` }}></div>
                            </div>
                            <button 
                                onClick={togglePlayback}
                                className="w-16 h-16 bg-white text-black hover:bg-neutral-200 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all"
                            >
                                {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                            </button>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex w-full gap-3">
                        {!isMe && (
                            <button 
                                onClick={async () => {
                                    if (!user) return;
                                    const targetUid = signal.userUid;
                                    const convoId = [user.uid, targetUid].sort().join('_');
                                    const contextText = signal.text ? `Replying to your signal: "${signal.text}"\n\n` : `Replying to your vibe... \n\n`;
                                    
                                    const inboxRef = ref(database, `userInboxes/${user.uid}/${targetUid}`);
                                    const snap = await get(inboxRef);
                                    
                                    if (!snap.exists()) {
                                        await update(ref(database, `conversations/${convoId}`), { type: 'dm', members: { [user.uid]: true, [targetUid]: true }, createdAt: Date.now() });
                                        await set(inboxRef, { type: 'dm', name: signal.userName, photoURL: signal.photoURL || null, lastMessage: null, lastMessageAt: Date.now(), unreadCount: 0 });
                                        const theirInboxRef = ref(database, `userInboxes/${targetUid}/${user.uid}`);
                                        await set(theirInboxRef, { type: 'dm', name: user.displayName, photoURL: user.photoURL || null, lastMessage: null, lastMessageAt: Date.now(), unreadCount: 0 });
                                    }
                                    
                                    navigate(`/inbox?chatId=${targetUid}`);
                                    onClose();
                                }}
                                className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20"
                            >
                                <MessageCircle size={16} /> Reply Vibe
                            </button>
                        )}
                        {!isMe && (
                            <button 
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!user) return;
                                    const likeRef = ref(database, `signals/${signal.userUid}/likes/${user.uid}`);
                                    const snap = await get(likeRef);
                                    if (snap.exists()) await remove(likeRef);
                                    else await set(likeRef, true);
                                }}
                                className={`flex-1 py-4 rounded-[24px] transition-all active:scale-95 flex items-center justify-center gap-2 border ${signal.likes?.[user?.uid || ''] ? 'bg-red-500 border-red-400 text-white shadow-lg shadow-red-900/20' : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'}`}
                            >
                                <Heart size={16} className={signal.likes?.[user?.uid || ''] ? 'fill-current' : ''} />
                                <span className="text-[11px] font-black">{Object.keys(signal.likes || {}).length || ''}</span>
                            </button>
                        )}
                        {isMe && !signal.music && (
                            <button onClick={() => { onEditStatus?.(); }} className="w-full py-4 bg-white/5 hover:bg-white/10 text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest transition-all">Change status</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const SignalCreatorModal: React.FC<{ 
    onClose: () => void, 
    onPost: () => void, 
    text: string, 
    setText: (t: string) => void,
    music: MusicMetadata | null,
    setMusic: (m: MusicMetadata | null) => void
}> = ({ onClose, onPost, text, setText, music, setMusic }) => {
    const [showMusicPicker, setShowMusicPicker] = useState(false);

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in" onClick={onClose}>
            <div className="bg-[#0f0f0f] border border-white/10 rounded-[48px] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-black text-white flex items-center gap-3"><div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center"><Edit3 size={18} className="text-white" /></div> Circle Status</h3>
                    <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors"><X size={20} /></button>
                </div>

                <div className="space-y-6">
                    <div className="space-y-1">
                        <textarea 
                            autoFocus
                            value={text}
                            onChange={e => setText(e.target.value.slice(0, 60))}
                            placeholder="Share a snippet or vibe..."
                            className="w-full h-32 bg-white/[0.04] border border-white/10 rounded-[32px] p-6 text-white focus:outline-none focus:border-indigo-500 transition-all resize-none placeholder:text-neutral-700 font-bold"
                        />
                        <div className="flex justify-between items-center px-4">
                            <span className="text-[10px] font-black uppercase text-neutral-600 tracking-widest">{text.length}/60</span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em] ml-4">Mood Tune</h4>
                        <div className={`p-5 rounded-[32px] border transition-all duration-300 ${music ? 'bg-indigo-600/10 border-indigo-500/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                            {music ? (
                                <div className="flex items-center gap-4 animate-in slide-in-from-left-2">
                                    <img src={music.artworkUrl} className="w-12 h-12 rounded-2xl border border-white/10 shadow-lg" alt="Art" />
                                    <div className="flex-1 min-w-0 text-left">
                                        <span className="block text-xs font-black text-white truncate">{music.trackName}</span>
                                        <span className="block text-[9px] font-bold text-neutral-500 uppercase tracking-tighter truncate">{music.artistName}</span>
                                    </div>
                                    <button onClick={() => setMusic(null)} className="p-2.5 text-neutral-500 hover:text-red-400 bg-white/5 rounded-2xl"><Trash size={16} /></button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => setShowMusicPicker(true)}
                                    className="w-full flex flex-col items-center justify-center gap-3 py-4 text-neutral-400 hover:text-indigo-400 transition-all group"
                                >
                                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-500/10 transition-colors">
                                        <Music size={20} className="group-hover:scale-110 transition-transform" />
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-widest">Select Vibe</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <button 
                        onClick={onPost}
                        disabled={!text.trim() && !music}
                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:grayscale text-white font-black uppercase tracking-widest rounded-[32px] shadow-2xl shadow-indigo-900/40 active:scale-[0.98] transition-all text-sm"
                    >
                        Signal Circles
                    </button>
                </div>
            </div>
            {showMusicPicker && (
                <SignalMusicPicker 
                    onSelect={(m) => { setMusic(m); setShowMusicPicker(false); }} 
                    onClose={() => setShowMusicPicker(false)} 
                />
            )}
        </div>
    );
};

const SignalMusicPicker: React.FC<{ onSelect: (m: MusicMetadata) => void, onClose: () => void }> = ({ onSelect, onClose }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [trending, setTrending] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const fetchTrending = async () => {
            setLoading(true);
            try {
                const resp = await fetch(`https://itunes.apple.com/search?term=billboard+hot+100&media=music&entity=song&limit=15`);
                const data = await resp.json();
                setTrending(data.results || []);
            } catch (e) { console.error(e); }
            setLoading(false);
        };
        fetchTrending();
    }, []);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        try {
            const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=20`);
            const data = await resp.json();
            setResults(data.results || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const togglePreview = (url: string) => {
        if (previewingUrl === url) {
            audioRef.current?.pause();
            setPreviewingUrl(null);
        } else {
            if (audioRef.current) audioRef.current.pause();
            audioRef.current = new Audio(url);
            audioRef.current.play();
            setPreviewingUrl(url);
            audioRef.current.onended = () => setPreviewingUrl(null);
        }
    };

    useEffect(() => {
        return () => {
            audioRef.current?.pause();
            audioRef.current = null;
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[2100] flex items-end justify-center p-0 md:p-4 bg-black/60 backdrop-blur-xl animate-in fade-in" onClick={onClose}>
            <div className="bg-[#0f0f0f] border-t md:border border-white/10 w-full max-w-lg rounded-t-[48px] md:rounded-[48px] h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-20" onClick={e => e.stopPropagation()}>
                <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Music Archives</h3>
                    <button onClick={onClose} className="p-3 text-neutral-500 hover:text-white transition-colors bg-white/5 rounded-full"><X size={20} /></button>
                </div>

                <div className="px-8 py-6 shrink-0">
                    <div className="relative">
                        <Search size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-600" />
                        <input 
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="Find your frequency..."
                            className="w-full bg-white/5 border border-white/10 rounded-full pl-16 pr-8 py-5 text-white placeholder:text-neutral-700 focus:outline-none focus:border-indigo-500 transition-all font-bold"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-12 space-y-8">
                    {!query && trending.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="px-4 text-[10px] font-black uppercase text-indigo-500/80 tracking-[0.4em]">Billboard Hot 100</h4>
                            {trending.map(track => (
                                <TrackItem key={track.trackId} track={track} onSelect={onSelect} previewingUrl={previewingUrl} togglePreview={togglePreview} />
                            ))}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>
                    ) : results.length > 0 ? (
                        <div className="space-y-2">
                            <h4 className="px-4 text-[10px] font-black uppercase text-neutral-500 tracking-[0.4em]">Search Results</h4>
                            {results.map(track => (
                                <TrackItem key={track.trackId} track={track} onSelect={onSelect} previewingUrl={previewingUrl} togglePreview={togglePreview} />
                            ))}
                        </div>
                    ) : query && !loading && (
                        <div className="py-20 text-center text-neutral-700 text-[10px] font-black uppercase tracking-widest">No matching vibes found</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TrackItem: React.FC<{ track: any, onSelect: (m: MusicMetadata) => void, previewingUrl: string | null, togglePreview: (u: string) => void }> = ({ track, onSelect, previewingUrl, togglePreview }) => (
    <div 
        className="flex items-center gap-5 p-4 rounded-[32px] hover:bg-white/5 cursor-pointer transition-all group"
        onClick={() => onSelect({
            trackName: track.trackName,
            artistName: track.artistName,
            previewUrl: track.previewUrl,
            artworkUrl: track.artworkUrl100
        })}
    >
        <div className="relative shrink-0">
            <img src={track.artworkUrl100} className="w-14 h-14 rounded-2xl object-cover shadow-xl group-hover:scale-105 transition-transform" alt="Art" />
            <button 
                onClick={(e) => { e.stopPropagation(); togglePreview(track.previewUrl); }}
                className={`absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px] transition-opacity rounded-2xl ${previewingUrl === track.previewUrl ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
                {previewingUrl === track.previewUrl ? <Pause size={24} className="text-white fill-white" /> : <Play size={24} className="text-white fill-white" />}
            </button>
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{track.trackName}</p>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight truncate mt-1">{track.artistName}</p>
        </div>
        <div className="p-3 text-indigo-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-4 transition-all">
            <Plus size={20} />
        </div>
    </div>
);