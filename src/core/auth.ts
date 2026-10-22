// Sécurité du compte : code à 6 chiffres, verrouillage, session, code SMS, numéros camerounais. Fonctions pures (sauf le hachage, asynchrone).
export const LONGUEUR_CODE = 6;
export const LIMITE_ESSAIS = 3;
export const DUREE_VERROU_MS = 15 * 60 * 1000;
export const SESSION_INACTIVITE_MS = 5 * 60 * 1000;
export const OTP_VALIDITE_MS = 5 * 60 * 1000;
export const OTP_ESSAIS_MAX = 5;
export const OTP_RENVOI_MS = 42 * 1000;

const SIMPLES = new Set(['123456', '654321', '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '123123', '121212', '112233', '012345', '234567', '345678', '456789', '567890', '987654', '876543']);

/** Code trop simple : suite, chiffres répétés ou liste noire. */
export function codeTropSimple(code: string): boolean {
  if (code.length !== LONGUEUR_CODE) return false;
  if (SIMPLES.has(code)) return true;
  const d = code.split('').map(Number);
  const suite = d.every((x, i) => i === 0 || x - d[i - 1] === 1) || d.every((x, i) => i === 0 || d[i - 1] - x === 1);
  return suite || new Set(d).size <= 2;
}
export interface ForceCode { score: 0 | 1 | 2 | 3; libelle: string }
/** Solidité d'un code complet : plus il a de chiffres différents, mieux c'est. */
export function forceCode(code: string): ForceCode {
  if (code.length < LONGUEUR_CODE || codeTropSimple(code)) return { score: 0, libelle: '' };
  const distincts = new Set(code.split('')).size;
  const score = distincts >= 5 ? 3 : distincts >= 4 ? 2 : 1;
  return { score, libelle: ['', 'CORRECT', 'BON', 'SOLIDE'][score] };
}

// ------------------------------------------------------------------ hachage
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export function selAleatoire(octets = 16): string {
  const a = new Uint8Array(octets); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** PBKDF2-SHA256 du code et d'un sel : le code n'est jamais gardé en clair. */
export async function hacher(secret: string, sel: string, iterations = 120_000): Promise<string> {
  const cle = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(sel), iterations }, cle, 256));
}
export async function verifierHash(secret: string, sel: string, attendu: string, iterations = 120_000): Promise<boolean> {
  const h = await hacher(secret, sel, iterations);
  let diff = h.length ^ attendu.length;
  for (let i = 0; i < Math.min(h.length, attendu.length); i++) diff |= h.charCodeAt(i) ^ attendu.charCodeAt(i);
  return diff === 0;
}

// ------------------------------------------------------------------ verrouillage
export interface EtatVerrou { echecs: number; verrouJusqua: number | null }
export const estVerrouille = (e: EtatVerrou, now: number) => e.verrouJusqua != null && now < e.verrouJusqua;
export const secondesAvantDeverrou = (e: EtatVerrou, now: number) => (e.verrouJusqua == null ? 0 : Math.max(0, Math.ceil((e.verrouJusqua - now) / 1000)));
/** Après un code faux : un essai de moins ; au troisième, le compte est verrouillé 15 minutes. */
export function apresEchec(e: EtatVerrou, now: number): EtatVerrou {
  const echecs = e.echecs + 1;
  return echecs >= LIMITE_ESSAIS ? { echecs, verrouJusqua: now + DUREE_VERROU_MS } : { echecs, verrouJusqua: null };
}
export const apresSucces = (): EtatVerrou => ({ echecs: 0, verrouJusqua: null });
export const essaisRestants = (e: EtatVerrou) => Math.max(0, LIMITE_ESSAIS - e.echecs);
export const sessionExpiree = (derniereActivite: number, now: number) => now - derniereActivite >= SESSION_INACTIVITE_MS;

// ------------------------------------------------------------------ code SMS (OTP)
export interface Otp { hash: string; sel: string; expire: number; essais: number; envoyeLe: number }
export function codeOtp(): string {
  const a = new Uint32Array(1); crypto.getRandomValues(a); return String(a[0] % 1_000_000).padStart(6, '0');
}
export async function creerOtp(code: string, now: number): Promise<Otp> {
  const sel = selAleatoire(8);
  return { sel, hash: await hacher(code, sel, 1000), expire: now + OTP_VALIDITE_MS, essais: 0, envoyeLe: now };
}
export type ResultatOtp = 'ok' | 'faux' | 'expire' | 'trop_d_essais';
export async function verifierOtp(otp: Otp | null, code: string, now: number): Promise<{ resultat: ResultatOtp; otp: Otp | null }> {
  if (!otp) return { resultat: 'expire', otp: null };
  if (now >= otp.expire) return { resultat: 'expire', otp };
  if (otp.essais >= OTP_ESSAIS_MAX) return { resultat: 'trop_d_essais', otp };
  if (await verifierHash(code, otp.sel, otp.hash, 1000)) return { resultat: 'ok', otp: null };
  const suivant = { ...otp, essais: otp.essais + 1 };
  return { resultat: suivant.essais >= OTP_ESSAIS_MAX ? 'trop_d_essais' : 'faux', otp: suivant };
}
export const secondesAvantRenvoi = (o: Otp | null, now: number) => (o ? Math.max(0, Math.ceil((o.envoyeLe + OTP_RENVOI_MS - now) / 1000)) : 0);

// ------------------------------------------------------------------ numéros camerounais
/** Les 9 chiffres nationaux : accepte « +237 6 91 22 48 21 », « 691224821 », « 00237… ». */
export function chiffresTel(brut: string): string {
  let d = brut.replace(/\D/g, '');
  if (d.startsWith('00237')) d = d.slice(5);
  else if (d.startsWith('237') && d.length > 9) d = d.slice(3);
  return d.slice(0, 9);
}
export const telValide = (brut: string) => /^[62]\d{8}$/.test(chiffresTel(brut));
/** « 6 91 22 48 21 » */
export function formaterTel(brut: string): string {
  const d = chiffresTel(brut);
  return d.length <= 1 ? d : `${d[0]} ${(d.slice(1).match(/.{1,2}/g) ?? []).join(' ')}`;
}
export type Operateur = 'Orange' | 'MTN' | 'Camtel';
export function operateurDuNumero(brut: string): Operateur | null {
  const d = chiffresTel(brut);
  if (/^(69|65[5-9])/.test(d)) return 'Orange';
  if (/^(67|68|65[0-4])/.test(d)) return 'MTN';
  if (/^2[23]/.test(d)) return 'Camtel';
  return null;
}
/** « 6•• •• 48 21 » */
export function masquerTel(brut: string): string {
  const d = chiffresTel(brut);
  return d.length < 9 ? d : `${d[0]}•• •• ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}
