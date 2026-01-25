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
import { ref, get } from 'firebase/database';
import { database } from './firebase';

const AppContent: React.FC = () => {
  const { user, loading, isGuest } = useAuth();
  
  // State for Flow Control
  const [splashSeen, setSplashSeen] = useState(() => localStorage.getItem('focusflow_splash_seen') === 'true');
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // 1. Seed Codes (Admin utility)
  useEffect(() => {
    if (user && !loading) {
      seedAccessCodes();
    }
  }, [user, loading]);

  // 2. Check Onboarding Status (Only if user exists)
  useEffect(() => {
    const checkOnboarding = async () => {
        if (!user || isGuest) {
            setCheckingOnboarding(false);
            return;
        }

        try {
            const snap = await get(ref(database, `users/${user.uid}/onboardingCompleted`));
            if (snap.exists() && snap.val() === true) {
                setOnboardingComplete(true);
            } else {
                setOnboardingComplete(false);
            }
        } catch (e) {
            console.error("Failed to check onboarding", e);
        } finally {
            setCheckingOnboarding(false);
        }
    };
    
    if (user) checkOnboarding();
  }, [user, isGuest]);

  const handleSplashComplete = () => {
      localStorage.setItem('focusflow_splash_seen', 'true');
      setSplashSeen(true);
  };

  const handleOnboardingComplete = () => {
      setOnboardingComplete(true);
  };

  // --- RENDERING FLOW ---

  // 1. Global Loading
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

  // 2. Splash Screen (New Users)
  // Show if not logged in AND splash not seen yet
  if (!user && !splashSeen) {
      return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // 3. Login Screen
  if (!user) {
    return <Login />;
  }

  // 4. Access Gate & Onboarding Wrapper
  return (
    <AccessGate>
       {/* 5. Onboarding (If not complete and not guest) */}
       {!isGuest && !onboardingComplete && !checkingOnboarding ? (
           <Onboarding onComplete={handleOnboardingComplete} />
       ) : (
           /* 6. Main App */
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
       )}
    </AccessGate>
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