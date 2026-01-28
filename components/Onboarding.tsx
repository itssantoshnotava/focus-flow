import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ref, update } from 'firebase/database';
import { updateProfile } from 'firebase/auth';
import { database } from '../firebase';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { getZodiacSign } from '../utils/zodiac';
import { Camera, ArrowRight, User, CheckCircle2, Circle, BookOpen, GraduationCap } from 'lucide-react';
import { StreamType, UserProfile } from '../types';
import { COMMERCE_SUBJECT_OPTIONS } from '../constants';

interface OnboardingProps {
  onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1); 
  const [loading, setLoading] = useState(false);

  // --- Step 1: Profile State ---
  const [name, setName] = useState(user?.displayName || '');
  const [bio, setBio] = useState('');
  const [dob, setDob] = useState('');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Step 2: Stream State ---
  const [stream, setStream] = useState<StreamType | null>(null);

  // --- Step 3: Exams/Subjects State ---
  // For PCM
  const [preparingForComp, setPreparingForComp] = useState<boolean | null>(null);
  const [selectedExams, setSelectedExams] = useState<Set<string>>(new Set());
  // For Commerce
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());

  // --- Step 4/5: New Prompts ---
  const [preparingForEamcet, setPreparingForEamcet] = useState<boolean | null>(null);
  const [elective, setElective] = useState<'ip' | 'pe' | null>(null);

  // --- Handlers ---

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLoading(true);
      try {
        const url = await uploadImageToCloudinary(e.target.files[0]);
        setPhotoURL(url);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleNextStep = () => {
    if (step === 2 && stream === 'IIT') {
        // IIT users skip the "Preparing for Comp" question as it's implied
        setPreparingForComp(true);
        setStep(4); // Skip to EAMCET question
        return;
    }
    if (step === 2 && stream === 'Commerce') {
        setStep(3); // Go to Subject select
        return;
    }
    if (step === 3 && stream === 'PCM' && preparingForComp === false) {
        setStep(5); // Skip EAMCET, go to Elective
        return;
    }
    if (step === 3 && stream === 'Commerce') {
        setStep(5); // Commerce has no EAMCET question
        return;
    }
    setStep((prev) => (prev + 1) as any);
  };

  const handleFinish = async () => {
    if (!user) return;
    setLoading(true);

    let zodiac = null;
    if (dob) {
       zodiac = getZodiacSign(dob).name;
    }

    const finalExams = new Set(selectedExams);
    if (preparingForEamcet) finalExams.add('eamcet');
    if (stream === 'IIT') {
        finalExams.add('jee');
        finalExams.add('bitsat');
        finalExams.add('viteee');
    }

    const profileUpdates: Partial<UserProfile> = {
        name,
        photoURL,
        bio,
        dob,
        zodiacSign: zodiac || undefined,
        stream: stream || undefined,
        preparingForComp: preparingForComp || undefined,
        onboardingCompleted: true,
        // Fix: Explicitly cast Array.from result to string[] to resolve TypeScript errors
        selectedExams: Array.from(finalExams) as string[],
        selectedSubjects: Array.from(selectedSubjects) as string[],
        elective: elective || 'ip',
        electiveSelected: true,
        eamcetPrompted: stream === 'IIT' || (stream === 'PCM' && preparingForComp) ? true : false
    };

    try {
        if (name !== user.displayName || photoURL !== user.photoURL) {
            await updateProfile(user, { displayName: name, photoURL });
        }
        await update(ref(database, `users/${user.uid}`), profileUpdates);
        localStorage.setItem('focusflow_onboarding_completed', 'true');
        onComplete();
    } catch (e) {
        console.error("Onboarding failed", e);
    } finally {
        setLoading(false);
    }
  };

  // --- RENDERERS ---

  const renderProfileStep = () => (
    <div className="space-y-6 animate-in slide-in-from-right duration-500">
        <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">Setup Profile</h2>
            <p className="text-neutral-500 text-sm">Let others know who you are.</p>
        </div>

        <div className="flex flex-col items-center gap-4">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-24 h-24 rounded-full bg-neutral-900 border-2 border-dashed border-neutral-700 flex items-center justify-center overflow-hidden">
                    {photoURL ? (
                        <img src={photoURL} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                        <User size={32} className="text-neutral-600" />
                    )}
                </div>
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={20} className="text-white" />
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
            </div>
            {loading && <span className="text-xs text-indigo-400">Uploading...</span>}
        </div>

        <div className="space-y-3">
            <input 
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Display Name"
                className="w-full bg-neutral-900 border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-indigo-500 outline-none"
            />
            <input 
                type="date"
                value={dob} onChange={e => setDob(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-indigo-500 outline-none"
            />
            <textarea 
                value={bio} onChange={e => setBio(e.target.value)}
                placeholder="Bio (Optional)"
                className="w-full bg-neutral-900 border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-indigo-500 outline-none h-24 resize-none"
            />
        </div>

        <button 
            onClick={handleNextStep}
            disabled={!name.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"
        >
            Next <ArrowRight size={18} />
        </button>
    </div>
  );

  const renderStreamStep = () => (
    <div className="space-y-6 animate-in slide-in-from-right duration-500">
        <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">Choose Stream</h2>
            <p className="text-neutral-500 text-sm">This customizes your dashboard.</p>
        </div>

        <div className="space-y-3">
            {[
                { id: 'PCM', label: 'PCM (Science)', desc: 'Physics, Chemistry, Maths' },
                { id: 'IIT', label: 'IIT JEE', desc: 'Focus on JEE Mains & Advanced' },
                { id: 'Commerce', label: 'Commerce', desc: 'Accounts, Economics, BST' }
            ].map((opt) => (
                <button
                    key={opt.id}
                    onClick={() => setStream(opt.id as StreamType)}
                    className={`w-full p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                        stream === opt.id 
                        ? 'bg-indigo-900/20 border-indigo-500/50' 
                        : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800'
                    }`}
                >
                    <div>
                        <div className={`font-bold ${stream === opt.id ? 'text-white' : 'text-neutral-300'}`}>{opt.label}</div>
                        <div className="text-xs text-neutral-500">{opt.desc}</div>
                    </div>
                    {stream === opt.id ? <CheckCircle2 className="text-indigo-500" /> : <Circle className="text-neutral-700" />}
                </button>
            ))}
        </div>

        <button 
            onClick={handleNextStep}
            disabled={!stream}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"
        >
            Next <ArrowRight size={18} />
        </button>
    </div>
  );

  const renderExamsOrSubjectsStep = () => {
      if (stream === 'PCM') {
          if (preparingForComp === null) {
              return (
                <div className="space-y-6 animate-in slide-in-from-right duration-500">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-white">Competitive Exams?</h2>
                        <p className="text-neutral-500 text-sm mt-1">Are you preparing for entrance exams?</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => {setPreparingForComp(true); handleNextStep();}} className="p-4 bg-neutral-900 border border-neutral-800 hover:border-indigo-500 rounded-xl font-bold text-white">Yes</button>
                        <button onClick={() => {setPreparingForComp(false); handleNextStep();}} className="p-4 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 rounded-xl font-bold text-neutral-400">No, just Boards</button>
                    </div>
                </div>
              );
          } else if (preparingForComp) {
               const examOptions = [
                   { id: 'jee', name: 'JEE Mains' },
                   { id: 'bitsat', name: 'BITSAT' },
                   { id: 'viteee', name: 'VITEEE' }
               ];
               return (
                   <div className="space-y-6 animate-in slide-in-from-right duration-500">
                       <div className="text-center">
                           <h2 className="text-xl font-bold text-white">Select Exams</h2>
                           <p className="text-neutral-500 text-sm">Select all that apply.</p>
                       </div>
                       <div className="space-y-2">
                           {examOptions.map(ex => {
                               const selected = selectedExams.has(ex.id);
                               return (
                                   <button key={ex.id} onClick={() => {
                                       const s = new Set(selectedExams);
                                       selected ? s.delete(ex.id) : s.add(ex.id);
                                       setSelectedExams(s);
                                   }} className={`w-full p-3 rounded-xl border flex justify-between items-center ${selected ? 'bg-indigo-900/20 border-indigo-500' : 'bg-neutral-900 border-neutral-800'}`}>
                                       <span className={selected ? 'text-white' : 'text-neutral-400'}>{ex.name}</span>
                                       {selected ? <CheckCircle2 size={18} className="text-indigo-500" /> : <Circle size={18} className="text-neutral-700" />}
                                   </button>
                               );
                           })}
                       </div>
                       <button onClick={handleNextStep} className="w-full bg-white text-black hover:bg-neutral-200 py-3 rounded-xl font-bold flex items-center justify-center gap-2">Continue <ArrowRight size={18} /></button>
                   </div>
               );
          }
      }

      if (stream === 'Commerce') {
          return (
             <div className="space-y-6 animate-in slide-in-from-right duration-500">
                 <div className="text-center">
                     <h2 className="text-xl font-bold text-white">Select Subjects</h2>
                     <p className="text-neutral-500 text-sm">Customize your syllabus tracker.</p>
                 </div>
                 <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                     {COMMERCE_SUBJECT_OPTIONS.map(sub => {
                         const selected = selectedSubjects.has(sub.id);
                         return (
                             <button key={sub.id} onClick={() => {
                                 const s = new Set(selectedSubjects);
                                 selected ? s.delete(sub.id) : s.add(sub.id);
                                 setSelectedSubjects(s);
                             }} className={`w-full p-3 rounded-xl border flex justify-between items-center ${selected ? 'bg-indigo-900/20 border-indigo-500' : 'bg-neutral-900 border-neutral-800'}`}>
                                 <span className={selected ? 'text-white' : 'text-neutral-400'}>{sub.name}</span>
                                 {selected ? <CheckCircle2 size={18} className="text-indigo-500" /> : <Circle size={18} className="text-neutral-700" />}
                             </button>
                         );
                     })}
                 </div>
                 <button onClick={handleNextStep} disabled={selectedSubjects.size === 0} className="w-full bg-white text-black hover:bg-neutral-200 disabled:opacity-50 py-3 rounded-xl font-bold flex items-center justify-center gap-2">Continue <ArrowRight size={18} /></button>
             </div>
          );
      }
      return null;
  };

  const renderEamcetStep = () => (
    <div className="space-y-6 animate-in slide-in-from-right duration-500 text-center">
        <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <GraduationCap size={32} className="text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">EAMCET Prep?</h2>
        <p className="text-neutral-400">Are you also preparing for EAMCET (May 12)?</p>
        <div className="grid grid-cols-2 gap-4">
            <button onClick={() => {setPreparingForEamcet(true); handleNextStep();}} className="p-4 bg-indigo-600 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95">Yes</button>
            <button onClick={() => {setPreparingForEamcet(false); handleNextStep();}} className="p-4 bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-xl font-bold active:scale-95">No</button>
        </div>
    </div>
  );

  const renderElectiveStep = () => (
    <div className="space-y-6 animate-in slide-in-from-right duration-500 text-center">
        <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen size={32} className="text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Select Elective</h2>
        <p className="text-neutral-400">Choose your optional Class 12 subject.</p>
        <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setElective('ip')} className={`flex flex-col items-center gap-1 py-4 rounded-2xl border transition-all ${elective === 'ip' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-neutral-900 border-neutral-800 text-neutral-500'}`}>
                <span className="text-lg font-black">IP</span>
                <span className="text-[8px] uppercase font-bold tracking-widest opacity-60">Informatics</span>
            </button>
            <button onClick={() => setElective('pe')} className={`flex flex-col items-center gap-1 py-4 rounded-2xl border transition-all ${elective === 'pe' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-neutral-900 border-neutral-800 text-neutral-500'}`}>
                <span className="text-lg font-black">PE</span>
                <span className="text-[8px] uppercase font-bold tracking-widest opacity-60">Physical Ed</span>
            </button>
        </div>
        <button 
            onClick={handleFinish} 
            disabled={!elective}
            className="w-full bg-white text-black hover:bg-neutral-200 disabled:opacity-50 py-3 rounded-xl font-bold mt-4"
        >
            Enter App
        </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6">
       <div className="w-full max-w-md">
           {/* Steps Indicator */}
           <div className="flex justify-between mb-8 px-4">
               {[1, 2, 3, 4, 5].map(i => (
                   <div key={i} className={`h-1 flex-1 mx-1 rounded-full transition-colors ${i <= step ? 'bg-indigo-600' : 'bg-neutral-800'}`}></div>
               ))}
           </div>

           {step === 1 && renderProfileStep()}
           {step === 2 && renderStreamStep()}
           {step === 3 && renderExamsOrSubjectsStep()}
           {step === 4 && renderEamcetStep()}
           {step === 5 && renderElectiveStep()}
       </div>
    </div>
  );
};
