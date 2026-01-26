import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ref, onValue, update, onDisconnect } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, Home, MessageCircle, Search, Bell, Globe, User 
} from 'lucide-react';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isGuest } = useAuth();
  
  const [inboxUnread, setInboxUnread] = useState(0);
  const [profileImage, setProfileImage] = useState(user?.photoURL);

  // Sync profile image
  useEffect(() => {
    if (user) {
        const userRef = ref(database, `users/${user.uid}/photoURL`);
        const unsub = onValue(userRef, (snap) => {
            if (snap.exists()) setProfileImage(snap.val());
            else setProfileImage(user.photoURL);
        });
        return () => unsub();
    }
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

      const inboxRef = ref(database, `userInboxes/${user.uid}`);
      const unsubInbox = onValue(inboxRef, (snapshot) => {
          let unreadChatsCount = 0;
          if (snapshot.exists()) {
              snapshot.forEach((child) => {
                  // Count distinct chats that have at least one unread message
                  if ((child.val().unreadCount || 0) > 0) {
                      unreadChatsCount++;
                  }
              });
          }
          setInboxUnread(unreadChatsCount);
      });

      return () => {
          unsubInbox();
      };
  }, [user, isGuest]);

  const NavItem = ({ icon: Icon, path, label, badge }: { icon: any, path: string, label: string, badge?: number }) => {
      const isActive = location.pathname === path;
      return (
        <button 
            onClick={() => navigate(path)} 
            className={`relative p-3 rounded-2xl transition-all duration-200 group flex items-center justify-center
              ${isActive ? 'scale-105 translate-z-0' : 'hover:bg-white/5 active:scale-95'}`}
            title={label}
        >
            {/* Active Glow Backdrop */}
            {isActive && (
              <div className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full animate-pulse pointer-events-none"></div>
            )}
            
            <Icon 
              size={24} 
              className={`transition-all duration-200 relative z-10 
                ${isActive 
                  ? "text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" 
                  : "text-neutral-500 group-hover:text-neutral-300"
                }`} 
            />

            {badge !== undefined && badge > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] bg-indigo-500 text-white text-[9px] font-black flex items-center justify-center rounded-full border-2 border-[#141414] shadow-lg animate-in zoom-in z-20">
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
      <aside className="hidden md:flex w-20 flex-col items-center py-8 border-r border-white/10 bg-[#1414148c] backdrop-blur-xl backdrop-saturate-[140%] z-50 shrink-0 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <div className="mb-10">
           <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/40 rotate-3 hover:rotate-0 transition-transform">
              <LayoutDashboard size={20} className="text-white" />
           </div>
        </div>

        <div className="flex flex-col gap-5 flex-1 w-full items-center">
           <NavItem icon={Home} path="/" label="Home" />
           {!isGuest && (
             <>
               <NavItem icon={MessageCircle} path="/inbox" label="Inbox" badge={inboxUnread} />
               <NavItem icon={Search} path="/search" label="Search" />
               <NavItem icon={Bell} path="/notifications" label="Notifications" />
             </>
           )}
           <NavItem icon={Globe} path="/group" label="Group Study" />
        </div>

        <div className="mt-auto flex flex-col gap-4 items-center mb-2">
            {!isGuest && (
               <button 
                  onClick={() => navigate(`/profile/${user?.uid}`)}
                  className="w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-white/10 to-transparent border border-white/10 hover:border-indigo-500/50 hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all overflow-hidden group"
                  title="Profile"
               >
                   <div className="w-full h-full rounded-full overflow-hidden bg-neutral-900 flex items-center justify-center">
                       {profileImage ? (
                         <img src={profileImage} alt="Profile" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                       ) : (
                         <div className="text-xs font-bold text-neutral-400">{user?.displayName?.charAt(0) || <User size={16} />}</div>
                       )}
                   </div>
               </button>
            )}
        </div>
      </aside>

      {/* --- CONTENT AREA --- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-neutral-950 relative">
         <Outlet />
      </main>

      {/* --- MOBILE NAV --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-22 bg-[#1414148c] backdrop-blur-[24px] backdrop-saturate-[160%] border-t border-white/10 flex items-center justify-around z-50 pb-6 px-4 rounded-t-[32px] shadow-[0_-8px_30px_rgba(0,0,0,0.25)]">
         <NavItem icon={Home} path="/" label="Home" />
         {!isGuest && (
           <>
             <NavItem icon={MessageCircle} path="/inbox" label="Inbox" badge={inboxUnread} />
             <NavItem icon={Search} path="/search" label="Search" />
             <NavItem icon={Bell} path="/notifications" label="Notifications" />
           </>
         )}
         <NavItem icon={Globe} path="/group" label="Group" />
         {!isGuest && (
            <button 
                onClick={() => navigate(`/profile/${user?.uid}`)}
                className="w-10 h-10 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-white/10 to-transparent border border-white/10 active:scale-90 transition-transform"
            >
               <div className="w-full h-full rounded-full overflow-hidden bg-neutral-900 flex items-center justify-center">
                   {profileImage ? (
                     <img src={profileImage} alt="Me" className="w-full h-full object-cover" />
                   ) : (
                     <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-xs text-neutral-400 font-bold">
                        {user?.displayName?.charAt(0) || <User size={16} />}
                     </div>
                   )}
               </div>
            </button>
         )}
      </nav>

    </div>
  );
};
