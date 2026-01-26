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
    SmilePlus, Paperclip, Play, Image as ImageIcon, Film, MoreVertical
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
  const [typingText, setTypingText] = useState('');
  const [inputText, setInputText] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (chats.length > 0) {
        const targetChatId = searchParams.get('chatId');
        if (targetChatId) {
            const targetChat = chats.find(c => c.id === targetChatId);
            if (targetChat) setSelectedChat(targetChat);
        }
    }
  }, [chats, searchParams]);

  useEffect(() => {
    if (!user || !selectedChat || !currentChatId) return;

    const messagesPath = selectedChat.type === 'dm' ? `messages/${currentChatId}` : `groupMessages/${selectedChat.id}`;
    const unsubMessages = onValue(ref(database, messagesPath), (snapshot) => {
      if (snapshot.exists()) {
        const list = Object.entries(snapshot.val()).map(([key, val]: [string, any]) => ({ id: key, ...val })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(list);
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

    if (selectedChat.type === 'group') {
        onValue(ref(database, `groupChats/${selectedChat.id}`), (snap) => {
            if (snap.exists()) setActiveGroupData(snap.val());
        });
    }

    return () => { unsubMessages(); unsubTyping(); };
  }, [selectedChat, currentChatId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingText]);

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

    const msgText = inputText.trim();
    setInputText('');
    setReplyingTo(null);
    update(ref(database, `typing/${currentChatId}/${user.uid}`), { isTyping: false });

    const msgData: any = {
      text: msgText,
      senderUid: user?.uid,
      senderName: user?.displayName,
      timestamp: Date.now(),
      replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderName: replyingTo.senderName } : null
    };

    if (attachment) {
        msgData.attachment = attachment;
    }

    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    const newMsgRef = push(ref(database, `${basePath}/${currentChatId}`));
    await set(newMsgRef, msgData);

    const updateInbox = (uid: string, chatName: string, chatPhoto?: string) => {
      const targetChatIdForInbox = selectedChat.id === uid ? user?.uid : selectedChat.id;
      const inboxRef = ref(database, `userInboxes/${uid}/${targetChatIdForInbox}`);
      update(inboxRef, {
        lastMessage: { text: attachment ? (attachment.type === 'image' ? 'Sent an image' : 'Sent a video') : msgText, timestamp: Date.now(), senderUid: user?.uid },
        lastMessageAt: Date.now(),
        name: chatName,
        photoURL: chatPhoto || null
      });
      if (uid !== user?.uid) {
          get(inboxRef).then(snap => {
              const currentUnread = snap.val()?.unreadCount || 0;
              update(inboxRef, { unreadCount: currentUnread + 1 });
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

    // Check video duration (simplified as standard HTML5 video tag doesn't provide it until loaded)
    // We assume the user respects the 1 min limit or add a soft check on size.
    if (file.type.startsWith('video/') && file.size > 50 * 1024 * 1024) { // Roughly 50MB
        alert("Video too large. Please keep it under 1 minute.");
        return;
    }

    setIsUploadingMedia(true);
    try {
        const url = await uploadImageToCloudinary(file);
        const type = file.type.startsWith('image/') ? 'image' : 'video';
        await sendMessage(undefined, { url, type });
    } catch (err) {
        console.error("Upload failed", err);
        alert("Failed to upload media.");
    } finally {
        setIsUploadingMedia(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim() || selectedGroupMembers.size === 0 || !user) return;
    setLoading(true);
    const groupId = `group_${Date.now()}`;
    const members: any = { [user.uid]: Date.now() };
    selectedGroupMembers.forEach(mid => { members[mid] = Date.now(); });

    const groupData = {
      id: groupId,
      name: newGroupName,
      members,
      admins: { [user.uid]: true },
      hostUid: user.uid,
      createdAt: Date.now(),
      type: 'group'
    };

    await set(ref(database, `groupChats/${groupId}`), groupData);
    
    const systemMsg = { text: `${user.displayName} created the group`, system: true, timestamp: Date.now() };
    await push(ref(database, `groupMessages/${groupId}`), systemMsg);

    const promises = Object.keys(members).map(mid => {
      return set(ref(database, `userInboxes/${mid}/${groupId}`), {
        type: 'group',
        name: newGroupName,
        lastMessage: systemMsg,
        lastMessageAt: Date.now(),
        unreadCount: mid === user.uid ? 0 : 1
      });
    });

    await Promise.all(promises);
    setViewMode('list');
    setLoading(false);
  };

  const lastSentMessageByMe = useMemo(() => {
    const myMsgs = messages.filter(m => m.senderUid === user?.uid);
    return myMsgs.length > 0 ? myMsgs[myMsgs.length - 1] : null;
  }, [messages, user]);

  if (loading && !chats.length) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="flex h-full bg-neutral-950 overflow-hidden font-sans">
      {/* Sidebar - Chat List */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-neutral-900 bg-neutral-950 shrink-0`}>
        <div className="p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/50 backdrop-blur-xl sticky top-0 z-20">
          <h1 className="text-2xl font-black text-white tracking-tight">Messages</h1>
          <button 
            onClick={() => setViewMode(viewMode === 'list' ? 'create_group' : 'list')}
            className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all active:scale-90"
          >
            {viewMode === 'list' ? <Plus size={20} /> : <X size={20} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {viewMode === 'list' ? (
            chats.length > 0 ? (
              chats.map(chat => (
                <button 
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={`w-full flex items-center gap-4 p-4 rounded-[24px] transition-all group ${selectedChat?.id === chat.id ? 'bg-white/10 backdrop-blur-xl border border-white/10 shadow-xl' : 'hover:bg-white/[0.04]'}`}
                >
                  <div className="relative shrink-0">
                    {chat.photoURL ? (
                      <img src={chat.photoURL} className="w-14 h-14 rounded-[18px] object-cover" />
                    ) : (
                      <div className={`w-14 h-14 rounded-[18px] flex items-center justify-center text-xl font-bold ${selectedChat?.id === chat.id ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'}`}>
                        {chat.name.charAt(0)}
                      </div>
                    )}
                    {chat.unreadCount ? chat.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-neutral-950">
                        {chat.unreadCount}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className={`font-bold truncate text-base ${selectedChat?.id === chat.id ? 'text-white' : 'text-neutral-200'}`}>{chat.name}</span>
                      <span className={`text-[10px] uppercase font-black shrink-0 ml-2 ${selectedChat?.id === chat.id ? 'text-white/60' : 'text-neutral-500'}`}>
                        {new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={`text-sm truncate font-medium ${selectedChat?.id === chat.id ? 'text-white/80' : 'text-neutral-500'}`}>
                      {chat.lastMessage?.senderUid === user?.uid && 'You: '}{chat.lastMessage?.text || 'No messages yet'}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="w-16 h-16 bg-neutral-900 rounded-[20px] flex items-center justify-center mb-4 text-neutral-700"><MessageCircle size={32} /></div>
                <h3 className="text-white font-bold mb-1">No chats yet</h3>
                <p className="text-neutral-500 text-sm">Add friends from search to start a conversation.</p>
              </div>
            )
          ) : (
            <div className="space-y-6 p-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Group Name</label>
                  <input 
                    value={newGroupName} 
                    onChange={e => setNewGroupName(e.target.value)} 
                    placeholder="E.g. Study Squad" 
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-bold"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Select Members</label>
                  {myFriends.length > 0 ? (
                    myFriends.map(friend => (
                      <button 
                        key={friend.uid}
                        onClick={() => {
                          const s = new Set(selectedGroupMembers);
                          s.has(friend.uid) ? s.delete(friend.uid) : s.add(friend.uid);
                          setSelectedGroupMembers(s);
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all ${selectedGroupMembers.has(friend.uid) ? 'bg-indigo-600/10 border-indigo-500/50' : 'bg-transparent border-white/5 hover:bg-white/5'}`}
                      >
                        <div className="flex items-center gap-3">
                          {friend.photoURL ? <img src={friend.photoURL} className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs text-neutral-500">{friend.name.charAt(0)}</div>}
                          <span className="text-sm font-bold text-neutral-300">{friend.name}</span>
                        </div>
                        {selectedGroupMembers.has(friend.uid) ? <CheckCircle2 size={18} className="text-indigo-400" /> : <Circle size={18} className="text-neutral-700" />}
                      </button>
                    ))
                  ) : <p className="text-xs text-neutral-600 italic px-3">You need friends to create a group.</p>}
                </div>
                <button 
                  onClick={createGroup}
                  disabled={!newGroupName.trim() || selectedGroupMembers.size === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-900/20 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all"
                >
                  Create Study Group
                </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col bg-neutral-950 relative overflow-hidden">
          {/* Top Bar */}
          <div className="p-4 md:p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/80 backdrop-blur-2xl z-20">
            <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 text-neutral-500 hover:text-white transition-colors"><ArrowLeft size={24} /></button>
              <div className="relative cursor-pointer" onClick={() => navigate(selectedChat.type === 'dm' ? `/profile/${selectedChat.id}` : `/group/${selectedChat.id}/settings`)}>
                {selectedChat.photoURL ? (
                  <img src={selectedChat.photoURL} className="w-12 h-12 rounded-[16px] object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-[16px] bg-neutral-800 flex items-center justify-center text-lg font-bold text-neutral-500">
                    {selectedChat.name.charAt(0)}
                  </div>
                )}
                {selectedChat.type === 'dm' && friendPresence?.online && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-neutral-950"></div>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-white truncate leading-tight text-lg">{selectedChat.name}</span>
                <span className="text-[10px] uppercase font-black text-neutral-500 tracking-wider">
                  {selectedChat.type === 'dm' ? (friendPresence?.online ? 'Online' : 'Offline') : 'Group Chat'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
                {selectedChat.type === 'group' && (
                  <button onClick={() => navigate(`/group/${selectedChat.id}/settings`)} className="p-3 text-neutral-500 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
                    <Settings size={20} />
                  </button>
                )}
                <button className="p-3 text-neutral-500 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
                  <MoreVertical size={20} />
                </button>
            </div>
          </div>

          {/* Messages Window */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4" ref={scrollContainerRef}>
            {messages.map((msg, index) => {
              if (msg.system) return (
                <div key={msg.id} className="w-full flex justify-center py-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="bg-white/5 border border-white/5 rounded-full px-4 py-1 text-[10px] text-neutral-500 font-bold uppercase tracking-widest">{msg.text}</div>
                </div>
              );

              const isMe = msg.senderUid === user?.uid;
              const showAvatar = !isMe && selectedChat.type === 'group';
              const showSenderName = !isMe && selectedChat.type === 'group' && (index === 0 || messages[index-1].senderUid !== msg.senderUid);
              const isLastSentByMe = msg.id === lastSentMessageByMe?.id;

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg animate-in ${isMe ? 'fade-in slide-in-from-right-4' : 'fade-in slide-in-from-left-4'} duration-200`}>
                  <div className={`flex gap-3 max-w-[85%] md:max-w-[70%] ${isMe ? 'flex-row-reverse' : ''}`}>
                    {showAvatar && (
                        <div className="w-8 h-8 rounded-lg bg-neutral-800 shrink-0 self-end mb-1 overflow-hidden">
                            {groupMembersDetails.find(m => m.uid === msg.senderUid)?.photoURL ? (
                                <img src={groupMembersDetails.find(m => m.uid === msg.senderUid)?.photoURL} className="w-full h-full object-cover" />
                            ) : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-neutral-500">{msg.senderName?.charAt(0)}</div>}
                        </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      {showSenderName && <span className="text-[10px] font-black text-indigo-400 mb-1 ml-3 uppercase tracking-wider">{msg.senderName}</span>}
                      
                      <div className="relative group/bubble">
                        <div 
                          className={`px-4 pt-3 pb-2 rounded-[24px] text-sm leading-relaxed shadow-sm transition-all break-words ${
                            isMe 
                              ? 'bg-indigo-600 text-white rounded-tr-[4px]' 
                              : 'bg-white/[0.04] text-neutral-200 rounded-tl-[4px] border border-white/5'
                          }`}
                        >
                          {msg.replyTo && (
                            <div className={`mb-2 p-2 rounded-xl text-xs border-l-4 bg-black/20 ${isMe ? 'border-white/40 text-white/60' : 'border-indigo-500/50 text-neutral-500'}`}>
                              <p className="font-black truncate mb-0.5">{msg.replyTo.senderName}</p>
                              <p className="truncate italic">{msg.replyTo.text}</p>
                            </div>
                          )}
                          
                          {/* Attachment Rendering */}
                          {msg.attachment && (
                            <div className="mb-2 rounded-xl overflow-hidden bg-black/20 border border-white/5">
                                {msg.attachment.type === 'image' ? (
                                    <img src={msg.attachment.url} alt="Shared media" className="max-w-full h-auto object-cover max-h-80" />
                                ) : (
                                    <video src={msg.attachment.url} controls className="max-w-full h-auto max-h-80" />
                                )}
                            </div>
                          )}

                          <p>{msg.text}</p>
                          
                          {/* Timestamp and Seen INSIDE bubble */}
                          <div className="flex items-center justify-end gap-2 mt-1 -mr-1">
                            <span className="text-[9px] font-bold opacity-60 uppercase tracking-tighter">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isLastSentByMe && (
                                <span className="text-[9px] font-black uppercase tracking-tighter opacity-80 animate-in fade-in slide-in-from-right-1">Seen</span>
                            )}
                          </div>
                        </div>

                        {/* Reaction Picker Trigger - Hidden until hover */}
                        <div className={`absolute top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity px-2 z-10 ${isMe ? 'right-full' : 'left-full'}`}>
                            <button onClick={() => setReplyingTo(msg)} className="p-1.5 bg-neutral-900 border border-white/10 rounded-lg text-neutral-500 hover:text-white transition-all"><Reply size={14} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {typingText && (
              <div className="flex items-center gap-3 animate-in fade-in duration-300">
                 <div className="px-5 py-3 bg-white/[0.03] border border-white/5 rounded-full rounded-tl-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-typing-dot"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-typing-dot [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-typing-dot [animation-delay:0.4s]"></div>
                    </div>
                    <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">{typingText}</span>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 md:p-6 bg-neutral-950 border-t border-neutral-900 z-20">
            {replyingTo && (
              <div className="mb-4 p-4 bg-indigo-500/10 border-l-4 border-indigo-500 rounded-r-2xl flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">Replying to {replyingTo.senderName}</p>
                  <p className="text-sm text-neutral-400 truncate">{replyingTo.text}</p>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-2 text-neutral-500 hover:text-white transition-colors"><X size={18} /></button>
              </div>
            )}
            
            <form onSubmit={sendMessage} className="flex gap-4 items-end max-w-5xl mx-auto">
              <div className="flex-1 bg-white/[0.03] border border-white/10 rounded-[28px] p-2 flex items-end transition-all focus-within:border-indigo-500/50 focus-within:bg-white/[0.05]">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept="image/*,video/*" 
                />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingMedia}
                  className="p-3 text-neutral-500 hover:text-indigo-400 transition-colors shrink-0 disabled:opacity-50"
                >
                  {isUploadingMedia ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
                </button>
                <textarea 
                  rows={1}
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent border-none text-white text-base px-2 py-3 focus:outline-none resize-none custom-scrollbar placeholder:text-neutral-600 font-medium"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                />
                <button type="button" className="p-3 text-neutral-500 hover:text-indigo-400 transition-colors shrink-0"><SmilePlus size={20} /></button>
              </div>
              <button 
                type="submit" 
                disabled={!inputText.trim() && !isUploadingMedia}
                className="bg-indigo-600 text-white p-4 rounded-full shadow-lg shadow-indigo-900/40 hover:bg-indigo-500 transition-all active:scale-90 disabled:opacity-30 disabled:scale-100 disabled:shadow-none shrink-0"
              >
                <Send size={24} />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-neutral-950 text-center px-12 relative overflow-hidden">
           <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
           <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[150px] pointer-events-none"></div>
           
           <div className="w-24 h-24 bg-neutral-900 border border-white/5 rounded-[32px] flex items-center justify-center mb-8 shadow-2xl relative z-10 rotate-3">
              <MessageCircle size={40} className="text-indigo-500" />
           </div>
           <h2 className="text-3xl font-black text-white tracking-tight mb-3 relative z-10">Select a conversation</h2>
           <p className="text-neutral-500 max-w-xs leading-relaxed relative z-10 font-medium">Choose a chat from the sidebar or start a new group study session with your friends.</p>
        </div>
      )}
    </div>
  );
};