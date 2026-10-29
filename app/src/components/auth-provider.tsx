import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { supabase } from '../../lib/supabase';
import type { Profile, UserRole } from '@/lib/types';
import { updateActiveProTrackingBookings } from '@/lib/pro-location-task';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role: UserRole, metadata?: Record<string, unknown>) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (nextSession) setAuthError(null);
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
    if (Platform.OS === 'web') return;

    let mounted = true;
    const handledAuthCodes = new Set<string>();
    async function handleAuthUrl(url: string) {
      const code = Linking.parse(url).queryParams?.code;
      if (typeof code !== 'string' || handledAuthCodes.has(code)) return;
      handledAuthCodes.add(code);

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error && mounted) setAuthError(error.message);
      } catch (cause) {
        if (mounted) {
          setAuthError(cause instanceof Error ? cause.message : 'No pudimos confirmar tu cuenta.');
        }
      }
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });
    void Linking.getInitialURL()
      .then((url) => {
        if (url) return handleAuthUrl(url);
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setAuthError(cause instanceof Error ? cause.message : 'No pudimos confirmar tu cuenta.');
        }
      });

    return () => {
      mounted = false;
      subscription.remove();
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
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    metadata: Record<string, unknown> = {},
  ) {
    setAuthError(null);
    const emailRedirectTo =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : Linking.createURL('/');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { ...metadata, role, full_name: fullName }, emailRedirectTo },
    });
    if (error) throw error;
    return Boolean(data.session);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    if (Platform.OS !== 'web') {
      try {
        await updateActiveProTrackingBookings([]);
      } catch (cause) {
        setAuthError(cause instanceof Error ? cause.message : 'No pudimos detener el seguimiento de ubicación.');
      }
    }
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
      value={{
        session,
        profile,
        loading,
        profileError,
        authError,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}