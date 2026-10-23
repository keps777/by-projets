// Services complémentaires (diaspora, commerce, protection, énergie) : plafonds par niveau, décision, tarif par âge, créneaux.
// Fonctions pures ; les règles de base restent dans diaspora.ts, commerce.ts, protection.ts, energie.ts.
import { NIVEAUX, PLAFONDS, SEUILS_NIVEAU, decider, type Decision, type Niveau } from './credit.ts';
import { ajouterJours, enDate, jourSemaineLong, prochainePaie, type Jour } from './dates.ts';
import { AGE_MAX_ENTREE } from './protection.ts';

export const NOM_NIVEAU: Record<Niveau, string> = { START: 'Start', PLUS: 'Plus', PRO: 'Pro', ELITE: 'Élite' };

/** Premier niveau (dans l'ordre) qui vérifie la condition ; null si aucun. */
export const niveauMinimal = (ok: (n: Niveau) => boolean): Niveau | null => NIVEAUX.find(ok) ?? null;

/** Plafond d'un paiement depuis l'étranger : même plafond que le crédit personnel du niveau. */
export const plafondDiaspora = (n: Niveau) => PLAFONDS[n].credit;
/** Avance de stock maximale par niveau (0 : pas encore disponible). */
export const PLAFOND_STOCK: Record<Niveau, number> = { START: 0, PLUS: 500_000, PRO: 850_000, ELITE: 2_000_000 };
/** Capital maximal de la protection famille par niveau. */
export const PLAFOND_CAPITAL: Record<Niveau, number> = { START: 1_000_000, PLUS: 2_000_000, PRO: 5_000_000, ELITE: 5_000_000 };

export const niveauPourKit = (prix: number) => niveauMinimal((n) => PLAFONDS[n].credit >= prix);
export const niveauPourCapital = (capital: number) => niveauMinimal((n) => PLAFOND_CAPITAL[n] >= capital);
export const niveauPourStock = () => niveauMinimal((n) => PLAFOND_STOCK[n] > 0);
export const seuilScore = (n: Niveau | null) => (n ? SEUILS_NIVEAU[n] : Infinity);

export interface EntreeService {
  score: number; seuilScore: number; salaire: number;
  mensualiteNouvelle: number; mensualitesExistantes: number;
  employeurPartenaire: boolean; ancienneteAns: number;
}
/** Décision d'un crédit de service : on passe par `decider()` et on écarte le contrôle « véhicule », qui ne concerne que l'auto. */
export function deciderService(e: EntreeService, ignorer: string[] = []): Decision {
  const d = decider({ ...e, contratStable: true, vehiculeControle: true, prix: 0, financement: 0 });
  const controles = d.controles.filter((c) => c.id !== 'vehicule' && !ignorer.includes(c.id));
  const ko = controles.find((c) => !c.ok);
  return { approuve: !ko, controles, motif: ko ? ko.titre : null };
}

/** Prime mensuelle d'un assuré selon l'âge (le souscripteur est inclus dans la base, prime 0). */
export function primeParAge(age: number): number {
  return age <= 17 ? 400 : age <= 49 ? 900 : age <= 64 ? 1800 : 2400;
}
export type VerdictAge = { ok: true } | { ok: false; erreur: string };
export function verifierAge(age: number | null): VerdictAge {
  if (age === null || !Number.isInteger(age) || age < 0 || age > 120) return { ok: false, erreur: 'Entrez un âge entre 0 et 120 ans.' };
  if (age > AGE_MAX_ENTREE) return { ok: false, erreur: `Âge maximum à l'entrée : ${AGE_MAX_ENTREE} ans.` };
  return { ok: true };
}

export interface Creneau { jour: Jour; label: string; sous: string }
/** Trois créneaux d'installation : lundi, mercredi, vendredi, au plus tôt 3 jours après `aujourdhui`. */
export function creneauxInstallation(aujourdhui: Jour): Creneau[] {
  const res: Creneau[] = [];
  for (let i = 3; i < 30 && res.length < 3; i++) {
    const j = ajouterJours(aujourdhui, i);
    if (![1, 3, 5].includes(enDate(j).getDay())) continue;
    const apresMidi = res.length === 1;
    const l = jourSemaineLong(j);
    res.push({ jour: j, label: l.charAt(0).toUpperCase() + l.slice(1), sous: apresMidi ? 'Après-midi · 13 h à 17 h' : 'Matin · 8 h à 12 h' });
  }
  return res;
}
/** Première mensualité du kit : à la paie qui suit la fin de l'installation (5 jours). */
export const premierPrelevementKit = (installation: Jour, jourPaie: number): Jour => prochainePaie(ajouterJours(installation, 5), jourPaie);

/** Lundi = 0 … dimanche = 6. */
export const indexSemaine = (ts: number) => (new Date(ts).getDay() + 6) % 7;
/** Lundi (AAAA-MM-JJ) de la semaine de `ts`. */
export function lundiDe(ts: number): Jour {
  const d = new Date(ts); d.setDate(d.getDate() - indexSemaine(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Variation en % entre deux semaines (null si pas de base de comparaison). */
export const variationPct = (courant: number, precedent: number) => (precedent > 0 ? Math.round(((courant - precedent) / precedent) * 100) : null);

/** Étapes d'un paiement depuis l'étranger : instants de chacune des 4 étapes. */
export const instantsEtapes = (debut: number, delaiSigne: number) => [debut, debut, debut + 60_000, debut + delaiSigne];

/** Libellé de durée restante : « 12 min », « 1 h 05 ». */
export function dureeCourte(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
