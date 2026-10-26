// Centre de notifications et préférences : filtres, groupes par jour, heures relatives, lecture, niveaux (tout / l'essentiel / rien) et canaux.
import { app, jourDe, tranche } from '../../data/store.svelte.ts';
import { compteDe, setPrefsNotif } from '../../domain/compte.ts';
import type { Notification, Prefs } from '../../domain/types.ts';

export type FiltreNotif = 'toutes' | 'echeances' | 'drops' | 'soute' | 'ventes';
export const FILTRES_NOTIF: { id: FiltreNotif; label: string; types: Notification['type'][] | null }[] = [
  { id: 'toutes', label: 'Toutes', types: null }, { id: 'echeances', label: 'Échéances', types: ['echeance'] }, { id: 'drops', label: 'Drops', types: ['drop', 'prix'] },
  { id: 'soute', label: 'Soute', types: ['bagage'] }, { id: 'ventes', label: 'Ventes', types: ['vente', 'achat', 'transfert', 'proposition'] }
];
export type Ton = 'accent' | 'up' | 'ok' | 'neutre';
export const TYPES_NOTIF: Record<Notification['type'], { libelle: string; ton: Ton; icone: string }> = {
  echeance: { libelle: 'Échéance', ton: 'accent', icone: 'horloge' }, drop: { libelle: 'Drop', ton: 'up', icone: 'eclair' }, prix: { libelle: 'Prix', ton: 'up', icone: 'etiquette' },
  bagage: { libelle: 'Soute', ton: 'neutre', icone: 'sac' }, vente: { libelle: 'Vente', ton: 'ok', icone: 'portefeuille' }, achat: { libelle: 'Achat', ton: 'ok', icone: 'portefeuille' },
  transfert: { libelle: 'Transfert', ton: 'neutre', icone: 'echange' }, proposition: { libelle: 'Proposition', ton: 'up', icone: 'etiquette' }, systeme: { libelle: 'Information', ton: 'neutre', icone: 'info' }
};
export const notificationsDe = (compteId: string): Notification[] => app.monde.notifications.filter((n) => n.compteId === compteId).sort((a, b) => b.quand - a.quand);
export function filtrerNotifs(liste: Notification[], f: FiltreNotif): Notification[] { const t = FILTRES_NOTIF.find((x) => x.id === f)?.types; return t ? liste.filter((n) => t.includes(n.type)) : liste; }
export const nonLues = (liste: Notification[]): number => liste.filter((n) => !n.lu).length;
export const texteCompteur = (n: number): string => (n === 0 ? 'Tout est lu' : n === 1 ? '1 non lue' : `${n} non lues`);
export interface GroupeJour { id: 'auj' | 'hier' | 'tot'; titre: string; items: Notification[] }
const TITRES = { auj: 'Aujourd’hui', hier: 'Hier', tot: 'Plus tôt' } as const;
const J = 86_400_000, JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const groupeDe = (quand: number, now: number): GroupeJour['id'] => { const j = jourDe(quand); return j === jourDe(now) ? 'auj' : j === jourDe(now - J) ? 'hier' : 'tot'; };
/** Notifications regroupées par jour (Aujourd'hui, Hier, Plus tôt), groupes vides omis, ordre conservé. */
export function grouperParJour(liste: Notification[], now: number): GroupeJour[] {
  return (['auj', 'hier', 'tot'] as const).map((id) => ({ id, titre: TITRES[id], items: liste.filter((n) => groupeDe(n.quand, now) === id) })).filter((g) => g.items.length > 0);
}
const p2 = (n: number) => String(n).padStart(2, '0');
/** « maintenant », « il y a 2 h », « hier · 18:20 », « ven. 9 oct. ». */
export function heureRelative(quand: number, now: number): string {
  const g = groupeDe(quand, now), d = new Date(quand);
  if (g === 'hier') return `hier · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  if (g === 'tot') return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
  const min = Math.floor(Math.max(0, now - quand) / 60_000);
  return min < 1 ? 'maintenant' : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`;
}
export function marquerLu(id: string): void { const n = app.monde.notifications.find((x) => x.id === id); if (n) n.lu = true; }
export function toutMarquerLu(compteId: string): number { let k = 0; for (const n of app.monde.notifications) if (n.compteId === compteId && !n.lu) { n.lu = true; k++; } return k; }

// --- Préférences --------------------------------------------------------------------------------------------------------------------------------------------------
export const NIVEAUX_NOTIF: { id: Prefs; nom: string; texte: string }[] = [
  { id: 'tout', nom: 'Tout', texte: 'Échéances, ventes, drops, prix et soute.' }, { id: 'essentiel', nom: 'L’essentiel', texte: 'Échéances et ventes. Pas de drops, de prix ni de soute.' }, { id: 'rien', nom: 'Rien', texte: 'Aucune notification facultative.' }
];
export const libelleNiveau = (p: Prefs): string => ({ tout: 'Tout', essentiel: 'L’essentiel', rien: 'Rien' })[p];
export const CATEGORIES: { id: string; libelle: string; icone: string; niveaux: Prefs[] }[] = [
  { id: 'echeances', libelle: 'Échéances', icone: 'horloge', niveaux: ['tout', 'essentiel'] }, { id: 'drops', libelle: 'Drops et prix', icone: 'eclair', niveaux: ['tout'] },
  { id: 'soute', libelle: 'Soute du vol', icone: 'sac', niveaux: ['tout'] }, { id: 'ventes', libelle: 'Ventes et versements', icone: 'portefeuille', niveaux: ['tout', 'essentiel'] }
];
export const incluse = (categorieId: string, niveau: Prefs): boolean => !!CATEGORIES.find((c) => c.id === categorieId)?.niveaux.includes(niveau);
/** Les alertes de prix et de drops sont suspendues dès que le niveau n'est plus « Tout » (hypothèse). */
export const alertesSuspendues = (niveau: Prefs): boolean => niveau !== 'tout';
interface Canaux { appareil: boolean; courriel: boolean }
export const canaux = (): Canaux => tranche<Canaux>('notifs', () => ({ appareil: true, courriel: true }));
export function choisirNiveau(compteId: string, p: Prefs): boolean { if (!compteDe(compteId) || !NIVEAUX_NOTIF.some((n) => n.id === p)) return false; setPrefsNotif(compteId, p); return true; }
export function reglerCanal(canal: keyof Canaux, actif: boolean): void { canaux()[canal] = actif; }
