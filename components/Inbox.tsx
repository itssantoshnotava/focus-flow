import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, update, get } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { X, Send, MessageCircle, ArrowLeft, Check, CheckCheck } from 'lucide-react';

interface InboxProps {
  onClose: () => void;
}

export const Inbox: React.FC<InboxProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<any | null>(null);
  const [friendPresence, setFriendPresence] = useState<{online: boolean, lastSeen: number} | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Track if user is manually scrolling up
  const isAutoScrollEnabled = useRef(true);

  // Helper: Conversation ID
  const getConvoId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');

  // --- 1. Fetch Friends & Last Messages (Inbox List) ---
  useEffect(() => {
    if (!user) return;
    const friendsRef = ref(database, `friends/${user.uid}`);
    
    const unsub = onValue(friendsRef, async (snapshot) => {
      if (snapshot.exists()) {
        const friendIds = Object.keys(snapshot.val());
        
        const friendPromises = friendIds.map(async (fid) => {
            const snap = await get(ref(database, `users/${fid}`));
            const userData = snap.val();
            return { uid: fid, ...userData };
        });
        
        const friendsData = await Promise.all(friendPromises);
        
        // Fetch metadata
        const friendsWithMeta = await Promise.all(friendsData.map(async (f) => {
            const convoId = getConvoId(user.uid, f.uid);
            const convoSnap = await get(ref(database, `conversations/${convoId}`));
            const convoData = convoSnap.val();
            return {
                ...f,
                lastMessage: convoData?.lastMessage,
                timestamp: convoData?.lastMessage?.timestamp || 0
            };
        }));
        
        setFriends(friendsWithMeta.sort((a, b) => b.timestamp - a.timestamp));
      } else {
        setFriends([]);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // --- 2. Listen for Messages, Presence & Handle Seen Status ---
  useEffect(() => {
      if (!user || !selectedFriend) {
          setFriendPresence(null);
          return;
      }
      
      const convoId = getConvoId(user.uid, selectedFriend.uid);
      
      // A. Presence Listener
      const presenceRef = ref(database, `presence/${selectedFriend.uid}`);
      const unsubPresence = onValue(presenceRef, (snap) => {
          if (snap.exists()) setFriendPresence(snap.val());
          else setFriendPresence(null);
      });

      // B. Messages Listener
      const messagesRef = ref(database, `messages/${convoId}`);
      const unsubMsg = onValue(messagesRef, (snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const list = Object.entries(data).map(([key, val]: [string, any]) => ({
                  id: key,
                  ...val
              })).sort((a, b) => a.timestamp - b.timestamp);
              
              setMessages(list);

              // C. Seen Logic: Mark incoming messages as seen
              const updates: Record<string, any> = {};
              let hasUnseen = false;

              list.forEach(msg => {
                  if (msg.senderUid !== user.uid && !msg.seen) {
                      updates[`messages/${convoId}/${msg.id}/seen`] = true;
                      hasUnseen = true;
                  }
              });

              // Also update conversation lastMessage if it matches
              if (hasUnseen) {
                  update(ref(database), updates);
                  // Check if last message needs update in conversation root
                  get(ref(database, `conversations/${convoId}/lastMessage`)).then(snap => {
                       const lm = snap.val();
                       if(lm && lm.senderUid !== user.uid && !lm.seen) {
                           update(ref(database, `conversations/${convoId}/lastMessage`), { seen: true });
                       }
                  });
              }

          } else {
              setMessages([]);
          }
      });
      
      // Focus input on selection
      setTimeout(() => inputRef.current?.focus(), 100);
      isAutoScrollEnabled.current = true;

      return () => {
          unsubMsg();
          unsubPresence();
      };
  }, [user, selectedFriend]);

  // --- 3. Smart Auto Scroll ---
  useEffect(() => {
      if (isAutoScrollEnabled.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
  }, [messages]);

  // Handle Scroll events to toggle auto-scroll
  const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      // If user is near bottom (within 50px), enable auto-scroll. Otherwise disable.
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      isAutoScrollEnabled.current = isAtBottom;
  };

  const handleSend = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!inputText.trim() || !user || !selectedFriend) return;
      
      const text = inputText.trim();
      const convoId = getConvoId(user.uid, selectedFriend.uid);
      const timestamp = Date.now();
      
      const msgData = {
          senderUid: user.uid,
          text,
          timestamp,
          seen: false
      };
      
      // Force auto-scroll when I send a message
      isAutoScrollEnabled.current = true;

      // 1. Push Message
      await push(ref(database, `messages/${convoId}`), msgData);
      
      // 2. Update Conversation Metadata
      await update(ref(database, `conversations/${convoId}`), {
          members: {
              [user.uid]: true,
              [selectedFriend.uid]: true
          },
          lastMessage: { ...msgData }
      });
      
      setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
      }
  };

  // --- Formatting Helpers ---
  const formatTime = (ts: number) => {
      if (!ts) return '';
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRelativeTime = (ts: number) => {
      if (!ts) return '';
      const diff = Date.now() - ts;
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(mins / 60);
      const days = Math.floor(hours / 24);

      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m`;
      if (hours < 24) return `${hours}h`;
      if (days < 7) return `${days}d`;
      return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getLastSeenText = (lastSeen: number) => {
      const diff = Date.now() - lastSeen;
      if (diff < 60000) return 'Last seen just now';
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `Last seen ${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `Last seen ${hours}h ago`;
      return `Last seen ${new Date(lastSeen).toLocaleDateString()}`;
  };

  return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-neutral-900 border border-neutral-800 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex overflow-hidden animate-in zoom-in-95 duration-200">
           
           {/* SIDEBAR (Friend List) */}
           <div className={`w-full md:w-1/3 border-r border-neutral-800 flex flex-col ${selectedFriend ? 'hidden md:flex' : 'flex'}`}>
               <div className="p-4 border-b border-neutral-800 bg-neutral-900 flex justify-between items-center">
                   <h2 className="text-white font-bold text-lg flex items-center gap-2">
                       <MessageCircle size={20} className="text-indigo-500" /> Inbox
                   </h2>
                   <button onClick={onClose} className="md:hidden p-2 text-neutral-500 hover:text-white">
                       <X size={20} />
                   </button>
               </div>
               
               <div className="flex-1 overflow-y-auto custom-scrollbar bg-neutral-950/50">
                   {loading ? (
                       <div className="p-4 text-center text-neutral-600 text-sm">Loading chats...</div>
                   ) : friends.length === 0 ? (
                       <div className="p-8 text-center text-neutral-600 italic text-sm">
                           No friends found.<br/>Add friends to start chatting!
                       </div>
                   ) : (
                       friends.map(friend => {
                           const isUnread = friend.lastMessage && friend.lastMessage.senderUid !== user?.uid && !friend.lastMessage.seen;
                           
                           return (
                               <button 
                                   key={friend.uid}
                                   onClick={() => setSelectedFriend(friend)}
                                   className={`w-full p-4 flex items-center gap-3 hover:bg-neutral-800/50 transition-colors border-b border-neutral-800/50 text-left group ${selectedFriend?.uid === friend.uid ? 'bg-indigo-900/10 border-indigo-500/10' : ''}`}
                               >
                                   <div className="relative shrink-0">
                                        {friend.photoURL ? (
                                            <img src={friend.photoURL} className="w-12 h-12 rounded-full bg-neutral-800 object-cover border border-neutral-800" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white border border-neutral-800">
                                                {friend.name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                        {/* Unread Dot */}
                                        {isUnread && (
                                            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-indigo-500 border-2 border-neutral-900 rounded-full"></span>
                                        )}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                       <div className="flex justify-between items-baseline mb-0.5">
                                           <span className={`font-medium text-sm truncate ${isUnread ? 'text-white' : 'text-neutral-300'} ${selectedFriend?.uid === friend.uid ? 'text-indigo-300' : ''}`}>
                                               {friend.name}
                                           </span>
                                           {friend.timestamp > 0 && (
                                               <span className={`text-[10px] ${isUnread ? 'text-indigo-400 font-medium' : 'text-neutral-500'}`}>{formatRelativeTime(friend.timestamp)}</span>
                                           )}
                                       </div>
                                       <p className={`text-xs truncate flex items-center gap-1 ${isUnread ? 'text-neutral-200 font-medium' : 'text-neutral-500 group-hover:text-neutral-400'}`}>
                                           {friend.lastMessage?.senderUid === user?.uid && (
                                               <span className="text-[10px] opacity-70">You:</span>
                                           )}
                                           {friend.lastMessage?.text?.slice(0, 30) || 'Start a conversation'}
                                           {friend.lastMessage?.text?.length > 30 && '...'}
                                       </p>
                                   </div>
                               </button>
                           );
                       })
                   )}
               </div>
           </div>

           {/* CHAT AREA */}
           <div className={`w-full md:w-2/3 flex flex-col bg-neutral-950 ${!selectedFriend ? 'hidden md:flex' : 'flex'}`}>
               
               {selectedFriend ? (
                   <>
                       {/* Chat Header */}
                       <div className="p-3 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur flex items-center justify-between">
                           <div className="flex items-center gap-3">
                               <button onClick={() => setSelectedFriend(null)} className="md:hidden p-2 text-neutral-400 hover:text-white">
                                   <ArrowLeft size={20} />
                               </button>
                               <div className="flex items-center gap-3">
                                   <div className="relative">
                                       {selectedFriend.photoURL ? (
                                            <img src={selectedFriend.photoURL} className="w-9 h-9 rounded-full bg-neutral-800" />
                                        ) : (
                                            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                                                {selectedFriend.name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                        {/* Online Indicator */}
                                        {friendPresence && (
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-900 ${friendPresence.online ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div>
                                        )}
                                   </div>
                                   <div className="flex flex-col">
                                       <span className="font-bold text-neutral-200 text-sm leading-tight">{selectedFriend.name}</span>
                                       <span className="text-[10px] text-neutral-500 font-medium">
                                           {friendPresence?.online ? (
                                               <span className="text-emerald-500">Online</span>
                                           ) : (
                                               friendPresence?.lastSeen ? getLastSeenText(friendPresence.lastSeen) : 'Offline'
                                           )}
                                       </span>
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
                               // Grouping logic: Show avatar only if previous msg was diff sender or long time gap
                               const prevMsg = messages[idx - 1];
                               const isChain = prevMsg && prevMsg.senderUid === msg.senderUid && (msg.timestamp - prevMsg.timestamp < 60000);
                               
                               return (
                                   <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isChain ? 'mt-0.5' : 'mt-4'}`}>
                                       <div className={`flex gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                           {/* Avatar Placeholder (for alignment) */}
                                           <div className="w-8 flex-shrink-0 flex flex-col items-center">
                                               {!isMe && !isChain && (
                                                    selectedFriend.photoURL ? (
                                                        <img src={selectedFriend.photoURL} className="w-8 h-8 rounded-full bg-neutral-800" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-indigo-600 text-[10px] flex items-center justify-center font-bold text-white">
                                                            {selectedFriend.name?.charAt(0)}
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
                                       
                                       {/* Meta Info (Timestamp & Status) */}
                                       <div className={`flex items-center gap-1 mt-1 px-11 ${isMe ? 'mr-0' : 'ml-0'}`}>
                                            <span className="text-[10px] text-neutral-600">
                                                {formatTime(msg.timestamp)}
                                            </span>
                                            {isMe && idx === messages.length - 1 && (
                                                <span className="text-[10px] font-medium ml-1">
                                                    {msg.seen ? (
                                                        <span className="text-neutral-500">Seen</span>
                                                    ) : (
                                                        <span className="text-neutral-600">Sent</span>
                                                    )}
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
                                   placeholder={`Message ${selectedFriend.name}...`}
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
                           <div className="text-[10px] text-neutral-600 text-center mt-2 hidden md:block">
                               Enter to send, Shift + Enter for new line
                           </div>
                       </div>
                   </>
               ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 p-8 text-center bg-neutral-950/50">
                       <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4 border border-neutral-800">
                           <MessageCircle size={32} className="text-indigo-500/50" />
                       </div>
                       <h3 className="text-lg font-medium text-neutral-300 mb-2">Your Messages</h3>
                       <p className="text-sm max-w-xs text-neutral-500">Select a friend from the list to start a private conversation.</p>
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