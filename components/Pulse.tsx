
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ref, onValue, push, set, remove, query, orderByChild, limitToLast, get, update } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { 
  Heart, MessageCircle, Send, Image as ImageIcon, X, Plus, 
  Loader2, Zap, User, MoreVertical, Compass, Edit3, Trash2, AlertCircle,
  Music, Play, Pause, Search as SearchIcon, Volume2, VolumeX, Check,
  Film, ChevronLeft, ChevronRight, Camera, Smile, Type, Palette
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

export interface Comment {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  timestamp: number;
  parentId?: string;
}

export interface Moment {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  url: string;
  type: 'image' | 'video';
  timestamp: number;
  expiresAt: number;
  overlays?: {
    text: string;
    color: string;
    x: number;
    y: number;
  }[];
}

export const Pulse: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [moments, setMoments] = useState<Record<string, Moment[]>>({}); // Grouped by user
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMomentCreator, setShowMomentCreator] = useState(false);
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);
  const [activeMomentUser, setActiveMomentUser] = useState<string | null>(null);

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
    
    // Posts Sync
    const postsRef = query(ref(database, 'posts'), orderByChild('timestamp'), limitToLast(50));
    const unsubPosts = onValue(postsRef, (snap) => {
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

    // Moments Sync
    const momentsRef = ref(database, 'moments');
    const unsubMoments = onValue(momentsRef, (snap) => {
      if (snap.exists()) {
        const now = Date.now();
        const data = snap.val();
        const grouped: Record<string, Moment[]> = {};
        Object.entries(data).forEach(([id, val]: [string, any]) => {
          if (val.expiresAt > now) {
            if (!grouped[val.authorUid]) grouped[val.authorUid] = [];
            grouped[val.authorUid].push({ id, ...val });
          }
        });
        // Sort each user's moments
        Object.keys(grouped).forEach(uid => {
          grouped[uid].sort((a, b) => a.timestamp - b.timestamp);
        });
        setMoments(grouped);
      } else {
        setMoments({});
      }
    });

    return () => {
      unsubPosts();
      unsubMoments();
    };
  }, [user, following]);

  const momentUsers = useMemo(() => {
    const uids = Object.keys(moments).filter(uid => uid === user?.uid || following[uid]);
    // Put current user first
    return uids.sort((a, b) => {
      if (a === user?.uid) return -1;
      if (b === user?.uid) return 1;
      return 0;
    });
  }, [moments, following, user]);

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

        {/* Moments Row */}
        <div className="flex gap-4 overflow-x-auto no-scrollbar mb-8 pb-2">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <button 
              onClick={() => setShowMomentCreator(true)}
              className="w-16 h-16 rounded-full bg-neutral-900 border-2 border-indigo-600 border-dashed flex items-center justify-center text-indigo-500 relative overflow-hidden"
            >
              {user?.photoURL ? (
                <div className="w-full h-full relative">
                   <img src={user.photoURL} className="w-full h-full object-cover opacity-50" />
                   <div className="absolute inset-0 flex items-center justify-center"><Plus size={24} /></div>
                </div>
              ) : <Plus size={24} />}
            </button>
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">You</span>
          </div>

          {momentUsers.map(uid => {
            if (uid === user?.uid && !moments[uid]) return null;
            const userMoments = moments[uid];
            const author = userMoments[0];
            return (
              <div 
                key={uid} 
                onClick={() => setActiveMomentUser(uid)}
                className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
              >
                <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-tr from-indigo-500 to-purple-500 group-active:scale-95 transition-transform">
                  <div className="w-full h-full rounded-full bg-neutral-950 p-[2px]">
                    <div className="w-full h-full rounded-full overflow-hidden border border-white/10">
                      {author.authorPhoto ? <img src={author.authorPhoto} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-500 font-bold">{author.authorName.charAt(0)}</div>}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest truncate max-w-[64px]">{uid === user?.uid ? 'You' : author.authorName.split(' ')[0]}</span>
              </div>
            );
          })}
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
      {showMomentCreator && <MomentCreatorModal onClose={() => setShowMomentCreator(false)} />}
      {activeMomentUser && <MomentViewerFullscreen moments={moments[activeMomentUser]} userUids={momentUsers} initialUserUid={activeMomentUser} onClose={() => setActiveMomentUser(null)} />}
      {activeCommentsPost && <CommentsModal post={activeCommentsPost} onClose={() => setActiveCommentsPost(null)} />}
    </div>
  );
};

