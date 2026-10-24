// Règles du superviseur de gare : qui valide un écart, fiabilité d'un agent, PIN non triviaux, numéros camerounais, tri des alertes.
// Fonctions pures : aucune lecture du monde, tout est passé en argument.

/** Un superviseur valide seul un écart de caisse jusqu'à ce seuil (en valeur absolue) ; au-delà, c'est le patron. */
export const SEUIL_ECART_SUPERVISEUR = 2000;
export type Validateur = 'juste' | 'superviseur' | 'patron';
export function quiValide(ecart: number): Validateur {
  const a = Math.abs(ecart);
  return a === 0 ? 'juste' : a <= SEUIL_ECART_SUPERVISEUR ? 'superviseur' : 'patron';
}

export interface Fiabilite { niveau: 'fiable' | 'surveiller' | 'risque'; texte: string; ton: 'ok' | 'wa' | 'er' }
/** Fiabilité d'un caissier d'après le nombre d'écarts constatés sur 90 jours. */
export function fiabilite(nbEcarts: number): Fiabilite {
  if (nbEcarts <= 2) return { niveau: 'fiable', texte: 'fiable', ton: 'ok' };
  if (nbEcarts <= 4) return { niveau: 'surveiller', texte: 'à surveiller', ton: 'wa' };
  return { niveau: 'risque', texte: 'à risque', ton: 'er' };
}

// ------------------------------------------------------------------ PIN
const INTERDITS = new Set(['1004', '2580', '0852', '1590', '1478', '3698', '1379', '2468', '1357', '9876', '0123', '6969', '1313', '4200', '1010', '2020']);
/** Un PIN est trivial s'il n'a pas 4 chiffres, répète un chiffre, suit une suite (1234, 8642…), un motif (1212, 1122), ressemble à une année ou figure dans la liste noire. */
export function pinTrivial(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;
  const d = [...pin].map(Number), pas = d[1] - d[0];
  if ([0, 1, -1, 2, -2].includes(pas) && d.every((x, i) => i === 0 || x - d[i - 1] === pas)) return true;
  if (pin[0] === pin[2] && pin[1] === pin[3]) return true;
  if (pin[0] === pin[1] && pin[2] === pin[3]) return true;
  if (pin === [...pin].reverse().join('')) return true;
  if (/^(19|20)\d\d$/.test(pin)) return true;
  return INTERDITS.has(pin);
}
export const pinValide = (pin: string) => /^\d{4}$/.test(pin) && !pinTrivial(pin);
/** Tire un PIN non trivial et différent de ceux à exclure (l'ancien). `alea` rend un nombre dans [0, 1[ (injectable pour les tests). */
export function genererPin(alea: () => number = Math.random, exclure: (string | undefined)[] = []): string {
  for (let i = 0; i < 500; i++) {
    const pin = Array.from({ length: 4 }, () => Math.floor(alea() * 10) % 10).join('');
    if (pinValide(pin) && !exclure.includes(pin)) return pin;
  }
  return exclure.includes('7391') ? '5927' : '7391';
}
/** Alea cryptographique si disponible (navigateur), sinon Math.random. */
export function aleaSur(): () => number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.getRandomValues ? () => c.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random;
}

// ------------------------------------------------------------------ téléphone
/** Chiffres d'un numéro camerounais, sans l'indicatif 237 ni les séparateurs. */
export function chiffresTel(t: string): string {
  const c = t.replace(/\D/g, '');
  return c.length === 12 && c.startsWith('237') ? c.slice(3) : c;
}
/** Mobile camerounais : 9 chiffres commençant par 6. */
export const telValide = (t: string) => /^6\d{8}$/.test(chiffresTel(t));
/** « 670000101 » → « 670 00 01 01 ». */
export function formaterTel(t: string): string {
  const c = chiffresTel(t);
  return c.length === 9 ? `${c.slice(0, 3)} ${c.slice(3, 5)} ${c.slice(5, 7)} ${c.slice(7)}` : t;
}

// ------------------------------------------------------------------ alertes
export type GenreAlerte = 'annulation' | 'litige' | 'acces' | 'caisse' | 'depart' | 'retard' | 'scan';
export interface Alerte { id: string; genre: GenreAlerte; ton: 'wa' | 'er' | 'inf'; etiquette: string; titre: string; sous: string; href: string; gravite: number }
export const GRAVITE: Record<GenreAlerte, number> = { annulation: 6, acces: 5, depart: 4, caisse: 3, litige: 3, scan: 2, retard: 1 };
/** Plus grave d'abord, puis le plus récent (`ts` décroissant, passé à part). */
export function trierAlertes<T extends Alerte>(alertes: (T & { ts?: number })[]): T[] {
  return [...alertes].sort((a, b) => b.gravite - a.gravite || (b.ts ?? 0) - (a.ts ?? 0) || a.id.localeCompare(b.id));
}

/** Types d'événement du journal qui signalent un scan refusé au quai (l'agent du quai en consigne un à chaque refus). */
export const TYPES_REFUS_SCAN = ['scan_refuse', 'scan_refus', 'refus_scan'] as const;

/** Motifs proposés pour une annulation décidée par le superviseur. */
export const MOTIFS_ANNULATION = ['Copie ou capture d’écran', 'Erreur de vente', 'Passager absent', 'Bus indisponible', 'Autre'] as const;
export const MOTIFS_DEPART = ['Panne du bus', 'Chauffeur indisponible', 'Route coupée', 'Trop peu de passagers', 'Autre'] as const;
