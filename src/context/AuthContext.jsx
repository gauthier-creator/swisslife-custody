import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);
  const inactivityTimer = useRef(null);
  const isSigningOut = useRef(false);

  // Fetch profile from custody_profiles
  const fetchProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('custody_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) setProfile(data);
    return data;
  }, []);

  const performSignOut = useCallback(async () => {
    if (isSigningOut.current) return;
    isSigningOut.current = true;
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    isSigningOut.current = false;
  }, []);

  // Inactivity timeout — auto-logout after 15 min without user interaction
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      if (session) performSignOut();
    }, INACTIVITY_TIMEOUT_MS);
  }, [session, performSignOut]);

  useEffect(() => {
    if (!session) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetInactivityTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetInactivityTimer(); // start timer

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [session, resetInactivityTimer]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) fetchProfile(s.user.id);
    });

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (email, password, fullName, role = 'banquier') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await performSignOut();
  }, [performSignOut]);

  const isAdmin = profile?.role === 'admin';
  const isBanquier = profile?.role === 'banquier';
  const loading = session === undefined;

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      loading,
      isAdmin,
      isBanquier,
      signIn,
      signUp,
      signOut,
      fetchProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
