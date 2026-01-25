import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, get, set } from "firebase/database";
import { updateProfile } from "firebase/auth";
import { database, auth } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { getZodiacSign } from '../utils/zodiac';
import { 
  Camera, Edit2, Save, X, LogOut, Settings, 
  MapPin, Calendar, Sparkles, Flame, User, ChevronRight, Trophy, MessageCircle, Loader2
} from 'lucide-react';

export const Profile: React.FC = () => {
  const { uid } = useParams();
  const { user, logout, isGuest } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);

  // Edit State
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editDob, setEditDob] = useState('');

  const isOwnProfile = user?.uid === uid;

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

    // Check friendship status
    if (user && !isOwnProfile) {
        const friendRef = ref(database, `friends/${user.uid}/${uid}`);
        const unsubFriend = onValue(friendRef, (snap) => {
            setIsFriend(snap.exists());
        });
        return () => {
            unsub();
            unsubFriend();
        }
    }

    return () => unsub();
  }, [uid, user, isOwnProfile]);

  const handleSave = async () => {
    if (!uid || !isOwnProfile) return;

    let zodiac = profileData.zodiacSign;
    if (editDob) {
      const z = getZodiacSign(editDob);
      zodiac = z.name;
    }

    const updates = {
      name: editName,
      bio: editBio,
      dob: editDob,
      zodiacSign: zodiac
    };

    await update(ref(database, `users/${uid}`), updates);
    if (auth.currentUser && editName !== auth.currentUser.displayName) {
        await updateProfile(auth.currentUser, { displayName: editName });
    }
    setIsEditing(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && isOwnProfile && !isGuest) {
      setIsUploading(true);
      try {
        const url = await uploadImageToCloudinary(e.target.files[0]);
        if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: url });
        await update(ref(database, `users/${uid}`), { photoURL: url });
      } catch (err) {
        console.error("Upload failed", err);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleStartChat = async () => {
    if (!user || !uid || !isFriend || isStartingChat) return;
    
    setIsStartingChat(true);
    try {
        const myInboxRef = ref(database, `userInboxes/${user.uid}/${uid}`);
        const snap = await get(myInboxRef);

        if (!snap.exists()) {
            // Create Conversation Entry (for tracking members)
            const getDmConvoId = (u1: string, u2: string) => [u1, u2].sort().join('_');
            const convoId = getDmConvoId(user.uid, uid);
            
            await update(ref(database, `conversations/${convoId}`), {
                type: 'dm',
                members: { [user.uid]: true, [uid]: true },
                createdAt: Date.now()
            });

            // Initialize Inbox for me
            await set(myInboxRef, {
                type: 'dm',
                name: profileData.name,
                photoURL: profileData.photoURL || null,
                lastMessage: null,
                lastMessageAt: Date.now(),
                unreadCount: 0
            });

            // Initialize Inbox for them
            const theirInboxRef = ref(database, `userInboxes/${uid}/${user.uid}`);
            await set(theirInboxRef, {
                type: 'dm',
                name: user.displayName,
                photoURL: user.photoURL || null,
                lastMessage: null,
                lastMessageAt: Date.now(),
                unreadCount: 0
            });
        }
        
        // Navigate with search param
        navigate(`/inbox?chatId=${uid}`);
    } catch (err) {
        console.error("Failed to start chat", err);
        alert("Failed to start chat. Please try again.");
    } finally {
        setIsStartingChat(false);
    }
  };

  const handleLogout = async () => {
      await logout();
      window.location.hash = '/login';
  };

  if (loading) return <div className="flex h-full items-center justify-center bg-neutral-950"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;

  if (!profileData) return <div className="flex h-full items-center justify-center text-neutral-500 bg-neutral-950">User not found.</div>;

  const zodiac = profileData.dob ? getZodiacSign(profileData.dob) : null;

  return (
    <div className="flex-1 h-full bg-neutral-950 overflow-y-auto custom-scrollbar relative">
      {/* Ambient Background Glows */}
      <div className="absolute top-0 left-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-2xl mx-auto w-full pt-16 px-6 pb-24 relative z-10">
        
        {/* MAIN PROFILE CARD */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-[32px] p-8 mb-6 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
          
          <div className="flex flex-col items-center gap-8 relative z-10">
            
            {/* Avatar Section */}
            <div className="relative">
              <div className="w-36 h-36 rounded-[40px] p-1.5 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 shadow-xl overflow-hidden group">
                <div className="w-full h-full rounded-[34px] overflow-hidden bg-neutral-900 relative">
                  {profileData.photoURL ? (
                    <img src={profileData.photoURL} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-5xl font-bold text-neutral-400">
                      {profileData.name?.charAt(0)}
                    </div>
                  )}
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 backdrop-blur-sm">
                      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
              </div>

              {isOwnProfile && (
                <>
                  <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-2 -right-2 p-3 bg-indigo-600 text-white rounded-2xl border-4 border-[#0d0d0d] hover:bg-indigo-500 transition-all shadow-xl active:scale-90"
                    title="Change Photo"
                  >
                    <Camera size={20} />
                  </button>
                </>
              )}
            </div>

            {/* Name & Bio */}
            <div className="text-center space-y-3 w-full">
              {!isEditing ? (
                <>
                  <div className="flex items-center justify-center gap-2 group">
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">{profileData.name}</h1>
                    {isOwnProfile && (
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-white transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
                  </div>
                  {profileData.bio ? (
                    <p className="text-neutral-400 max-w-sm mx-auto whitespace-pre-wrap text-sm leading-relaxed font-medium">
                      {profileData.bio}
                    </p>
                  ) : isOwnProfile && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="text-indigo-400/60 hover:text-indigo-400 text-xs font-medium italic transition-colors"
                    >
                      + Add a bio
                    </button>
                  )}

                  {/* Message Friend Button */}
                  {!isOwnProfile && isFriend && !isGuest && (
                      <button 
                        onClick={handleStartChat}
                        disabled={isStartingChat}
                        className="mt-4 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
                      >
                        {isStartingChat ? <Loader2 size={20} className="animate-spin" /> : <MessageCircle size={20} />}
                        Message
                      </button>
                  )}
                </>
              ) : (
                <div className="w-full max-w-sm mx-auto space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 ml-3 tracking-widest">Display Name</label>
                    <input 
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full bg-neutral-950/50 border border-white/10 rounded-2xl px-5 py-3 text-center font-bold text-white focus:outline-none focus:border-indigo-500 transition-all"
                      placeholder="Your Name"
                    />
                  </div>
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 ml-3 tracking-widest">About You</label>
                    <textarea 
                      value={editBio}
                      onChange={e => setEditBio(e.target.value)}
                      className="w-full bg-neutral-950/50 border border-white/10 rounded-2xl px-5 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[100px] text-center resize-none transition-all"
                      placeholder="Tell us about yourself..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleSave}
                      className="flex-1 bg-white text-black h-12 rounded-2xl font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={18} /> Save Profile
                    </button>
                    <button 
                      onClick={() => { setIsEditing(false); setEditName(profileData.name); setEditBio(profileData.bio); setEditDob(profileData.dob); }}
                      className="px-5 bg-neutral-800 text-neutral-400 hover:text-white rounded-2xl transition-colors flex items-center justify-center"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* STATS SECTION - Nested Glass */}
            <div className="w-full grid grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/[0.05] rounded-3xl p-5 flex flex-col items-center gap-2 hover:bg-white/[0.08] transition-colors group">
                <div className="p-3 bg-orange-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                  <Flame size={24} className="text-orange-500 fill-orange-500" />
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-white leading-tight">{profileData.streaks?.current || profileData.streak || 0}</div>
                  <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest">Day Streak</div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/[0.05] rounded-3xl p-5 flex flex-col items-center gap-2 hover:bg-white/[0.08] transition-colors group">
                <div className="p-3 bg-indigo-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                  {zodiac ? (
                    <span className="text-3xl leading-none filter drop-shadow-sm">{zodiac.icon}</span>
                  ) : (
                    <Sparkles size={24} className="text-indigo-400" />
                  )}
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-white leading-tight">{zodiac ? zodiac.name : '---'}</div>
                  <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest">Zodiac Sign</div>
                </div>
              </div>
            </div>

            {/* Action Bar (Settings/Logout) */}
            {isOwnProfile && !isEditing && (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white rounded-2xl border border-white/10 transition-all font-semibold text-sm backdrop-blur-sm"
                  >
                    <Settings size={18} />
                    Settings
                  </button>
                  {showSettings && (
                    <div className="absolute top-full mt-3 right-0 w-56 bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-2xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-2">
                        <button 
                          onClick={handleLogout}
                          className="w-full flex items-center justify-between px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-2xl text-sm font-bold transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <LogOut size={18} />
                            Log Out
                          </div>
                          <ChevronRight size={14} className="opacity-50" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS SECTION - Liquid Glass */}
        <div className="bg-white/[0.02] backdrop-blur-lg border border-white/[0.06] rounded-[32px] p-8 shadow-xl">
            <h3 className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              Records & Stats
            </h3>
            
            <div className="space-y-6">
                <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-neutral-800/50 rounded-2xl group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors text-neutral-500">
                          <Trophy size={20} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Longest Streak</span>
                          <span className="text-white font-semibold">{profileData.streaks?.longest || 0} Days</span>
                        </div>
                    </div>
                </div>

                <div className="h-px bg-white/[0.04]"></div>

                <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-neutral-800/50 rounded-2xl group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors text-neutral-500">
                          <Calendar size={20} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Date of Birth</span>
                          {isEditing ? (
                              <input 
                                  type="date" 
                                  value={editDob}
                                  onChange={e => setEditDob(e.target.value)}
                                  className="mt-1 bg-neutral-950/50 border border-white/10 text-white text-sm px-4 py-2 rounded-xl focus:outline-none focus:border-indigo-500 transition-all"
                              />
                          ) : (
                              <span className="text-white font-semibold">
                                  {profileData.dob ? new Date(profileData.dob).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not shared'}
                              </span>
                          )}
                        </div>
                    </div>
                </div>

                <div className="h-px bg-white/[0.04]"></div>

                <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-neutral-800/50 rounded-2xl group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors text-neutral-500">
                          <User size={20} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Account Type</span>
                          <span className="text-white font-semibold flex items-center gap-2">
                                {profileData.stream || 'General'} Student
                                <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] rounded-full border border-indigo-500/20 uppercase font-black">Standard</span>
                          </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};