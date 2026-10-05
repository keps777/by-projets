// Client Supabase « administrateur » des fonctions serveur : clé de service, qui contourne les règles d'accès.
// Ne jamais l'exposer à l'app. Les variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournies par Supabase.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type Client = SupabaseClient;

export function clientAdmin(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cle) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.');
  return createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Lève une erreur lisible si la réponse Supabase en contient une. */
export function verifier<T>(r: { data: T; error: { message: string } | null }, quoi: string): T {
  if (r.error) throw new Error(`${quoi} : ${r.error.message}`);
  return r.data;
}

let secretEnCache: Promise<string | undefined> | null = null;

/**
 * Secret partagé avec pg_cron, lu dans le coffre de la base (migration 0800) puis gardé en mémoire.
 * Repli sur la variable CRON_SECRET si le coffre ne répond pas (installations antérieures).
 */
export function secretCron(): Promise<string | undefined> {
  secretEnCache ??= clientAdmin().rpc('secret_cron').then((r) => {
    const v = typeof r.data === 'string' && !r.error ? r.data : undefined;
    if (!v) secretEnCache = null;
    return v ?? Deno.env.get('CRON_SECRET');
  }, () => { secretEnCache = null; return Deno.env.get('CRON_SECRET'); });
  return secretEnCache;
}
