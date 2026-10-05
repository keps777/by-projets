// Réglages de l'environnement. Sans adresse Supabase, l'app tourne en « mode local » (données dans le téléphone, sans connexion).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_CLE = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const VAPID_PUBLIQUE = import.meta.env.VITE_VAPID_PUBLIC_KEY;
export const modeServeur = Boolean(SUPABASE_URL && SUPABASE_CLE);
export const ID_LOCAL = '00000000-0000-4000-8000-000000000001';
