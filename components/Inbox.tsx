import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
    VolumeX, Archive, Ban, Lock, Trash
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
  const urlChatId = searchParams.get('chatId');
  
  const [viewMode, setViewMode] = useState<'list' | 'create_group'>('list');
  const [showArchived, setShowArchived] = useState(false);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, { name: string, photoURL?: string }>>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [friendPresence, setFriendPresence] = useState<{online: boolean, lastSeen: number, activeChatId?: string} | null>(null);
  const [typingText, setTypingText] = useState('');
  const [inputText, setInputText] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [unsendConfirmId, setUnsendConfirmId] = useState<string | null>(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [listMenuId, setListMenuId] = useState<string | null>(null);
  const [listMenuPos, setListMenuPos] = useState<{ x: number, y: number } | null>(null);

  // Block & Social States
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [followers, setFollowers] = useState<Record<string, boolean>>({});
  const [iBlockedThem, setIBlockedThem] = useState<Record<string, boolean>>({}); 
  const [theyBlockedMe, setTheyBlockedMe] = useState<Record<string, boolean>>({}); 
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

  useEffect(() => {
    if (!user || !currentChatId) return;
    const pRef = ref(database, `presence/${user.uid}`);
    update(pRef, { activeChatId: currentChatId });
    return () => { update(pRef, { activeChatId: null }); };
  }, [user, currentChatId]);

  useEffect(() => {
    if (!user) return;
    onValue(ref(database, `following/${user.uid}`), (snap) => setFollowing(snap.val() || {}));
    onValue(ref(database, `followers/${user.uid}`), (snap) => setFollowers(snap.val() || {}));
    onValue(ref(database, `blocks/${user.uid}`), (snap) => setIBlockedThem(snap.val() || {}));
    onValue(ref(database, `mutedChats/${user.uid}`), (snap) => setMutedChats(snap.val() || {}));
    onValue(ref(database, `archivedChats/${user.uid}`), (snap) => setArchivedChats(snap.val() || {}));
  }, [user]);

  useEffect(() => {
    if (!user || !selectedChat || selectedChat.type !== 'dm') {
        setTheyBlockedMe({});
        return;
    }
    const targetUid = selectedChat.id;
    const refPath = ref(database, `blocks/${targetUid}/${user.uid}`);
    const unsub = onValue(refPath, (snap) => {
        setTheyBlockedMe(prev => ({ ...prev, [targetUid]: snap.exists() }));
    });
    return () => unsub();
  }, [user, selectedChat]);

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
    onChildAdded(inboxRef, handleInboxUpdate);
    onChildChanged(inboxRef, handleInboxUpdate);
    onChildRemoved(inboxRef, (snapshot) => {
        setChats(prev => prev.filter(c => c.id !== snapshot.key));
    });
    get(inboxRef).then(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (urlChatId && chats.length > 0 && (!selectedChat || selectedChat.id !== urlChatId)) {
        const found = chats.find(c => c.id === urlChatId);
        if (found) {
            setSelectedChat(found);
        } else {
            get(ref(database, `users/${urlChatId}`)).then(snap => {
                if (snap.exists()) {
                    const u = snap.val();
                    setSelectedChat({
                        id: urlChatId,
                        type: 'dm',
                        name: u.name || 'User',
                        photoURL: u.photoURL || undefined,
                        timestamp: Date.now()
                    });
                }
            });
        }
    }
  }, [urlChatId, chats]);

  useEffect(() => {
    if (!selectedChat) return;
    const attachListener = (uid: string) => {
      onValue(ref(database, `users/${uid}`), (snap) => {
        if (snap.exists()) {
          const data = snap.val();
          const isBlocked = iBlockedThem[uid] || theyBlockedMe[uid];
          setUserProfiles(prev => ({
            ...prev, [uid]: { name: isBlocked ? 'Wisp User' : data.name, photoURL: isBlocked ? undefined : data.photoURL }
          }));
        }
      });
    };
    if (selectedChat.type === 'dm') attachListener(selectedChat.id);
    else get(ref(database, `groupChats/${selectedChat.id}/members`)).then(snap => {
        if (snap.exists()) Object.keys(snap.val()).forEach(mid => attachListener(mid));
    });
  }, [selectedChat, iBlockedThem, theyBlockedMe]);

  const isCurrentChatBlocked = useMemo(() => {
    if (!selectedChat || selectedChat.type !== 'dm') return false;
    return iBlockedThem[selectedChat.id] || theyBlockedMe[selectedChat.id];
  }, [selectedChat, iBlockedThem, theyBlockedMe]);

  const isCurrentChatMutual = useMemo(() => {
    if (!selectedChat || selectedChat.type !== 'dm') return true;
    return following[selectedChat.id] && followers[selectedChat.id];
  }, [selectedChat, following, followers]);

  const filteredChats = useMemo(() => {
    return chats.filter(c => {
        if (!c || !c.id) return false;
        const isArchived = archivedChats[c.id];
        if (showArchived) return isArchived;
        if (isArchived) return false;
        if (c.type === 'group') return true;
        return following[c.id] && followers[c.id];
    });
  }, [chats, archivedChats, following, followers, showArchived]);

  useEffect(() => {
    if (!user || !selectedChat || !currentChatId) return;
    const messagesPath = selectedChat.type === 'dm' ? `messages/${currentChatId}` : `groupMessages/${selectedChat.id}`;
    const unsubMessages = onValue(ref(database, messagesPath), (snapshot) => {
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([key, val]: [string, any]) => ({ id: key, ...val })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(list);
        list.forEach(m => { if (m.senderUid !== user.uid && !m.seen) update(ref(database, `${messagesPath}/${m.id}`), { seen: true }); });
      } else { setMessages([]); }
    });
    update(ref(database, `userInboxes/${user.uid}/${selectedChat.id}`), { unreadCount: 0 });
    if (selectedChat.type === 'dm') onValue(ref(database, `presence/${selectedChat.id}`), (snap) => setFriendPresence(snap.val()));
    return () => unsubMessages();
  }, [selectedChat, currentChatId, user]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typingText]);

  const handleRemoveChat = async (chatId: string) => {
      if (!user) return;
      if (window.confirm("Remove this chat from your inbox? This only clears it from your list, no messages will be deleted.")) {
          await remove(ref(database, `userInboxes/${user.uid}/${chatId}`));
          if (selectedChat?.id === chatId) setSelectedChat(null);
          setListMenuId(null);
          setListMenuPos(null);
      }
  };

  const handleOpenListMenu = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setListMenuPos({ x: rect.right, y: rect.bottom });
    setListMenuId(chatId);
  };

  const sendMessage = async (e?: React.FormEvent, attachment?: { url: string, type: 'image' | 'video' }) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachment && !user || !selectedChat || !currentChatId) return;
    if (selectedChat.type === 'dm' && isCurrentChatBlocked) return;

    const msgText = inputText.trim();
    setInputText('');
    setReplyingTo(null);
    update(ref(database, `typing/${currentChatId}/${user.uid}`), { isTyping: false });

    const msgData: any = { 
        text: msgText, 
        senderUid: user?.uid, 
        senderName: user?.displayName, 
        timestamp: Date.now(), 
        seen: false,
        replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderName: replyingTo.senderName } : null
    };

    if (attachment) msgData.attachment = attachment;

    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    const newMsgRef = push(ref(database, `${basePath}/${currentChatId}`));
    await set(newMsgRef, msgData);

    const updateInbox = (uid: string, chatName: string, chatPhoto?: string) => {
      const targetIdForInbox = selectedChat.id === uid ? user?.uid : selectedChat.id;
      const inboxRef = ref(database, `userInboxes/${uid}/${targetIdForInbox}`);
      update(inboxRef, { 
          lastMessage: { text: attachment ? (attachment.type === 'image' ? 'Image' : 'Video') : msgText, timestamp: Date.now(), senderUid: user?.uid }, 
          lastMessageAt: Date.now(), 
          name: chatName, 
          photoURL: chatPhoto || null 
      });
    };

    if (selectedChat.type === 'dm') {
      updateInbox(user!.uid, selectedChat.name, selectedChat.photoURL);
      updateInbox(selectedChat.id, user!.displayName || 'User', user!.photoURL || undefined);
    }
  };

  const handleUnsend = async (msgId: string) => {
    if (!currentChatId || !selectedChat) return;
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    await remove(ref(database, `${basePath}/${currentChatId}/${msgId}`));
    setUnsendConfirmId(null);
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    if (!currentChatId || !selectedChat || !user) return;
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    const reactionRef = ref(database, `${basePath}/${currentChatId}/${msgId}/reactions/${user.uid}`);
    const snap = await get(reactionRef);
    if (snap.exists() && snap.val() === emoji) {
        await remove(reactionRef);
    } else {
        await set(reactionRef, emoji);
    }
    setActiveReactionPickerId(null);
  };

  const lastSentMessageByMe = useMemo(() => {
    if (!user || !messages) return null;
    const myMessages = messages.filter(m => m.senderUid === user.uid && !m.system && !m.deleted);
    return myMessages.length > 0 ? myMessages[myMessages.length - 1] : null;
  }, [messages, user]);

  if (loading && !chats.length) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="flex h-full bg-neutral-950 overflow-hidden font-sans">
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-neutral-900 bg-neutral-950 shrink-0`}>
        <div className="p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/50 backdrop-blur-xl sticky top-0 z-20">
          <h1 className="text-2xl font-black text-white tracking-tight">{showArchived ? 'Archive' : 'Messages'}</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowArchived(!showArchived)} className={`p-2 rounded-xl transition-all ${showArchived ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`} title="Archived Chats"><Archive size={20} /></button>
            <button onClick={() => setViewMode(viewMode === 'list' ? 'create_group' : 'list')} className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all active:scale-90">{viewMode === 'list' ? <Plus size={20} /> : <X size={20} />}</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {viewMode === 'list' ? (
            filteredChats.length > 0 ? (
                filteredChats.map(chat => {
                const isSelected = selectedChat?.id === chat.id;
                return (
                  <div key={chat.id} className="relative group/item">
                      <button 
                        onClick={() => setSelectedChat(chat)} 
                        className={`w-full flex items-center gap-4 p-4 rounded-[24px] transition-all relative ${isSelected ? 'bg-white/10 backdrop-blur-xl border border-white/10 shadow-xl opacity-100' : 'hover:bg-white/[0.04] opacity-80 hover:opacity-100'}`}
                      >
                        <div className="relative shrink-0">
                          {chat.photoURL ? <img src={chat.photoURL} className="w-14 h-14 rounded-full object-cover" /> : <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${isSelected ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'}`}>{chat.name.charAt(0)}</div>}
                          {chat.unreadCount ? chat.unreadCount > 0 && <div className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-neutral-950">{chat.unreadCount}</div> : null}
                        </div>
                        <div className="flex-1 text-left overflow-hidden">
                          <div className="flex justify-between items-baseline mb-0.5">
                            <span className={`font-bold truncate text-base ${isSelected ? 'text-white' : 'text-neutral-200'}`}>{chat.name}</span>
                            <span className={`text-[10px] uppercase font-black shrink-0 ml-2 ${isSelected ? 'text-white/60' : 'text-neutral-500'}`}>{new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className={`text-sm truncate font-medium ${isSelected ? 'text-white/80' : 'text-neutral-500'}`}>{chat.lastMessage?.senderUid === user?.uid && 'You: '}{chat.lastMessage?.text || 'No messages yet'}</p>
                        </div>
                        
                        <div className={`absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity z-10`}>
                             <button 
                                onClick={(e) => handleOpenListMenu(e, chat.id)}
                                className="p-2 bg-neutral-950/90 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-full border border-white/10 shadow-lg"
                             >
                                 <MoreVertical size={16} />
                             </button>
                        </div>
                      </button>
                  </div>
                );
              })
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <div className="w-16 h-16 bg-neutral-900 rounded-[20px] flex items-center justify-center mb-4 text-neutral-700">
                        {showArchived ? <Archive size={32} /> : <MessageCircle size={32} />}
                    </div>
                    <h3 className="text-white font-bold mb-1">{showArchived ? 'No archived chats' : 'No chats yet'}</h3>
                    <p className="text-neutral-500 text-sm">{showArchived ? 'Conversations you archive will appear here.' : 'Mutual followers will appear here.'}</p>
                </div>
            )
          ) : (
            <div className="space-y-6 p-2">
                <div className="space-y-2"><label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Group Name</label><input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="E.g. Study Squad" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-bold" /></div>
                <button onClick={() => setViewMode('list')} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black transition-all">Back</button>
            </div>
          )}
        </div>
      </div>

      {selectedChat ? (
        <div className="flex-1 flex flex-col bg-neutral-950 relative overflow-hidden">
          {chatLoading ? (
              <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                      <Loader2 className="animate-spin text-indigo-500" size={32} />
                      <span className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Opening Chat...</span>
                  </div>
              </div>
          ) : (
            <>
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
                <button onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)} className={`p-3 rounded-2xl transition-all ${isHeaderMenuOpen ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}>
                    <MoreVertical size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 pb-20" ref={scrollContainerRef}>
                {messages.map((msg) => {
                  const isMe = msg.senderUid === user?.uid;
                  const reactions = msg.reactions ? Object.entries(msg.reactions) : [];
                  const isLastSentByMe = msg.id === lastSentMessageByMe?.id;

                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg relative mb-1`}>
                      <div className={`flex gap-2 max-w-[85%] md:max-w-[70%] ${isMe ? 'flex-row-reverse' : 'items-end'}`}>
                        <div className="flex flex-col min-w-0 relative">
                            <div className={`px-4 py-2.5 rounded-[22px] text-sm leading-relaxed break-words relative group ${isMe ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-3xl rounded-br-lg' : 'bg-[#1f1f1f] text-neutral-200 rounded-3xl rounded-bl-lg border border-white/5'}`}>
                                <p className="inline-block whitespace-pre-wrap">{msg.text}</p>
                                {reactions.length > 0 && (
                                    <div className={`absolute -bottom-2 ${isMe ? 'right-2' : 'left-2'} flex gap-1 bg-neutral-900 border border-white/10 rounded-full px-1.5 py-0.5 shadow-xl`}>
                                        {reactions.map(([uid, emoji]) => <span key={uid} className="text-[10px] animate-reaction-bounce">{emoji as string}</span>)}
                                    </div>
                                )}
                                <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'right-full mr-2' : 'left-full ml-2'}`}>
                                    <button onClick={() => setReplyingTo(msg)} className="p-1.5 text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"><Reply size={14} /></button>
                                    <button onClick={() => setActiveReactionPickerId(msg.id)} className="p-1.5 text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"><SmilePlus size={14} /></button>
                                    {isMe && <button onClick={() => setUnsendConfirmId(msg.id)} className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"><Trash size={14} /></button>}
                                </div>
                            </div>
                        </div>
                      </div>
                      {isLastSentByMe && (
                          <div className="flex items-center gap-1 mt-1 mr-1 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                            {msg.seen ? <><CheckCheck size={12} className="text-indigo-500" /> Seen</> : <><Check size={12} /> Sent</>}
                          </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 md:p-6 bg-neutral-950 border-t border-neutral-900 z-30">
                <div className="flex gap-3 items-end max-w-5xl mx-auto">
                    <div className="flex-1 bg-white/[0.04] border border-white/5 rounded-[28px] p-1.5 flex items-end">
                        <textarea 
                            rows={1} 
                            value={inputText} 
                            onChange={(e) => setInputText(e.target.value)} 
                            placeholder="Message…" 
                            className="flex-1 bg-transparent border-none text-white text-[15px] px-4 py-2.5 focus:outline-none resize-none" 
                        />
                    </div>
                    <button 
                        onClick={() => sendMessage()} 
                        className="bg-indigo-600 text-white p-3.5 rounded-full hover:bg-indigo-500 shadow-lg"
                    >
                        <Send size={20} />
                    </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-neutral-950 text-center px-12">
           <div className="w-24 h-24 bg-neutral-900 border border-white/5 rounded-[32px] flex items-center justify-center mb-8"><MessageCircle size={40} className="text-indigo-500" /></div>
           <h2 className="text-3xl font-black text-white tracking-tight mb-3">Select a conversation</h2>
           <p className="text-neutral-500 max-w-xs leading-relaxed">Choose a mutual follower to start chatting.</p>
        </div>
      )}

      {/* PORTAL MENU FOR LIST REMOVAL */}
      {listMenuId && listMenuPos && createPortal(
          <div className="fixed inset-0 z-[9999]">
              <div className="absolute inset-0 bg-transparent" onClick={() => { setListMenuId(null); setListMenuPos(null); }}></div>
              <div 
                  style={{ 
                      position: 'fixed', 
                      top: `${listMenuPos.y + 8}px`, 
                      left: `${listMenuPos.x - 192}px`, // Adjust based on width 48 (192px)
                      zIndex: 10000 
                  }}
                  className="w-48 bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-[20px] shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-200 origin-top-right"
              >
                  <button 
                      onClick={() => handleRemoveChat(listMenuId)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                  >
                      <Trash2 size={18} /> Remove Chat
                  </button>
                  <button 
                      onClick={() => { setListMenuId(null); setListMenuPos(null); }}
                      className="w-full px-4 py-2.5 text-[10px] font-black text-neutral-500 uppercase tracking-widest text-center hover:text-white transition-colors"
                  >
                      Cancel
                  </button>
              </div>
          </div>,
          document.body
      )}

      {unsendConfirmId && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-neutral-900 border border-white/10 rounded-[32px] p-8 max-w-xs w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="w-16 h-16 bg-red-500/10 rounded-[24px] flex items-center justify-center mx-auto mb-6">
                      <AlertCircle size={32} className="text-red-500" />
                  </div>
                  <h3 className="text-xl font-black text-white mb-2">Unsend message?</h3>
                  <p className="text-neutral-400 text-sm mb-8">This will permanently remove the message for everyone.</p>
                  <div className="flex flex-col gap-2">
                      <button onClick={() => handleUnsend(unsendConfirmId)} className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl transition-all shadow-lg active:scale-[0.98]">Unsend</button>
                      <button onClick={() => setUnsendConfirmId(null)} className="w-full py-3.5 bg-neutral-800 text-neutral-400 hover:text-white font-black rounded-2xl transition-all">Cancel</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
