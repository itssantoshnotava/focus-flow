import React, { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Inbox } from './components/Inbox';
import { SearchPage } from './components/Search';
import { NotificationsPage } from './components/Notifications';
import { GroupStudy } from './components/GroupStudy';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TimerProvider } from './contexts/TimerContext';
import { Login } from './components/Login';
import { AccessGate } from './components/AccessGate';
import { seedAccessCodes } from './utils/seeder';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user && !loading) {
      seedAccessCodes();
    }
  }, [user, loading]);

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

  if (!user) {
    return <Login />;
  }

  return (
    <AccessGate>
      <TimerProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>
            
            <Route path="/group" element={<GroupStudy />} />
            <Route path="/group/:roomId" element={<GroupStudy />} />
          </Routes>
        </HashRouter>
      </TimerProvider>
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