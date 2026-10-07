// Lien d'abonnement au calendrier de l'iPhone (fonction serveur « calendrier ») : le jeton est le secret du lien.
import { SUPABASE_URL } from '../../data/config.ts';

/** Jeton aléatoire de 43 caractères sûrs (256 bits). */
export function nouveauJetonCalendrier(): string {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function lienCalendrier(jeton: string, schema: 'https' | 'webcal' = 'https'): string {
  const base = `${SUPABASE_URL ?? ''}/functions/v1/calendrier?jeton=${encodeURIComponent(jeton)}`;
  return schema === 'webcal' ? base.replace(/^https?:/, 'webcal:') : base;
}
