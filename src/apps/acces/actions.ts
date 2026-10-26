// Logique d'accès : identifiants, demande de code (simulée), vérification avec limite d'essais, création ou connexion, mémoire de l'appareil.
// Aucun envoi réel : le code de vérification est celui de la démonstration (voir `CODE_DEMO`).
import { app, tranche } from '../../data/store.svelte.ts';
import { codeValide, compteDe, connecter, courrielValide, creerCompte, telephoneValide, trouverCompte } from '../../domain/compte.ts';
import type { Compte } from '../../domain/types.ts';

/** Hypothèses de la maquette [H], à valider : longueur du code, essais permis, délai de renvoi, durée du blocage. */
export const LONGUEUR_CODE = 6;
export const ESSAIS_MAX = 3;
export const DELAI_RENVOI_S = 30;
export const DUREE_BLOCAGE_S = 30;
export const DELAI_ENVOI_MS = 800;
export const DELAI_CLE_MS = 1200;

export type TypeId = 'email' | 'tel';
export const chiffres = (s: string): string => s.replace(/\D/g, '');

/** Téléphone nord-américain : `514 555 0142` (le « 1 » d'indicatif est retiré, la frappe en cours est formatée au fil de l'eau). */
export function formaterTelephone(s: string): string {
  let d = chiffres(s); if (d.length > 10 && d.startsWith('1')) d = d.slice(1); d = d.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
}
/** Un identifiant saisi est un courriel s'il contient « @ », sinon un téléphone. */
export const typeDe = (s: string): TypeId => (s.includes('@') ? 'email' : 'tel');
export const identifiantValide = (type: TypeId, s: string): boolean => (type === 'email' ? courrielValide(s) : telephoneValide(s));
/** Forme enregistrée d'un identifiant : courriel en minuscules, sans espaces ; téléphone formaté. */
export const normaliserIdentifiant = (type: TypeId, s: string): string => (type === 'email' ? s.trim().toLowerCase() : formaterTelephone(s));
/** Le code saisi : chiffres seulement, six au plus (gère le collage « 482 915 » ou « 482-915 »). */
export const nettoyerCode = (s: string): string => chiffres(s).slice(0, LONGUEUR_CODE);
export const initiales = (c: Pick<Compte, 'prenom' | 'nom'>): string => `${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`.toUpperCase();
/** « 482915 » → « 482 915 », pour l'affichage. */
export const codeAffiche = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`.trim();

// --- Demande de code (simulée) ---
export type ResultatEnvoi = { ok: true } | { ok: false; raison: 'hors-ligne' | 'echec' };
/** Envoi simulé : attend `delai` ms, puis réussit (sauf hors ligne, ou échec forcé pour la démonstration). */
export async function demanderCode(opts: { enLigne?: boolean; echec?: boolean; delai?: number } = {}): Promise<ResultatEnvoi> {
  const { enLigne = true, echec = false, delai = DELAI_ENVOI_MS } = opts;
  if (!enLigne) return { ok: false, raison: 'hors-ligne' };
  await new Promise((r) => setTimeout(r, delai));
  return echec ? { ok: false, raison: 'echec' } : { ok: true };
}

// --- Vérification avec limite d'essais ---
export interface Essais { restants: number; bloqueJusqua: number | null }
export const essaisNeufs = (): Essais => ({ restants: ESSAIS_MAX, bloqueJusqua: null });
export type ResultatCode = { etat: 'incomplet' | 'ok' | 'incorrect' | 'bloque'; essais: Essais; secondesBlocage?: number };
/** Vérifie un code (fonction pure : `maintenant` en ms). Un blocage échu rend les essais. */
export function verifierCode(code: string, essais: Essais, maintenant: number): ResultatCode {
  let e = { ...essais };
  if (e.bloqueJusqua !== null) {
    if (maintenant < e.bloqueJusqua) return { etat: 'bloque', essais: e, secondesBlocage: Math.ceil((e.bloqueJusqua - maintenant) / 1000) };
    e = essaisNeufs();
  }
  if (code.length < LONGUEUR_CODE) return { etat: 'incomplet', essais: e };
  if (codeValide(code)) return { etat: 'ok', essais: e };
  const restants = e.restants - 1;
  if (restants <= 0) { const fin = maintenant + DUREE_BLOCAGE_S * 1000; return { etat: 'bloque', essais: { restants: 0, bloqueJusqua: fin }, secondesBlocage: DUREE_BLOCAGE_S }; }
  return { etat: 'incorrect', essais: { restants, bloqueJusqua: null } };
}
/** Un code erroné pour « Simuler un code erroné » (jamais le bon). */
export const CODE_ERRONE = '381920';

/** Compte à rebours (secondes restantes avant de pouvoir renvoyer), d'après l'horloge réelle. */
export const secondesRestantes = (finMs: number, maintenant: number): number => Math.max(0, Math.ceil((finMs - maintenant) / 1000));
export const minuteur = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// --- Mémoire de l'appareil (tranche « acces ») ---
interface Acces { appareil?: { compteId: string } }
const acces = () => tranche<Acces>('acces', () => ({}));
export const compteDeLAppareil = (): Compte | undefined => { const a = acces().appareil; const c = a ? compteDe(a.compteId) : undefined; return c?.actif ? c : undefined; };
export function memoriserAppareil(compteId: string): void { const a = acces(); a.appareil = { compteId }; }
export function oublierAppareil(): void { const a = acces(); delete a.appareil; }

// --- Brouillon d'inscription / de connexion ---
/** Démarre le brouillon (écran d'inscription ou de connexion) : un seul identifiant, l'autre est effacé. */
export function commencerBrouillon(type: TypeId, valeur: string): void {
  const v = normaliserIdentifiant(type, valeur);
  app.session.inscription = { ...(type === 'email' ? { email: v } : { tel: v }), etape: 1 };
}
export const identifiantDuBrouillon = (): { type: TypeId; valeur: string } | undefined => {
  const i = app.session.inscription; if (i.email) return { type: 'email', valeur: i.email }; if (i.tel) return { type: 'tel', valeur: i.tel }; return undefined;
};
export const compteExistant = (valeur: string): Compte | undefined => trouverCompte(valeur);

/** Le code est bon : connecte le compte existant, ou crée le compte (étape 2 du parcours). */
export function creerOuConnecter(mode: 'creation' | 'connexion'): { compteId: string; creation: boolean } | undefined {
  const id = identifiantDuBrouillon(); if (!id) return undefined;
  const existant = trouverCompte(id.valeur);
  if (existant) {
    if (!connecter(existant.id)) return undefined;
    memoriserAppareil(existant.id); app.session.inscription = { etape: 1 };
    return { compteId: existant.id, creation: false };
  }
  if (mode === 'connexion') return undefined; // pas de compte à connecter : retour à l'inscription
  const c = creerCompte(id.type === 'email' ? { email: id.valeur } : { tel: id.valeur });
  connecter(c.id); memoriserAppareil(c.id); app.session.inscription.etape = 2;
  return { compteId: c.id, creation: true };
}
/** Clé d'accès simulée : la confirmation de l'appareil réussit après `delai` ms. */
export async function confirmerCleAcces(compteId: string, opts: { delai?: number; refuser?: boolean } = {}): Promise<boolean> {
  await new Promise((r) => setTimeout(r, opts.delai ?? DELAI_CLE_MS));
  if (opts.refuser) return false;
  if (!connecter(compteId)) return false;
  memoriserAppareil(compteId); return true;
}
