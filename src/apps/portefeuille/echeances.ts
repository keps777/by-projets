// Calendrier des échéances : pour chaque droit du compte, l'échéance (24 h avant le départ : dernier moment pour nommer le voyageur, retrait automatique de l'annonce),
// les rappels J-30 / J-7 / J-2 que le détenteur active, le regroupement par mois et le compte à rebours. Fonctions pures.
import { fmt } from '../../core/argent.ts';
import { departDe, echeanceDe, joursAvant } from '../../core/regles.ts';
import type { Monde } from '../../domain/types.ts';
import { jourSemaine, heureDe } from '../voyager/format.ts';

export type Urgence = 'proche' | 'moyenne' | 'lointaine';
/** Proche : 90 jours ou moins ; moyenne : de 91 à 120 jours ; lointaine : au-delà (même seuil de 90 jours que le statut « À nommer » du portefeuille). */
export const SEUIL_PROCHE_JOURS = 90, SEUIL_MOYENNE_JOURS = 120;
export const urgenceDe = (jours: number): Urgence => (jours <= SEUIL_PROCHE_JOURS ? 'proche' : jours <= SEUIL_MOYENNE_JOURS ? 'moyenne' : 'lointaine');
export const LIBELLE_URGENCE: Record<Urgence, string> = { proche: 'Proche', moyenne: 'Moyenne', lointaine: 'Lointaine' };

export type CleRappel = 'j30' | 'j7' | 'j2';
export const RAPPELS: { cle: CleRappel; jours: number; libelle: string }[] = [{ cle: 'j30', jours: 30, libelle: 'J-30' }, { cle: 'j7', jours: 7, libelle: 'J-7' }, { cle: 'j2', jours: 2, libelle: 'J-2' }];
export type Rappels = Record<CleRappel, boolean>;
export const RAPPELS_DEFAUT: Rappels = { j30: true, j7: true, j2: false };

export interface Echeance {
  droitId: string; route: string; ville: string; numeroVol: string; compagnie: string; departMs: number; echeanceMs: number; statut: 'detenu' | 'en_vente' | 'nomme';
  /** « Détenu », « En revente · 620 $ », « Nommé ». */ statutLib: string; annonce?: number; jours: number; urgence: Urgence;
  /** « dim. 13 déc. · 18:05 » */ quand: string; /** « dim. 13 déc. 2026 · 18:05 » */ quandLong: string; /** Ce qui se passe à l'échéance. */ effet: string;
}
/** Les échéances à venir des droits détenus, en vente ou nommés, de la plus proche à la plus lointaine. */
export function echeances(m: Monde, compteId: string, now: number): Echeance[] {
  const res: Echeance[] = [];
  for (const d of m.droits) {
    if (d.detenteurId !== compteId || (d.statut !== 'detenu' && d.statut !== 'en_vente' && d.statut !== 'nomme')) continue;
    const v = m.vols.find((x) => x.id === d.volId); if (!v) continue;
    const dep = departDe(v.jour, v.heureDepart); if (dep <= now) continue;
    const ech = echeanceDe(dep), jours = joursAvant(ech, now), a = m.aeroports.find((x) => x.code === v.vers);
    const statutLib = d.statut === 'detenu' ? 'Détenu' : d.statut === 'nomme' ? 'Nommé' : `En revente · ${fmt(d.annonce?.prix ?? 0)}`;
    const effet = d.statut === 'detenu' ? 'Nommer le voyageur avant cette date.' : d.statut === 'en_vente' ? 'Retrait automatique de l’annonce à cette date.' : 'Voyageur nommé : plus aucune revente ni aucun transfert.';
    res.push({ droitId: d.id, route: `${v.de} → ${v.vers}`, ville: a?.ville ?? v.vers, numeroVol: v.numero, compagnie: m.compagnies.find((c) => c.id === v.compagnieId)?.nom ?? v.compagnieId, departMs: dep, echeanceMs: ech, statut: d.statut, statutLib, annonce: d.annonce?.prix, jours, urgence: urgenceDe(jours), quand: `${jourSemaine(ech)} · ${heureDe(ech)}`, quandLong: `${jourSemaine(ech, { avecAnnee: true })} · ${heureDe(ech)}`, effet });
  }
  return res.sort((a, b) => a.echeanceMs - b.echeanceMs);
}
/** La prochaine échéance à agir : un droit détenu ou en vente (un droit déjà nommé n'attend plus rien). */
export const prochaine = (l: Echeance[], now: number): Echeance | undefined => l.find((e) => e.statut !== 'nomme' && e.echeanceMs > now);

