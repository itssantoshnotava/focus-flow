import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, update, get, set } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { X, Send, MessageCircle, ArrowLeft, Users, Plus, CheckCircle2, Circle } from 'lucide-react';

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
    seen?: boolean;
  };
  timestamp: number;
  unreadCount?: number;
}

export const Inbox: React.FC<InboxProps> = ({ onClose }) => {
  const { user } = useAuth();
  
  // View State
  const [viewMode, setViewMode] = useState<'list' | 'create_group'>('list');
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  
  // Data State
  const [messages, setMessages] = useState<any[]>([]);
  const [friendPresence, setFriendPresence] = useState<{online: boolean, lastSeen: number} | null>(null);
  const [myFriends, setMyFriends] = useState<any[]>([]); // For group creation
  
  // Inputs
  const [inputText, setInputText] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isAutoScrollEnabled = useRef(true);

  // Helper: DM Conversation ID
  const getDmConvoId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');

  // --- 1. Fetch Chats (DMs + Groups) ---
  useEffect(() => {
    if (!user) return;
    
    // We need to listen to two sources: Friends (for DMs) and users/{uid}/groupChats (for Groups)
    
    // A. Listen to Friends
    const friendsRef = ref(database, `friends/${user.uid}`);
    const groupsRef = ref(database, `users/${user.uid}/groupChats`);

    const fetchData = async () => {
       // We'll perform a one-time fetch for structure, then set up real-time listeners for updates implies complex merging.
       // For simplicity in this architecture, we will listen to changes on friends/groups lists and re-fetch details.
       // In a production app, we would Denormalize 'inbox' data.
       
       onValue(friendsRef, async (friendsSnap) => {
           const friendIds = friendsSnap.exists() ? Object.keys(friendsSnap.val()) : [];
           
           // Fetch Friend Details & DM Metadata
           const dmPromises = friendIds.map(async (fid) => {
               const userSnap = await get(ref(database, `users/${fid}`));
               const userData = userSnap.val();
               
               const convoId = getDmConvoId(user.uid, fid);
               const convoSnap = await get(ref(database, `conversations/${convoId}`));
               const convoData = convoSnap.val();

               return {
                   id: fid,
                   type: 'dm',
                   name: userData?.name || 'Unknown',
                   photoURL: userData?.photoURL,
                   lastMessage: convoData?.lastMessage,
                   timestamp: convoData?.lastMessage?.timestamp || 0
               } as ChatItem;
           });

           // Get Groups
           onValue(groupsRef, async (groupsSnap) => {
               const groupIds = groupsSnap.exists() ? Object.keys(groupsSnap.val()) : [];
               
               const groupPromises = groupIds.map(async (gid) => {
                   const groupSnap = await get(ref(database, `groupChats/${gid}`));
                   if (!groupSnap.exists()) return null;
                   const groupData = groupSnap.val();
                   
                   return {
                       id: gid,
                       type: 'group',
                       name: groupData.name,
                       photoURL: groupData.photoURL,
                       lastMessage: groupData.lastMessage,
                       timestamp: groupData.lastMessage?.timestamp || groupData.createdAt || 0
                   } as ChatItem;
               });

               const dms = await Promise.all(dmPromises);
               const groups = (await Promise.all(groupPromises)).filter(g => g !== null) as ChatItem[];
               
               const combined = [...dms, ...groups].sort((a, b) => b.timestamp - a.timestamp);
               setChats(combined);
               setLoading(false);
           });
       });
    };

    fetchData();
  }, [user]);

  // --- 2. Fetch Friends for Group Creation ---
  useEffect(() => {
      if (!user || viewMode !== 'create_group') return;
      const friendsRef = ref(database, `friends/${user.uid}`);
      get(friendsRef).then(async (snap) => {
          if (snap.exists()) {
              const ids = Object.keys(snap.val());
              const promises = ids.map(id => get(ref(database, `users/${id}`)).then(s => ({ uid: id, ...s.val() })));
              const res = await Promise.all(promises);
              setMyFriends(res);
          }
      });
  }, [user, viewMode]);

  // --- 3. Chat Logic (Messages & Presence) ---
  useEffect(() => {
      if (!user || !selectedChat) {
          setFriendPresence(null);
          return;
      }

      let messagesPath = '';
      if (selectedChat.type === 'dm') {
          const convoId = getDmConvoId(user.uid, selectedChat.id);
          messagesPath = `messages/${convoId}`;
          
          // Presence only for DMs
          const presenceRef = ref(database, `presence/${selectedChat.id}`);
          onValue(presenceRef, (snap) => {
              setFriendPresence(snap.exists() ? snap.val() : null);
          });
      } else {
          messagesPath = `groupMessages/${selectedChat.id}`;
          setFriendPresence(null);
      }

      const messagesRef = ref(database, messagesPath);
      const unsubMsg = onValue(messagesRef, (snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const list = Object.entries(data).map(([key, val]: [string, any]) => ({
                  id: key,
                  ...val
              })).sort((a, b) => a.timestamp - b.timestamp);
              
              setMessages(list);

              // Mark as Seen (Only for DMs in this requirement, keeping groups simple)
              if (selectedChat.type === 'dm') {
                  const convoId = getDmConvoId(user.uid, selectedChat.id);
                  const updates: Record<string, any> = {};
                  let hasUnseen = false;
                  
                  list.forEach(msg => {
                      if (msg.senderUid !== user.uid && !msg.seen) {
                          updates[`messages/${convoId}/${msg.id}/seen`] = true;
                          hasUnseen = true;
                      }
                  });
                  
                  if (hasUnseen) {
                      update(ref(database), updates);
                       // Check if last message needs update
                      get(ref(database, `conversations/${convoId}/lastMessage`)).then(snap => {
                           const lm = snap.val();
                           if(lm && lm.senderUid !== user.uid && !lm.seen) {
                               update(ref(database, `conversations/${convoId}/lastMessage`), { seen: true });
                           }
                      });
                  }
              }
          } else {
              setMessages([]);
          }
      });
      
      setTimeout(() => inputRef.current?.focus(), 100);
      isAutoScrollEnabled.current = true;

      return () => unsubMsg();
  }, [user, selectedChat]);

  // Auto Scroll
  useEffect(() => {
      if (isAutoScrollEnabled.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
  }, [messages]);

  const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      isAutoScrollEnabled.current = isAtBottom;
  };

  // --- Actions ---

  const handleSend = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!inputText.trim() || !user || !selectedChat) return;
      
      const text = inputText.trim();
      const timestamp = Date.now();
      
      if (selectedChat.type === 'dm') {
          const convoId = getDmConvoId(user.uid, selectedChat.id);
          const msgData = { senderUid: user.uid, text, timestamp, seen: false };
          
          await push(ref(database, `messages/${convoId}`), msgData);
          await update(ref(database, `conversations/${convoId}`), {
              members: { [user.uid]: true, [selectedChat.id]: true },
              lastMessage: { ...msgData }
          });
      } else {
          // Group Message
          const msgData = { 
              senderUid: user.uid, 
              senderName: user.displayName || 'Unknown', 
              text, 
              timestamp 
          };
          await push(ref(database, `groupMessages/${selectedChat.id}`), msgData);
          await update(ref(database, `groupChats/${selectedChat.id}`), {
              lastMessage: { ...msgData }
          });
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
          
          await set(newGroupRef, {
              name: newGroupName.trim(),
              createdBy: user.uid,
              createdAt: Date.now(),
              members: membersObj
          });
          
          // Update user lists
          const updates: any = {};
          updates[`users/${user.uid}/groupChats/${groupId}`] = true;
          selectedGroupMembers.forEach(uid => {
              updates[`users/${uid}/groupChats/${groupId}`] = true;
          });
          
          await update(ref(database), updates);
          
          setViewMode('list');
          setNewGroupName('');
          setSelectedGroupMembers(new Set());
      }
  };

  const toggleGroupMember = (uid: string) => {
      const next = new Set(selectedGroupMembers);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      setSelectedGroupMembers(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
      }
  };

  // --- Formatting ---
  const formatTime = (ts: number) => {
      if (!ts) return '';
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const formatRelativeTime = (ts: number) => {
      if (!ts) return '';
      const diff = Date.now() - ts;
      if (diff < 60000) return 'Just now';
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h`;
      return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-neutral-900 border border-neutral-800 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex overflow-hidden animate-in zoom-in-95 duration-200">
           
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
                           <div className="p-8 text-center text-neutral-600 italic text-sm">
                               No messages yet.
                           </div>
                       ) : (
                           chats.map(chat => {
                               const isUnread = chat.lastMessage && chat.lastMessage.senderUid !== user?.uid && !chat.lastMessage.seen && chat.type === 'dm';
                               
                               return (
                                   <button 
                                       key={chat.id}
                                       onClick={() => setSelectedChat(chat)}
                                       className={`w-full p-4 flex items-center gap-3 hover:bg-neutral-800/50 transition-colors border-b border-neutral-800/50 text-left group ${selectedChat?.id === chat.id ? 'bg-indigo-900/10 border-indigo-500/10' : ''}`}
                                   >
                                       <div className="relative shrink-0">
                                            {chat.type === 'group' ? (
                                                <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center border border-neutral-700">
                                                    <Users size={20} className="text-neutral-400" />
                                                </div>
                                            ) : chat.photoURL ? (
                                                <img src={chat.photoURL} className="w-12 h-12 rounded-full bg-neutral-800 object-cover border border-neutral-800" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white border border-neutral-800">
                                                    {chat.name.charAt(0)}
                                                </div>
                                            )}
                                            {isUnread && (
                                                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-indigo-500 border-2 border-neutral-900 rounded-full"></span>
                                            )}
                                       </div>
                                       <div className="flex-1 min-w-0">
                                           <div className="flex justify-between items-baseline mb-0.5">
                                               <span className={`font-medium text-sm truncate ${isUnread ? 'text-white' : 'text-neutral-300'} ${selectedChat?.id === chat.id ? 'text-indigo-300' : ''}`}>
                                                   {chat.name}
                                               </span>
                                               {chat.timestamp > 0 && (
                                                   <span className={`text-[10px] ${isUnread ? 'text-indigo-400 font-medium' : 'text-neutral-500'}`}>{formatRelativeTime(chat.timestamp)}</span>
                                               )}
                                           </div>
                                           <p className={`text-xs truncate flex items-center gap-1 ${isUnread ? 'text-neutral-200 font-medium' : 'text-neutral-500 group-hover:text-neutral-400'}`}>
                                               {chat.lastMessage?.senderUid === user?.uid && (
                                                   <span className="text-[10px] opacity-70">You:</span>
                                               )}
                                               {chat.lastMessage?.text?.slice(0, 30) || (chat.type === 'group' ? 'New Group' : 'Start a conversation')}
                                           </p>
                                       </div>
                                   </button>
                               );
                           })
                       )}
                   </div>
               ) : (
                   /* CREATE GROUP FORM */
                   <div className="flex-1 flex flex-col bg-neutral-950">
                       <div className="p-4 space-y-4">
                           <input 
                               value={newGroupName}
                               onChange={e => setNewGroupName(e.target.value)}
                               placeholder="Group Name"
                               className="w-full bg-neutral-900 border border-neutral-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500"
                           />
                           <div className="text-xs font-bold text-neutral-500 uppercase tracking-wide">Select Members</div>
                       </div>
                       <div className="flex-1 overflow-y-auto custom-scrollbar px-2">
                           {myFriends.map(friend => {
                               const isSelected = selectedGroupMembers.has(friend.uid);
                               return (
                                   <button 
                                      key={friend.uid}
                                      onClick={() => toggleGroupMember(friend.uid)}
                                      className={`w-full p-3 flex items-center justify-between rounded-xl mb-1 ${isSelected ? 'bg-indigo-900/20 border border-indigo-500/20' : 'hover:bg-neutral-900 border border-transparent'}`}
                                   >
                                       <div className="flex items-center gap-3">
                                            {friend.photoURL ? (
                                                <img src={friend.photoURL} className="w-8 h-8 rounded-full" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs text-white font-bold">{friend.name?.charAt(0)}</div>
                                            )}
                                            <span className={`text-sm ${isSelected ? 'text-indigo-200' : 'text-neutral-300'}`}>{friend.name}</span>
                                       </div>
                                       {isSelected ? <CheckCircle2 size={18} className="text-indigo-500" /> : <Circle size={18} className="text-neutral-700" />}
                                   </button>
                               );
                           })}
                       </div>
                       <div className="p-4 border-t border-neutral-800">
                           <button 
                               onClick={handleCreateGroup}
                               disabled={!newGroupName.trim() || selectedGroupMembers.size === 0}
                               className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-neutral-800 text-white py-3 rounded-xl font-medium transition-colors"
                           >
                               Create Group ({selectedGroupMembers.size})
                           </button>
                       </div>
                   </div>
               )}
           </div>

           {/* CHAT AREA */}
           <div className={`w-full md:w-2/3 flex flex-col bg-neutral-950 ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
               {selectedChat ? (
                   <>
                       {/* Chat Header */}
                       <div className="p-3 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur flex items-center justify-between">
                           <div className="flex items-center gap-3">
                               <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 text-neutral-400 hover:text-white">
                                   <ArrowLeft size={20} />
                               </button>
                               <div className="flex items-center gap-3">
                                   <div className="relative">
                                       {selectedChat.type === 'group' ? (
                                           <div className="w-9 h-9 rounded-2xl bg-neutral-800 flex items-center justify-center border border-neutral-700">
                                               <Users size={16} className="text-neutral-400" />
                                           </div>
                                       ) : selectedChat.photoURL ? (
                                            <img src={selectedChat.photoURL} className="w-9 h-9 rounded-full bg-neutral-800" />
                                        ) : (
                                            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                                                {selectedChat.name.charAt(0)}
                                            </div>
                                        )}
                                        {/* Online Indicator (DM Only) */}
                                        {friendPresence && (
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-900 ${friendPresence.online ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div>
                                        )}
                                   </div>
                                   <div className="flex flex-col">
                                       <span className="font-bold text-neutral-200 text-sm leading-tight">{selectedChat.name}</span>
                                       {selectedChat.type === 'dm' && (
                                           <span className="text-[10px] text-neutral-500 font-medium">
                                               {friendPresence?.online ? (
                                                   <span className="text-emerald-500">Online</span>
                                               ) : (
                                                   friendPresence?.lastSeen ? `Seen ${formatRelativeTime(friendPresence.lastSeen)}` : 'Offline'
                                               )}
                                           </span>
                                       )}
                                       {selectedChat.type === 'group' && (
                                           <span className="text-[10px] text-neutral-500">Group Chat</span>
                                       )}
                                   </div>
                               </div>
                           </div>
                           <button onClick={onClose} className="hidden md:block p-2 text-neutral-500 hover:text-white rounded-lg hover:bg-neutral-800">
                               <X size={20} />
                           </button>
                       </div>

                       {/* Messages List */}
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
                                       {/* Group Sender Name */}
                                       {selectedChat.type === 'group' && !isMe && !isChain && (
                                           <span className="text-[10px] text-neutral-500 ml-10 mb-0.5">{msg.senderName}</span>
                                       )}
                                       
                                       <div className={`flex gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                           {/* Avatar Placeholder */}
                                           <div className="w-8 flex-shrink-0 flex flex-col items-center">
                                               {!isMe && !isChain && (
                                                    selectedChat.type === 'group' ? (
                                                        <div className="w-8 h-8 rounded-full bg-indigo-900/50 flex items-center justify-center text-[10px] font-bold text-indigo-300 border border-indigo-500/20">
                                                            {msg.senderName?.charAt(0)}
                                                        </div>
                                                    ) : (
                                                        // For DM, use friend avatar logic (simplified here)
                                                        <div className="w-8 h-8 rounded-full bg-indigo-600 text-[10px] flex items-center justify-center font-bold text-white">
                                                            {selectedChat.name.charAt(0)}
                                                        </div>
                                                    )
                                               )}
                                           </div>
                                           
                                           <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                               <div className={`px-4 py-2 rounded-2xl text-sm break-words whitespace-pre-wrap leading-relaxed shadow-sm ${
                                                   isMe 
                                                   ? 'bg-indigo-600 text-white rounded-tr-sm' 
                                                   : 'bg-neutral-800 text-neutral-200 rounded-tl-sm'
                                               }`}>
                                                   {msg.text}
                                               </div>
                                           </div>
                                       </div>
                                       
                                       {/* Meta Info */}
                                       <div className={`flex items-center gap-1 mt-1 px-11 ${isMe ? 'mr-0' : 'ml-0'}`}>
                                            <span className="text-[10px] text-neutral-600">
                                                {formatTime(msg.timestamp)}
                                            </span>
                                            {isMe && idx === messages.length - 1 && selectedChat.type === 'dm' && (
                                                <span className="text-[10px] font-medium ml-1">
                                                    {msg.seen ? <span className="text-neutral-500">Seen</span> : <span className="text-neutral-600">Sent</span>}
                                                </span>
                                            )}
                                       </div>
                                   </div>
                               );
                           })}
                           <div ref={messagesEndRef} />
                       </div>

                       {/* Input Area */}
                       <div className="p-3 bg-neutral-900 border-t border-neutral-800">
                           <form onSubmit={handleSend} className="flex gap-2 items-end bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-2 focus-within:border-indigo-500/50 transition-colors">
                               <textarea
                                   ref={inputRef}
                                   value={inputText}
                                   onChange={e => setInputText(e.target.value)}
                                   onKeyDown={handleKeyDown}
                                   placeholder={`Message ${selectedChat.name}...`}
                                   rows={1}
                                   className="flex-1 bg-transparent text-white px-2 py-2 focus:outline-none text-sm resize-none custom-scrollbar max-h-32 placeholder:text-neutral-600"
                                   style={{ minHeight: '40px' }}
                               />
                               <button 
                                   type="submit" 
                                   disabled={!inputText.trim()}
                                   className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-neutral-800 text-white p-2.5 rounded-lg transition-colors mb-0.5"
                               >
                                   <Send size={16} />
                               </button>
                           </form>
                       </div>
                   </>
               ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 p-8 text-center bg-neutral-950/50">
                       <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4 border border-neutral-800">
                           <MessageCircle size={32} className="text-indigo-500/50" />
                       </div>
                       <h3 className="text-lg font-medium text-neutral-300 mb-2">Inbox</h3>
                       <p className="text-sm max-w-xs text-neutral-500">Select a chat or create a new group to start messaging.</p>
                       <button onClick={onClose} className="md:block hidden mt-8 px-6 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors text-sm border border-neutral-700">
                           Close Inbox
                       </button>
                   </div>
               )}
           </div>

        </div>
      </div>
  );
};