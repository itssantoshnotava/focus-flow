import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const { signInWithGoogle, error } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 font-sans text-neutral-200">
      <div className="flex flex-col items-center gap-8 max-w-md w-full animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-900/20">
                <LayoutDashboard size={32} className="text-white" />
            </div>
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-white tracking-tight">Circles</h1>
                <p className="text-neutral-500">Minimalist exam preparation dashboard</p>
            </div>
        </div>
        
        {error && (
            <div className="w-full bg-red-900/20 border border-red-900/50 rounded-lg p-3 flex items-start gap-3 text-red-200 text-sm">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
            </div>
        )}

        <div className="w-full space-y-3">
            <button 
                onClick={signInWithGoogle}
                className="w-full bg-white text-black font-medium py-4 px-6 rounded-xl flex items-center justify-center gap-3 hover:bg-neutral-200 transition-all shadow-xl active:scale-95"
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                <span>Sign in with Google</span>
            </button>
        </div>

        <p className="text-xs text-neutral-600 max-w-xs text-center mt-2">
            Authentication is required to save study progress and join the community rankings.
        </p>
      </div>
    </div>
  );
};