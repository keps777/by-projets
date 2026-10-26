// Moyens de paiement de démonstration : carte de test (Luhn, expiration MM/AA, code), wallet, mobile money. Rien n'est conservé, aucun réseau :
// les fonctions sont pures et le résultat du « prestataire » est simulé d'après le numéro (voir `issueSimulee`).
import type { MoyenPaiement } from '../../domain/marche.ts';

export type ChoixMoyen = 'carte' | 'wallet' | 'mobile';
export const MOYENS: ChoixMoyen[] = ['carte', 'wallet', 'mobile'];
/** Carte de test proposée dans l'aide du champ. */
export const CARTE_DE_TEST = '4242 4242 4242 4242';
/** Terminaisons qui déclenchent un refus simulé. */
export const FIN_CARTE_REFUSEE = '0002';
export const FIN_MOBILE_REFUSE = '00';
/** Durée simulée du traitement (ms). */
export const DELAI_TRAITEMENT_MS = 1200;

export const chiffres = (s: string): string => s.replace(/\D/g, '');
/** Contrôle de Luhn sur une suite de chiffres (espaces tolérés, autre caractère refusé). */
export function luhn(numero: string): boolean {
  const sans = numero.replace(/\s/g, ''), c = chiffres(sans); if (c.length < 2 || c !== sans) return false;
  let somme = 0;
  for (let i = 0; i < c.length; i++) { let n = Number(c[c.length - 1 - i]); if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } somme += n; }
  return somme % 10 === 0;
}
/** « 4242424242424242 » → « 4242 4242 4242 4242 » (16 chiffres au plus). */
export const formaterNumero = (s: string): string => chiffres(s).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
/** « 1228 » → « 12/28 » ; « 12/2 » → « 12/2 ». */
export function formaterExpiration(s: string): string { const c = chiffres(s).slice(0, 4); return c.length > 2 ? `${c.slice(0, 2)}/${c.slice(2)}` : c; }
export const quatreDerniers = (numero: string): string => chiffres(numero).slice(-4);

export function erreurNumero(s: string): string {
  const c = chiffres(s);
  if (!c) return 'Entrez le numéro de la carte.';
  if (c.length !== 16) return 'Le numéro compte 16 chiffres.';
  return luhn(c) ? '' : 'Ce numéro de carte n’est pas valide : vérifiez les chiffres.';
}
/** Expiration MM/AA : « Mois invalide : de 01 à 12. » si le mois est hors plage ; carte échue refusée (valable jusqu'à la fin du mois indiqué). */
export function erreurExpiration(s: string, maintenant: number): string {
  const t = s.trim(); if (!t) return 'Entrez la date d’expiration (MM/AA).';
  const m = /^(\d{1,2})\/?(\d{0,2})$/.exec(t);
  if (!m) return 'Format attendu : MM/AA.';
  const mois = Number(m[1]); if (m[1].length === 2 && (mois < 1 || mois > 12)) return 'Mois invalide : de 01 à 12.';
  if (m[1].length < 2 || m[2].length < 2) return 'Format attendu : MM/AA.';
  if (mois < 1 || mois > 12) return 'Mois invalide : de 01 à 12.';
  return new Date(2000 + Number(m[2]), mois, 1).getTime() > maintenant ? '' : 'Cette carte est échue : vérifiez la date.';
}
export const erreurCvc = (s: string): string => (/^\d{3}$/.test(s.trim()) ? '' : 'Le code de sécurité compte 3 chiffres.');
export const erreurNom = (s: string): string => (s.trim().length >= 2 ? '' : 'Entrez le nom inscrit sur la carte.');
/** Numéro de téléphone mobile money : 8 à 15 chiffres, le « + » d'indicatif toléré (le format varie selon le pays). */
export function erreurMobile(s: string): string {
  const c = chiffres(s); if (!c) return 'Entrez votre numéro de téléphone mobile money.';
  return c.length >= 8 && c.length <= 15 && /^[+\d\s().-]+$/.test(s.trim()) ? '' : 'Ce numéro n’est pas valide : 8 à 15 chiffres.';
}
export interface SaisieCarte { numero: string; exp: string; cvc: string; nom: string }
export interface ErreursCarte { numero?: string; exp?: string; cvc?: string; nom?: string }
export function erreursCarte(d: SaisieCarte, maintenant: number): ErreursCarte {
  const e: ErreursCarte = { numero: erreurNumero(d.numero), exp: erreurExpiration(d.exp, maintenant), cvc: erreurCvc(d.cvc), nom: erreurNom(d.nom) };
  for (const k of Object.keys(e) as (keyof ErreursCarte)[]) if (!e[k]) delete e[k];
  return e;
}

export type Issue = { ok: true } | { ok: false; message: string };
/** Réponse simulée du prestataire : carte finissant par 0002 ou numéro mobile finissant par 00 → refus ; tout le reste est accepté. */
export function issueSimulee(moyen: ChoixMoyen, d: { numero?: string; mobile?: string }): Issue {
  if (moyen === 'carte' && quatreDerniers(d.numero ?? '') === FIN_CARTE_REFUSEE) return { ok: false, message: 'Paiement refusé par la banque (carte de test). Essayez une autre carte, par exemple 4242 4242 4242 4242.' };
  if (moyen === 'mobile' && chiffres(d.mobile ?? '').endsWith(FIN_MOBILE_REFUSE)) return { ok: false, message: 'Paiement refusé par l’opérateur mobile money (numéro de test). Essayez un autre numéro.' };
  return { ok: true };
}
/** Le moyen choisi, tel que le marché l'enregistre. */
export const moyenMarche = (m: ChoixMoyen): MoyenPaiement => m;
