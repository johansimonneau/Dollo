import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Injectés au build par vite.config.ts (URL + anon key uniquement, publiques par conception).
const url = __SUPABASE_URL__;
const anonKey = __SUPABASE_ANON_KEY__;

// Lu AVANT la création du client : il consomme puis efface le fragment d'URL des liens reçus par e-mail.
const hash = typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.slice(1)) : new URLSearchParams();
/** Ouverture via le lien « mot de passe oublié » : il faut demander un nouveau mot de passe. */
export const recoveryInUrl = hash.get('type') === 'recovery';
/** Lien d'e-mail invalide ou expiré (ex. déjà utilisé) : Supabase le signale dans l'URL. */
export const authErrorInUrl = hash.get('error_code') ?? hash.get('error');

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
