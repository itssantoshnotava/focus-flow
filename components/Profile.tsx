import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from "firebase/database";
import { updateProfile } from "firebase/auth";
import { database, auth } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { getZodiacSign } from '../utils/zodiac';
import { 
  Camera, Edit2, Save, X, LogOut, Settings, 
  MapPin, Calendar, Sparkles, Flame, User
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
    return () => unsub();
  }, [uid]);

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

  const handleLogout = async () => {
      await logout();
      navigate('/login'); // Redirect handled by App but safe to explicit
  };

  if (loading) return <div className="flex h-full items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;

  if (!profileData) return <div className="flex h-full items-center justify-center text-neutral-500">User not found.</div>;

  const zodiac = profileData.dob ? getZodiacSign(profileData.dob) : null;

  return (
    <div className="flex-1 h-full bg-neutral-950 overflow-y-auto custom-scrollbar">
      <div className="max-w-2xl mx-auto w-full pt-10 px-6 pb-20">
        
        {/* HEADER / COVER AREA */}
        <div className="flex flex-col items-center gap-6 mb-12">
          
          {/* Avatar */}
          <div className="relative group">
            <div className="w-32 h-32 rounded-full border-4 border-neutral-900 shadow-2xl overflow-hidden bg-neutral-900 relative">
               {profileData.photoURL ? (
                 <img src={profileData.photoURL} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center bg-indigo-600 text-4xl font-bold text-white">
                    {profileData.name?.charAt(0)}
                 </div>
               )}
               {isUploading && (
                   <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                       <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                   </div>
               )}
            </div>

            {/* Edit Avatar Button (Own Profile) */}
            {isOwnProfile && (
                <>
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-0 right-0 p-2.5 bg-neutral-800 text-white rounded-full border-4 border-neutral-950 hover:bg-neutral-700 transition-colors shadow-lg"
                    >
                        <Camera size={18} />
                    </button>
                </>
            )}
          </div>

          {/* User Info Display */}
          <div className="text-center space-y-2 w-full">
             {!isEditing ? (
                 <>
                    <h1 className="text-2xl font-bold text-white">{profileData.name}</h1>
                    {profileData.bio && (
                        <p className="text-neutral-400 max-w-sm mx-auto whitespace-pre-wrap text-sm leading-relaxed">{profileData.bio}</p>
                    )}
                 </>
             ) : (
                 <div className="w-full max-w-sm mx-auto space-y-3">
                     <input 
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 text-center font-bold text-white focus:outline-none focus:border-indigo-500"
                        placeholder="Name"
                     />
                     <textarea 
                        value={editBio}
                        onChange={e => setEditBio(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[80px] text-center"
                        placeholder="Bio..."
                     />
                 </div>
             )}
          </div>

          {/* Stats Bar */}
          <div className="flex items-center gap-6 bg-neutral-900/50 border border-neutral-900 px-6 py-3 rounded-2xl">
              <div className="flex flex-col items-center gap-1">
                  <span className="text-lg font-bold text-white flex items-center gap-1.5">
                      <Flame size={18} className="text-orange-500 fill-orange-500" />
                      {profileData.streak || 0}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-neutral-600 tracking-wider">Streak</span>
              </div>
              <div className="w-px h-8 bg-neutral-800"></div>
              <div className="flex flex-col items-center gap-1">
                 <span className="text-lg font-bold text-white flex items-center gap-1.5">
                     {zodiac ? <span className="text-xl leading-none">{zodiac.icon}</span> : <Sparkles size={18} className="text-indigo-400" />}
                     {zodiac ? zodiac.name : '---'}
                 </span>
                 <span className="text-[10px] uppercase font-bold text-neutral-600 tracking-wider">Zodiac</span>
              </div>
          </div>

          {/* Action Buttons (Own Profile) */}
          {isOwnProfile && (
              <div className="flex gap-3">
                  {!isEditing ? (
                      <>
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors border border-neutral-800"
                        >
                            <Edit2 size={16} /> Edit Profile
                        </button>
                        <div className="relative">
                            <button 
                                onClick={() => setShowSettings(!showSettings)}
                                className="p-2.5 bg-neutral-900 text-neutral-400 hover:text-white rounded-xl border border-neutral-800 transition-colors"
                            >
                                <Settings size={20} />
                            </button>
                            {showSettings && (
                                <div className="absolute top-full mt-2 right-0 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95">
                                    <button 
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-neutral-800 text-sm font-medium text-left"
                                    >
                                        <LogOut size={16} /> Log Out
                                    </button>
                                </div>
                            )}
                        </div>
                      </>
                  ) : (
                      <div className="flex gap-3">
                          <button 
                              onClick={handleSave}
                              className="flex items-center gap-2 px-6 py-2.5 bg-white text-black rounded-xl text-sm font-bold hover:bg-neutral-200 transition-colors"
                          >
                              <Save size={16} /> Save
                          </button>
                          <button 
                              onClick={() => { setIsEditing(false); setEditName(profileData.name); setEditBio(profileData.bio); setEditDob(profileData.dob); }}
                              className="px-4 py-2.5 bg-neutral-800 text-neutral-400 hover:text-white rounded-xl transition-colors"
                          >
                              <X size={20} />
                          </button>
                      </div>
                  )}
              </div>
          )}

        </div>

        {/* DETAILS SECTION */}
        <div className="bg-neutral-900/30 border border-neutral-900 rounded-2xl p-6 space-y-6">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">About</h3>
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-neutral-300">
                        <Calendar size={18} className="text-neutral-600" />
                        <span className="text-sm font-medium">Date of Birth</span>
                    </div>
                    {isEditing ? (
                        <input 
                            type="date" 
                            value={editDob}
                            onChange={e => setEditDob(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 text-white text-sm px-3 py-1 rounded-lg focus:outline-none focus:border-indigo-500"
                        />
                    ) : (
                        <span className="text-sm text-neutral-500 font-mono">
                            {profileData.dob ? new Date(profileData.dob).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}
                        </span>
                    )}
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-neutral-300">
                        <MapPin size={18} className="text-neutral-600" />
                        <span className="text-sm font-medium">Joined</span>
                    </div>
                    <span className="text-sm text-neutral-500 font-mono">
                         Member since 2024
                    </span>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};