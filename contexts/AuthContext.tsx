import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User, AuthError } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isGuest: boolean;
  signInWithGoogle: () => Promise<void>;
  loginAsGuest: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Only update if we are not in guest mode
      if (!isGuest) {
        setUser(currentUser);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [isGuest]);

  const signInWithGoogle = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setIsGuest(false);
    } catch (err: any) {
      console.error("Error signing in", err);
      const authError = err as AuthError;
      if (authError.code === 'auth/unauthorized-domain') {
          setError(`Domain not authorized: ${window.location.hostname}. Please add this domain to Firebase Console > Authentication > Settings > Authorized Domains.`);
      } else if (authError.code === 'auth/popup-closed-by-user') {
          setError('Sign-in cancelled.');
      } else {
          setError(authError.message || 'Failed to sign in. Please try again.');
      }
    }
  };

  const loginAsGuest = () => {
    setError(null);
    // Create a mock user object that satisfies the User interface for our needs
    const guestUser = {
      uid: `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      displayName: 'Guest',
      email: null,
      photoURL: null,
      emailVerified: false,
      isAnonymous: true,
      metadata: {},
      providerData: [],
      // Mock methods that might be called
      getIdToken: async () => 'guest-token',
      toJSON: () => ({})
    } as unknown as User;

    setUser(guestUser);
    setIsGuest(true);
    setLoading(false);
  };

  const logout = async () => {
    try {
        if (isGuest) {
            setUser(null);
            setIsGuest(false);
        } else {
            await signOut(auth);
        }
    } catch (e) {
        console.error(e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, isGuest, signInWithGoogle, loginAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
};