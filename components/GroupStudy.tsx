import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Plus, LogIn } from 'lucide-react';

export const GroupStudy: React.FC = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans flex flex-col items-center justify-center relative p-6 selection:bg-indigo-500/30">
      <button 
        onClick={() => navigate('/')} 
        className="absolute top-6 left-6 p-2 text-neutral-500 hover:text-white hover:bg-neutral-900 rounded-lg transition-all"
        title="Back to Dashboard"
      >
        <ArrowLeft size={24} />
      </button>
      
      <div className="w-full max-w-sm flex flex-col gap-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-neutral-900 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-neutral-800 shadow-xl">
                <Users size={24} className="text-indigo-500" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Group Study</h1>
            <p className="text-neutral-500">Collaborate with peers in real-time</p>
        </div>

        {/* Controls */}
        <div className="space-y-4">
            
            <div className="space-y-2">
                <label className="text-xs font-medium text-neutral-500 ml-1 uppercase tracking-wide">Display Name</label>
                <input 
                    type="text" 
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-neutral-900/50 border border-neutral-800 text-white px-4 py-3.5 rounded-xl focus:outline-none focus:border-indigo-500/50 focus:bg-neutral-900 transition-all placeholder:text-neutral-700"
                />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
                <button className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-[0.98]">
                    <Plus size={18} />
                    <span>Create Room</span>
                </button>
                <button className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-medium py-3.5 rounded-xl border border-neutral-700 hover:border-neutral-600 transition-all active:scale-[0.98]">
                    <LogIn size={18} />
                    <span>Join Room</span>
                </button>
            </div>

        </div>

      </div>
    </div>
  );
};