
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, get } from "firebase/database";
import { database } from "../firebase";
import { PostCard, CommentsModal } from './Pulse';
import { Post } from '../types';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

export const PostDetailView: React.FC = () => {
    const { postId } = useParams();
    const navigate = useNavigate();
    const [post, setPost] = useState<Post | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [activeComments, setActiveComments] = useState(false);

    useEffect(() => {
        if (!postId) return;
        setLoading(true);
        const postRef = ref(database, `posts/${postId}`);
        const unsub = onValue(postRef, (snap) => {
            if (snap.exists()) {
                setPost({ id: snap.key, ...snap.val() } as Post);
                setError(false);
            } else {
                setError(true);
            }
            setLoading(false);
        });
        return () => unsub();
    }, [postId]);

    if (loading) return <div className="flex h-full items-center justify-center bg-neutral-950"><Loader2 className="animate-spin text-indigo-500" /></div>;

    if (error || !post) {
        return (
            <div className="flex flex-col h-full items-center justify-center bg-neutral-950 p-6 text-center space-y-4">
                <AlertCircle size={48} className="text-neutral-700" />
                <h2 className="text-xl font-bold text-white">Post not found</h2>
                <button onClick={() => navigate(-1)} className="text-indigo-400 font-bold">Go Back</button>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-y-auto custom-scrollbar p-4 md:p-8">
            <div className="max-w-2xl w-full mx-auto space-y-6">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                    <span className="font-bold">Back</span>
                </button>

                <PostCard post={post} onOpenComments={() => setActiveComments(true)} />
                
                {activeComments && <CommentsModal post={post} onClose={() => setActiveComments(false)} />}
            </div>
        </div>
    );
};
