import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const StudyRoom: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans flex flex-col items-center justify-center p-6">
       <button 
        onClick={() => navigate('/group')} 
        className="absolute top-6 left-6 p-2 text-neutral-500 hover:text-white hover:bg-neutral-900 rounded-lg transition-all"
        title="Back to Lobby"
      >
        <ArrowLeft size={24} />
      </button>
      <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">Room {roomId}</h1>
          <p className="text-neutral-500">Room created successfully.</p>
      </div>
    </div>
  );
};