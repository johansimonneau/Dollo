import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Injectés au build par vite.config.ts (URL + anon key uniquement, publiques par conception).
const url = __SUPABASE_URL__;
const anonKey = __SUPABASE_ANON_KEY__;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
