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

export const Inbox: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlChatId = searchParams.get('chatId');
  
  const [viewMode, setViewMode] = useState<'list' | 'create_group'>('list');
  const [showArchived, setShowArchived] = useState(false);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(urlChatId);

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
  const [loading, setLoading] = useState(true);
  const [unsendConfirmId, setUnsendConfirmId] = useState<string | null>(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [groupAdmins, setGroupAdmins] = useState<Record<string, boolean>>({});
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [followers, setFollowers] = useState<Record<string, boolean>>({});
  const [archivedChats, setArchivedChats] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  const selectedChat = useMemo(() => {
    if (!activeChatId) return null;
    return chats.find(c => c.id === activeChatId) || null;
  }, [chats, activeChatId]);

  // --- SCROLL MANAGEMENT ---
  const isOpeningChat = useRef(false);

  useEffect(() => {
    if (activeChatId) {
      isOpeningChat.current = true;
    }
  }, [activeChatId]);

  useLayoutEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      if (isOpeningChat.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        isOpeningChat.current = false;
      } else {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [messages]);

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
                    // Constant profile pfp sync
                    onValue(ref(database, `users/${chat.id}`), (uSnap) => {
                        if (uSnap.exists()) setUserProfiles(prev => ({ ...prev, [chat.id]: uSnap.val() }));
                    });
                    // Constant presence sync
                    onValue(ref(database, `presence/${chat.id}`), (pSnap) => {
                        if (pSnap.exists()) setListPresences(prev => ({ ...prev, [chat.id]: pSnap.val() }));
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
        const unsub = onValue(ref(database, `presence/${activeChatId}`), (snap) => {
            setFriendPresence(snap.val());
        });
        return () => unsub();
    }
  }, [activeChatId, selectedChat]);

  const currentConvoId = useMemo(() => {
    if (!user || !activeChatId || !selectedChat) return null;
    return selectedChat.type === 'dm' ? [user.uid, activeChatId].sort().join('_') : activeChatId;
  }, [user, activeChatId, selectedChat]);

  useEffect(() => {
    if (!user || !activeChatId || !currentConvoId) return;
    const path = selectedChat?.type === 'dm' ? `messages/${currentConvoId}` : `groupMessages/${activeChatId}`;
    const unsub = onValue(ref(database, path), (snapshot) => {
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([id, val]: [string, any]) => ({ id, ...val })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(list);
        list.forEach(m => {
            if (m.senderUid !== user.uid && !m.seen) update(ref(database, `${path}/${m.id}`), { seen: true });
        });
        update(ref(database, `userInboxes/${user.uid}/${activeChatId}`), { unreadCount: 0 });
      } else { setMessages([]); }
    });
    return () => unsub();
  }, [activeChatId, currentConvoId, user, selectedChat?.type]);

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
    setTimeout(() => {
        if (messageInputRef.current) {
            messageInputRef.current.focus();
            const len = messageInputRef.current.value.length;
            messageInputRef.current.setSelectionRange(len, len);
        }
    }, 0);
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !user || !activeChatId || !selectedChat || !currentConvoId) return;
    const msgText = inputText.trim();
    const ts = Date.now();
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
    const path = selectedChat?.type === 'dm' ? `messages/${currentConvoId}/${msgId}` : `groupMessages/${activeChatId}/${msgId}`;
    await remove(ref(database, path));
    setUnsendConfirmId(null);
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    const path = selectedChat?.type === 'dm' ? `messages/${currentConvoId}/${msgId}/reactions/${user!.uid}` : `groupMessages/${activeChatId}/${msgId}/reactions/${user!.uid}`;
    const snap = await get(ref(database, path));
    if (snap.exists() && snap.val() === emoji) await remove(ref(database, path));
    else await set(ref(database, path), emoji);
    setActiveReactionPickerId(null);
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
      {/* --- SIDEBAR --- */}
      <div className={`${activeChatId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-neutral-900 bg-neutral-950 shrink-0`}>
        <div className="p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/50 backdrop-blur-xl sticky top-0 z-20">
          <h1 className="text-2xl font-black text-white tracking-tight">{showArchived ? 'Archive' : 'Messages'}</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowArchived(!showArchived)} className={`p-2 rounded-xl transition-colors ${showArchived ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}><Archive size={20} /></button>
            <button onClick={() => setViewMode(viewMode === 'list' ? 'create_group' : 'list')} className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors">{viewMode === 'list' ? <Plus size={20} /> : <X size={20} />}</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {filteredChats.map(chat => {
            const isSelected = activeChatId === chat.id;
            const profile = userProfiles[chat.id];
            const presence = listPresences[chat.id];
            const photo = chat.type === 'dm' ? profile?.photoURL : chat.photoURL;
            const name = chat.type === 'dm' ? profile?.name || chat.name : chat.name;
            return (
              <button 
                key={chat.id} 
                onClick={() => { setActiveChatId(chat.id); navigate(`/inbox?chatId=${chat.id}`, { replace: true }); }} 
                className={`w-full flex items-center gap-4 p-4 rounded-[24px] relative border ${isSelected ? 'bg-white/10 backdrop-blur-xl border-white/10' : 'hover:bg-white/[0.04] border-transparent'}`}
              >
                <div className="relative shrink-0">
                  {photo ? <img src={photo} className="w-14 h-14 rounded-full object-cover border border-white/5" /> : <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center text-xl font-bold text-neutral-500">{name.charAt(0)}</div>}
                  {chat.type === 'dm' && <div className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-neutral-950 ${presence?.online ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div>}
                  {chat.unreadCount ? <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full border-2 border-neutral-950 flex items-center justify-center text-[10px] font-black text-white">{chat.unreadCount}</div> : null}
                </div>
                <div className="flex-1 text-left min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                        <span className="font-bold text-white truncate">{name}</span>
                        {chat.type === 'group' && <Users size={12} className="text-neutral-600" />}
                    </div>
                    <p className={`text-sm truncate ${chat.unreadCount ? 'text-neutral-200 font-medium' : 'text-neutral-500'}`}>{chat.lastMessage?.senderUid === user?.uid && 'You: '}{chat.lastMessage?.text || 'No messages'}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* --- CHAT AREA --- */}
      {activeChatId && selectedChat ? (
        <div className="flex-1 flex flex-col bg-neutral-950 relative overflow-hidden">
          <div className="p-4 md:p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/80 backdrop-blur-2xl z-20">
            <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setActiveChatId(null)} className="md:hidden p-2 text-neutral-500 hover:text-white"><ArrowLeft size={24} /></button>
              <div className="cursor-pointer relative" onClick={() => navigate(selectedChat.type === 'dm' ? `/profile/${activeChatId}` : `/group/${activeChatId}/settings`)}>
                  { (selectedChat.type === 'dm' ? userProfiles[activeChatId]?.photoURL : selectedChat.photoURL) ? <img src={selectedChat.type === 'dm' ? userProfiles[activeChatId]?.photoURL : selectedChat.photoURL} className="w-11 h-11 rounded-full object-cover border border-white/5 shadow-lg" /> : <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{(selectedChat.type === 'dm' ? userProfiles[activeChatId]?.name : selectedChat.name)?.charAt(0)}</div> }
                  {selectedChat.type === 'dm' && friendPresence?.online && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-neutral-950 shadow-sm animate-pulse"></div>}
              </div>
              <div className="flex flex-col min-w-0">
                  <span className="font-bold text-white truncate text-base md:text-lg">{selectedChat.type === 'dm' ? (userProfiles[activeChatId]?.name || selectedChat.name) : selectedChat.name}</span>
                  <span className="text-[10px] uppercase font-black text-neutral-500 tracking-wider">{selectedChat.type === 'dm' ? (friendPresence?.online ? 'Online' : 'Offline') : `${Object.keys(selectedChat.members || {}).length} Members ${isAdmin ? '• Admin' : ''}`}</span>
              </div>
            </div>
            <button onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)} className={`p-3 rounded-2xl transition-colors ${isHeaderMenuOpen ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}><MoreVertical size={20} /></button>
            {isHeaderMenuOpen && (
                <div className="absolute right-6 top-20 w-48 bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-1 z-50 animate-in zoom-in">
                    {selectedChat.type === 'group' && <button onClick={() => { setIsHeaderMenuOpen(false); navigate(`/group/${activeChatId}/settings`); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-xl"><Settings size={18} /> Group Details</button>}
                    <button onClick={() => { setIsHeaderMenuOpen(false); navigate(selectedChat.type === 'dm' ? `/profile/${activeChatId}` : `/group/${activeChatId}/settings`); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-xl"><UserCircle2 size={18} /> View {selectedChat.type === 'dm' ? 'Profile' : 'Members'}</button>
                </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4" ref={scrollContainerRef}>
            {messages.map((msg) => {
              const isMe = msg.senderUid === user?.uid;
              const senderPfp = userProfiles[msg.senderUid]?.photoURL;
              const reactions = Object.entries(msg.reactions || {});
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg relative mb-2`}>
                   <div className={`flex gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMe && (
                        <div className="shrink-0 self-end mb-1">
                          {senderPfp ? <img src={senderPfp} className="w-8 h-8 rounded-full object-cover border border-white/5" /> : <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-neutral-500">?</div>}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0 relative">
                        {selectedChat.type === 'group' && !isMe && <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3 mb-1">{msg.senderName} {groupAdmins[msg.senderUid] && <ShieldCheck size={10} className="inline ml-1 text-indigo-400" />}</span>}
                        <div onDoubleClick={() => handleReaction(msg.id, '❤️')} className={`rounded-[22px] px-4 py-2.5 shadow-lg cursor-pointer relative ${isMe ? 'bg-indigo-600 text-white rounded-br-lg' : 'bg-[#1f1f1f] text-neutral-200 rounded-bl-lg border border-white/5'}`}>
                            {msg.replyTo && (
                                <div className="bg-white/5 rounded-lg py-1.5 px-2.5 mb-2 border-l-2 border-indigo-500/50 text-xs italic opacity-80 inline-block max-w-full">
                                    <span className="block font-black uppercase text-[8px] not-italic text-indigo-400 mb-0.5">{msg.replyTo.senderName}</span>
                                    {msg.replyTo.text}
                                </div>
                            )}
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                            {isMe && (
                                <div className="absolute -bottom-5 right-0 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                    <span className="text-[9px] font-black uppercase text-neutral-500 tracking-tighter">{msg.seen ? 'Seen' : 'Sent'}</span>
                                    {msg.seen ? <CheckCheck size={12} className="text-indigo-500" /> : <Check size={12} className="text-neutral-600" />}
                                </div>
                            )}
                        </div>
                        {reactions.length > 0 && <div className={`absolute -bottom-2 ${isMe ? 'right-2' : 'left-2'} flex gap-1 bg-neutral-900 border border-white/10 rounded-full px-1.5 py-0.5 shadow-xl z-10 animate-in zoom-in`}>{reactions.map(([uid, emoji]) => <span key={uid} className="text-[10px]">{emoji as string}</span>)}</div>}
                        <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-all ${isMe ? 'right-full mr-3' : 'left-full ml-3'}`}>
                            <button onClick={() => setReplyingTo(msg)} className="p-2 text-neutral-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-full"><Reply size={16} /></button>
                            <button onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setReactionPickerPos({ x: rect.left, y: rect.top, isMe }); setActiveReactionPickerId(msg.id); }} className="p-2 text-neutral-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-full"><SmilePlus size={16} /></button>
                            {(isMe || isAdmin || isHost) && <button onClick={() => setUnsendConfirmId(msg.id)} className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-full"><Trash size={16} /></button>}
                        </div>
                      </div>
                   </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 md:p-6 bg-neutral-950 border-t border-neutral-900 z-30">
              <div className="max-w-5xl mx-auto flex flex-col gap-2 relative">
                  {replyingTo && (
                    <div className="flex items-center justify-between bg-white/[0.04] backdrop-blur-3xl px-4 py-2.5 rounded-[18px] border border-white/5 mb-2 animate-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-1 h-6 bg-indigo-500 rounded-full shrink-0"></div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">{replyingTo.senderName}</span>
                                <span className="text-xs text-neutral-400 truncate opacity-80">{replyingTo.text}</span>
                            </div>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="p-1 text-neutral-500 hover:text-white bg-white/5 rounded-full"><X size={14} /></button>
                    </div>
                  )}
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 bg-white/[0.04] border border-white/5 rounded-[28px] p-1.5 flex items-end">
                      <button onClick={() => {}} className="p-3 text-neutral-500 hover:text-indigo-400"><Paperclip size={20} /></button>
                      <textarea ref={messageInputRef} rows={1} value={inputText} onChange={e => { setInputText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Message..." className="flex-1 bg-transparent border-none text-white text-[15px] px-3 py-2.5 focus:outline-none resize-none max-h-40 overflow-y-auto custom-scrollbar" />
                      <button ref={emojiButtonRef} onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-3 rounded-full transition-colors ${showEmojiPicker ? 'text-indigo-400 bg-white/10' : 'text-neutral-500 hover:text-indigo-400'}`}><Smile size={20} /></button>
                    </div>
                    <button onClick={() => sendMessage()} disabled={!inputText.trim()} className={`p-4 rounded-full transition-all shadow-lg active:scale-95 ${inputText.trim() ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-600'}`}><Send size={20} /></button>
                  </div>
              </div>
          </div>
        </div>
      ) : ( <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-neutral-950 text-center px-12"><MessageCircle size={48} className="text-neutral-800 mb-4 opacity-50" /><h2 className="text-2xl font-black text-white mb-2">Select a conversation</h2><p className="text-neutral-600 text-sm">Choose a friend or group to start chatting.</p></div> )}
    </div>
  );
};