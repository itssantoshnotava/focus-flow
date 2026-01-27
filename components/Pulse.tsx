// Fix: Added useMemo to the React imports
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ref, onValue, push, set, remove, query, orderByChild, limitToLast } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { 
  Heart, MessageCircle, Send, Image as ImageIcon, X, Plus, 
  Loader2, Zap, User, MoreVertical, Compass, Edit3, Trash2, AlertCircle,
  Music, Play, Pause, Search as SearchIcon, Volume2, VolumeX, Check,
  Film, ChevronLeft, ChevronRight
} from 'lucide-react';
import { uploadMediaToCloudinary } from '../utils/cloudinary';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';

// Global reference to handle "Only one playing at a time"
let globalAudioInstance: HTMLAudioElement | null = null;
let globalSetIsPlaying: ((val: boolean) => void) | null = null;

export interface MusicMetadata {
  trackName: string;
  artistName: string;
  previewUrl: string;
  artworkUrl: string;
}

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

export interface Post {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  type: 'text' | 'image' | 'video' | 'session';
  content: string;
  images?: string[]; // Legacy support
  media?: MediaItem[];
  timestamp: number;
  music?: MusicMetadata;
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

        <div 
          onClick={() => setShowCreateModal(true)}
          className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-[24px] p-4 mb-8 flex items-center gap-4 cursor-pointer hover:bg-white/[0.05] transition-all group shadow-xl"
        >
          <div className="w-10 h-10 rounded-full bg-neutral-900 border border-white/5 overflow-hidden shrink-0">
             {user?.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-neutral-500"><User size={20} /></div>}
          </div>
          <div className="flex-1 text-neutral-500 font-medium text-sm group-hover:text-neutral-400 transition-colors">
            Pulse your study progress...
          </div>
          <div className="flex gap-2">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:bg-indigo-500 group-hover:text-white transition-all">
              <ImageIcon size={18} />
            </div>
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl group-hover:bg-purple-500 group-hover:text-white transition-all">
              <Film size={18} />
            </div>
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const mediaItems = useMemo(() => {
    if (post.media) return post.media;
    if (post.images) return post.images.map(url => ({ url, type: 'image' as const }));
    return [];
  }, [post.media, post.images]);

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

  // Audio & Autoplay logic
  useEffect(() => {
    const audio = post.music?.previewUrl ? new Audio(post.music.previewUrl) : null;
    if (audio) {
      audio.loop = true;
      audio.volume = 0.6;
      audioRef.current = audio;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        
        // Handle Music
        if (audio) {
          if (isVisible) {
            if (globalAudioInstance && globalAudioInstance !== audio) {
                globalAudioInstance.pause();
                if (globalSetIsPlaying) globalSetIsPlaying(false);
            }
            audio.play().then(() => {
                setIsPlaying(true);
                globalAudioInstance = audio;
                globalSetIsPlaying = setIsPlaying;
            }).catch(() => setIsPlaying(false));
          } else {
            audio.pause();
            setIsPlaying(false);
            if (globalAudioInstance === audio) {
                globalAudioInstance = null;
                globalSetIsPlaying = null;
            }
          }
        }

        // Handle Video Autoplay
        videoRefs.current.forEach(video => {
          if (video) {
            if (isVisible) {
              video.play().catch(() => {});
            } else {
              video.pause();
            }
          }
        });
      });
    }, { threshold: 0.6 });

    if (cardRef.current) observer.observe(cardRef.current);

