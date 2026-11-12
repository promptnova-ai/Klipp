import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  configuredUrl &&
  configuredAnonKey &&
  !configuredUrl.includes('preview-placeholder') &&
  !configuredAnonKey.includes('preview-placeholder'),
);

// Safe fallback keeps the public UI preview bootable. It is deliberately not
// a real backend: auth and database operations require the project's real keys.
const supabaseUrl = configuredUrl || 'https://preview-placeholder.supabase.co';
const supabaseAnonKey = configuredAnonKey || 'preview-placeholder-anon-key';

const webStorage = {
  async getItem(key: string) {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      return;
    }
  },
  async removeItem(key: string) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      return;
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