export interface RappelPlanifie { droitId: string; route: string; jours: number; libelle: string; dateMs: number }
const jourDe0 = (ms: number): number => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
/** Rappels activés, un par échéance non nommée et par délai, à une date strictement postérieure à aujourd'hui. Triés par date. */
export function rappelsPlanifies(l: Echeance[], r: Rappels, now: number): RappelPlanifie[] {
  const res: RappelPlanifie[] = [], auj = jourDe0(now);
  for (const e of l) {
    if (e.statut === 'nomme') continue;
    const j = new Date(e.echeanceMs);
    for (const { cle, jours, libelle } of RAPPELS) { if (!r[cle]) continue; const dateMs = new Date(j.getFullYear(), j.getMonth(), j.getDate() - jours).getTime(); if (dateMs > auj) res.push({ droitId: e.droitId, route: e.route, jours, libelle, dateMs }); }
  }
  return res.sort((a, b) => a.dateMs - b.dateMs || a.route.localeCompare(b.route));
}
/** « Prochain rappel : dim. 13 nov. · YUL → CDG (J-30) » ou l'avertissement s'il n'y en a aucun. */
export function phraseProchainRappel(p: RappelPlanifie[]): string {
  return p[0] ? `Prochain rappel : ${jourSemaine(p[0].dateMs)} · ${p[0].route} (${p[0].libelle})` : 'Aucun rappel programmé : vous ne serez pas prévenu avant les échéances.';
}

export type Entree = { genre: 'aujourdhui'; dateMs: number; jour: string } | { genre: 'rappel'; dateMs: number; jour: string; texte: string; droitId: string } | { genre: 'echeance'; dateMs: number; jour: string; e: Echeance };
export interface Mois { cle: string; label: string; annee: string; resume: string; entrees: Entree[] }
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** Mois par mois, d'aujourd'hui à la dernière échéance : marqueur du jour, échéances et rappels ; « Aucune échéance » pour un mois vide. */
export function chronologie(l: Echeance[], r: Rappels, now: number): Mois[] {
  const plan = rappelsPlanifies(l, r, now), auj = jourDe0(now);
  const entrees: Entree[] = [{ genre: 'aujourdhui', dateMs: auj, jour: String(new Date(auj).getDate()) },
    ...l.map((e): Entree => ({ genre: 'echeance', dateMs: jourDe0(e.echeanceMs), jour: String(new Date(e.echeanceMs).getDate()), e })),
    ...plan.map((p): Entree => ({ genre: 'rappel', dateMs: p.dateMs, jour: String(new Date(p.dateMs).getDate()), texte: `Rappel ${p.libelle} · ${p.route}`, droitId: p.droitId }))];
  const ordre = { aujourdhui: 0, rappel: 1, echeance: 2 };
  entrees.sort((a, b) => a.dateMs - b.dateMs || ordre[a.genre] - ordre[b.genre]);
  const fin = new Date(Math.max(auj, ...entrees.map((x) => x.dateMs))), debut = new Date(auj);
  const mois: Mois[] = [];
  for (let y = debut.getFullYear(), mo = debut.getMonth(); y < fin.getFullYear() || (y === fin.getFullYear() && mo <= fin.getMonth()); mo === 11 ? (y++, (mo = 0)) : mo++) {
    const liste = entrees.filter((x) => { const d = new Date(x.dateMs); return d.getFullYear() === y && d.getMonth() === mo; });
    const ne = liste.filter((x) => x.genre === 'echeance').length, nr = liste.filter((x) => x.genre === 'rappel').length, p: string[] = [];
    if (ne) p.push(`${ne} échéance${ne > 1 ? 's' : ''}`); if (nr) p.push(`${nr} rappel${nr > 1 ? 's' : ''}`);
    mois.push({ cle: `${y}-${String(mo + 1).padStart(2, '0')}`, label: MOIS[mo], annee: String(y), resume: p.length ? p.join(' · ') : 'Aucune échéance', entrees: liste });
  }
  return mois;
}
/** « Oct. 2026 → mai 2027 · 4 droits de voyage ». */
export function resumeEchelle(mois: Mois[], nbDroits: number): string {
  const f = (m: Mois, maj: boolean) => `${maj ? m.label.charAt(0).toUpperCase() + m.label.slice(1) : m.label} ${m.annee}`;
  return `${mois.length > 1 ? `${f(mois[0], true)} → ${f(mois[mois.length - 1], false)}` : f(mois[0], true)} · ${nbDroits} droit${nbDroits > 1 ? 's' : ''} de voyage`;
}
/** Chiffres du compte à rebours (jours sur deux chiffres, heures, minutes, secondes), et sa phrase pour les lecteurs d'écran. */
export function decompte(ms: number): { j: string; h: string; m: string; s: string; phrase: string } {
  const t = Math.max(0, Math.floor(ms / 1000)), j = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), s = t % 60, p = (n: number) => String(n).padStart(2, '0');
  return { j: p(j), h: p(h), m: p(m), s: p(s), phrase: `Temps restant avant l’échéance : ${j} jour${j > 1 ? 's' : ''}, ${h} heure${h > 1 ? 's' : ''}, ${m} minute${m > 1 ? 's' : ''}` };
}
