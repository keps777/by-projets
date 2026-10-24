// Santé du système, simulée : latences, file hors ligne, paiements en attente, erreurs. Déterministe à la minute près.
import { hash01 } from './analyses.ts';

export type StatutService = 'ok' | 'lent';
export interface Service { id: string; nom: string; detail: string; latenceMs: number | null; statut: StatutService; /** 8 barres en % de la latence normale. */ historique: number[] }
const DEFS: [string, string, string, number | null][] = [
  ['api', 'API billets et quai', 'ventes, scans, signatures', 120], ['momo', 'Paiement MTN MoMo', 'collecte et remboursements', 1800], ['om', 'Paiement Orange Money', 'collecte', 2000],
  ['ussd', 'USSD *123#', 'MTN · Orange', 2100], ['msg', 'WhatsApp et SMS', 'billets, codes, rapports', 3400], ['cartes', 'Cartes en relief', 'tuiles et positions bus', 210],
  ['assistant', 'Assistant du patron', 'questions sur les chiffres', 4200], ['sync', 'Synchronisation hors ligne', 'guichets et convoyeurs', null]
];
export const LATENCE_OM_INCIDENT = 9100;
export function services(minute: number, omRelancee: boolean): Service[] {
  return DEFS.map(([id, nom, detail, base]) => {
    const jitter = (k: number) => 0.9 + 0.2 * hash01(`${id}|${minute - k * 5}`);
    const incident = id === 'om' && !omRelancee, brut = base === null ? 0 : (incident ? LATENCE_OM_INCIDENT : base) * jitter(0);
    const latence = base === null ? null : brut >= 1000 ? Math.round(brut / 100) * 100 : Math.round(brut / 10) * 10;
    const historique = Array.from({ length: 8 }, (_, i) => (incident && i === 7 ? 100 : Math.round(35 + 35 * hash01(`${id}|h${minute - (7 - i) * 5}`))));
    return { id, nom, detail, latenceMs: latence, statut: incident ? 'lent' : 'ok', historique };
  });
}
export interface Sante {
  statut: 'ok' | 'degrade'; services: Service[]; latenceP95: number; erreurs1h: number; requetes1h: number; ussdSec: number; horsLigne: number; paiementsAttente: number;
  incident: boolean; disponibilite30j: number; sauvegardes: number; billetsVerifies: number;
}
export function sante(p: { minute: number; omRelancee: boolean; paiementsAttente: number; horsLigneLocal: boolean }): Sante {
  const sv = services(p.minute, p.omRelancee), incident = sv.some((s) => s.statut === 'lent');
  return {
    statut: incident ? 'degrade' : 'ok', services: sv, latenceP95: 160 + Math.round(40 * hash01(`p95|${p.minute}`)), erreurs1h: (incident ? 12 : 3), requetes1h: 41_000 + Math.round(400 * hash01(`req|${Math.floor(p.minute / 60)}`)),
    ussdSec: Math.round((1.9 + 0.4 * hash01(`ussd|${p.minute}`)) * 10) / 10, horsLigne: (incident ? 6 : 0) + (p.horsLigneLocal ? 3 : 0), paiementsAttente: p.paiementsAttente, incident,
    disponibilite30j: 99.96, sauvegardes: 30, billetsVerifies: 14_820
  };
}
export type Niveau = 'ok' | 'wa' | 'er';
/** Niveau d'une jauge : `ok` jusqu'au seuil bas, `wa` jusqu'au seuil haut, `er` au-delà (valeurs croissantes = plus grave). */
export const niveau = (valeur: number, seuilBas: number, seuilHaut: number): Niveau => (valeur <= seuilBas ? 'ok' : valeur <= seuilHaut ? 'wa' : 'er');
