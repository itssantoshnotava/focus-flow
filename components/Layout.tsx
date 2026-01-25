import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ref, onValue, set, update, onDisconnect, get } from "firebase/database";
import { updateProfile } from "firebase/auth";
import { database, auth } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { 
  LayoutDashboard, Home, MessageCircle, Search, Bell, Globe, 
  LogOut, Camera, Loader2, User 
} from 'lucide-react';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isGuest } = useAuth();
  
  const [inboxUnread, setInboxUnread] = useState(0);
  const [requestCount, setRequestCount] = useState(0);

  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [profileImage, setProfileImage] = useState(user?.photoURL);
  const profileInputRef = React.useRef<HTMLInputElement>(null);

  // Sync profile image
  useEffect(() => {
    if (user) setProfileImage(user.photoURL);
  }, [user]);

  // --- Global Presence System ---
  useEffect(() => {
    if (user && !isGuest) {
        const connectedRef = ref(database, ".info/connected");
        const presenceRef = ref(database, `presence/${user.uid}`);
        
        const unsub = onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                onDisconnect(presenceRef).update({
                    online: false,
                    lastSeen: Date.now()
                });
                update(presenceRef, {
                    online: true,
                    lastSeen: Date.now()
                });
            }
        });

        return () => unsub();
    }
  }, [user, isGuest]);

  // --- Global Counters Listeners ---
  useEffect(() => {
      if (!user || isGuest) return;

      // 1. Inbox Unread
      const inboxRef = ref(database, `userInboxes/${user.uid}`);
      const unsubInbox = onValue(inboxRef, (snapshot) => {
          let total = 0;
          if (snapshot.exists()) {
              snapshot.forEach((child) => {
                  total += child.val().unreadCount || 0;
              });
          }
          setInboxUnread(total);
      });

      // 2. Friend Requests
      const requestsRef = ref(database, `friendRequests/${user.uid}`);
      const unsubRequests = onValue(requestsRef, (snapshot) => {
          setRequestCount(snapshot.exists() ? Object.keys(snapshot.val()).length : 0);
      });

      return () => {
          unsubInbox();
          unsubRequests();
      };
  }, [user, isGuest]);

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && user && !isGuest) {
      setIsUploadingProfile(true);
      try {
        const file = e.target.files[0];
        const url = await uploadImageToCloudinary(file);
        if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: url });
        await update(ref(database, `users/${user.uid}`), { photoURL: url });
        setProfileImage(url);
      } catch (err) {
        console.error("Profile upload failed", err);
        alert("Failed to upload profile picture.");
      } finally {
        setIsUploadingProfile(false);
        if (profileInputRef.current) profileInputRef.current.value = '';
      }
    }
  };

  const NavItem = ({ icon: Icon, path, label, badge }: { icon: any, path: string, label: string, badge?: number }) => {
      const isActive = location.pathname === path;
      return (
        <button 
            onClick={() => navigate(path)} 
            className={`relative p-3 rounded-xl transition-all group ${isActive ? 'bg-neutral-800' : 'hover:bg-neutral-900'}`}
            title={label}
        >
            <Icon size={24} className={isActive ? "text-indigo-500" : "text-neutral-500 group-hover:text-neutral-300 transition-colors"} />
            {badge !== undefined && badge > 0 && (
                <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-neutral-950 animate-in zoom-in">
                    {badge > 99 ? '99' : badge}
                </span>
            )}
            <span className="sr-only">{label}</span>
        </button>
      );
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden md:flex w-20 flex-col items-center py-6 border-r border-neutral-900 bg-neutral-950 z-50 shrink-0">
        <div className="mb-8">
           <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/20">
              <LayoutDashboard size={20} className="text-white" />
           </div>
        </div>

        <div className="flex flex-col gap-4 flex-1 w-full items-center">
           <NavItem icon={Home} path="/" label="Home" />
           {!isGuest && (
             <>
               <NavItem icon={MessageCircle} path="/inbox" label="Inbox" badge={inboxUnread} />
               <NavItem icon={Search} path="/search" label="Search" />
               <NavItem icon={Bell} path="/notifications" label="Notifications" badge={requestCount} />
             </>
           )}
           <NavItem icon={Globe} path="/group" label="Group Study" />
        </div>

        <div className="mt-auto flex flex-col gap-4 items-center">
            {!isGuest && (
               <div className="relative group">
                   <input type="file" ref={profileInputRef} onChange={handleProfileUpload} className="hidden" accept="image/*" />
                   <button 
                      className="relative cursor-pointer w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-800 hover:border-neutral-600 transition-colors overflow-hidden"
                      onClick={() => profileInputRef.current?.click()}
                   >
                       {profileImage ? (
                         <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                       ) : (
                         <div className="text-xs font-bold text-neutral-400">{user?.displayName?.charAt(0) || <User size={16} />}</div>
                       )}
                       <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                           <Camera size={14} className="text-white" />
                       </div>
                       {isUploadingProfile && (
                           <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                               <Loader2 size={14} className="text-indigo-400 animate-spin" />
                           </div>
                       )}
                   </button>
               </div>
            )}
            <button onClick={() => logout()} className="p-3 text-neutral-600 hover:text-red-400 transition-colors rounded-xl hover:bg-neutral-900">
                <LogOut size={20} />
            </button>
        </div>
      </aside>

      {/* --- CONTENT AREA --- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-neutral-950 relative">
         <Outlet />
      </main>

      {/* --- MOBILE NAV --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-neutral-950 border-t border-neutral-900 flex items-center justify-around z-50 pb-2 px-2">
         <NavItem icon={Home} path="/" label="Home" />
         {!isGuest && (
           <>
             <NavItem icon={MessageCircle} path="/inbox" label="Inbox" badge={inboxUnread} />
             <NavItem icon={Search} path="/search" label="Search" />
             <NavItem icon={Bell} path="/notifications" label="Notifications" badge={requestCount} />
           </>
         )}
         <NavItem icon={Globe} path="/group" label="Group" />
         <button onClick={() => logout()} className="p-3 rounded-xl transition-all text-neutral-500 hover:text-white">
             <LogOut size={24} />
         </button>
      </nav>

    </div>
  );
};