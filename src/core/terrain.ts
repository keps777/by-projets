// Logique pure des agents de terrain : arrêts d'une ligne, prix en route, attribution des montées/descentes, écart de contrôle, amende.
import { arrondiA } from './money.ts';
import { hhmm, minutes } from './retard.ts';

export interface Arret { nom: string; lieu: string; offsetMin: number; prevu: string; type: 'depart' | 'arret' | 'terminus' }
export interface LigneArrets { de: string; vers: string; gareDe: string; gareVers: string }

/** Arrêts intermédiaires connus par axe (part de la durée totale écoulée à l'arrêt). Axe inconnu : un arrêt « Mi-parcours ». */
const AXES: Record<string, [string, number][]> = {
  'Yaoundé>Douala': [['Mbankomo', 35 / 210], ['Boumnyebel', 80 / 210], ['Pouma', 110 / 210], ['Edéa', 140 / 210], ['Yassa', 185 / 210]],
  'Yaoundé>Bafoussam': [['Obala', 0.12], ['Bafia', 0.36], ['Ndikinimeki', 0.55], ['Makénéné', 0.78]],
  'Yaoundé>Bamenda': [['Bafia', 0.2], ['Makénéné', 0.45], ['Bafoussam', 0.7]],
  'Douala>Kribi': [['Edéa', 0.4]]
};
function intermediaires(de: string, vers: string): [string, number][] {
  const direct = AXES[`${de}>${vers}`]; if (direct) return direct;
  const inverse = AXES[`${vers}>${de}`]; if (inverse) return [...inverse].reverse().map(([n, f]) => [n, 1 - f] as [string, number]);
  return [['Mi-parcours', 0.5]];
}

/** Feuille de route d'un départ : origine, arrêts, terminus, avec l'heure prévue de chaque arrêt (retard compris). */
export function arretsDeLigne(l: LigneArrets, heure: string, dureeMin: number, retardMin = 0): Arret[] {
  const base = minutes(heure) + retardMin, h = (off: number) => hhmm(base + off);
  return [
    { nom: `${l.de} ${l.gareDe}`, lieu: `gare de ${l.gareDe}`, offsetMin: 0, prevu: h(0), type: 'depart' },
    ...intermediaires(l.de, l.vers).map(([nom, f]) => { const off = Math.round(f * dureeMin); return { nom, lieu: 'gare routière', offsetMin: off, prevu: h(off), type: 'arret' as const }; }),
    { nom: `${l.vers} ${l.gareVers}`, lieu: `gare de ${l.gareVers}`, offsetMin: dureeMin, prevu: h(dureeMin), type: 'terminus' }
  ];
}

/** Prix d'un billet vendu à un arrêt : part du trajet restant, arrondie à 500 F (minimum 500 F). Nul au terminus. */
export function prixDepuisArret(prixDepart: number, offsetMin: number, dureeMin: number): number {
  if (offsetMin >= dureeMin) return 0;
  const reste = 1 - Math.max(0, offsetMin) / dureeMin;
  return Math.min(prixDepart, Math.max(500, arrondiA(prixDepart * reste, 500)));
}

export const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Où un billet monte et descend (indices dans `arretsDeLigne`), de façon déterministe : la plupart vont de l'origine au terminus. */
export function trajetBillet(code: string, nbArrets: number): { monte: number; descend: number } {
  const inter = nbArrets - 2, dernier = nbArrets - 1;
  if (inter < 1) return { monte: 0, descend: dernier };
  const m = hash(`${code}m`) % 100, d = hash(`${code}d`) % 100;
  const monte = m < 10 ? 1 + (m % inter) : 0, descend = d < 25 ? 1 + (d % inter) : dernier;
  return { monte, descend: descend <= monte ? dernier : descend };
}

export type Verdict = { ecart: number; niveau: 'conforme' | 'fraude'; texte: string; pct: number };
/** Contrôle inopiné : voyageurs comptés contre billets valides. */
export function verdictControle(comptes: number, valides: number): Verdict {
  const ecart = comptes - valides, pct = comptes <= 0 ? 100 : Math.min(100, Math.round((valides / comptes) * 100));
  if (ecart > 0) return { ecart, niveau: 'fraude', texte: `${ecart} passager${ecart > 1 ? 's' : ''} de plus que de billets`, pct };
  return { ecart, niveau: 'conforme', texte: ecart === 0 ? 'Compte juste' : `${-ecart} place${ecart < -1 ? 's' : ''} sans voyageur`, pct };
}
/** Amende pour voyageur sans billet : un montant égal au prix du billet (le voyageur paie donc le double). */
export const amende = (prixBillet: number) => prixBillet;
/** Origine d'un billet vue par le contrôleur : app, papier (guichet) ou SMS (convoyeur, vendeur, USSD, WhatsApp). */
export const supportBillet = (canal: string): 'app' | 'papier' | 'sms' => (canal === 'app' ? 'app' : canal === 'guichet' ? 'papier' : 'sms');

/** « AM7F3K22 » → « AM-7F3K-22 » (forme lue par l'agent) ; l'inverse accepte tirets et espaces. */
export const codeAffiche = (code: string) => (code.length === 8 ? `${code.slice(0, 2)}-${code.slice(2, 6)}-${code.slice(6)}` : code);
export const codeBrut = (saisie: string) => saisie.toUpperCase().replace(/[^A-Z0-9.]/g, '');

/** Minutes de retard au moment réel du départ (négatif : en avance). */
export const retardReel = (heurePrevue: string, nowMin: number) => nowMin - minutes(heurePrevue);
/** Durée « m:ss » d'un arrêt. */
export function dureeArret(ms: number): string { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
export const ARRET_MAX_MIN = 8;
export const VITESSE_MAX = 90;
