import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, set, remove, query, orderByChild, limitToLast } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { 
  Heart, MessageCircle, Send, Image as ImageIcon, X, Plus, 
  Loader2, Zap, User, MoreVertical, Compass, Edit3, Trash2, AlertCircle
} from 'lucide-react';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';

export interface Post {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  type: 'text' | 'image' | 'session';
  content: string;
  images?: string[];
  timestamp: number;
  sessionData?: {
    duration: number;
    mode: string;
    roomCode?: string;
  };
}

interface Comment {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  timestamp: number;
}

export const Pulse: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);

  useEffect(() => {
    if (!user) return;
    const followingRef = ref(database, `following/${user.uid}`);
    const unsub = onValue(followingRef, (snap) => {
      setFollowing(snap.val() || {});
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const postsRef = query(ref(database, 'posts'), orderByChild('timestamp'), limitToLast(50));
    const unsub = onValue(postsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.entries(data)
          .map(([id, val]: [string, any]) => ({ id, ...val }))
          .filter(p => p.authorUid === user.uid || following[p.authorUid])
          .sort((a, b) => b.timestamp - a.timestamp);
        setPosts(list);
      } else {
        setPosts([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user, following]);

  if (loading) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-y-auto custom-scrollbar relative pb-24 md:pb-8">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-indigo-600/5 blur-[120px] pointer-events-none -z-0"></div>

      <div className="max-w-2xl w-full mx-auto px-4 py-8 relative z-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Compass size={32} className="text-indigo-500" /> Pulse
          </h1>
        </div>

        {/* Inline Create Trigger - Visual emphasis on media */}
        <div 
          onClick={() => setShowCreateModal(true)}
          className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-[24px] p-4 mb-8 flex items-center gap-4 cursor-pointer hover:bg-white/[0.05] transition-all group shadow-xl"
        >
          <div className="w-10 h-10 rounded-full bg-neutral-900 border border-white/5 overflow-hidden shrink-0">
             {user?.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-neutral-500"><User size={20} /></div>}
          </div>
          <div className="flex-1 text-neutral-500 font-medium text-sm group-hover:text-neutral-400 transition-colors">
            Share a study update with photos...
          </div>
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:bg-indigo-500 group-hover:text-white transition-all">
            <ImageIcon size={18} />
          </div>
        </div>

        <div className="space-y-6">
          {posts.length > 0 ? (
            posts.map(post => (
              <PostCard 
                key={post.id} 
                post={post} 
                onOpenComments={() => setActiveCommentsPost(post)} 
              />
            ))
          ) : (
            <div className="text-center py-20 flex flex-col items-center gap-4 animate-in fade-in duration-700">
              <div className="w-20 h-20 bg-neutral-900/50 rounded-full flex items-center justify-center border border-white/5 shadow-inner">
                <Compass size={32} className="text-neutral-800" />
              </div>
              <div className="space-y-1">
                <p className="text-white font-bold text-lg">Your pulse is quiet</p>
                <p className="text-neutral-500 text-sm max-w-[240px] mx-auto leading-relaxed">Follow your study partners to see their thoughts and sessions here.</p>
              </div>
              <button onClick={() => navigate('/search')} className="bg-white/5 hover:bg-white/10 text-indigo-400 px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest border border-white/5 transition-all mt-4">Discover People</button>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && <CreatePostModal onClose={() => setShowCreateModal(false)} />}
      {activeCommentsPost && <CommentsModal post={activeCommentsPost} onClose={() => setActiveCommentsPost(null)} />}
    </div>
  );
};

export const PostCard: React.FC<{ post: Post, onOpenComments: () => void }> = ({ post, onOpenComments }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [commentsCount, setCommentsCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onValue(ref(database, `postLikes/${post.id}`), (snap) => setLikes(snap.val() || {}));
    onValue(ref(database, `postComments/${post.id}`), (snap) => setCommentsCount(snap.exists() ? Object.keys(snap.val()).length : 0));
  }, [post.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    const likeRef = ref(database, `postLikes/${post.id}/${user.uid}`);
    if (likes[user.uid]) await remove(likeRef);
    else await set(likeRef, true);
  };

  const handleDeletePost = async () => {
    try {
      await remove(ref(database, `posts/${post.id}`));
      // Cleanup associated data
      await remove(ref(database, `postLikes/${post.id}`));
      await remove(ref(database, `postComments/${post.id}`));
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error(err);
      alert("Failed to delete post.");
    }
  };

  const isLiked = user ? likes[user.uid] : false;
  const likesCount = Object.keys(likes).length;
  const isAuthor = user?.uid === post.authorUid;

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-[32px] overflow-hidden shadow-2xl transition-all hover:bg-white/[0.05] animate-in fade-in slide-in-from-bottom-4 duration-500 group/post">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/profile/${post.authorUid}`)}>
            <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden ring-2 ring-transparent group-hover/post:ring-indigo-500/20 transition-all">
                {post.authorPhoto ? (
                <img src={post.authorPhoto} className="w-full h-full object-cover" />
                ) : (
                <div className="w-full h-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{post.authorName.charAt(0)}</div>
                )}
            </div>
            <div className="flex flex-col">
              <span className="text-white font-bold text-sm tracking-tight">{post.authorName}</span>
              <span className="text-[10px] font-black text-neutral-600 uppercase tracking-widest leading-none mt-0.5">{formatTime(post.timestamp)}</span>
            </div>
          </div>
          
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              className="p-2 text-neutral-600 hover:text-white transition-colors"
            >
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in duration-200">
                {isAuthor ? (
                  <button 
                    onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-500/5 transition-colors"
                  >
                    <Trash2 size={16} /> Delete post
                  </button>
                ) : (
                  <button 
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-400 hover:bg-white/5 transition-colors"
                  >
                    <AlertCircle size={16} /> Report
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {post.type === 'image' && post.images && (
            <div className={`grid gap-2 overflow-hidden rounded-3xl border border-white/5 ${post.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {post.images.map((img, i) => (
                <img 
                  key={i} 
                  src={img} 
                  className={`w-full object-cover hover:scale-105 transition-transform duration-700 ${post.images!.length === 3 && i === 0 ? 'col-span-2 h-72' : 'h-56'}`} 
                  alt="Post content" 
                />
              ))}
            </div>
          )}

          {post.type === 'session' && post.sessionData && (
            <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-5 flex items-center justify-between group shadow-inner">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-900/40 transition-transform group-hover:scale-110">
                  <Zap size={24} className="text-white animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] leading-none mb-1.5">Session Pulse</span>
                  <span className="text-white font-bold text-sm">
                    Focused for {Math.floor(post.sessionData.duration / 60)} mins
                  </span>
                </div>
              </div>
              {post.sessionData.roomCode && (
                <button 
                  onClick={() => navigate(`/group/${post.sessionData?.roomCode}`)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all shadow-lg active:scale-95"
                >
                  Study Together
                </button>
              )}
            </div>
          )}

          {post.content && (
            <p className="text-neutral-200 text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
              {post.content}
            </p>
          )}
        </div>

        <div className="flex items-center gap-6 mt-7 pt-5 border-t border-white/[0.05]">
          <button 
            onClick={handleLike}
            className={`flex items-center gap-2 transition-all ${isLiked ? 'text-red-500 scale-110' : 'text-neutral-500 hover:text-red-500'}`}
          >
            <Heart size={20} className={isLiked ? 'fill-current' : ''} />
            <span className="text-xs font-bold">{likesCount || ''}</span>
          </button>
          
          <button 
            onClick={(e) => { e.stopPropagation(); onOpenComments(); }}
            className="flex items-center gap-2 text-neutral-500 hover:text-indigo-400 transition-all"
          >
            <MessageCircle size={20} />
            <span className="text-xs font-bold">{commentsCount || ''}</span>
          </button>
        </div>
      </div>

      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-[32px] p-8 max-w-xs w-full text-center shadow-2xl animate-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-500/10 rounded-[24px] flex items-center justify-center mx-auto mb-6"><Trash2 size={32} className="text-red-500" /></div>
            <h3 className="text-xl font-black text-white mb-2">Delete this post?</h3>
            <p className="text-neutral-500 text-sm mb-8">This action can't be undone.</p>
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleDeletePost} 
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-red-900/20 active:scale-95"
              >
                Delete
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(false)} 
                className="w-full py-4 bg-neutral-800 text-neutral-400 hover:text-white rounded-2xl transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const CreatePostModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).slice(0, 3 - images.length) as File[];
      setImages([...images, ...files]);
      const newPreviews = files.map((f: Blob) => URL.createObjectURL(f));
      setPreviews([...previews, ...newPreviews]);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!user || images.length === 0) return;
    setLoading(true);

    try {
      const imageUrls = await Promise.all(images.map(img => uploadImageToCloudinary(img)));
      
      const newPostRef = push(ref(database, 'posts'));
      await set(newPostRef, {
        authorUid: user.uid,
        authorName: user.displayName,
        authorPhoto: user.photoURL,
        type: 'image',
        content: text.trim(),
        images: imageUrls,
        timestamp: Date.now()
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to share your post.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 w-full max-w-lg rounded-[40px] p-8 shadow-2xl animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-black text-white">Create Pulse</h3>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors"><X size={24} /></button>
        </div>

        <div className="space-y-6">
          {/* Media First Selection Area */}
          <div className="flex flex-col gap-4">
            {previews.length === 0 ? (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-square md:aspect-video rounded-[32px] border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-4 hover:bg-white/5 hover:border-indigo-500/50 transition-all group"
              >
                <div className="w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ImageIcon size={32} />
                </div>
                <div className="text-center">
                  <p className="text-white font-bold">Select photos</p>
                  <p className="text-neutral-500 text-xs mt-1 uppercase tracking-widest">Share what you're studying</p>
                </div>
              </button>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                {previews.map((p, i) => (
                  <div key={i} className="relative w-40 h-40 shrink-0 rounded-2xl overflow-hidden border border-white/10 group shadow-lg">
                    <img src={p} className="w-full h-full object-cover" />
                    <button onClick={() => removeImage(i)} className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black active:scale-90 transition-all"><X size={12} /></button>
                  </div>
                ))}
                {previews.length < 3 && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-40 h-40 shrink-0 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <Plus size={24} />
                  </button>
                )}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" multiple />
          </div>

          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-neutral-900 border border-white/5 shadow-inner shrink-0 mt-1">
              {user?.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-neutral-500"><User size={24} /></div>}
            </div>
            <textarea 
              value={text}
              onChange={e => setText(e.target.value.slice(0, 500))}
              placeholder="Write a caption... (optional)"
              className="flex-1 bg-transparent border-none text-white text-lg focus:outline-none resize-none min-h-[100px] placeholder:text-neutral-700 custom-scrollbar"
            />
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-white/5">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.2em]">{text.length}/500</span>
            </div>
            
            <button 
              onClick={handlePost}
              disabled={loading || images.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-10 py-3.5 rounded-2xl font-bold shadow-lg shadow-indigo-900/20 flex items-center gap-2 transition-all active:scale-95"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Pulse'}
            </button>
          </div>
          {images.length === 0 && (
            <p className="text-[10px] text-center text-neutral-600 uppercase font-black tracking-widest animate-pulse">Photo required to post</p>
          )}
        </div>
      </div>
    </div>
  );
};

const CommentsModal: React.FC<{ post: Post, onClose: () => void }> = ({ post, onClose }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const commentsRef = ref(database, `postComments/${post.id}`);
    const unsub = onValue(commentsRef, (snap) => {
      if (snap.exists()) {
        const list = Object.entries(snap.val())
          .map(([id, val]: [string, any]) => ({ id, ...val }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setComments(list);
      } else {
        setComments([]);
      }
    });
    return () => unsub();
  }, [post.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [comments]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !text.trim() || loading) return;
    setLoading(true);

    try {
      const newCommentRef = push(ref(database, `postComments/${post.id}`));
      await set(newCommentRef, {
        authorUid: user.uid,
        authorName: user.displayName,
        authorPhoto: user.photoURL,
        text: text.trim(),
        timestamp: Date.now()
      });
      setText('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in" onClick={onClose}>
      <div className="bg-[#1a1a1a] border-t md:border border-white/10 w-full max-w-xl h-[85vh] md:h-[70vh] rounded-t-[40px] md:rounded-[40px] flex flex-col shadow-2xl animate-in slide-in-from-bottom-20 duration-500" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h3 className="text-white font-black text-lg">Replies</h3>
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-black">Conversations on {post.authorName}'s post</span>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors"><X size={24} /></button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {comments.length > 0 ? (
            comments.map(c => (
              <div key={c.id} className="flex gap-4 group/comment animate-in fade-in">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-white/5 overflow-hidden shrink-0">
                    {c.authorPhoto ? (
                    <img src={c.authorPhoto} className="w-full h-full object-cover" />
                    ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-500">{c.authorName?.charAt(0)}</div>
                    )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{c.authorName}</span>
                    <span className="text-[9px] text-neutral-600 font-black uppercase tracking-widest">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-neutral-400 text-[13px] leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-neutral-700 space-y-3 opacity-30">
              <MessageCircle size={40} />
              <p className="text-xs font-black uppercase tracking-widest">Start the conversation</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-neutral-900/50 border-t border-white/5 shrink-0">
          <form onSubmit={handleAddComment} className="flex gap-3">
            <input 
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Write a reply..."
              className="flex-1 bg-white/5 border border-white/10 text-white text-sm px-6 py-4 rounded-2xl focus:outline-none focus:border-indigo-500 transition-all placeholder:text-neutral-600"
            />
            <button 
              type="submit" 
              disabled={loading || !text.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-4 rounded-2xl transition-all shadow-lg active:scale-95"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};