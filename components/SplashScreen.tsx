import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Check, ArrowRight } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [agreed, setAgreed] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleContinue = () => {
    if (agreed) {
      setIsExiting(true);
      setTimeout(() => {
        onComplete();
      }, 500); // Wait for animation
    }
  };

  return (
    <div className={`fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center p-6 text-center transition-opacity duration-500 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
      <div className="max-w-md w-full flex flex-col items-center animate-in fade-in zoom-in duration-700">
        
{/* Logo */}
<div className="flex flex-col items-center mb-10">
  <img
    src="/logo.png"
    alt="wishp"
    className="w-32 h-32 mb-4 select-none"
  />

  <h1 className="text-5xl font-bold text-white tracking-tight">
    wishp
  </h1>

  <p className="text-neutral-400 text-base mt-2">
    study. connect. stay consistent.
  </p>
</div>


        {/* Terms */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 w-full mb-8 text-left">
          <p className="text-neutral-300 text-sm leading-relaxed mb-4">
            By continuing, you agree to commit to your study goals and participate in the community with respect.
          </p>
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setAgreed(!agreed)}
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${agreed ? 'bg-indigo-600 border-indigo-600' : 'border-neutral-600 group-hover:border-neutral-400'}`}>
              {agreed && <Check size={14} className="text-white" />}
            </div>
            <span className={`text-sm font-medium transition-colors ${agreed ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'}`}>
              I agree to the Terms & Conditions
            </span>
          </div>
        </div>

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          disabled={!agreed}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
            agreed 
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-900/20 translate-y-0' 
            : 'bg-neutral-800 text-neutral-500 cursor-not-allowed translate-y-2 opacity-50'
          }`}
        >
          <span>Get Started</span>
          <ArrowRight size={20} />
        </button>

      </div>
    </div>
  );
};
