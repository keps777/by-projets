import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLE, SUPABASE_URL, modeServeur } from './config.ts';

let client: SupabaseClient | null = null;

/** Client Supabase (null en mode local). */
export function supabase(): SupabaseClient | null {
  if (!modeServeur) return null;
  client ??= createClient(SUPABASE_URL!, SUPABASE_CLE!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return client;
}