// Fix: Added missing CreatePostModal component
const CreatePostModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ file: File; preview: string; type: 'image' | 'video' }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<MusicMetadata | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).slice(0, 5 - files.length) as File[];
      const newFiles = selectedFiles.map(f => ({
        file: f,
        preview: URL.createObjectURL(f),
        type: f.type.startsWith('video/') ? 'video' as const : 'image' as const
      }));
      setFiles([...files, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!user || (!text.trim() && files.length === 0)) return;
    setLoading(true);

    try {
      const mediaItems = await Promise.all(
        files.map(async (f) => {
          const res = await uploadMediaToCloudinary(f.file);
          return { url: res.url, type: res.type };
        })
      );
      
      const newPostRef = push(ref(database, 'posts'));
      await set(newPostRef, {
        authorUid: user.uid,
        authorName: user.displayName,
        authorPhoto: user.photoURL,
        type: mediaItems.some(m => m.type === 'video') ? 'video' : (mediaItems.length > 0 ? 'image' : 'text'),
        content: text.trim(),
        media: mediaItems,
        music: selectedMusic,
        timestamp: Date.now()
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to post pulse.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in" onClick={onClose}>
      <div className="bg-[#121212] border border-white/10 w-full max-w-xl rounded-[40px] p-8 shadow-2xl animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-black text-white flex items-center gap-3"><Edit3 size={24} className="text-indigo-500" /> New Pulse</h3>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors"><X size={24} /></button>
        </div>

        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-[18px] overflow-hidden bg-neutral-900 border border-white/5 shrink-0 shadow-lg">
              {user?.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-neutral-500"><User size={24} /></div>}
            </div>
            <textarea 
              autoFocus
              value={text}
              onChange={e => setText(e.target.value.slice(0, 1000))}
              placeholder="What's your study vibe today?"
              className="flex-1 bg-transparent border-none text-white text-lg focus:outline-none resize-none min-h-[140px] placeholder:text-neutral-700 font-medium"
            />
          </div>

          {files.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {files.map((f, i) => (
                <div key={i} className="relative w-32 h-48 shrink-0 rounded-[24px] overflow-hidden border border-white/10 shadow-xl group">
                  {f.type === 'video' ? (
                    <video src={f.preview} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={f.preview} className="w-full h-full object-cover" />
                  )}
                  <button onClick={() => removeFile(i)} className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black transition-colors backdrop-blur-md"><X size={14} /></button>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded-md text-[8px] font-black uppercase text-white/70 tracking-widest">{f.type}</div>
                </div>
              ))}
            </div>
          )}

          {selectedMusic && (
            <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-[24px] p-4 flex items-center gap-4 animate-in slide-in-from-left-2">
                <img src={selectedMusic.artworkUrl} className="w-12 h-12 rounded-xl shadow-lg" alt="Art" />
                <div className="flex-1 min-w-0">
                    <span className="block text-xs font-black text-white truncate">{selectedMusic.trackName}</span>
                    <span className="block text-[9px] font-bold text-neutral-500 uppercase tracking-tighter truncate">{selectedMusic.artistName}</span>
                </div>
                <button onClick={() => setSelectedMusic(null)} className="p-2 text-neutral-500 hover:text-red-400 bg-white/5 rounded-xl transition-colors"><Trash2 size={16} /></button>
            </div>
          )}

          <div className="flex items-center justify-between pt-6 border-t border-white/5">
            <div className="flex gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= 5}
                className="p-4 bg-white/5 text-indigo-400 rounded-2xl hover:bg-white/10 transition-all active:scale-90 disabled:opacity-30"
              >
                <ImageIcon size={22} />
              </button>
              <button 
                onClick={() => setShowMusicPicker(true)}
                className={`p-4 rounded-2xl transition-all active:scale-90 ${selectedMusic ? 'bg-indigo-600 text-white' : 'bg-white/5 text-purple-400 hover:bg-white/10'}`}
              >
                <Music size={22} />
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,video/*" multiple />
            </div>
            <div className="flex items-center gap-5">
              <span className="text-[10px] font-black text-neutral-700 uppercase tracking-widest">{text.length}/1000</span>
              <button 
                onClick={handlePost}
                disabled={loading || (!text.trim() && files.length === 0)}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:grayscale text-white px-10 py-4 rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/20 flex items-center gap-3 transition-all active:scale-95"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : 'Pulse'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {showMusicPicker && (
          <PostMusicPicker 
              onSelect={(m) => { setSelectedMusic(m); setShowMusicPicker(false); }} 
              onClose={() => setShowMusicPicker(false)} 
          />
      )}
    </div>
  );
};

// Fix: Added missing PostMusicPicker component
const PostMusicPicker: React.FC<{ onSelect: (m: MusicMetadata) => void, onClose: () => void }> = ({ onSelect, onClose }) => {
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
            <div className="bg-[#0f0f0f] border-t md:border border-white/10 w-full max-w-lg rounded-t-[40px] md:rounded-[40px] h-[80vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-20" onClick={e => e.stopPropagation()}>
                <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0">
                    <h3 className="text-xl font-black text-white">Add Music</h3>
                    <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors bg-white/5 rounded-full"><X size={20} /></button>
                </div>

                <div className="px-8 pb-4 shrink-0 mt-4">
                    <div className="relative">
                        <SearchIcon size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-700" />
                        <input 
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="Find a song..."
                            className="w-full bg-white/5 border border-white/10 rounded-3xl pl-14 pr-6 py-4 text-white placeholder:text-neutral-700 focus:outline-none focus:border-indigo-500 transition-all font-medium"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-12 space-y-8">
                    {!query && trending.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="px-2 text-[10px] font-black uppercase text-indigo-500/80 tracking-[0.3em]">Trending Now</h4>
                            {trending.map(track => (
                                <TrackItem key={track.trackId} track={track} onSelect={onSelect} previewingUrl={previewingUrl} togglePreview={togglePreview} />
                            ))}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>
                    ) : results.length > 0 ? (
                        <div className="space-y-2">
                            <h4 className="px-2 text-[10px] font-black uppercase text-neutral-500 tracking-[0.3em]">Results</h4>
                            {results.map(track => (
                                <TrackItem key={track.trackId} track={track} onSelect={onSelect} previewingUrl={previewingUrl} togglePreview={togglePreview} />
                            ))}
                        </div>
                    ) : query && !loading && (
                        <div className="py-20 text-center text-neutral-700 text-xs font-black uppercase tracking-widest">No matching tracks</div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Fix: Added missing TrackItem component for music picker
const TrackItem: React.FC<{ track: any, onSelect: (m: MusicMetadata) => void, previewingUrl: string | null, togglePreview: (u: string) => void }> = ({ track, onSelect, previewingUrl, togglePreview }) => (
    <div 
        className="flex items-center gap-4 p-3 rounded-3xl hover:bg-white/5 cursor-pointer transition-all group"
        onClick={() => onSelect({
            trackName: track.trackName,
            artistName: track.artistName,
            previewUrl: track.previewUrl,
            artworkUrl: track.artworkUrl100
        })}
    >
        <div className="relative shrink-0">
            <img src={track.artworkUrl100} className="w-12 h-12 rounded-2xl object-cover shadow-lg group-hover:scale-105 transition-transform" alt="Art" />
            <button 
                onClick={(e) => { e.stopPropagation(); togglePreview(track.previewUrl); }}
                className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity rounded-2xl ${previewingUrl === track.previewUrl ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
                {previewingUrl === track.previewUrl ? <Pause size={20} className="text-white fill-white" /> : <Play size={20} className="text-white fill-white" />}
            </button>
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{track.trackName}</p>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter truncate mt-0.5">{track.artistName}</p>
        </div>
        <div className="p-2 text-indigo-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all">
            <Plus size={18} />
        </div>
    </div>
);

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
    onValue(ref(database, `postComments/${post.id}`), (snap) => {
      if (snap.exists()) {
        setCommentsCount(Object.keys(snap.val()).length);
      } else {
        setCommentsCount(0);
      }
    });
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
                {user?.uid === post.authorUid ? (
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
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {mediaItems.map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentMediaIndex ? 'bg-indigo-500 w-3' : 'bg-white/30'}`} />
                    ))}
                  </div>
                </>
              )}

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
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenComments(); }}
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

const MomentCreatorModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [file, setFile] = useState<{ file: File; preview: string; type: 'image' | 'video' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [isAddingText, setIsAddingText] = useState(false);
  const [textOverlays, setTextOverlays] = useState<{text: string; color: string; x: number; y: number}[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const selected = e.target.files[0];
      if (selected.type.startsWith('video/') && selected.size > 20 * 1024 * 1024) {
        alert("Video is too large. Max 20MB.");
        return;
      }
      setFile({
        file: selected,
        preview: URL.createObjectURL(selected),
        type: selected.type.startsWith('video/') ? 'video' : 'image'
      });
    }
  };

  const handleAddOverlay = () => {
    if (!text.trim()) {
      setIsAddingText(false);
      return;
    }
    setTextOverlays([...textOverlays, { text: text.trim(), color: textColor, x: 50, y: 50 }]);
    setText('');
    setIsAddingText(false);
  };

  const handlePost = async () => {
    if (!user || !file) return;
    setLoading(true);
    try {
      const media = await uploadMediaToCloudinary(file.file);
      const momentRef = push(ref(database, 'moments'));
      await set(momentRef, {
        authorUid: user.uid,
        authorName: user.displayName,
        authorPhoto: user.photoURL,
        url: media.url,
        type: media.type,
        timestamp: Date.now(),
        expiresAt: Date.now() + 86400000, // 24h
        overlays: textOverlays
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to share moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black bg-opacity-95 backdrop-blur-md animate-in fade-in" onClick={onClose}>
      <div className="w-full h-full flex flex-col items-center justify-center p-4 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white bg-white/10 rounded-full hover:bg-white/20 transition-all z-50"><X size={24} /></button>

        {!file ? (
          <div className="flex flex-col items-center gap-6">
            <div className="w-24 h-24 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center animate-pulse">
               <Camera size={40} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black text-white">Capture a Moment</h3>
              <p className="text-neutral-500 text-sm font-medium">Share what you're up to for 24 hours.</p>
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-900/20 active:scale-95 transition-all"
            >
              Choose Photo or Video
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,video/*" className="hidden" />
          </div>
        ) : (
          <div className="w-full max-w-sm aspect-[9/16] bg-neutral-900 rounded-[40px] overflow-hidden relative shadow-2xl border border-white/5">
            {file.type === 'video' ? (
              <video src={file.preview} className="w-full h-full object-cover" autoPlay loop muted playsInline />
            ) : (
              <img src={file.preview} className="w-full h-full object-cover" />
            )}

            {/* Overlays Render */}
            <div className="absolute inset-0 pointer-events-none">
              {textOverlays.map((ov, i) => (
                <div key={i} className="absolute p-4 text-center font-black text-2xl drop-shadow-lg" style={{ color: ov.color, top: `${ov.y}%`, left: `${ov.x}%`, transform: 'translate(-50%, -50%)' }}>
                  {ov.text}
                </div>
              ))}
            </div>

            {/* Editing Tools Bar */}
            <div className="absolute top-6 left-6 flex flex-col gap-4">
              <button onClick={() => setIsAddingText(true)} className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all"><Type size={20} /></button>
              <button className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all"><Smile size={20} /></button>
            </div>

            {/* Post Button */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full px-10">
              <button 
                onClick={handlePost}
                disabled={loading}
                className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <>Share Moment <Send size={18} /></>}
              </button>
            </div>
          </div>
        )}

        {isAddingText && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-[3000]">
            <div className="w-full max-w-xs space-y-6">
              <input 
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Enter text..."
                className="w-full bg-transparent border-b-2 border-white text-white text-3xl font-black text-center focus:outline-none placeholder:text-neutral-700"
              />
              <div className="flex justify-center gap-2">
                {['#ffffff', '#6366f1', '#f43f5e', '#fbbf24', '#10b981'].map(c => (
                  <button key={c} onClick={() => setTextColor(c)} className={`w-8 h-8 rounded-full border-2 ${textColor === c ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <button onClick={handleAddOverlay} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold uppercase tracking-widest">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MomentViewerFullscreen: React.FC<{ moments: Moment[]; userUids: string[]; initialUserUid: string; onClose: () => void }> = ({ moments, userUids, initialUserUid, onClose }) => {
  const { user } = useAuth();
  const [currentUserIndex, setCurrentUserIndex] = useState(userUids.indexOf(initialUserUid));
  const [currentMomentIndex, setCurrentMomentIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  const currentMoments = useMemo(() => {
    // This is simplified. In a real app we'd fetch the next user's moments if they change.
    // For this prototype, we'll assume the `moments` prop is the one for the initial user only,
    // or we'd need a more global moments object. 
    // Let's assume we close on last moment for now for simplicity.
    return moments;
  }, [moments, currentUserIndex]);

  const moment = currentMoments[currentMomentIndex];

  useEffect(() => {
    if (!moment) return;
    // Log View
    const viewRef = ref(database, `momentViews/${moment.id}/${user?.uid}`);
    set(viewRef, true);

    // Sync Stats
    const viewsRef = ref(database, `momentViews/${moment.id}`);
    onValue(viewsRef, snap => setViewCount(snap.exists() ? Object.keys(snap.val()).length : 0));
    
    const likesRef = ref(database, `momentLikes/${moment.id}`);
    onValue(likesRef, snap => {
      setLikeCount(snap.exists() ? Object.keys(snap.val()).length : 0);
      setIsLiked(user ? !!snap.val()?.[user.uid] : false);
    });

    startTimeRef.current = Date.now();
  }, [moment, user]);

  const handleNext = () => {
    if (currentMomentIndex < currentMoments.length - 1) {
      setCurrentMomentIndex(currentMomentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentMomentIndex > 0) {
      setCurrentMomentIndex(currentMomentIndex - 1);
    }
  };

  const toggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !moment) return;
    const likeRef = ref(database, `momentLikes/${moment.id}/${user.uid}`);
    if (isLiked) remove(likeRef);
    else set(likeRef, true);
  };

  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black flex items-center justify-center animate-in fade-in fill-mode-forwards" 
         onClick={(e) => {
           const x = e.clientX;
           if (x < window.innerWidth / 3) handlePrev();
           else handleNext();
         }}>
      
      {/* Progress Bars */}
      <div className="absolute top-4 left-4 right-4 flex gap-1 z-[3010]">
        {currentMoments.map((_, i) => (
          <div key={i} className="flex-1 h-[2px] bg-white/20 rounded-full overflow-hidden">
             <div 
               className={`h-full bg-white transition-all ${i === currentMomentIndex ? 'animate-progress' : i < currentMomentIndex ? 'w-full' : 'w-0'}`} 
               style={{ animationDuration: moment.type === 'video' ? '15s' : '5s' }}
               onAnimationEnd={() => i === currentMomentIndex && handleNext()}
             />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-10 left-4 right-4 flex items-center justify-between z-[3010]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20">
            {moment.authorPhoto ? <img src={moment.authorPhoto} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-neutral-800 flex items-center justify-center font-bold text-[10px]">{moment.authorName.charAt(0)}</div>}
          </div>
          <div className="flex flex-col">
            <span className="text-white text-xs font-black tracking-tight">{moment.authorName}</span>
            <span className="text-[8px] text-neutral-400 font-bold uppercase tracking-widest">{new Date(moment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-2 text-white/50 hover:text-white"><X size={20} /></button>
      </div>

      {/* Content */}
      <div className="w-full h-full relative flex items-center justify-center">
        {moment.type === 'video' ? (
          <video ref={videoRef} src={moment.url} className="w-full h-full object-cover" autoPlay playsInline muted />
        ) : (
          <img src={moment.url} className="w-full h-full object-cover" />
        )}

        {/* Overlays */}
        <div className="absolute inset-0 pointer-events-none">
          {moment.overlays?.map((ov, i) => (
            <div key={i} className="absolute p-4 text-center font-black text-2xl drop-shadow-lg" style={{ color: ov.color, top: `${ov.y}%`, left: `${ov.x}%`, transform: 'translate(-50%, -50%)' }}>
              {ov.text}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-10 items-center z-[3010]">
         <div className="flex flex-col items-center gap-1">
           <button onClick={toggleLike} className={`p-3 rounded-full backdrop-blur-md transition-all ${isLiked ? 'text-red-500 bg-red-500/10' : 'text-white bg-white/10'}`}>
             <Heart size={24} className={isLiked ? 'fill-current' : ''} />
           </button>
           <span className="text-[10px] font-black text-white">{likeCount}</span>
         </div>
         <div className="flex flex-col items-center gap-1">
           <div className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white">
             <Volume2 size={24} />
           </div>
           <span className="text-[10px] font-black text-white">{viewCount} views</span>
         </div>
      </div>

    </div>,
    document.body
  );
};

const CommentsModal: React.FC<{ post: Post, onClose: () => void }> = ({ post, onClose }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
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
    if (!replyTo) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [comments, replyTo]);

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
        timestamp: Date.now(),
        parentId: replyTo?.id || null
      });
      setText('');
      setReplyTo(null);
    } finally {
      setLoading(false);
    }
  };

  const threadedComments = useMemo(() => {
    const roots = comments.filter(c => !c.parentId);
    const children = comments.filter(c => c.parentId);
    
    return roots.map(root => ({
      ...root,
      replies: children.filter(child => child.parentId === root.id)
    }));
  }, [comments]);

  return (
    <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in" onClick={onClose}>
      <div className="bg-[#121212] border-t md:border border-white/10 w-full max-w-xl h-[85vh] md:h-[75vh] rounded-t-[40px] md:rounded-[40px] flex flex-col shadow-2xl animate-in slide-in-from-bottom-20 duration-500 overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h3 className="text-white font-black text-lg flex items-center gap-2">
              Replies <span className="bg-indigo-500/10 text-indigo-400 text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/20">{comments.length}</span>
            </h3>
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-black">Conversations on {post.authorName}'s post</span>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors bg-white/5 rounded-full"><X size={20} /></button>
        </div>

        {/* Scrollable Content */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-neutral-900/20">
          {threadedComments.length > 0 ? (
            threadedComments.map(c => (
              <div key={c.id} className="space-y-4 animate-in fade-in duration-300">
                <div className="flex gap-4 group/comment">
                  <div className="w-10 h-10 rounded-2xl bg-neutral-900 border border-white/5 overflow-hidden shrink-0 shadow-lg">
                      {c.authorPhoto ? (
                      <img src={c.authorPhoto} className="w-full h-full object-cover" />
                      ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-500">{c.authorName?.charAt(0)}</div>
                      )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-white">{c.authorName}</span>
                      <span className="text-[9px] text-neutral-600 font-black uppercase tracking-widest">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-neutral-300 text-[14px] leading-relaxed font-medium">{c.text}</p>
                    <button 
                      onClick={() => setReplyTo(c)}
                      className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1 hover:text-indigo-400 transition-colors"
                    >
                      Reply
                    </button>
                  </div>
                </div>

                {/* Nested Replies */}
                {c.replies && c.replies.length > 0 && (
                  <div className="ml-10 space-y-4 border-l border-white/5 pl-6">
                    {c.replies.map(r => (
                      <div key={r.id} className="flex gap-3 group/comment animate-in fade-in">
                        <div className="w-8 h-8 rounded-xl bg-neutral-900 border border-white/5 overflow-hidden shrink-0">
                            {r.authorPhoto ? (
                            <img src={r.authorPhoto} className="w-full h-full object-cover" />
                            ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-neutral-500">{r.authorName?.charAt(0)}</div>
                            )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{r.authorName}</span>
                            <span className="text-[8px] text-neutral-600 font-black uppercase tracking-widest">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-neutral-400 text-[13px] leading-relaxed">{r.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-neutral-700 space-y-3 opacity-30">
              <MessageCircle size={40} />
              <p className="text-xs font-black uppercase tracking-widest">Start the conversation</p>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-6 bg-[#0a0a0a] border-t border-white/5 shrink-0">
          {replyTo && (
            <div className="flex items-center justify-between px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl mb-3 animate-in slide-in-from-bottom-2 duration-200">
               <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Replying to @{replyTo.authorName}</span>
               <button onClick={() => setReplyTo(null)} className="p-1 text-neutral-500 hover:text-white"><X size={14} /></button>
            </div>
          )}
          <form onSubmit={handleAddComment} className="flex gap-3">
            <input 
              autoFocus={!!replyTo}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
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
