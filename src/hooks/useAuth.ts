import { useEffect, useState } from 'react';
import { auth, db } from '@/src/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Profile } from '@/src/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      // Cleanup previous profile subscription if any
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (firebaseUser) {
        // Start listening to profile changes
        profileUnsubscribe = onSnapshot(
          doc(db, 'profiles', firebaseUser.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              setProfile({
                id: docSnap.id,
                ...docSnap.data()
              } as Profile);
            } else {
              setProfile(null);
            }
            setLoading(false);
          },
          (err) => {
            console.error("Profile snapshot error:", err);
            setLoading(false);
          }
        );
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  return { user, profile, loading };
}
