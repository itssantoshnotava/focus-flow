import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { GroupStudy } from './components/GroupStudy';
import { StudyRoom } from './components/StudyRoom';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/group" element={<GroupStudy />} />
        <Route path="/group/:roomId" element={<StudyRoom />} />
      </Routes>
    </HashRouter>
  );
};

export default App;