import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { supabase } from '../../lib/supabase';
import type { Profile, UserRole } from '@/lib/types';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setProfileError(null);
      setLoading(Boolean(nextSession));
      if (!nextSession) setProfile(null);
    });

    void supabase.auth.getSession().then(({ data: result, error }) => {
      if (!mounted) return;
      if (error) setProfileError(error.message);
      setSession(result.session);
      if (!result.session) setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!session) {
      setProfile(null);
      setProfileError(null);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    void supabase
      .from('profiles')
      .select('id, role, full_name, phone, avatar_url, created_at')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return;
        setProfile(data as Profile | null);
        setProfileError(error?.message ?? null);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string, fullName: string, role: UserRole) {
    const emailRedirectTo =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : Linking.createURL('/');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role, full_name: fullName }, emailRedirectTo },
    });
    if (error) throw error;
    return Boolean(data.session);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function refreshProfile() {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, phone, avatar_url, created_at')
      .eq('id', session.user.id)
      .single();
    setProfile(data as Profile | null);
    setProfileError(error?.message ?? null);
    setLoading(false);
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, profileError, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}