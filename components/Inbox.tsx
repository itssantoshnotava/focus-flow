import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ref, onValue, push, update, get, set, remove, onChildAdded, onChildChanged, onChildRemoved, query, limitToLast } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    Send, MessageCircle, ArrowLeft, Users, Plus, CheckCircle2, 
    Circle, Settings, Camera, Trash2, UserPlus, 
    Save, Edit2, UserMinus, Loader2, X, Check, CheckCheck, Reply, CornerUpRight,
    SmilePlus, Paperclip, Play, Image as ImageIcon, Film, MoreVertical, Smile, AlertCircle,
    VolumeX, Archive, Ban, Lock, Trash, UserCircle2
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
const COMMON_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '🥵', '🥶', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄', '💋', '🩸', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦', '💨', '🕳', '💣', '💬', '👁️‍🗨️', '🗨', '🗯', '💭', '💤'
];

// Global store for drafts that persists as long as the app is loaded (cleared on reload)
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

  // Block & Social States
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [followers, setFollowers] = useState<Record<string, boolean>>({});
  const [iBlockedThem, setIBlockedThem] = useState<Record<string, boolean>>({}); 
  const [theyBlockedMe, setTheyBlockedMe] = useState<Record<string, boolean>>({}); 
  const [mutedChats, setMutedChats] = useState<Record<string, boolean>>({});
  const [archivedChats, setArchivedChats] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // --- Outside click to close emoji picker ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current && 
        !emojiPickerRef.current.contains(event.target as Node) &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // --- DRAFT MANAGEMENT ---
  const isInternalLoading = useRef(false);

  useEffect(() => {
    if (activeChatId && !isInternalLoading.current) {
      draftsStore[activeChatId] = inputText;
    }
    isInternalLoading.current = false;
  }, [inputText]);

  useEffect(() => {
    if (activeChatId) {
      const draft = draftsStore[activeChatId] || '';
      isInternalLoading.current = true; 
      setInputText(draft);
    } else {
      setInputText('');
    }
    setShowEmojiPicker(false);
  }, [activeChatId]);

  // --- SCROLL MANAGEMENT ---
  const isInitialLoadRef = useRef(true);
  const prevActiveChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeChatId !== prevActiveChatIdRef.current) {
      isInitialLoadRef.current = true;
      prevActiveChatIdRef.current = activeChatId;
    }
  }, [activeChatId]);

  useLayoutEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      if (isInitialLoadRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        isInitialLoadRef.current = false;
      } else {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [messages]);

  const currentChatId = useMemo(() => {
    if (!user || !activeChatId || !selectedChat) return null;
    return selectedChat.type === 'dm' ? [user.uid, activeChatId].sort().join('_') : activeChatId;
  }, [user, activeChatId, selectedChat]);

  // Real-time Presence Listeners for the sidebar list
  useEffect(() => {
    if (!chats.length) return;
    const dms = chats.filter(c => c.type === 'dm');
    const unsubs = dms.map(chat => {
      return onValue(ref(database, `presence/${chat.id}`), (snap) => {
        setListPresences(prev => ({ ...prev, [chat.id]: snap.val() }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [chats]);

  // Profile real-time sync
  useEffect(() => {
    if (!chats.length) return;
    const unsubscribes: (() => void)[] = [];
    chats.forEach(chat => {
      if (chat.type === 'dm') {
        const uRef = ref(database, `users/${chat.id}`);
        const unsub = onValue(uRef, (snap) => {
          if (snap.exists()) {
            const data = snap.val();
            const isBlocked = iBlockedThem[chat.id] || theyBlockedMe[chat.id];
            setUserProfiles(prev => ({
              ...prev,
              [chat.id]: { name: isBlocked ? 'Wisp User' : data.name, photoURL: isBlocked ? undefined : data.photoURL }
            }));
          }
        });
        unsubscribes.push(unsub);
      }
    });
    return () => unsubscribes.forEach(u => u());
  }, [chats, iBlockedThem, theyBlockedMe]);

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

    const friendsRef = ref(database, `friends/${user.uid}`);
    onValue(friendsRef, async (snapshot) => {
        if (snapshot.exists()) {
            const friendIds = Object.keys(snapshot.val());
            const promises = friendIds.map(uid => get(ref(database, `users/${uid}`)).then(s => {
              const u = s.val();
              return { uid, name: u?.name, photoURL: u?.photoURL };
            }));
            const details = await Promise.all(promises);
            setMyFriends(details.filter(d => d.name));
        } else {
            setMyFriends([]);
        }
    });
  }, [user]);

  useEffect(() => {
    if (!user || !activeChatId || (selectedChat && selectedChat.type !== 'dm')) {
        setTheyBlockedMe({});
        return;
    }
    const targetUid = activeChatId;
    const refPath = ref(database, `blocks/${targetUid}/${user.uid}`);
    const unsub = onValue(refPath, (snap) => {
        setTheyBlockedMe(prev => ({ ...prev, [targetUid]: snap.exists() }));
    });
    return () => unsub();
  }, [user, activeChatId, selectedChat]);

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
            unreadCount: val.unreadCount || 0
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
    if (urlChatId && urlChatId !== activeChatId) {
        const found = chats.find(c => c.id === urlChatId);
        if (found) {
            setActiveChatId(urlChatId);
        } else {
            get(ref(database, `users/${urlChatId}`)).then(snap => {
                if (snap.exists()) {
                    const u = snap.val();
                    const newTemp: ChatItem = {
                        id: urlChatId,
                        type: 'dm',
                        name: u.name || 'User',
                        photoURL: u.photoURL || undefined,
                        timestamp: Date.now()
                    };
                    setTempChat(newTemp);
                    setActiveChatId(urlChatId);
                }
            });
        }
    }
  }, [urlChatId, chats]);

  useEffect(() => {
    if (!selectedChat || selectedChat.type !== 'group') return;
    get(ref(database, `groupChats/${selectedChat.id}/members`)).then(snap => {
        if (snap.exists()) {
          Object.keys(snap.val()).forEach(mid => {
            onValue(ref(database, `users/${mid}`), (uSnap) => {
              if (uSnap.exists()) {
                const uData = uSnap.val();
                setUserProfiles(prev => ({ ...prev, [mid]: { name: uData.name, photoURL: uData.photoURL } }));
              }
            });
          });
        }
    });
  }, [selectedChat]);

  const isCurrentChatBlocked = useMemo(() => {
    if (!activeChatId || !selectedChat || selectedChat.type !== 'dm') return false;
    return iBlockedThem[activeChatId] || theyBlockedMe[activeChatId];
  }, [activeChatId, selectedChat, iBlockedThem, theyBlockedMe]);

  const filteredChats = useMemo(() => {
    return chats.filter(c => {
        if (!c || !c.id) return false;
        const isArchived = archivedChats[c.id];
        if (showArchived) return isArchived;
        if (isArchived) return false;
        if (c.type === 'group') return true;
        return following[c.id] && followers[c.id];
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [chats, archivedChats, following, followers, showArchived]);

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
    update(ref(database, `userInboxes/${user.uid}/${activeChatId}`), { unreadCount: 0 });
    if (selectedChat?.type === 'dm') onValue(ref(database, `presence/${activeChatId}`), (snap) => setFriendPresence(snap.val()));
    return () => unsubMessages();
  }, [activeChatId, currentChatId, user, selectedChat?.type]);

  const handleSelectChat = (chat: ChatItem) => {
      setActiveChatId(chat.id);
      navigate(`/inbox?chatId=${chat.id}`, { replace: true });
      update(ref(database, `userInboxes/${user!.uid}/${chat.id}`), { unreadCount: 0 });
  };

  const handleRemoveChat = async (chatId: string) => {
      if (!user) return;
      if (window.confirm("Remove this chat from your inbox?")) {
          await remove(ref(database, `userInboxes/${user.uid}/${chatId}`));
          if (activeChatId === chatId) {
              setActiveChatId(null);
              navigate('/inbox', { replace: true });
          }
          setListMenuId(null);
          setListMenuPos(null);
          delete draftsStore[chatId];
      }
  };

  const handleOpenListMenu = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setListMenuPos({ x: rect.right, y: rect.bottom });
    setListMenuId(chatId);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploadingMedia(true);
    try {
        const url = await uploadImageToCloudinary(file);
        const type = file.type.startsWith('video') ? 'video' : 'image';
        await sendMessage(undefined, { url, type });
    } catch (err) {
        console.error("Upload failed", err);
        alert("Failed to upload media.");
    } finally {
        setIsUploadingMedia(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
        e.preventDefault();
        setIsUploadingMedia(true);
        try {
            const url = await uploadImageToCloudinary(file);
            const type = file.type.startsWith('video') ? 'video' : 'image';
            await sendMessage(undefined, { url, type });
        } catch (err) {
            console.error("Paste upload failed", err);
        } finally {
            setIsUploadingMedia(false);
        }
    }
  };

  const toggleMemberSelection = (uid: string) => {
    const next = new Set(selectedMembers);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelectedMembers(next);
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
          updates[`users/${user.uid}/groupChats/${groupId}`] = true;
          selectedMembers.forEach(mid => {
              updates[`userInboxes/${mid}/${groupId}`] = { type: 'group', name: groupData.name, lastMessageAt: Date.now(), unreadCount: 1 };
              updates[`users/${mid}/groupChats/${groupId}`] = true;
          });
          await update(ref(database), updates);
          setNewGroupName('');
          setSelectedMembers(new Set());
          setViewMode('list');
          handleSelectChat({ id: groupId, type: 'group', name: groupData.name, timestamp: Date.now() });
      } catch (err) {
          console.error("Group creation failed", err);
      } finally {
          setCreatingGroup(false);
      }
  };

  const sendMessage = async (e?: React.FormEvent, attachment?: { url: string, type: 'image' | 'video' }) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachment) return;
    if (!user || !activeChatId || !selectedChat || !currentChatId) return;
    if (selectedChat.type === 'dm' && isCurrentChatBlocked) return;
    const msgText = inputText.trim();
    const timestamp = Date.now();
    setInputText('');
    draftsStore[activeChatId] = '';
    setReplyingTo(null);
    setShowEmojiPicker(false);
    update(ref(database, `typing/${currentChatId}/${user.uid}`), { isTyping: false });
    const msgData: any = { text: msgText, senderUid: user?.uid, senderName: user?.displayName, timestamp: timestamp, seen: false, replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderName: replyingTo.senderName } : null };
    if (attachment) msgData.attachment = attachment;
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    const newMsgRef = push(ref(database, `${basePath}/${currentChatId}`));
    await set(newMsgRef, msgData);
    
    const updateInbox = async (ownerUid: string, targetChatId: string, chatName: string, chatPhoto?: string, incrementUnread = false) => {
      const inboxRef = ref(database, `userInboxes/${ownerUid}/${targetChatId}`);
      const inboxSnap = await get(inboxRef);
      const currentUnread = (inboxSnap.exists() && incrementUnread) ? (inboxSnap.val().unreadCount || 0) : 0;
      const inboxData: any = { 
        lastMessage: { text: attachment ? (attachment.type === 'image' ? 'Image' : 'Video') : msgText, timestamp: timestamp, senderUid: user?.uid }, 
        lastMessageAt: timestamp, 
        name: chatName, 
        photoURL: chatPhoto || null, 
        type: selectedChat.type, 
        unreadCount: incrementUnread ? currentUnread + 1 : 0 
      };
      update(inboxRef, inboxData);
    };

    if (selectedChat.type === 'dm') {
      updateInbox(user.uid, activeChatId, selectedChat.name, selectedChat.photoURL, false);
      updateInbox(activeChatId, user.uid, user.displayName || 'User', user.photoURL || undefined, true);
    } else {
      const membersSnap = await get(ref(database, `groupChats/${activeChatId}/members`));
      if (membersSnap.exists()) {
          const members = Object.keys(membersSnap.val());
          members.forEach(memberId => {
              const isMe = memberId === user!.uid;
              updateInbox(memberId, activeChatId, selectedChat.name, selectedChat.photoURL, !isMe);
          });
      }
    }
  };

  const handleUnsend = async (msgId: string) => {
    if (!currentChatId || !activeChatId || !selectedChat || !user) return;
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    
    // 1. Delete the message
    await remove(ref(database, `${basePath}/${currentChatId}/${msgId}`));
    setUnsendConfirmId(null);

    // 2. Query remaining messages to find the new latest one
    const messagesQuery = query(ref(database, `${basePath}/${currentChatId}`), limitToLast(1));
    const snap = await get(messagesQuery);
    
    let newLastMsg = null;
    let newTimestamp = Date.now();

    if (snap.exists()) {
        const entries = Object.entries(snap.val());
        const [_, val]: [string, any] = entries[0];
        newLastMsg = {
            text: val.attachment ? (val.attachment.type === 'image' ? 'Image' : 'Video') : val.text,
            timestamp: val.timestamp,
            senderUid: val.senderUid
        };
        newTimestamp = val.timestamp;
    }

    // 3. Determine participants to update
    let participants: string[] = [];
    if (selectedChat.type === 'dm') {
        participants = [user.uid, activeChatId];
    } else {
        const membersSnap = await get(ref(database, `groupChats/${activeChatId}/members`));
        if (membersSnap.exists()) {
            participants = Object.keys(membersSnap.val());
        }
    }

    const updates: any = {};
    participants.forEach(pUid => {
        const targetId = selectedChat.type === 'dm' ? (pUid === user.uid ? activeChatId : user.uid) : activeChatId;
        updates[`userInboxes/${pUid}/${targetId}/lastMessage`] = newLastMsg;
        updates[`userInboxes/${pUid}/${targetId}/lastMessageAt`] = newTimestamp;
    });

    await update(ref(database), updates);
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    if (!currentChatId || !activeChatId || !selectedChat || !user) return;
    const basePath = selectedChat.type === 'dm' ? 'messages' : 'groupMessages';
    const reactionRef = ref(database, `${basePath}/${currentChatId}/${msgId}/reactions/${user.uid}`);
    const snap = await get(reactionRef);
    if (snap.exists() && snap.val() === emoji) await remove(reactionRef);
    else await set(reactionRef, emoji);
    setActiveReactionPickerId(null);
    setReactionPickerPos(null);
  };

  const openReactionPicker = (e: React.MouseEvent, msgId: string, isMe: boolean) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setReactionPickerPos({ x: rect.left, y: rect.top, isMe });
    setActiveReactionPickerId(msgId);
  };

  const handleReplyClick = (msg: any) => {
      setReplyingTo(msg);
      // Auto-focus the input field
      messageInputRef.current?.focus();
  };

  const lastSentMessageByMe = useMemo(() => {
    if (!user || !messages) return null;
    const myMessages = messages.filter(m => m.senderUid === user.uid && !m.system && !m.deleted);
    return myMessages.length > 0 ? myMessages[myMessages.length - 1] : null;
  }, [messages, user]);

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
    // Auto-focus back to input and ensure cursor is at the end
    setTimeout(() => {
        if (messageInputRef.current) {
            messageInputRef.current.focus();
            const length = messageInputRef.current.value.length;
            messageInputRef.current.setSelectionRange(length, length);
        }
    }, 0);
  };

  if (loading && !chats.length) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="flex h-full bg-neutral-950 overflow-hidden font-sans">
      <div className={`${activeChatId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-neutral-900 bg-neutral-950 shrink-0`}>
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
                const isSelected = activeChatId === chat.id;
                const unreadCount = chat.unreadCount || 0;
                const profile = userProfiles[chat.id];
                const presence = listPresences[chat.id];
                const displayName = chat.type === 'dm' ? (profile?.name || chat.name) : chat.name;
                const displayPhoto = chat.type === 'dm' ? (profile?.photoURL || chat.photoURL) : chat.photoURL;
                const currentDraft = draftsStore[chat.id];
                return (
                  <div key={chat.id} className="relative group/item">
                      <button onClick={() => handleSelectChat(chat)} className={`w-full flex items-center gap-4 p-4 rounded-[24px] transition-all relative ${isSelected ? 'bg-white/10 backdrop-blur-xl border border-white/10 shadow-xl' : 'hover:bg-white/[0.04] opacity-80 hover:opacity-100'}`}>
                        <div className="relative shrink-0">
                          {displayPhoto ? <img src={displayPhoto} className="w-14 h-14 rounded-full object-cover" /> : <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${isSelected ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'}`}>{displayName.charAt(0)}</div>}
                          {chat.type === 'dm' && !iBlockedThem[chat.id] && !theyBlockedMe[chat.id] && (
                            <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-neutral-950 ${presence?.online ? 'bg-emerald-500' : 'bg-neutral-600'}`}></div>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col text-left min-w-0 overflow-hidden">
                          <div className="flex justify-between items-center gap-2 mb-0.5 w-full">
                            <span className={`font-bold truncate text-base flex-1 ${isSelected ? 'text-white' : 'text-neutral-200'} ${unreadCount > 0 ? 'text-white font-black' : ''}`}>{displayName}</span>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] uppercase font-black ${isSelected ? 'text-white/60' : 'text-neutral-500'} whitespace-nowrap`}>{chat.timestamp ? new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                <div className="opacity-0 group-hover/item:opacity-100 transition-opacity z-10">
                                     <button onClick={(e) => handleOpenListMenu(e, chat.id)} className="p-1.5 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg border border-white/10 shadow-lg"><MoreVertical size={14} /></button>
                                </div>
                            </div>
                          </div>
                          <div className="flex justify-between items-center gap-2 w-full relative">
                             <p className={`text-sm truncate font-medium flex-1 pr-6 ${isSelected ? 'text-white/80' : unreadCount > 0 ? 'text-white font-black' : 'text-neutral-500'}`}>
                                {currentDraft && !isSelected ? <><span className="text-red-500 font-black">Draft: </span><span className="italic">{currentDraft}</span></> : <>{chat.lastMessage?.senderUid === user?.uid && 'You: '}{chat.lastMessage?.text || 'No messages'}</>}
                             </p>
                             {unreadCount > 0 && (
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 min-w-[20px] h-5 px-1.5 bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center rounded-full shadow-lg border-2 border-neutral-950 animate-in zoom-in">
                                    {unreadCount}
                                </div>
                             )}
                          </div>
                        </div>
                      </button>
                  </div>
                );
              })
            ) : ( <div className="flex flex-col items-center justify-center py-20 text-center px-6"><div className="w-16 h-16 bg-neutral-900 rounded-[20px] flex items-center justify-center mb-4 text-neutral-700">{showArchived ? <Archive size={32} /> : <MessageCircle size={32} />}</div><h3 className="text-white font-bold mb-1">{showArchived ? 'No archived chats' : 'No chats yet'}</h3><p className="text-neutral-500 text-sm">{showArchived ? 'Conversations you archive will appear here.' : 'Mutual followers will appear here.'}</p></div> )
          ) : (
            <div className="space-y-6 p-2 flex flex-col h-full">
                <div className="space-y-2"><label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Group Name</label><input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="E.g. Study Squad" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-bold" /></div>
                <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1"><label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3">Select Members ({selectedMembers.size})</label>{myFriends.length > 0 ? ( myFriends.map(friend => { const isSelected = selectedMembers.has(friend.uid); return ( <button key={friend.uid} onClick={() => toggleMemberSelection(friend.uid)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all border ${isSelected ? 'bg-indigo-600/10 border-indigo-500/50' : 'bg-white/[0.02] border-transparent hover:bg-white/[0.05]'}`}><div className="relative">{friend.photoURL ? <img src={friend.photoURL} className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-400">{friend.name.charAt(0)}</div>}{isSelected && <div className="absolute -top-1 -right-1 bg-indigo-500 text-white rounded-full p-0.5 border-2 border-neutral-950"><Check size={10} strokeWidth={4} /></div>}</div><span className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-neutral-400'}`}>{friend.name}</span></button> ); }) ) : ( <div className="p-4 text-center text-neutral-600 text-xs italic">You need friends to create a group.</div> )}</div>
                <div className="space-y-2 pt-4"><button onClick={handleCreateGroup} disabled={!newGroupName.trim() || selectedMembers.size === 0 || creatingGroup} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 hover:bg-indigo-500 disabled:opacity-50">{creatingGroup ? <Loader2 className="animate-spin" size={20} /> : 'Create Group'}</button><button onClick={() => setViewMode('list')} className="w-full bg-neutral-800 text-neutral-400 py-3 rounded-2xl font-black transition-all">Cancel</button></div>
            </div>
          )}
        </div>
      </div>

      {activeChatId && selectedChat ? (
        <div className="flex-1 flex flex-col bg-neutral-950 relative overflow-hidden">
          {chatLoading ? ( <div className="flex-1 flex items-center justify-center"><div className="flex flex-col items-center gap-3"><Loader2 className="animate-spin text-indigo-500" size={32} /><span className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Opening Chat...</span></div></div> ) : (
            <>
              <div className="p-4 md:p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950/80 backdrop-blur-2xl z-20">
                <div className="flex items-center gap-4 min-w-0">
                  <button onClick={() => { setActiveChatId(null); navigate('/inbox', { replace: true }); }} className="md:hidden p-2 text-neutral-500 hover:text-white transition-colors"><ArrowLeft size={24} /></button>
                  <div className="relative cursor-pointer" onClick={() => navigate(selectedChat.type === 'dm' ? `/profile/${activeChatId}` : `/group/${activeChatId}/settings`)}>{(selectedChat.type === 'dm' ? userProfiles[activeChatId]?.photoURL : selectedChat.photoURL) ? <img src={selectedChat.type === 'dm' ? userProfiles[activeChatId]?.photoURL : selectedChat.photoURL} className="w-10 h-10 md:w-11 md:h-11 rounded-full object-cover" /> : <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-neutral-800 flex items-center justify-center text-lg font-bold text-neutral-500">{(selectedChat.type === 'dm' ? userProfiles[activeChatId]?.name : selectedChat.name)?.charAt(0) || '?'}</div>}{selectedChat.type === 'dm' && friendPresence?.online && !isCurrentChatBlocked && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-neutral-950"></div>}</div>
                  <div className="flex flex-col min-w-0"><span className="font-bold text-white truncate leading-tight text-base md:text-lg">{selectedChat.type === 'dm' ? (userProfiles[activeChatId]?.name || selectedChat.name) : selectedChat.name}</span><span className="text-[9px] md:text-[10px] uppercase font-black text-neutral-500 tracking-wider">{selectedChat.type === 'dm' ? (isCurrentChatBlocked ? 'Blocked' : friendPresence?.online ? 'Online' : 'Offline') : 'Group Chat'}</span></div>
                </div>
                <div className="relative"><button onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)} className={`p-3 rounded-2xl transition-all ${isHeaderMenuOpen ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}><MoreVertical size={20} /></button>{isHeaderMenuOpen && <div className="absolute right-0 top-full mt-2 w-48 bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-1 z-[100]">{selectedChat.type === 'group' && <button onClick={() => { setIsHeaderMenuOpen(false); navigate(`/group/${activeChatId}/settings`); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-xl"><Settings size={18} /> Group Settings</button>}<button onClick={() => { setIsHeaderMenuOpen(false); navigate(selectedChat.type === 'dm' ? `/profile/${activeChatId}` : `/group/${activeChatId}/settings`); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-300 hover:bg-white/5 rounded-xl"><UserCircle2 size={18} /> View {selectedChat.type === 'dm' ? 'Profile' : 'Members'}</button></div>}</div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 pb-20" ref={scrollContainerRef}>{messages.map((msg, index) => { const isMe = msg.senderUid === user?.uid; const reactions = msg.reactions ? Object.entries(msg.reactions) : []; const isLastSentByMe = msg.id === lastSentMessageByMe?.id; const senderProfile = userProfiles[msg.senderUid]; return ( <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg relative mb-2`}><div className={`flex gap-3 max-w-[90%] md:max-w-[75%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>{(selectedChat.type === 'group' || (!isMe && selectedChat.type === 'dm')) && <div className="shrink-0 self-end mb-1">{senderProfile?.photoURL ? <img src={senderProfile.photoURL} className="w-8 h-8 rounded-full border border-white/5 object-cover" /> : <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-neutral-500">{senderProfile?.name?.charAt(0) || msg.senderName?.charAt(0) || '?'}</div>}</div>}<div className="flex flex-col min-w-0 relative">{selectedChat.type === 'group' && !isMe && <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest ml-3 mb-1">{senderProfile?.name || msg.senderName}</span>}<div onDoubleClick={() => handleReaction(msg.id, '❤️')} className={`flex flex-col rounded-[22px] relative shadow-lg cursor-pointer ${isMe ? 'bg-indigo-600 text-white rounded-br-lg' : 'bg-[#1f1f1f] text-neutral-200 rounded-bl-lg border border-white/5'}`}>{msg.replyTo && <div className="mx-1 mt-1 px-3 py-2 rounded-[18px] bg-black/20 border-l-4 border-indigo-400 mb-1"><p className="text-[10px] font-black uppercase text-indigo-400">{msg.replyTo.senderName}</p><p className="text-xs truncate opacity-70">{msg.replyTo.text}</p></div>}{msg.attachment && <div className="p-1">{msg.attachment.type === 'image' ? <img src={msg.attachment.url} className="max-w-full rounded-[18px] max-h-[300px] object-cover" /> : <div className="relative group/vid"><video src={msg.attachment.url} className="max-w-full rounded-[18px] max-h-[300px] object-cover" /><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/vid:opacity-100 bg-black/20"><button onClick={(e) => { e.stopPropagation(); const vid = e.currentTarget.parentElement?.previousElementSibling as HTMLVideoElement; if (vid.paused) vid.play(); else vid.pause(); }} className="p-4 bg-black/40 text-white rounded-full"><Play fill="currentColor" size={24} /></button></div></div>}</div>}<div className="px-4 py-2.5"><p className="inline-block whitespace-pre-wrap text-sm select-none">{msg.text}</p></div>{reactions.length > 0 && <div className={`absolute -bottom-2 ${isMe ? 'right-2' : 'left-2'} flex gap-1 bg-neutral-900 border border-white/10 rounded-full px-1.5 py-0.5 shadow-xl z-10 hover:bg-neutral-800 cursor-pointer`} onClick={(e) => openReactionPicker(e, msg.id, isMe)}>{reactions.map(([uid, emoji]) => <span key={uid} className="text-[10px] animate-reaction-bounce">{emoji as string}</span>)}</div>}<div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-20 ${isMe ? 'right-full mr-2' : 'left-full ml-2'}`}><button onClick={() => handleReplyClick(msg)} className="p-2 text-neutral-500 hover:text-white rounded-full transition-all"><Reply size={16} /></button><button onClick={(e) => openReactionPicker(e, msg.id, isMe)} className="p-2 text-neutral-500 hover:text-white rounded-full transition-all"><SmilePlus size={16} /></button>{isMe && <button onClick={() => setUnsendConfirmId(msg.id)} className="p-2 text-neutral-500 hover:text-red-400 rounded-full transition-all"><Trash size={16} /></button>}</div></div></div></div>{isLastSentByMe && <div className="flex items-center gap-1 mt-1 mr-1 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{msg.seen ? <><CheckCheck size={12} className="text-indigo-500" /> Seen</> : <><Check size={12} /> Sent</>}</div>}</div> ); })}<div ref={messagesEndRef} /></div>
              <div className="p-4 md:p-6 bg-neutral-950 border-t border-neutral-900 z-30">
                <div className="max-w-5xl mx-auto flex flex-col gap-2 relative">
                  {showEmojiPicker && (
                    <div 
                      ref={emojiPickerRef} 
                      className="absolute bottom-full mb-4 right-0 w-80 h-96 bg-[#1a1a1a]/60 backdrop-blur-[40px] border border-white/10 rounded-[32px] shadow-[0_8px_48px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden z-[100] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300"
                    >
                      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] ml-2">Express Yourself</span>
                        <button onClick={() => setShowEmojiPicker(false)} className="p-1.5 text-neutral-500 hover:text-white hover:bg-white/10 rounded-full transition-colors"><X size={14} /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar grid grid-cols-6 gap-1">
                        {COMMON_EMOJIS.map(emoji => (
                          <button 
                            key={emoji} 
                            onClick={() => addEmoji(emoji)}
                            className="p-2.5 hover:bg-white/10 rounded-2xl text-xl transition-all active:scale-90 hover:scale-110"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {replyingTo && <div className="flex items-center justify-between bg-white/5 px-4 py-2 rounded-2xl border border-white/5 mb-2"><div className="flex items-center gap-3 overflow-hidden"><Reply size={14} className="text-indigo-400" /><div className="flex flex-col min-w-0"><span className="text-[10px] font-black uppercase text-indigo-400">{replyingTo.senderName}</span><span className="text-xs text-neutral-400 truncate">{replyingTo.text}</span></div></div><button onClick={() => setReplyingTo(null)} className="p-1 text-neutral-500 hover:text-white"><X size={16} /></button></div>}
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 bg-white/[0.04] border border-white/5 rounded-[28px] p-1.5 flex items-end relative">
                      <button onClick={() => fileInputRef.current?.click()} disabled={isUploadingMedia} className="p-3 text-neutral-500 hover:text-indigo-400 transition-all">{isUploadingMedia ? <Loader2 className="animate-spin" size={20} /> : <Paperclip size={20} />}</button>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,video/*" />
                      <textarea 
                        ref={messageInputRef}
                        rows={1} 
                        value={inputText} 
                        onChange={(e) => { setInputText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} 
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} 
                        onPaste={handlePaste} 
                        placeholder="Message…" 
                        className="flex-1 bg-transparent border-none text-white text-[15px] px-3 py-2.5 focus:outline-none resize-none max-h-40 overflow-y-auto custom-scrollbar" 
                      />
                      <button 
                        ref={emojiButtonRef}
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                        className={`p-3 transition-all rounded-full ${showEmojiPicker ? 'text-indigo-400 bg-white/10' : 'text-neutral-500 hover:text-indigo-400 hover:bg-white/5'}`}
                      >
                        <Smile size={20} />
                      </button>
                    </div>
                    <button onClick={() => sendMessage()} disabled={!inputText.trim() && !isUploadingMedia} className={`p-4 rounded-full transition-all shadow-lg active:scale-95 flex items-center justify-center shrink-0 ${inputText.trim() ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-neutral-800 text-neutral-600'}`}><Send size={20} /></button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : ( <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-neutral-950 text-center px-12"><div className="w-24 h-24 bg-neutral-900 border border-white/5 rounded-[32px] flex items-center justify-center mb-8"><MessageCircle size={40} className="text-indigo-500" /></div><h2 className="text-3xl font-black text-white tracking-tight mb-3">Select a conversation</h2><p className="text-neutral-500 max-w-xs leading-relaxed">Choose a mutual follower to start chatting.</p></div> )}

      {activeReactionPickerId && reactionPickerPos && createPortal(
          <div className="fixed inset-0 z-[1000]"><div className="absolute inset-0 bg-transparent" onClick={() => { setActiveReactionPickerId(null); setReactionPickerPos(null); }}></div><div style={{ position: 'fixed', top: `${reactionPickerPos.y - 50}px`, left: reactionPickerPos.isMe ? `${reactionPickerPos.x - 200}px` : `${reactionPickerPos.x}px`, zIndex: 1001 }} className="bg-neutral-900 border border-white/10 rounded-full p-1.5 shadow-2xl flex gap-1 animate-in zoom-in fade-in">{REACTION_EMOJIS.map(emoji => ( <button key={emoji} onClick={() => handleReaction(activeReactionPickerId, emoji)} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-xl transition-transform hover:scale-125">{emoji}</button> ))}</div></div>,
          document.body
      )}

      {listMenuId && listMenuPos && createPortal(
          <div className="fixed inset-0 z-[9999]"><div className="absolute inset-0 bg-transparent" onClick={() => { setListMenuId(null); setListMenuPos(null); }}></div><div style={{ position: 'fixed', top: `${listMenuPos.y + 8}px`, left: `${listMenuPos.x - 192}px`, zIndex: 10000 }} className="w-48 bg-neutral-900 border border-white/10 rounded-[20px] shadow-2xl p-1.5"><button onClick={() => handleRemoveChat(listMenuId)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"><Trash2 size={18} /> Remove Chat</button></div></div>,
          document.body
      )}

      {unsendConfirmId && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in"><div className="bg-neutral-900 border border-white/10 rounded-[32px] p-8 max-w-xs w-full text-center shadow-2xl animate-in zoom-in"><div className="w-16 h-16 bg-red-500/10 rounded-[24px] flex items-center justify-center mx-auto mb-6"><AlertCircle size={32} className="text-red-500" /></div><h3 className="text-xl font-black text-white mb-2">Unsend message?</h3><p className="text-neutral-400 text-sm mb-8">This will permanently remove the message for everyone.</p><div className="flex flex-col gap-2"><button onClick={() => handleUnsend(unsendConfirmId)} className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl transition-all shadow-lg active:scale-[0.98]">Unsend</button><button onClick={() => setUnsendConfirmId(null)} className="w-full py-3.5 bg-neutral-800 text-neutral-400 hover:text-white font-black rounded-2xl transition-all">Cancel</button></div></div></div>
      )}
    </div>
  );
};