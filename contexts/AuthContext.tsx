import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, database } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User, AuthError } from 'firebase/auth';
import { ref, get, set, update } from 'firebase/database';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      // Sync user to database if logged in
      if (currentUser) {
          const userRef = ref(database, `users/${currentUser.uid}`);
          try {
              const snapshot = await get(userRef);
              if (!snapshot.exists()) {
                  await set(userRef, {
                      name: currentUser.displayName,
                      photoURL: currentUser.photoURL
                  });
              } else {
                  await update(userRef, {
                      name: currentUser.displayName,
                      photoURL: currentUser.photoURL
                  });
              }
          } catch (e) {
              console.error("Error syncing user profile", e);
          }
      }
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
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

  const logout = async () => {
    try {
        await signOut(auth);
    } catch (e) {
        console.error(e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};