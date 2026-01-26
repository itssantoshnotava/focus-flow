import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, get, remove } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from '../contexts/AuthContext';
import { 
  ArrowLeft, LogOut, ChevronRight, User, Bell, 
  Shield, Globe, HelpCircle, Moon, Ban, Loader2, Unlock
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<'main' | 'blocked_accounts'>('main');
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (view === 'blocked_accounts' && user) {
        setLoading(true);
        const blocksRef = ref(database, `blocks/${user.uid}`);
        onValue(blocksRef, async (snap) => {
            if (snap.exists()) {
                const uids = Object.keys(snap.val());
                const promises = uids.map(uid => get(ref(database, `users/${uid}`)).then(s => ({ uid, ...s.val() })));
                const data = await Promise.all(promises);
                setBlockedUsers(data.filter(u => u.name));
            } else {
                setBlockedUsers([]);
            }
            setLoading(false);
        });
    }
  }, [view, user]);

  const handleUnblock = async (targetUid: string) => {
    if (!user) return;
    await remove(ref(database, `blocks/${user.uid}/${targetUid}`));
  };

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
        await logout();
        window.location.hash = '/login';
    }
  };

  const SettingItem = ({ icon: Icon, label, description, colorClass = "text-neutral-500", onClick }: { icon: any, label: string, description?: string, colorClass?: string, onClick?: () => void }) => (
    <div onClick={onClick} className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/[0.05] rounded-[24px] hover:bg-white/[0.06] transition-all cursor-pointer group">
      <div className="flex items-center gap-4">
        <div className={`p-3 bg-neutral-800/50 rounded-2xl group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors ${colorClass}`}>
          <Icon size={20} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white tracking-tight">{label}</span>
          {description && <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter">{description}</span>}
        </div>
      </div>
      <ChevronRight size={18} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
    </div>
  );

  if (view === 'blocked_accounts') {
      return (
        <div className="flex-1 h-full bg-neutral-950 overflow-y-auto custom-scrollbar relative">
             <div className="max-w-2xl mx-auto w-full pt-12 px-6 pb-24 relative z-10">
                <div className="flex items-center gap-4 mb-10">
                    <button onClick={() => setView('main')} className="p-3 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-2xl border border-white/10 transition-all active:scale-90"><ArrowLeft size={20} /></button>
                    <h1 className="text-3xl font-black text-white tracking-tight">Blocked</h1>
                </div>

                <div className="space-y-3">
                    {loading ? ( <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div> ) : blockedUsers.length > 0 ? (
                        blockedUsers.map(u => (
                            <div key={u.uid} className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/[0.05] rounded-[24px]">
                                <div className="flex items-center gap-4">
                                    {u.photoURL ? <img src={u.photoURL} className="w-12 h-12 rounded-2xl object-cover" /> : <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center font-bold text-neutral-500">{u.name?.charAt(0)}</div>}
                                    <span className="font-bold text-white">{u.name}</span>
                                </div>
                                <button onClick={() => handleUnblock(u.uid)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2"><Unlock size={14} /> Unblock</button>
                            </div>
                        ))
                    ) : ( <div className="text-center py-20 text-neutral-600 font-medium">No blocked accounts.</div> )}
                </div>
             </div>
        </div>
      );
  }

  return (
    <div className="flex-1 h-full bg-neutral-950 overflow-y-auto custom-scrollbar relative">
      <div className="absolute top-0 left-1/4 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="max-w-2xl mx-auto w-full pt-12 px-6 pb-24 relative z-10">
        <div className="flex items-center gap-4 mb-10">
            <button onClick={() => navigate(-1)} className="p-3 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-2xl border border-white/10 transition-all active:scale-90"><ArrowLeft size={20} /></button>
            <h1 className="text-3xl font-black text-white tracking-tight">Settings</h1>
        </div>
        <div className="space-y-8">
            <div className="space-y-4">
                <h3 className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-2">Account</h3>
                <div className="space-y-3">
                    <SettingItem icon={User} label="Profile Information" description="Name, Bio, Date of Birth" onClick={() => navigate(`/profile/${user?.uid}`)} />
                    <SettingItem icon={Ban} label="Blocked Accounts" description="Manage blocked users" onClick={() => setView('blocked_accounts')} />
                    <SettingItem icon={Bell} label="Notifications" description="Manage alerts & sounds" />
                    <SettingItem icon={Shield} label="Privacy & Security" description="Password, Data controls" />
                </div>
            </div>
            <div className="space-y-4">
                <h3 className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-2">General</h3>
                <div className="space-y-3">
                    <SettingItem icon={Moon} label="Appearance" description="Dark mode, Themes" />
                    <SettingItem icon={Globe} label="Language" description="English (US)" />
                </div>
            </div>
            <div className="space-y-4">
                <h3 className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-2">Support</h3>
                <div className="space-y-3">
                    <SettingItem icon={HelpCircle} label="Help Center" description="FAQs, Contact us" />
                </div>
            </div>
            <div className="pt-6 border-t border-white/[0.05] space-y-4">
                <button onClick={handleLogout} className="w-full flex items-center justify-between p-5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 rounded-[28px] group transition-all">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-500/10 rounded-2xl text-red-500 group-hover:scale-110 transition-transform"><LogOut size={20} /></div>
                        <div className="flex flex-col text-left"><span className="text-sm font-bold text-red-400">Log Out</span><span className="text-[10px] font-black text-red-900/60 uppercase tracking-tighter">Exit current session</span></div>
                    </div>
                    <ChevronRight size={18} className="text-red-900/40" />
                </button>
            </div>
        </div>
        <div className="mt-16 text-center"><p className="text-[10px] font-black text-neutral-600 uppercase tracking-[0.3em]">FocusFlow v1.0.4</p></div>
      </div>
    </div>
  );
};