import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ref, onValue, update, onDisconnect } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { 
  Home, MessageCircle, Search, Bell, Globe, User 
} from 'lucide-react';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isGuest } = useAuth();
  
  const [inboxUnread, setInboxUnread] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const [profileImage, setProfileImage] = useState(user?.photoURL);

  // Sync profile image
  useEffect(() => {
    if (user) {
        // Realtime listen for photo updates (if changed in Profile page)
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
      <div className="mb-8 flex items-center justify-center">
  <img
    src="/logo.png"
    alt="wishp"
    className="h-12 w-auto object-contain"
  />
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

        <div className="mt-auto flex flex-col gap-4 items-center mb-2">
            {!isGuest && (
               <button 
                  onClick={() => navigate(`/profile/${user?.uid}`)}
                  className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-800 hover:border-neutral-600 transition-colors overflow-hidden"
                  title="Profile"
               >
                   {profileImage ? (
                     <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                   ) : (
                     <div className="text-xs font-bold text-neutral-400">{user?.displayName?.charAt(0) || <User size={16} />}</div>
                   )}
               </button>
            )}
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
         {!isGuest && (
            <button 
                onClick={() => navigate(`/profile/${user?.uid}`)}
                className="w-10 h-10 rounded-full overflow-hidden border border-neutral-800"
            >
               {profileImage ? (
                 <img src={profileImage} alt="Me" className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-xs"><User size={16} /></div>
               )}
            </button>
         )}
      </nav>

    </div>
  );
};
