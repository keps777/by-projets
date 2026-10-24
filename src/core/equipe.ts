// Équipe vue par le patron : activité d'une personne d'après le journal du monde (`evenements`), ses ventes et ses écarts de caisse.
import type { Caisse, Evenement, Personne, Role } from '../domain/types.ts';
import { ajouterJours, jourDe, type Jour } from './dates.ts';
import { estVendu, jourDeTs, type Donnees } from './indicateurs.ts';

/** Rôles que le patron voit dans « mes gens » (hors patron et voyageurs). */
export const ROLES_VISIBLES: Role[] = ['superviseur', 'guichet', 'quai', 'chauffeur', 'convoyeur', 'controleur', 'comptable', 'relais', 'livreur', 'vendeur'];
export const ETIQUETTE_ROLE: Record<Role, string> = {
  voyageur: 'voyageur', guichet: 'guichet', quai: 'quai', chauffeur: 'chauffeur', convoyeur: 'convoyeur', controleur: 'contrôleur', superviseur: 'superviseur', patron: 'patron',
  comptable: 'comptable', relais: 'point relais', livreur: 'livreur moto', conducteur: 'conducteur covoit.', vendeur: 'vendeur ambulant'
};
export const initiales = (p: Pick<Personne, 'prenom' | 'nom'>) => `${p.prenom[0] ?? ''}${p.nom[0] ?? ''}`.toUpperCase();
/** Les gens d'une compagnie que le patron gère, triés par gare puis par rôle. */
export function gens(personnes: Personne[], compagnieId: string, ordreGares: string[]): Personne[] {
  const rang = (p: Personne) => { const i = ordreGares.indexOf(p.gareId ?? ''); return i < 0 ? 99 : i; }, ordre = (p: Personne) => ROLES_VISIBLES.indexOf(p.role);
  return personnes.filter((p) => p.compagnieId === compagnieId && ROLES_VISIBLES.includes(p.role)).sort((a, b) => rang(a) - rang(b) || ordre(a) - ordre(b) || a.prenom.localeCompare(b.prenom, 'fr'));
}
export const evenementsDe = (evenements: Evenement[], personneId: string) => evenements.filter((e) => e.acteurId === personneId).sort((a, b) => b.ts - a.ts);
export interface ActivitePersonne {
  derniere?: Evenement; evenements: Evenement[]; billets30: number; recette30: number; parJour: number[]; ecarts90: Caisse[]; sommeEcarts: number; clotures: number; scans30: number; inactifDepuisJours: number | null;
}
/** Billets vendus par la personne (30 jours), barres par jour, écarts de caisse sur 90 jours, dernière activité. */
export function activite(d: Pick<Donnees, 'billets' | 'caisses'> & { evenements: Evenement[] }, personneId: string, o: { jour: Jour; now: number }): ActivitePersonne {
  const evs = evenementsDe(d.evenements, personneId), debut30 = ajouterJours(o.jour, -29), debut90 = ajouterJours(o.jour, -89);
  const vendus = d.billets.filter((b) => estVendu(b) && b.acheteurId === personneId && b.canal !== 'app' && jourDeTs(b.creeLe) >= debut30);
  const jours = Array.from({ length: 30 }, (_, i) => ajouterJours(debut30, i)), compte = jours.map((j) => vendus.filter((b) => jourDeTs(b.creeLe) === j).length), max = Math.max(...compte, 0);
  const ecarts = d.caisses.filter((c) => c.agentId === personneId && c.ecart && c.ecart !== 0 && jourDeTs(c.ouvertA) >= debut90).sort((a, b) => b.ouvertA - a.ouvertA);
  const derniere = evs[0];
  return {
    derniere, evenements: evs.slice(0, 8), billets30: vendus.length, recette30: vendus.reduce((s, b) => s + b.prix, 0), parJour: compte.map((x) => (max ? Math.round((x / max) * 100) : 0)),
    ecarts90: ecarts, sommeEcarts: ecarts.reduce((s, c) => s + (c.ecart ?? 0), 0), clotures: d.caisses.filter((c) => c.agentId === personneId && c.statut !== 'ouverte').length,
    scans30: d.billets.filter((b) => b.scannePar === personneId && (b.scanneLe ?? 0) >= new Date(`${debut30}T00:00:00`).getTime()).length,
    inactifDepuisJours: derniere ? Math.max(0, Math.round((o.now - derniere.ts) / 86_400_000)) : null
  };
}
/** « Aujourd'hui · 18:40 », « Hier », « il y a 3 j » — l'âge d'une activité. */
export function ageActivite(ts: number | undefined, now: number): string {
  if (ts === undefined) return 'aucune activité enregistrée';
  const j = jourDeTs(ts), auj = jourDe(new Date(now)), hh = new Date(ts).toTimeString().slice(0, 5);
  if (j === auj) return now - ts < 60_000 ? 'à l’instant' : `aujourd’hui · ${hh}`;
  if (j === ajouterJours(auj, -1)) return `hier · ${hh}`;
  return `il y a ${Math.max(2, Math.round((now - ts) / 86_400_000))} j`;
}

const trivial = (pin: string) => /^(\d)\1{3}$/.test(pin) || '0123456789012'.includes(pin) || '9876543210987'.includes(pin);
/** Nouveau PIN à 4 chiffres, déterministe pour une graine donnée : ni répétitif (1111), ni suite (1234), ni identique à l'ancien. */
export function nouveauPin(personneId: string, ancien: string | undefined, graine: number): string {
  let n = [...personneId].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 10000, 7) + Math.abs(Math.floor(graine)) * 7919;
  for (let i = 0; i < 50; i++) { const pin = String(Math.abs(n) % 10000).padStart(4, '0'); if (!trivial(pin) && pin !== ancien) return pin; n = n * 31 + 17; }
  return '7391';
}
/** Rôles qui travaillent dans une gare (donc qu'on peut déplacer d'une gare à l'autre). */
export const ROLES_DE_GARE: Role[] = ['guichet', 'quai', 'chauffeur', 'convoyeur', 'controleur', 'superviseur'];
