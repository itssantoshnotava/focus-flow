import React, { useState } from 'react';
import { ref, get, update } from 'firebase/database';
import { database } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Lock, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';

interface AccessGateProps {
    onSuccess: () => void;
}

export const AccessGate: React.FC<AccessGateProps> = ({ onSuccess }) => {
  const { user } = useAuth();
  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;

    setLoading(true);
    setError(null);

    const code = inputCode.trim();
    const codeRef = ref(database, `accessCodes/${code}`);

    try {
      const snapshot = await get(codeRef);

      if (!snapshot.exists()) {
        setError('Invalid access code.');
        setLoading(false);
        return;
      }

      const data = snapshot.val();

      if (data.used) {
        setError('This access code has already been used.');
        setLoading(false);
        return;
      }

      // Valid and unused
      // 1. Mark code as used
      // If user exists, log their ID. If not (pre-auth), log 'pre-auth'.
      await update(codeRef, {
        used: true,
        usedBy: user?.uid || 'pre-auth',
        usedAt: Date.now()
      });

      // 2. Persist locally
      localStorage.setItem('focusflow_access', 'true');

      // 3. If user is somehow already logged in, update their profile too
      if (user) {
          await update(ref(database, `users/${user.uid}`), {
              accessGranted: true
          });
      }

      onSuccess();

    } catch (err) {
      console.error(err);
      setError('Validation failed. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 font-sans text-neutral-200">
      <div className="w-full max-w-sm flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
        
        <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-center shadow-lg">
                <Lock size={20} className="text-indigo-500" />
            </div>
            <div className="space-y-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Private Access</h1>
                <p className="text-neutral-500 text-sm">Enter your invite code to continue.</p>
            </div>
        </div>
        
        {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
            </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="relative">
                <KeyRound size={16} className="absolute left-3.5 top-3.5 text-neutral-600" />
                <input 
                    type="text" 
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="Enter Access Code"
                    className="w-full bg-neutral-900 border border-neutral-800 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 transition-all placeholder:text-neutral-700 text-sm font-mono tracking-wider uppercase"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck="false"
                />
            </div>
            
            <button 
                type="submit"
                disabled={loading || !inputCode.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                    <>
                        <span>Verify Code</span>
                        <ArrowRight size={16} />
                    </>
                )}
            </button>
        </form>

        <p className="text-[10px] text-neutral-600 text-center">
            You must verify an access code before signing in.
        </p>

      </div>
    </div>
  );
};