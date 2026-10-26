// Comptes et session : ce que chaque écran d'accès (ouverture, inscription, code, clé d'accès, profil) partage.
import { app, nouvelId, maintenant } from '../data/store.svelte.ts';
import { CODE_DEMO } from '../data/constantes.ts';
import type { Compte, Notification, Prefs } from './types.ts';

export const comptes = (): Compte[] => app.monde.comptes;
export const compteDe = (id: string | null | undefined): Compte | undefined => (id ? app.monde.comptes.find((c) => c.id === id) : undefined);
/** Le compte connecté, ou undefined. À appeler dans un `$derived` ou une action. */
export const compteCourant = (): Compte | undefined => compteDe(app.session.compteId);
export const estAdmin = (c: Compte | undefined = compteCourant()): boolean => c?.role === 'admin';
const norm = (s: string) => s.trim().toLowerCase();
const chiffres = (s: string) => s.replace(/\D/g, '');
/** Cherche un compte par courriel ou téléphone (insensible à la casse et à la mise en forme). */
export function trouverCompte(identifiant: string): Compte | undefined {
  const i = norm(identifiant); if (!i) return undefined;
  if (i.includes('@')) return app.monde.comptes.find((c) => norm(c.email) === i);
  const t = chiffres(i); return t.length >= 7 ? app.monde.comptes.find((c) => chiffres(c.tel).endsWith(t) || t.endsWith(chiffres(c.tel))) : undefined;
}
export const courrielValide = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
export const telephoneValide = (s: string): boolean => { const t = chiffres(s); return t.length === 10 || (t.length === 11 && t.startsWith('1')); };
/** Le code de vérification est celui de la démonstration (aucun envoi réel). */
export const codeValide = (code: string): boolean => code.trim() === CODE_DEMO;

export function connecter(id: string): boolean {
  const c = compteDe(id); if (!c || !c.actif) return false;
  app.session.compteId = id; app.session.derniereActivite = maintenant(); return true;
}
export function deconnecter(): void { app.session.compteId = null; }
/** Nouveau compte voyageur (sans carte, sans identité : ces étapes sont facultatives). Renvoie l'identifiant « ACC-0xxx ». */
export function creerCompte(d: { prenom?: string; nom?: string; email?: string; tel?: string }): Compte {
  const n = app.monde.comptes.length + 410 + Math.floor(Math.random() * 90);
  const c: Compte = { id: `ACC-${String(n).padStart(4, '0')}`, role: 'voyageur', prenom: d.prenom ?? '', nom: d.nom ?? '', email: d.email ?? '', tel: d.tel ?? '', ville: 'Montréal', aeroport: 'YUL', langue: app.session.langue, region: 'Canada · CAD',
    pass: { actif: false }, passkey: false, proches: [], solde: 0, enAttente: 0, prefsNotif: 'essentiel', partage: { offres: true, analyses: false, partenaires: false }, creeLe: maintenant(), actif: true };
  app.monde.comptes.push(c); return c;
}
export function majCompte(id: string, patch: Partial<Compte>): void { const c = compteDe(id); if (c) Object.assign(c, patch); }
export const setPrefsNotif = (id: string, p: Prefs) => majCompte(id, { prefsNotif: p });
/** Ajoute une notification (respecte la préférence : « rien » = aucune, « l'essentiel » = seulement les essentielles). */
export function notifier(compteId: string, n: Omit<Notification, 'id' | 'compteId' | 'quand' | 'lu'>): void {
  const c = compteDe(compteId); if (!c || c.prefsNotif === 'rien' || (c.prefsNotif === 'essentiel' && !n.essentielle)) return;
  app.monde.notifications.unshift({ id: nouvelId('n'), compteId, quand: maintenant(), lu: false, ...n });
}
