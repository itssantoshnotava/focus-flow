
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, get, set, remove, query, orderByChild, equalTo, limitToLast } from "firebase/database";
import { updateProfile } from "firebase/auth";
import { database, auth } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { getZodiacSign } from '../utils/zodiac';
import { Post } from '../types';
import { 
  sendFollowRequest, unfollowUser, removeFollower, followBack 
} from '../utils/followActions';
import { 
  Camera, Edit2, Save, X, Settings, 
  Calendar, Sparkles, Flame, User, Trophy, MessageCircle, Loader2, Ban, 
  ArrowLeft, Unlock, UserMinus, UserPlus, Clock, Lock, LayoutGrid, Heart, Play
} from 'lucide-react';

export const Profile: React.FC = () => {
  const { uid } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'stats'>('posts');
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  
  // Follower/Following States
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [hasSentRequest, setHasSentRequest] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  
  // Sub-view for Followers/Following Lists
  const [listView, setListView] = useState<'none' | 'followers' | 'following'>('none');
  const [listUsers, setListUsers] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Block states
  const [isBlockingThem, setIsBlockingThem] = useState(false);
  const [isBlockedByThem, setIsBlockedByThem] = useState(false);

  // Edit State
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editDob, setEditDob] = useState('');

  const isMe = user?.uid === uid;
  const isMutual = isFollowing && isFollowedBy;

  useEffect(() => {
    if (!uid) return;
    const userRef = ref(database, `users/${uid}`);
    const unsub = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setProfileData(data);
        setEditName(data.name || '');
        setEditBio(data.bio || '');
        setEditDob(data.dob || '');
      }
      setLoading(false);
    });

    onValue(ref(database, `followers/${uid}`), (snap) => {
        setFollowersCount(snap.exists() ? Object.keys(snap.val()).length : 0);
    });

    onValue(ref(database, `following/${uid}`), (snap) => {
        setFollowingCount(snap.exists() ? Object.keys(snap.val()).length : 0);
    });

    if (user && !isMe) {
        onValue(ref(database, `following/${user.uid}/${uid}`), (snap) => setIsFollowing(snap.exists()));
        onValue(ref(database, `followers/${user.uid}/${uid}`), (snap) => setIsFollowedBy(snap.exists()));
        onValue(ref(database, `followRequests/${uid}/${user.uid}`), (snap) => setHasSentRequest(snap.exists()));
        onValue(ref(database, `blocks/${user.uid}/${uid}`), (snap) => setIsBlockingThem(snap.exists()));
        onValue(ref(database, `blocks/${uid}/${user.uid}`), (snap) => setIsBlockedByThem(snap.exists()));
    }

    return () => unsub();
  }, [uid, user, isMe]);

  // Sync User Posts for Profile
  useEffect(() => {
    if (!uid) return;
    setPostsLoading(true);
    const postsQuery = query(
      ref(database, 'posts'), 
      orderByChild('authorUid'), 
      equalTo(uid),
      limitToLast(50)
    );

    const unsub = onValue(postsQuery, (snap) => {
      if (snap.exists()) {
        const list = Object.entries(snap.val())
          .map(([id, val]: [string, any]) => ({ id, ...val } as Post))
          .sort((a, b) => b.timestamp - a.timestamp);
        setUserPosts(list);
      } else {
        setUserPosts([]);
      }
      setPostsLoading(false);
    });

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (listView === 'none' || !uid) return;
    setListLoading(true);
    const path = listView === 'followers' ? `followers/${uid}` : `following/${uid}`;
    get(ref(database, path)).then(async (snap) => {
        if (snap.exists()) {
            const uids = Object.keys(snap.val());
            const promises = uids.map(id => get(ref(database, `users/${id}`)).then(s => ({ uid: id, ...s.val() })));
            const users = await Promise.all(promises);
            setListUsers(users.filter(u => u.name));
        } else { setListUsers([]); }
        setListLoading(false);
    });
  }, [listView, uid]);

  const handleFollowAction = async () => {
    if (!user || !uid || isMe || isBlockingThem || isBlockedByThem) return;
    if (isFollowing) {
      await unfollowUser(user.uid, uid);
    } else if (hasSentRequest) {
      // requested
    } else if (isFollowedBy) {
      await followBack(user.uid, uid);
    } else {
      await sendFollowRequest(user.uid, user.displayName || 'User', user.photoURL, uid);
    }
  };

  const handleBlockToggle = async () => {
    if (!user || !uid || isMe) return;
    const blockRef = ref(database, `blocks/${user.uid}/${uid}`);
    if (isBlockingThem) {
        await remove(blockRef);
    } else {
        await set(blockRef, true);
        const updates: any = {};
        updates[`following/${user.uid}/${uid}`] = null;
        updates[`followers/${uid}/${user.uid}`] = null;
        updates[`following/${uid}/${user.uid}`] = null;
        updates[`followers/${user.uid}/${uid}`] = null;
        updates[`followRequests/${uid}/${user.uid}`] = null;
        updates[`followRequests/${user.uid}/${uid}`] = null;
        await update(ref(database), updates);
    }
  };

  const handleSave = async () => {
    if (!uid || !isMe) return;
    let zodiac = profileData.zodiacSign;
    if (editDob) { zodiac = getZodiacSign(editDob).name; }
    const updates = { name: editName, bio: editBio, dob: editDob, zodiacSign: zodiac };
    await update(ref(database, `users/${uid}`), updates);
    if (auth.currentUser && editName !== auth.currentUser.displayName) {
        await updateProfile(auth.currentUser, { displayName: editName });
    }
    setIsEditing(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && isMe) {
      setIsUploading(true);
      try {
        const url = await uploadImageToCloudinary(e.target.files[0]);
        if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: url });
        await update(ref(database, `users/${uid}`), { photoURL: url });
      } catch (err) { console.error(err); } finally { setIsUploading(false); }
    }
  };

  const handleStartChat = async () => {
    if (!user || !uid || !isMutual || isBlockingThem || isBlockedByThem) return;
    try {
        const myInboxRef = ref(database, `userInboxes/${user.uid}/${uid}`);
        const snap = await get(myInboxRef);
        if (!snap.exists()) {
            const convoId = [user.uid, uid].sort().join('_');
            await update(ref(database, `conversations/${convoId}`), { type: 'dm', members: { [user.uid]: true, [uid]: true }, createdAt: Date.now() });
            await set(myInboxRef, { type: 'dm', name: profileData.name, photoURL: profileData.photoURL || null, lastMessage: null, lastMessageAt: Date.now(), unreadCount: 0 });
            const theirInboxRef = ref(database, `userInboxes/${uid}/${user.uid}`);
            await set(theirInboxRef, { type: 'dm', name: user.displayName, photoURL: user.photoURL || null, lastMessage: null, lastMessageAt: Date.now(), unreadCount: 0 });
        }
        navigate(`/inbox?chatId=${uid}`);
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

  if (listView !== 'none') {
    return (
        <div className="flex-1 h-full bg-neutral-950 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="p-6 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-xl flex items-center gap-4 sticky top-0 z-20">
                <button onClick={() => setListView('none')} className="p-2 text-neutral-500 hover:text-white transition-colors"><ArrowLeft size={24} /></button>
                <h2 className="text-xl font-black text-white capitalize">{listView}</h2>
            </div>
            <div className="flex-1 p-4 space-y-2 max-w-2xl mx-auto w-full">
                {listLoading ? ( <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div> ) : listUsers.length > 0 ? (
                    listUsers.map(u => (
                        <div key={u.uid} className="flex items-center justify-between p-4 bg-white/5 border border-white/[0.03] rounded-3xl hover:bg-white/[0.08] transition-all">
                            <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setListView('none'); navigate(`/profile/${u.uid}`); }}>
                                {u.photoURL ? <img src={u.photoURL} className="w-12 h-12 rounded-2xl object-cover" /> : <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{u.name?.charAt(0)}</div>}
                                <span className="font-bold text-neutral-200">{u.name}</span>
                            </div>
                        </div>
                    ))
                ) : ( <div className="text-center py-20 text-neutral-600 font-medium">No {listView} yet.</div> )}
            </div>
        </div>
    );
  }

  const restrictedProfile = !isMe && isBlockedByThem;
  const limitedProfile = !isMe && isBlockingThem;

  const displayProfile = restrictedProfile ? {
    name: "FocusFlow User",
    photoURL: null,
    bio: null,
    streak: 0,
    streaks: { current: 0, longest: 0 }
  } : profileData;

  const zodiac = (displayProfile?.dob && !restrictedProfile && !limitedProfile) ? getZodiacSign(displayProfile.dob) : null;

  return (
    <div className="flex-1 h-full bg-neutral-950 overflow-y-auto custom-scrollbar relative">
      <div className="absolute top-0 left-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      {isMe && (
        <button onClick={() => navigate('/settings')} className="absolute top-8 right-8 z-30 p-3 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-2xl border border-white/10 transition-all shadow-xl active:scale-90 backdrop-blur-xl" title="Settings"><Settings size={24} /></button>
      )}

      <div className="max-w-2xl mx-auto w-full pt-16 px-6 pb-24 relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-[32px] p-8 mb-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col items-center gap-8 relative z-10">
            <div className="relative">
              <div className="w-32 h-32 rounded-[40px] p-1.5 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 shadow-xl overflow-hidden group">
                <div className="w-full h-full rounded-[34px] overflow-hidden bg-neutral-900 relative">
                  {displayProfile.photoURL ? ( <img src={displayProfile.photoURL} alt="Profile" className="w-full h-full object-cover" /> ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-5xl font-bold text-neutral-400">{displayProfile.name?.charAt(0)}</div>
                  )}
                  {isUploading && ( <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 backdrop-blur-sm"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div> )}
                </div>
              </div>
              {isMe && ( <> <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" /><button onClick={() => fileInputRef.current?.click()} className="absolute -bottom-1 -right-1 p-2.5 bg-indigo-600 text-white rounded-2xl border-4 border-[#0d0d0d] hover:bg-indigo-500 transition-all shadow-xl active:scale-90" title="Change Photo"><Camera size={18} /></button> </> )}
            </div>

            <div className="text-center space-y-3 w-full">
              {!isEditing ? (
                <>
                  <div className="flex items-center justify-center gap-2 group">
                    <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                        {displayProfile.name}
                        {restrictedProfile && <Ban size={20} className="text-red-500" />}
                        {limitedProfile && <Lock size={20} className="text-orange-500" />}
                    </h1>
                    {isMe && ( <button onClick={() => setIsEditing(true)} className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-white transition-all"><Edit2 size={16} /></button> )}
                  </div>

                  {!restrictedProfile && (
                    <div className="flex items-center justify-center gap-6 mb-4">
                        <div className="flex flex-col items-center">
                            <span className="text-xl font-black text-white">{userPosts.length}</span>
                            <span className="text-[10px] uppercase font-black text-neutral-500 tracking-widest">Posts</span>
                        </div>
                        <button onClick={() => setListView('followers')} className="flex flex-col items-center group">
                            <span className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors">{followersCount}</span>
                            <span className="text-[10px] uppercase font-black text-neutral-500 tracking-widest">Followers</span>
                        </button>
                        <button onClick={() => setListView('following')} className="flex flex-col items-center group">
                            <span className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors">{followingCount}</span>
                            <span className="text-[10px] uppercase font-black text-neutral-500 tracking-widest">Following</span>
                        </button>
                    </div>
                  )}

                  {(displayProfile.bio && !restrictedProfile && !limitedProfile) && (
                    <p className="text-neutral-400 max-w-sm mx-auto whitespace-pre-wrap text-sm leading-relaxed font-medium mb-6">{displayProfile.bio}</p>
                  )}

                  {!isMe && (
                      <div className="flex items-center justify-center gap-3 mt-4">
                          {restrictedProfile ? (
                              <div className="text-xs font-bold text-neutral-600 uppercase tracking-widest py-2 bg-white/5 px-6 rounded-xl border border-white/5">User unavailable</div>
                          ) : limitedProfile ? (
                              <button onClick={handleBlockToggle} className="flex-1 max-w-[200px] inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95">
                                <Unlock size={18} /> Unblock
                              </button>
                          ) : (
                            <>
                              <button 
                                onClick={handleFollowAction} 
                                disabled={hasSentRequest}
                                className={`flex-1 max-w-[160px] px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 border flex items-center justify-center gap-2 ${
                                    isFollowing ? 'bg-neutral-800 border-white/10 text-neutral-300' : 
                                    hasSentRequest ? 'bg-neutral-900 border-white/5 text-neutral-600' :
                                    'bg-indigo-600 border-indigo-500 text-white'
                                }`}
                              >
                                {hasSentRequest ? <Clock size={16} /> : (isFollowing ? null : <UserPlus size={16} />)}
                                {isFollowing ? "Following" : hasSentRequest ? "Requested" : isFollowedBy ? "Follow back" : "Follow"}
                              </button>
                              {isMutual && (
                                  <button onClick={handleStartChat} className="flex-1 max-w-[140px] inline-flex items-center justify-center gap-2 bg-white text-black px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95"><MessageCircle size={18} /> Message</button>
                              )}
                              <button onClick={handleBlockToggle} className="p-3 text-neutral-500 hover:text-red-500 bg-white/5 hover:bg-red-500/10 border border-white/5 rounded-2xl transition-all" title="Block User"><Ban size={20} /></button>
                            </>
                          )}
                      </div>
                  )}
                </>
              ) : (
                <div className="w-full max-w-sm mx-auto space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Display Name" className="w-full bg-neutral-950/50 border border-white/10 rounded-2xl px-5 py-3 text-center font-bold text-white focus:outline-none focus:border-indigo-500 transition-all" />
                  <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Tell us about yourself..." className="w-full bg-neutral-950/50 border border-white/10 rounded-2xl px-5 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[100px] text-center resize-none transition-all" />
                  <div className="flex gap-2"><button onClick={handleSave} className="flex-1 bg-white text-black h-12 rounded-2xl font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2"><Save size={18} /> Save</button><button onClick={() => setIsEditing(false)} className="px-5 bg-neutral-800 text-neutral-400 hover:text-white rounded-2xl transition-colors flex items-center justify-center"><X size={20} /></button></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab System */}
        <div className="flex items-center justify-center gap-1 bg-white/[0.03] p-1 rounded-2xl mb-4 border border-white/5">
            <button 
                onClick={() => setActiveTab('posts')}
                className={`flex-1 py-3 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'posts' ? 'bg-white/10 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
                <LayoutGrid size={14} /> Posts
            </button>
            <button 
                onClick={() => setActiveTab('stats')}
                className={`flex-1 py-3 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'stats' ? 'bg-white/10 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
                <Flame size={14} /> Stats
            </button>
        </div>

        {/* Dynamic Content Sections */}
        {activeTab === 'posts' ? (
            <div className="grid grid-cols-3 gap-1 md:gap-2">
                {postsLoading ? (
                    <div className="col-span-3 flex justify-center py-12"><Loader2 className="animate-spin text-indigo-500" /></div>
                ) : userPosts.length > 0 ? (
                    userPosts.map(post => (
                        <div 
                            key={post.id} 
                            onClick={() => navigate(`/post/${post.id}`)}
                            className="relative aspect-square bg-neutral-900 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        >
                            {post.media && post.media[0]?.type === 'video' ? (
                                <>
                                    <video src={post.media[0].url} className="w-full h-full object-cover" />
                                    <div className="absolute top-2 right-2 text-white shadow-sm"><Play size={12} fill="white" /></div>
                                </>
                            ) : post.media ? (
                                <img src={post.media[0].url} className="w-full h-full object-cover" alt="Post thumbnail" />
                            ) : post.images ? (
                                <img src={post.images[0]} className="w-full h-full object-cover" alt="Post thumbnail" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center p-2 bg-neutral-800 text-neutral-400 text-[10px] font-medium text-center">
                                    {post.content.slice(0, 40)}...
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="col-span-3 text-center py-20 bg-white/[0.02] rounded-[32px] border border-dashed border-white/10">
                        <p className="text-neutral-500 font-bold">No pulses shared yet.</p>
                    </div>
                )}
            </div>
        ) : (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 border border-white/[0.05] rounded-3xl p-5 flex flex-col items-center gap-2 group">
                        <div className="p-3 bg-orange-500/10 rounded-2xl group-hover:scale-110 transition-transform"><Flame size={24} className="text-orange-500 fill-orange-500 animate-fire-flicker" /></div>
                        <div className="text-center"><div className="text-2xl font-black text-white leading-tight">{displayProfile.streaks?.current || 0}</div><div className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest">Day Streak</div></div>
                    </div>
                    <div className="bg-white/5 border border-white/[0.05] rounded-3xl p-5 flex flex-col items-center gap-2 group">
                        <div className="p-3 bg-indigo-500/10 rounded-2xl group-hover:scale-110 transition-transform">{zodiac ? <span className="text-3xl leading-none">{zodiac.icon}</span> : <Sparkles size={24} className="text-indigo-400" />}</div>
                        <div className="text-center"><div className="text-2xl font-black text-white leading-tight">{zodiac ? zodiac.name : '---'}</div><div className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest">Zodiac</div></div>
                    </div>
                </div>

                <div className="bg-white/[0.02] border border-white/[0.06] rounded-[32px] p-8 space-y-6">
                    <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-neutral-800/50 rounded-2xl text-neutral-500"><Trophy size={20} /></div>
                            <div className="flex flex-col"><span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Record Streak</span><span className="text-white font-semibold">{displayProfile.streaks?.longest || 0} Days</span></div>
                        </div>
                    </div>
                    <div className="h-px bg-white/[0.04]"></div>
                    <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-neutral-800/50 rounded-2xl text-neutral-500"><Calendar size={20} /></div>
                            <div className="flex flex-col"><span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Join Date</span><span className="text-white font-semibold">Dec 2024</span></div>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
