import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Inbox } from './components/Inbox';
import { SearchPage } from './components/Search';
import { NotificationsPage } from './components/Notifications';
import { GroupStudy } from './components/GroupStudy';
import { Profile } from './components/Profile';
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
  const { user, loading, isGuest } = useAuth();
  
  // --- Flow State ---
  // Initialize state from LocalStorage to avoid flicker and blocking
  const [splashSeen, setSplashSeen] = useState(() => localStorage.getItem('focusflow_splash_seen') === 'true');
  const [accessVerified, setAccessVerified] = useState(() => localStorage.getItem('focusflow_access') === 'true');
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem('focusflow_onboarding_completed') === 'true');
  
  const [checkingProfile, setCheckingProfile] = useState(true);

  // 1. Seed Codes (Admin utility - runs silently if user exists)
  useEffect(() => {
    if (user && !loading) {
      seedAccessCodes();
    }
  }, [user, loading]);

  // 2. Sync Access & Check Onboarding (Once User is Logged In)
  useEffect(() => {
    const syncAndCheck = async () => {
        if (!user || isGuest) {
            setCheckingProfile(false);
            return;
        }

        try {
            const userRef = ref(database, `users/${user.uid}`);
            const snap = await get(userRef);
            
            if (snap.exists()) {
                const data = snap.val();
                
                // Sync Access Logic
                if (data.accessGranted) {
                    if (!accessVerified) {
                        localStorage.setItem('focusflow_access', 'true');
                        setAccessVerified(true);
                    }
                } else if (accessVerified) {
                    await update(userRef, { accessGranted: true });
                }

                // Check Onboarding Logic
                if (data.onboardingCompleted) {
                    if (!onboardingComplete) {
                        localStorage.setItem('focusflow_onboarding_completed', 'true');
                        setOnboardingComplete(true);
                    }
                } else {
                    // DB says not complete. But if local says complete (just finished), prioritize local and sync to DB
                    if (onboardingComplete) {
                        await update(userRef, { onboardingCompleted: true });
                    } else {
                        setOnboardingComplete(false);
                    }
                }
            } else {
                // User record doesn't exist yet
                // If local state says complete, we trust it and create/update profile
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
  }, [user, isGuest]); // Removed dependencies that cause re-loops, handled inside logic

  const handleSplashComplete = () => {
      localStorage.setItem('focusflow_splash_seen', 'true');
      setSplashSeen(true);
  };

  const handleAccessSuccess = () => {
      // Local storage is set inside AccessGate, just update state
      setAccessVerified(true);
  };

  const handleOnboardingComplete = () => {
      localStorage.setItem('focusflow_onboarding_completed', 'true');
      setOnboardingComplete(true);
  };

  // --- RENDERING FLOW ---

  // 1. Global Loading (Auth Check)
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

  // 2. Splash Screen (Always first if not seen)
  if (!splashSeen) {
      return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // 3. Access Gate (Strictly before Login)
  if (!accessVerified && !user) {
      return <AccessGate onSuccess={handleAccessSuccess} />;
  }

  // 4. Login Screen
  if (!user) {
    return <Login />;
  }

  // 5. Onboarding (Profile Setup)
  // Logic: Show onboarding if NOT guest AND NOT complete.
  // We use checkingProfile to avoid premature onboarding screen if data is fetching.
  // BUT if local state already says complete, we skip the check and render app.
  if (!isGuest && !onboardingComplete) {
      if (checkingProfile) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 font-sans">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
      }
      return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // 6. Main App
  return (
    <TimerProvider>
    <HashRouter>
        <Routes>
        <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile/:uid" element={<Profile />} />
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