// Récurrences des tâches (spec §7.1) : ce jour seulement, tous les jours, chaque semaine, chaque mois.
import { ajouterJours, ecartJours, jourSemaine, joursDuMois, lundiDe, moisDe, JOURS_COURTS, JOURS_LONGS } from './dates.ts';
import type { Jour } from './types.ts';

export type Frequence = 'une_fois' | 'quotidien' | 'hebdo' | 'mensuel';

export type FinRegle =
  | { type: 'aucune' }
  | { type: 'date'; date: Jour }
  | { type: 'fois'; fois: number };

export type Mensuel =
  | { mode: 'jour_du_mois'; jour: number }
  /** rang 1 à 4 = « 1er … 4ᵉ », 5 = dernier ; jour 0 = lundi … 6 = dimanche. */
  | { mode: 'rang'; rang: number; jour: number };

export interface Regle {
  frequence: Frequence;
  /** Premier jour (et jour unique pour « ce jour seulement »). */
  debut: Jour;
  /** Hebdomadaire : jours choisis, 0 = lundi … 6 = dimanche. */
  jours?: number[];
  mensuel?: Mensuel;
  fin: FinRegle;
}

const LIMITE = 5000;

function jourDuRang(annee: number, mois: number, rang: number, jourSem: number): Jour | null {
  const premier = `${annee}-${String(mois).padStart(2, '0')}-01`;
  const decal = (jourSem - jourSemaine(premier) + 7) % 7;
  const max = joursDuMois(`${annee}-${String(mois).padStart(2, '0')}`);
  let n = 1 + decal;
  if (rang >= 5) { while (n + 7 <= max) n += 7; } else n += (rang - 1) * 7;
  if (n > max) return null;
  return `${annee}-${String(mois).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
}

function* candidats(r: Regle): Generator<Jour> {
  if (r.frequence === 'une_fois') { yield r.debut; return; }
  if (r.frequence === 'quotidien') {
    for (let i = 0; i < LIMITE; i++) yield ajouterJours(r.debut, i);
    return;
  }
  if (r.frequence === 'hebdo') {
    const jours = [...new Set(r.jours?.length ? r.jours : [jourSemaine(r.debut)])].sort((a, b) => a - b);
    let lundi = lundiDe(r.debut);
    for (let s = 0; s < LIMITE; s++) {
      for (const j of jours) {
        const d = ajouterJours(lundi, j);
        if (d >= r.debut) yield d;
      }
      lundi = ajouterJours(lundi, 7);
    }
    return;
  }
  // mensuel
  const reg = r.mensuel ?? { mode: 'jour_du_mois' as const, jour: +r.debut.slice(8) };
  let [a, m] = r.debut.split('-').map(Number);
  for (let i = 0; i < 600; i++) {
    let d: Jour | null;
    if (reg.mode === 'jour_du_mois') {
      const dernier = joursDuMois(`${a}-${String(m).padStart(2, '0')}`);
      d = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(reg.jour, dernier)).padStart(2, '0')}`;
    } else d = jourDuRang(a, m, reg.rang, reg.jour);
    if (d && d >= r.debut) yield d;
    m++; if (m > 12) { m = 1; a++; }
  }
}

/** Tous les jours d'occurrence entre `de` et `a` (inclus), en respectant la fin de la règle. */
export function occurrencesEntre(r: Regle, de: Jour, a: Jour): Jour[] {
  const res: Jour[] = [];
  let n = 0;
  for (const d of candidats(r)) {
    if (r.fin.type === 'date' && d > r.fin.date) break;
    if (r.fin.type === 'fois' && n >= r.fin.fois) break;
    n++;
    if (d > a) break;
    if (d >= de) res.push(d);
  }
  return res;
}

export function dateExiste(r: Regle, jour: Jour): boolean { return occurrencesEntre(r, jour, jour).length === 1; }

const RANGS = ['1er', '2ᵉ', '3ᵉ', '4ᵉ', 'dernier'];

/** Rang du jour dans le mois : le 8 octobre 2026 est le 2ᵉ jeudi. */
export function rangDuJour(j: Jour): number { return Math.ceil(+j.slice(8) / 7); }

/** Description lisible : « chaque jeudi », « 3 fois par semaine (lun., mer., ven.) »… */
export function decrire(r: Regle): string {
  const fin = r.fin.type === 'date' ? ` · jusqu’au ${r.fin.date.slice(8)}/${r.fin.date.slice(5, 7)}` : r.fin.type === 'fois' ? ` · ${r.fin.fois} fois` : '';
  switch (r.frequence) {
    case 'une_fois': return 'ce jour seulement';
    case 'quotidien': return `tous les jours${fin}`;
    case 'hebdo': {
      const j = [...new Set(r.jours?.length ? r.jours : [jourSemaine(r.debut)])].sort((x, y) => x - y);
      if (j.length === 7) return `tous les jours${fin}`;
      return (j.length === 1 ? `chaque ${JOURS_LONGS[j[0]]}` : `${j.length} fois par semaine (${j.map((x) => JOURS_COURTS[x]).join(', ')})`) + fin;
    }
    case 'mensuel': {
      const m = r.mensuel ?? { mode: 'jour_du_mois' as const, jour: +r.debut.slice(8) };
      return (m.mode === 'jour_du_mois' ? `le ${m.jour} de chaque mois` : `le ${RANGS[m.rang - 1]} ${JOURS_LONGS[m.jour]} du mois`) + fin;
    }
  }
}

export { ecartJours, moisDe };
