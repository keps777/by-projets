// Carte de santé : numéro masqué, contenu du QR, vérification du code tournant côté partenaire. Fonctions pures.
import { codeCarte } from './sante.ts';

export const CRENEAU_MS = 30_000;
/** Contenu du QR code : version, numéro de membre, code du créneau en cours. */
export const contenuQr = (numeroMembre: string, code: string) => `AM1|${numeroMembre}|${code}`;
/** « AM4821 » devient « AM ···· 4821 ». */
export function masquerNumero(numero: string): string {
  const m = /^([A-Za-z]*)[-\s]?(\d+)$/.exec(numero.trim());
  return m ? `${m[1].toUpperCase()} ···· ${m[2].slice(-4)}` : numero;
}
/** « 483920 » devient « 483 920 ». */
export const grouperCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

const alnum = (s: string) => s.replace(/[^0-9a-z]/gi, '').toUpperCase();
const chiffres = (s: string) => s.replace(/\D/g, '');
/** Numéro de membre (« AM4821 », « AM-4821 ») ou téléphone (« 690 12 34 56 », « +237 690123456 ») : vrai si la saisie désigne ce membre. */
export function estCeMembre(saisie: string, numeroMembre: string, telephone: string): boolean {
  const s = alnum(saisie);
  if (s.length < 4) return false;
  if (s === alnum(numeroMembre)) return true;
  const tel = chiffres(telephone), d = chiffres(saisie);
  return d.length >= 8 && (d === tel || d === `237${tel}`);
}

export type VerificationCode = { ok: true } | { ok: false; raison: string };
/** Le code saisi doit être celui du créneau en cours ou du précédent (le temps de le lire et de le taper). */
export function verifierCode(numeroMembre: string, saisie: string, now: number): VerificationCode {
  const c = chiffres(saisie);
  if (c.length !== 6) return { ok: false, raison: 'Le code de la carte comporte 6 chiffres.' };
  if (c === codeCarte(numeroMembre, now) || c === codeCarte(numeroMembre, now - CRENEAU_MS)) return { ok: true };
  return { ok: false, raison: 'Code expiré ou incorrect. Demandez au patient le code affiché à l’écran.' };
}
