import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, update, get } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { X, Send, MessageCircle, ArrowLeft } from 'lucide-react';

interface InboxProps {
  onClose: () => void;
}

export const Inbox: React.FC<InboxProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Helper: Conversation ID is deterministic based on sorted UIDs
  const getConvoId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');

  // 1. Fetch Friends & Last Messages (Inbox List)
  useEffect(() => {
    if (!user) return;
    const friendsRef = ref(database, `friends/${user.uid}`);
    
    // Listen to friends list updates
    const unsub = onValue(friendsRef, async (snapshot) => {
      if (snapshot.exists()) {
        const friendIds = Object.keys(snapshot.val());
        
        // Fetch user details for each friend
        const friendPromises = friendIds.map(async (fid) => {
            const snap = await get(ref(database, `users/${fid}`));
            const userData = snap.val();
            return { uid: fid, ...userData };
        });
        
        const friendsData = await Promise.all(friendPromises);
        
        // Fetch last message for each conversation to populate the preview
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
        
        // Sort by most recent activity
        setFriends(friendsWithMeta.sort((a, b) => b.timestamp - a.timestamp));
      } else {
        setFriends([]);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // 2. Fetch Messages when a Friend is Selected (Chat Thread)
  useEffect(() => {
      if (!user || !selectedFriend) return;
      
      const convoId = getConvoId(user.uid, selectedFriend.uid);
      const messagesRef = ref(database, `messages/${convoId}`);
      
      const unsub = onValue(messagesRef, (snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const list = Object.entries(data).map(([key, val]: [string, any]) => ({
                  id: key,
                  ...val
              })).sort((a, b) => a.timestamp - b.timestamp);
              setMessages(list);
          } else {
              setMessages([]);
          }
      });
      
      return () => unsub();
  }, [user, selectedFriend]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedFriend]);

  const handleSend = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputText.trim() || !user || !selectedFriend) return;
      
      const text = inputText.trim();
      const convoId = getConvoId(user.uid, selectedFriend.uid);
      const timestamp = Date.now();
      
      const msgData = {
          senderUid: user.uid,
          text,
          timestamp
      };
      
      // 1. Push Message to history
      await push(ref(database, `messages/${convoId}`), msgData);
      
      // 2. Update Conversation Metadata (for Inbox previews)
      await update(ref(database, `conversations/${convoId}`), {
          members: {
              [user.uid]: true,
              [selectedFriend.uid]: true
          },
          lastMessage: {
              text,
              timestamp,
              senderUid: user.uid,
              seen: false 
          }
      });
      
      // Update local friend list state to reflect new last message immediately
      setFriends(prev => prev.map(f => {
          if (f.uid === selectedFriend.uid) {
              return {
                  ...f,
                  timestamp,
                  lastMessage: { text, timestamp, senderUid: user.uid }
              };
          }
          return f;
      }).sort((a, b) => b.timestamp - a.timestamp));

      setInputText('');
  };

  const formatTime = (ts: number) => {
      if (!ts) return '';
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-neutral-900 border border-neutral-800 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex overflow-hidden animate-in zoom-in-95 duration-200">
           
           {/* Sidebar (Friend List) - Hidden on mobile if chat is open */}
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
                       friends.map(friend => (
                           <button 
                               key={friend.uid}
                               onClick={() => setSelectedFriend(friend)}
                               className={`w-full p-4 flex items-center gap-3 hover:bg-neutral-800/50 transition-colors border-b border-neutral-800/50 text-left ${selectedFriend?.uid === friend.uid ? 'bg-indigo-900/10 border-indigo-500/10' : ''}`}
                           >
                               <div className="relative shrink-0">
                                    {friend.photoURL ? (
                                        <img src={friend.photoURL} className="w-10 h-10 rounded-full bg-neutral-800 object-cover" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                                            {friend.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                               </div>
                               <div className="flex-1 min-w-0">
                                   <div className="flex justify-between items-baseline mb-0.5">
                                       <span className={`font-medium text-sm truncate ${selectedFriend?.uid === friend.uid ? 'text-indigo-300' : 'text-neutral-200'}`}>
                                           {friend.name}
                                       </span>
                                       {friend.timestamp > 0 && (
                                           <span className="text-[10px] text-neutral-500">{formatTime(friend.timestamp)}</span>
                                       )}
                                   </div>
                                   <p className="text-xs text-neutral-500 truncate">
                                       {friend.lastMessage?.senderUid === user?.uid ? 'You: ' : ''}
                                       {friend.lastMessage?.text || 'Start a conversation'}
                                   </p>
                               </div>
                           </button>
                       ))
                   )}
               </div>
           </div>

           {/* Chat Area - Full screen on mobile if selected */}
           <div className={`w-full md:w-2/3 flex flex-col bg-neutral-950 ${!selectedFriend ? 'hidden md:flex' : 'flex'}`}>
               
               {selectedFriend ? (
                   <>
                       {/* Chat Header */}
                       <div className="p-3 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur flex items-center justify-between">
                           <div className="flex items-center gap-3">
                               <button onClick={() => setSelectedFriend(null)} className="md:hidden p-2 text-neutral-400 hover:text-white">
                                   <ArrowLeft size={20} />
                               </button>
                               <div className="flex items-center gap-2">
                                   {selectedFriend.photoURL ? (
                                        <img src={selectedFriend.photoURL} className="w-8 h-8 rounded-full bg-neutral-800" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                                            {selectedFriend.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                   <span className="font-bold text-neutral-200 text-sm">{selectedFriend.name}</span>
                               </div>
                           </div>
                           <button onClick={onClose} className="hidden md:block p-2 text-neutral-500 hover:text-white rounded-lg hover:bg-neutral-800">
                               <X size={20} />
                           </button>
                       </div>

                       {/* Messages List */}
                       <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                           {messages.map((msg, idx) => {
                               const isMe = msg.senderUid === user?.uid;
                               const showAvatar = idx === 0 || messages[idx - 1].senderUid !== msg.senderUid;
                               
                               return (
                                   <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                       {/* Avatar Spacer */}
                                       <div className="w-8 flex-shrink-0 flex flex-col items-center">
                                           {!isMe && showAvatar && (
                                                selectedFriend.photoURL ? (
                                                    <img src={selectedFriend.photoURL} className="w-6 h-6 rounded-full" />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-[10px] flex items-center justify-center font-bold text-white">
                                                        {selectedFriend.name?.charAt(0)}
                                                    </div>
                                                )
                                           )}
                                       </div>
                                       
                                       <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                                           <div className={`px-4 py-2 rounded-2xl text-sm break-words ${
                                               isMe 
                                               ? 'bg-indigo-600 text-white rounded-tr-sm' 
                                               : 'bg-neutral-800 text-neutral-200 rounded-tl-sm'
                                           }`}>
                                               {msg.text}
                                           </div>
                                           <span className="text-[10px] text-neutral-600 mt-1 px-1">
                                               {formatTime(msg.timestamp)}
                                           </span>
                                       </div>
                                   </div>
                               );
                           })}
                           <div ref={messagesEndRef} />
                       </div>

                       {/* Input Area */}
                       <div className="p-3 bg-neutral-900 border-t border-neutral-800">
                           <form onSubmit={handleSend} className="flex gap-2">
                               <input 
                                   value={inputText}
                                   onChange={e => setInputText(e.target.value)}
                                   placeholder={`Message ${selectedFriend.name}...`}
                                   className="flex-1 bg-neutral-950 border border-neutral-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                               />
                               <button 
                                   type="submit" 
                                   disabled={!inputText.trim()}
                                   className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-neutral-800 text-white p-3 rounded-xl transition-colors"
                               >
                                   <Send size={18} />
                               </button>
                           </form>
                       </div>
                   </>
               ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 p-8 text-center">
                       <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4 border border-neutral-800">
                           <MessageCircle size={32} className="text-indigo-500/50" />
                       </div>
                       <h3 className="text-lg font-medium text-neutral-300 mb-2">Your Messages</h3>
                       <p className="text-sm max-w-xs">Select a friend from the list to start a private conversation.</p>
                       <button onClick={onClose} className="md:block hidden mt-8 px-6 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors text-sm">
                           Close Inbox
                       </button>
                   </div>
               )}
           </div>

        </div>
      </div>
  );
};