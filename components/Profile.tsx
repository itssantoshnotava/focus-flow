import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, get, set, remove } from "firebase/database";
import { updateProfile } from "firebase/auth";
import { database, auth } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { getZodiacSign } from '../utils/zodiac';
import { 
  Camera, Edit2, Save, X, Settings, 
  Calendar, Sparkles, Flame, User, Trophy, MessageCircle, Loader2, Ban, 
  Users as UsersIcon, ArrowLeft, ChevronRight, Unlock
} from 'lucide-react';

export const Profile: React.FC = () => {
  const { uid } = useParams();
  const { user, isGuest } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Follower/Following States
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  
  // Sub-view for Followers/Following Lists
  const [listView, setListView] = useState<'none' | 'followers' | 'following'>('none');
  const [listUsers, setListUsers] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Block states (viewer perspective)
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

    // Followers Count
    const followersRef = ref(database, `followers/${uid}`);
    const unsubFollowersCount = onValue(followersRef, (snap) => {
        setFollowersCount(snap.exists() ? Object.keys(snap.val()).length : 0);
    });

    // Following Count
    const followingRef = ref(database, `following/${uid}`);
    const unsubFollowingCount = onValue(followingRef, (snap) => {
        setFollowingCount(snap.exists() ? Object.keys(snap.val()).length : 0);
    });

    // Check relationship with current user
    if (user && !isMe) {
        // Do I follow them?
        onValue(ref(database, `following/${user.uid}/${uid}`), (snap) => setIsFollowing(snap.exists()));
        // Do they follow me?
        onValue(ref(database, `following/${uid}/${user.uid}`), (snap) => setIsFollowedBy(snap.exists()));

        // Block logic (One-way)
        // 1. Did I block them?
        onValue(ref(database, `blocks/${user.uid}/${uid}`), (snap) => setIsBlockingThem(snap.exists()));
        // 2. Did they block me?
        onValue(ref(database, `blocks/${uid}/${user.uid}`), (snap) => setIsBlockedByThem(snap.exists()));
    }

    return () => unsub();
  }, [uid, user, isMe]);

  // Fetch users for list view
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

  const handleFollowToggle = async () => {
    if (!user || !uid || isMe || isBlockingThem || isBlockedByThem) return;
    const myFollowingRef = ref(database, `following/${user.uid}/${uid}`);
    const theirFollowersRef = ref(database, `followers/${uid}/${user.uid}`);
    if (isFollowing) {
        await remove(myFollowingRef);
        await remove(theirFollowersRef);
    } else {
        await set(myFollowingRef, true);
        await set(theirFollowersRef, true);
    }
  };

  const handleBlockToggle = async () => {
    if (!user || !uid || isMe) return;
    const blockRef = ref(database, `blocks/${user.uid}/${uid}`);
    if (isBlockingThem) {
        await remove(blockRef);
    } else {
        await set(blockRef, true);
        // Force unfollow when blocking
        await remove(ref(database, `following/${user.uid}/${uid}`));
        await remove(ref(database, `followers/${uid}/${user.uid}`));
        await remove(ref(database, `following/${uid}/${user.uid}`));
        await remove(ref(database, `followers/${user.uid}/${uid}`));
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
    if (e.target.files && e.target.files[0] && isMe && !isGuest) {
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
                        <div key={u.uid} onClick={() => { setListView('none'); navigate(`/profile/${u.uid}`); }} className="flex items-center justify-between p-4 bg-white/5 border border-white/[0.03] rounded-3xl hover:bg-white/[0.08] cursor-pointer transition-all">
                            <div className="flex items-center gap-4">
                                {u.photoURL ? <img src={u.photoURL} className="w-12 h-12 rounded-2xl object-cover" /> : <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{u.name?.charAt(0)}</div>}
                                <span className="font-bold text-neutral-200">{u.name}</span>
                            </div>
                            <ChevronRight size={18} className="text-neutral-600" />
                        </div>
                    ))
                ) : ( <div className="text-center py-20 text-neutral-600 font-medium">No {listView} yet.</div> )}
            </div>
        </div>
    );
  }

  // LOGIC: Profile visibility restricted if I am blocked by them
  const restrictedProfile = !isMe && isBlockedByThem;
  const limitedProfile = !isMe && isBlockingThem;

  const displayProfile = restrictedProfile ? {
    name: "Wisp User",
    photoURL: null,
    bio: null,
    dob: null,
    streak: 0,
    streaks: { current: 0, longest: 0 }
  } : profileData;

  const zodiac = (displayProfile?.dob && !restrictedProfile && !limitedProfile) ? getZodiacSign(displayProfile.dob) : null;

  return (
    <div className="flex-1 h-full bg-neutral-950 overflow-y-auto custom-scrollbar relative">
      <div className="absolute top-0 left-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {isMe && (
        <button onClick={() => navigate('/settings')} className="absolute top-8 right-8 z-30 p-3 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-2xl border border-white/10 transition-all shadow-xl active:scale-90 backdrop-blur-xl" title="Settings"><Settings size={24} /></button>
      )}

      <div className="max-w-2xl mx-auto w-full pt-16 px-6 pb-24 relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-[32px] p-8 mb-6 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
          <div className="flex flex-col items-center gap-8 relative z-10">
            <div className="relative">
              <div className="w-36 h-36 rounded-[40px] p-1.5 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 shadow-xl overflow-hidden group">
                <div className="w-full h-full rounded-[34px] overflow-hidden bg-neutral-900 relative">
                  {displayProfile.photoURL ? ( <img src={displayProfile.photoURL} alt="Profile" className="w-full h-full object-cover" /> ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-5xl font-bold text-neutral-400">{displayProfile.name?.charAt(0)}</div>
                  )}
                  {isUploading && ( <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 backdrop-blur-sm"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div> )}
                </div>
              </div>
              {isMe && ( <> <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" /><button onClick={() => fileInputRef.current?.click()} className="absolute -bottom-2 -right-2 p-3 bg-indigo-600 text-white rounded-2xl border-4 border-[#0d0d0d] hover:bg-indigo-500 transition-all shadow-xl active:scale-90" title="Change Photo"><Camera size={20} /></button> </> )}
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
                    <div className="flex items-center justify-center gap-8 mb-4">
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

                  {!isMe && !isGuest && (
                      <div className="flex items-center justify-center gap-3 mt-4">
                          {restrictedProfile ? (
                              <div className="text-xs font-bold text-neutral-600 uppercase tracking-widest py-2 bg-white/5 px-6 rounded-xl border border-white/5">This user is unavailable</div>
                          ) : limitedProfile ? (
                              <button onClick={handleBlockToggle} className="flex-1 max-w-[200px] inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95">
                                <Unlock size={18} /> Unblock
                              </button>
                          ) : (
                            <>
                              <button onClick={handleFollowToggle} className={`flex-1 max-w-[140px] px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 border ${isFollowing ? 'bg-neutral-800 border-white/10 text-neutral-300' : 'bg-indigo-600 border-indigo-500 text-white'}`}>
                                {isFollowing ? 'Following' : 'Follow'}
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
                  <div className="space-y-1 text-left"><label className="text-[10px] uppercase font-bold text-neutral-500 ml-3 tracking-widest">Display Name</label><input value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-neutral-950/50 border border-white/10 rounded-2xl px-5 py-3 text-center font-bold text-white focus:outline-none focus:border-indigo-500 transition-all" /></div>
                  <div className="space-y-1 text-left"><label className="text-[10px] uppercase font-bold text-neutral-500 ml-3 tracking-widest">About You</label><textarea value={editBio} onChange={e => setEditBio(e.target.value)} className="w-full bg-neutral-950/50 border border-white/10 rounded-2xl px-5 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[100px] text-center resize-none transition-all" /></div>
                  <div className="flex gap-2"><button onClick={handleSave} className="flex-1 bg-white text-black h-12 rounded-2xl font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2"><Save size={18} /> Save Profile</button><button onClick={() => setIsEditing(false)} className="px-5 bg-neutral-800 text-neutral-400 hover:text-white rounded-2xl transition-colors flex items-center justify-center"><X size={20} /></button></div>
                </div>
              )}
            </div>

            {(!restrictedProfile && !limitedProfile) && (
              <div className="w-full grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/[0.05] rounded-3xl p-5 flex flex-col items-center gap-2 hover:bg-white/[0.08] transition-colors group">
                  <div className="p-3 bg-orange-500/10 rounded-2xl group-hover:scale-110 transition-transform"><Flame size={24} className="text-orange-500 fill-orange-500 animate-fire-flicker" /></div>
                  <div className="text-center"><div className="text-2xl font-black text-white leading-tight">{displayProfile.streaks?.current || 0}</div><div className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest">Day Streak</div></div>
                </div>
                <div className="bg-white/5 border border-white/[0.05] rounded-3xl p-5 flex flex-col items-center gap-2 hover:bg-white/[0.08] transition-colors group">
                  <div className="p-3 bg-indigo-500/10 rounded-2xl group-hover:scale-110 transition-transform">{zodiac ? <span className="text-3xl leading-none filter drop-shadow-sm">{zodiac.icon}</span> : <Sparkles size={24} className="text-indigo-400" />}</div>
                  <div className="text-center"><div className="text-2xl font-black text-white leading-tight">{zodiac ? zodiac.name : '---'}</div><div className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest">Zodiac Sign</div></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {(!restrictedProfile && !limitedProfile) && (
          <div className="bg-white/[0.02] backdrop-blur-lg border border-white/[0.06] rounded-[32px] p-8 shadow-xl">
              <h3 className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> Records & Stats</h3>
              <div className="space-y-6">
                  <div className="flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-neutral-800/50 rounded-2xl group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors text-neutral-500"><Trophy size={20} /></div>
                          <div className="flex flex-col"><span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Longest Streak</span><span className="text-white font-semibold">{displayProfile.streaks?.longest || 0} Days</span></div>
                      </div>
                  </div>
                  <div className="h-px bg-white/[0.04]"></div>
                  <div className="flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-neutral-800/50 rounded-2xl group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors text-neutral-500"><Calendar size={20} /></div>
                          <div className="flex flex-col"><span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Date of Birth</span>{isMe && isEditing ? <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} className="mt-1 bg-neutral-950/50 border border-white/10 text-white text-sm px-4 py-2 rounded-xl focus:outline-none focus:border-indigo-500 transition-all" /> : <span className="text-white font-semibold">{displayProfile.dob ? new Date(displayProfile.dob).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not shared'}</span>}</div>
                      </div>
                  </div>
                  <div className="h-px bg-white/[0.04]"></div>
                  <div className="flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-neutral-800/50 rounded-2xl group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors text-neutral-500"><User size={20} /></div>
                          <div className="flex flex-col"><span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Account Type</span><span className="text-white font-semibold flex items-center gap-2">{profileData.stream || 'General'} Student <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] rounded-full border border-indigo-500/20 uppercase font-black">Standard</span></span></div>
                      </div>
                  </div>
              </div>
          </div>
        )}
      </div>
    </div>
  );
};