    return () => {
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      observer.disconnect();
    };
  }, [post.music]);

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
      await remove(ref(database, `postLikes/${post.id}`));
      await remove(ref(database, `postComments/${post.id}`));
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error(err);
      alert("Failed to delete post.");
    }
  };

  const togglePlayback = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (globalAudioInstance && globalAudioInstance !== audioRef.current) {
          globalAudioInstance.pause();
          if (globalSetIsPlaying) globalSetIsPlaying(false);
      }
      audioRef.current.play().then(() => {
          setIsPlaying(true);
          globalAudioInstance = audioRef.current;
          globalSetIsPlaying = setIsPlaying;
      }).catch(console.error);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !isMuted;
    if (audioRef.current) audioRef.current.muted = newMuted;
    videoRefs.current.forEach(v => { if (v) v.muted = newMuted; });
    setIsMuted(newMuted);
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
    <div ref={cardRef} className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-[32px] overflow-hidden shadow-2xl transition-all hover:bg-white/[0.05] animate-in fade-in slide-in-from-bottom-4 duration-500 group/post">
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
            <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-neutral-600 hover:text-white transition-colors">
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in duration-200">
                {isAuthor ? (
                  <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-500/5 transition-colors">
                    <Trash2 size={16} /> Delete post
                  </button>
                ) : (
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-400 hover:bg-white/5 transition-colors">
                    <AlertCircle size={16} /> Report
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 relative">
          {mediaItems.length > 0 && (
            <div className="relative rounded-3xl overflow-hidden border border-white/5 aspect-[4/5] bg-black/20 group/media">
              <div className="flex h-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${currentMediaIndex * 100}%)` }}>
                {mediaItems.map((item, i) => (
                  <div key={i} className="w-full h-full shrink-0 relative">
                    {item.type === 'video' ? (
                      <video 
                        ref={el => videoRefs.current[i] = el}
                        src={item.url}
                        className="w-full h-full object-cover"
                        loop
                        muted
                        playsInline
                      />
                    ) : (
                      <img src={item.url} className="w-full h-full object-cover" alt="Post content" />
                    )}
                  </div>
                ))}
              </div>

              {/* Media Navigation */}
              {mediaItems.length > 1 && (
                <>
                  <button 
                    onClick={() => setCurrentMediaIndex(prev => Math.max(0, prev - 1))}
                    className={`absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/40 backdrop-blur-md rounded-full text-white transition-opacity ${currentMediaIndex === 0 ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover/media:opacity-100'}`}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    onClick={() => setCurrentMediaIndex(prev => Math.min(mediaItems.length - 1, prev + 1))}
                    className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/40 backdrop-blur-md rounded-full text-white transition-opacity ${currentMediaIndex === mediaItems.length - 1 ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover/media:opacity-100'}`}
                  >
                    <ChevronRight size={20} />
                  </button>
                  {/* Dots */}
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {mediaItems.map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentMediaIndex ? 'bg-indigo-500 w-3' : 'bg-white/30'}`} />
                    ))}
                  </div>
                </>
              )}

              {/* Music Badge Overlay */}
              {post.music && (
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between z-20">
                   <div 
                    onClick={togglePlayback}
                    className="flex items-center gap-2.5 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full px-3 py-1.5 cursor-pointer hover:bg-black/70 transition-all max-w-[75%]"
                   >
                     <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white shrink-0 shadow-lg">
                       {isPlaying ? <Music size={12} className="animate-pulse" /> : <Play size={12} fill="currentColor" />}
                     </div>
                     <div className="flex flex-col min-w-0 marquee-container">
                       <span className={`text-[10px] text-white font-black tracking-tight whitespace-nowrap ${post.music.trackName.length > 18 ? 'animate-marquee' : ''}`}>
                         {post.music.trackName}
                       </span>
                       <span className="text-[8px] text-neutral-400 font-bold uppercase tracking-widest truncate leading-none">{post.music.artistName}</span>
                     </div>
                   </div>
                   <button 
                    onClick={toggleMute}
                    className="p-2.5 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full text-white hover:bg-black/70 transition-all shadow-lg active:scale-90"
                   >
                     {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                   </button>
                </div>
              )}
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
            <p className="text-neutral-200 text-[15px] leading-relaxed whitespace-pre-wrap font-medium px-1">
              {post.content}
            </p>
          )}
        </div>

        <div className="flex items-center gap-6 mt-7 pt-5 border-t border-white/[0.05]">
          <button 
            onClick={handleLike}
            className={`flex items-center gap-2 transition-all ${isLiked ? 'text-red-500 scale-110' : 'text-neutral-500 hover:text-red-500'}`}
          >
            <Heart size={22} className={isLiked ? 'fill-current' : ''} />
            <span className="text-xs font-black tracking-widest">{likesCount || ''}</span>
          </button>
          
          <button 
            onClick={(e) => { e.stopPropagation(); onOpenComments(); }}
            className="flex items-center gap-2 text-neutral-500 hover:text-indigo-400 transition-all"
          >
            <MessageCircle size={22} />
            <span className="text-xs font-black tracking-widest">{commentsCount || ''}</span>
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

const MusicPickerModal: React.FC<{ onSelect: (music: MusicMetadata) => void, onClose: () => void }> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchPopular();
  }, []);

  const fetchPopular = async () => {
    try {
      // Fetching study-friendly / trending music
      const resp = await fetch(`https://itunes.apple.com/search?term=study+lofi&media=music&entity=song&limit=10`);
      const data = await resp.json();
      setPopular(data.results || []);
    } catch (e) { console.error(e); }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=20`);
      const data = await resp.json();
      setResults(data.results || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const togglePreview = (url: string) => {
    if (previewingUrl === url) {
      audioRef.current?.pause();
      setPreviewingUrl(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audio.play();
      audioRef.current = audio;
      setPreviewingUrl(url);
      audio.onended = () => setPreviewingUrl(null);
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center p-0 md:p-4 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={onClose}>
      <div className="bg-[#1a1a1a] border-t md:border border-white/10 w-full max-w-lg rounded-t-[40px] md:rounded-[40px] h-[80vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-20 duration-500" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <h3 className="text-xl font-black text-white">Add Music</h3>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors"><X size={24} /></button>
        </div>

        <div className="p-6 border-b border-white/5 shrink-0">
           <div className="relative">
             <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-700" />
             <input 
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search tracks, artists..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white placeholder:text-neutral-700 focus:outline-none focus:border-indigo-500 transition-all text-sm"
             />
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-6">
          {!query && popular.length > 0 && (
            <div className="space-y-3">
              <h4 className="px-3 text-[10px] font-black uppercase text-neutral-500 tracking-widest">Popular for studying</h4>
              {popular.map(track => (
                <TrackItem key={track.trackId} track={track} onSelect={onSelect} previewingUrl={previewingUrl} togglePreview={togglePreview} />
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>
          ) : results.length > 0 ? (
            <div className="space-y-1">
              <h4 className="px-3 text-[10px] font-black uppercase text-neutral-500 tracking-widest">Search Results</h4>
              {results.map(track => (
                <TrackItem key={track.trackId} track={track} onSelect={onSelect} previewingUrl={previewingUrl} togglePreview={togglePreview} />
              ))}
            </div>
          ) : query ? (
            <div className="py-20 text-center text-neutral-600 text-sm font-bold uppercase tracking-widest">No songs found</div>
          ) : popular.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center gap-4 text-neutral-700">
               <Music size={40} className="opacity-10" />
               <p className="text-xs font-black uppercase tracking-[0.2em]">Add vibes to your pulse</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TrackItem: React.FC<{ track: any, onSelect: (m: MusicMetadata) => void, previewingUrl: string | null, togglePreview: (u: string) => void }> = ({ track, onSelect, previewingUrl, togglePreview }) => (
  <div 
    className="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 cursor-pointer transition-all group"
    onClick={() => onSelect({
      trackName: track.trackName,
      artistName: track.artistName,
      previewUrl: track.previewUrl,
      artworkUrl: track.artworkUrl100
    })}
  >
    <div className="relative shrink-0">
      <img src={track.artworkUrl100} className="w-12 h-12 rounded-xl object-cover shadow-lg" />
      <button 
        onClick={(e) => { e.stopPropagation(); togglePreview(track.previewUrl); }}
        className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity rounded-xl ${previewingUrl === track.previewUrl ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        {previewingUrl === track.previewUrl ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white" />}
      </button>
    </div>
    <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{track.trackName}</p>
        <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest truncate">{track.artistName}</p>
    </div>
    <div className="p-2 text-indigo-400 opacity-0 group-hover:opacity-100">
      <Plus size={18} />
    </div>
  </div>
);

const CreatePostModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ file: File; preview: string; type: 'image' | 'video' }[]>([]);
  const [loading, setLoading] = useState(false);
  const [music, setMusic] = useState<MusicMetadata | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const remainingSlots = 7 - files.length;
      // Fix: Explicitly cast Array.from result to File[] to ensure correct type inference for URL.createObjectURL
      const selected = Array.from(e.target.files).slice(0, remainingSlots) as File[];
      
      const newItems = selected.map((file: File) => ({
        file,
        preview: URL.createObjectURL(file),
        type: file.type.startsWith('video/') ? 'video' as const : 'image' as const
      }));

      setFiles(prev => [...prev, ...newItems]);
    }
  };

  const removeFile = (index: number) => {
    const item = files[index];
    URL.revokeObjectURL(item.preview);
    setFiles(files.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!user || files.length === 0) return;
    setLoading(true);

    try {
      const mediaResults = await Promise.all(files.map(item => uploadMediaToCloudinary(item.file)));
      
      const newPostRef = push(ref(database, 'posts'));
      await set(newPostRef, {
        authorUid: user.uid,
        authorName: user.displayName,
        authorPhoto: user.photoURL,
        type: mediaResults[0].type, // Primary type
        content: text.trim(),
        media: mediaResults,
        timestamp: Date.now(),
        music: music || null
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
      <div className="bg-[#121212] border border-white/10 w-full max-w-xl rounded-[40px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <h3 className="text-xl font-black text-white">New Pulse</h3>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors"><X size={24} /></button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          
          {/* Media Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em]">Media Gallery ({files.length}/7)</h4>
              {files.length < 7 && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                >
                  <Plus size={14} /> Add more
                </button>
              )}
            </div>

            {files.length === 0 ? (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-[4/3] rounded-[32px] border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-4 hover:bg-white/5 hover:border-indigo-500/50 transition-all group"
              >
                <div className="flex gap-3">
                  <div className="w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ImageIcon size={32} />
                  </div>
                  <div className="w-16 h-16 bg-purple-500/10 text-purple-400 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform [transition-delay:100ms]">
                    <Film size={32} />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-white font-bold">Select photos or videos</p>
                  <p className="text-neutral-500 text-[10px] mt-1 uppercase tracking-widest">Videos max 15 seconds</p>
                </div>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {files.map((item, i) => (
                  <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 group shadow-lg">
                    {item.type === 'video' ? (
                      <video src={item.preview} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={item.preview} className="w-full h-full object-cover" />
                    )}
                    <button onClick={() => removeFile(i)} className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black active:scale-90 transition-all opacity-0 group-hover:opacity-100"><X size={12} /></button>
                    {item.type === 'video' && <div className="absolute bottom-2 left-2 p-1 bg-black/60 rounded text-[8px] text-white font-black uppercase tracking-widest">Video</div>}
                  </div>
                ))}
                {files.length < 7 && (
                   <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <Plus size={24} />
                  </button>
                )}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,video/*" multiple />
          </div>

          {/* Music Section */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em]">Background Music</h4>
            <div className={`p-5 rounded-[24px] border transition-all ${music ? 'bg-indigo-600/5 border-indigo-500/20 shadow-inner' : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'}`}>
               {music ? (
                 <div className="flex items-center gap-4 animate-in slide-in-from-left-2">
                    <img src={music.artworkUrl} className="w-14 h-14 rounded-xl shadow-lg border border-white/10" />
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-black text-white truncate tracking-tight">{music.trackName}</span>
                      <span className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest truncate mt-0.5">{music.artistName}</span>
                    </div>
                    <button onClick={() => setMusic(null)} className="p-3 text-neutral-500 hover:text-red-400 bg-white/5 rounded-xl transition-all"><Trash2 size={18} /></button>
                 </div>
               ) : (
                 <button 
                  onClick={() => setShowMusicPicker(true)}
                  className="w-full flex items-center justify-center gap-3 py-2 text-neutral-400 hover:text-indigo-400 transition-all group"
                 >
                   <div className="p-2 bg-white/5 rounded-xl group-hover:bg-indigo-500/10 transition-all">
                    <Music size={20} className="group-hover:scale-110 transition-transform" />
                   </div>
                   <span className="text-sm font-black uppercase tracking-[0.2em]">Add Music</span>
                 </button>
               )}
            </div>
          </div>

          {/* Caption Section */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em]">Share your thoughts</h4>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl overflow-hidden bg-neutral-900 border border-white/5 shadow-inner shrink-0 mt-1">
                {user?.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-neutral-500"><User size={24} /></div>}
              </div>
              <textarea 
                value={text}
                onChange={e => setText(e.target.value.slice(0, 500))}
                placeholder="Write a caption... (optional)"
                className="flex-1 bg-transparent border-none text-white text-lg focus:outline-none resize-none min-h-[120px] placeholder:text-neutral-800 custom-scrollbar"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 bg-neutral-900/50 border-t border-white/5 shrink-0 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.2em]">{text.length}/500</span>
            {files.length === 0 && (
              <span className="text-[9px] text-red-500/80 font-black uppercase tracking-widest mt-1">Media required</span>
            )}
          </div>
          
          <button 
            onClick={handlePost}
            disabled={loading || files.length === 0}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-12 py-4 rounded-2xl font-black uppercase tracking-[0.1em] text-sm shadow-xl shadow-indigo-900/20 flex items-center gap-3 transition-all active:scale-95"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <>Pulse <Send size={18} /></>}
          </button>
        </div>
      </div>
      {showMusicPicker && <MusicPickerModal onSelect={(m) => { setMusic(m); setShowMusicPicker(false); }} onClose={() => setShowMusicPicker(false)} />}
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
