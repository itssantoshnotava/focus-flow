import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Inbox } from './components/Inbox';
import { SearchPage } from './components/Search';
import { NotificationsPage } from './components/Notifications';
import { GroupStudy } from './components/GroupStudy';
import { GroupSettings } from './components/GroupSettings';
import { Profile } from './components/Profile';
import { SettingsPage } from './components/Settings';
import { Pulse } from './components/Pulse';
import { PostDetailView } from './components/PostDetail';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TimerProvider } from './contexts/TimerContext';
import { Login } from './components/Login';
import { AccessGate } from './components/AccessGate';
import { seedAccessCodes } from './utils/seeder';
import { SplashScreen } from './components/SplashScreen';
import { Onboarding } from './components/Onboarding';
import { ref, get, update } from 'firebase/database';
import { database } from './firebase';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  
  const [splashSeen, setSplashSeen] = useState(() => localStorage.getItem('focusflow_splash_seen') === 'true');
  const [accessVerified, setAccessVerified] = useState(() => localStorage.getItem('focusflow_access') === 'true');
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem('focusflow_onboarding_completed') === 'true');
  
  const [checkingProfile, setCheckingProfile] = useState(true);

  useEffect(() => {
    if (user && !loading) {
      seedAccessCodes();
    }
  }, [user, loading]);

  useEffect(() => {
    const syncAndCheck = async () => {
        if (!user) {
            setCheckingProfile(false);
            return;
        }

        try {
            const userRef = ref(database, `users/${user.uid}`);
            const snap = await get(userRef);
            
            if (snap.exists()) {
                const data = snap.val();
                
                if (data.accessGranted) {
                    if (!accessVerified) {
                        localStorage.setItem('focusflow_access', 'true');
                        setAccessVerified(true);
                    }
                } else if (accessVerified) {
                    await update(userRef, { accessGranted: true });
                }

                if (data.onboardingCompleted) {
                    if (!onboardingComplete) {
                        localStorage.setItem('focusflow_onboarding_completed', 'true');
                        setOnboardingComplete(true);
                    }
                } else {
                    if (onboardingComplete) {
                        await update(userRef, { onboardingCompleted: true });
                    } else {
                        setOnboardingComplete(false);
                    }
                }
            } else {
                if (onboardingComplete) {
                    await update(userRef, { onboardingCompleted: true, accessGranted: accessVerified });
                } else {
                    setOnboardingComplete(false);
                }
            }
        } catch (e) {
            console.error("Failed to sync profile", e);
        } finally {
            setCheckingProfile(false);
        }
    };
    
    if (user) {
        setCheckingProfile(true);
        syncAndCheck();
    } else {
        setCheckingProfile(false);
    }
  }, [user, accessVerified, onboardingComplete]);

  const handleSplashComplete = () => {
      localStorage.setItem('focusflow_splash_seen', 'true');
      setSplashSeen(true);
  };

  const handleAccessSuccess = () => {
      setAccessVerified(true);
  };

  const handleOnboardingComplete = () => {
      localStorage.setItem('focusflow_onboarding_completed', 'true');
      setOnboardingComplete(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 font-sans">
        <div className="flex flex-col items-center gap-2">
           <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
           <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!splashSeen) {
      return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (!accessVerified && !user) {
      return <AccessGate onSuccess={handleAccessSuccess} />;
  }

  if (!user) {
    return <Login />;
  }

  if (!onboardingComplete) {
      if (checkingProfile) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 font-sans">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
      }
      return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <TimerProvider>
    <HashRouter>
        <Routes>
        <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pulse" element={<Pulse />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile/:uid" element={<Profile />} />
            <Route path="/post/:postId" element={<PostDetailView />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/group/:groupId/settings" element={<GroupSettings />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        
        <Route path="/group" element={<GroupStudy />} />
        <Route path="/group/:roomId" element={<GroupStudy />} />
        </Routes>
    </HashRouter>
    </TimerProvider>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;