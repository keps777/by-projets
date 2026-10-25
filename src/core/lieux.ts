// Autocomplétion des lieux de prise en charge et distance jusqu'à la gare. Pur.
import { GARES_POSITION, LIEUX, type Lieu } from './lieuxDonnees.ts';
export { LIEUX, GARES_POSITION, type Lieu, type TypeLieu } from './lieuxDonnees.ts';

/** Minuscules sans accents, apostrophes et tirets ramenés à l'espace : « Hôpital d’Essos » ≈ « hopital d essos ». */
export const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`\-–]/g, ' ').replace(/\s+/g, ' ').trim();

const INDEX = LIEUX.map((l) => ({ l, n: normaliser(l.nom) }));
/** Rang d'une proposition : 0 = le nom commence par la saisie, 1 = un mot commence par la saisie, 2 = la saisie est dans le nom, null = aucune correspondance. */
function rang(nom: string, q: string): 0 | 1 | 2 | null {
  if (nom.startsWith(q)) return 0;
  if (nom.split(' ').some((m) => m.startsWith(q)) || nom.includes(` ${q}`)) return 1;
  return nom.includes(q) ? 2 : null;
}
export interface OptionsSuggestion { /** Ne garder que les lieux de cette ville (ex. la ville de la gare de départ). */ ville?: string; limite?: number }
/** Propositions pour une saisie : par préfixe d'abord, puis par début de mot, puis par sous-chaîne ; à rang égal, la ville demandée d'abord, puis l'ordre alphabétique. */
export function suggerer(saisie: string, { ville, limite = 6 }: OptionsSuggestion = {}): Lieu[] {
  const q = normaliser(saisie); if (!q) return [];
  const trouves: { l: Lieu; r: number; n: string }[] = [];
  for (const { l, n } of INDEX) { if (ville && l.ville !== ville) continue; const r = rang(n, q); if (r !== null) trouves.push({ l, r, n }); }
  return trouves.sort((a, b) => a.r - b.r || a.n.localeCompare(b.n, 'fr')).slice(0, limite).map((x) => x.l);
}
/** Lieux à proposer sans saisie : les quartiers les plus connus de la ville. */
export const lieuxFrequents = (ville: string, n = 6): Lieu[] => LIEUX.filter((l) => l.ville === ville && l.type === 'quartier').slice(0, n);
/** Le lieu qui porte exactement ce nom (insensible aux accents et à la casse). */
export const trouverLieu = (nom: string, ville?: string): Lieu | undefined => { const q = normaliser(nom); return INDEX.find((x) => x.n === q && (!ville || x.l.ville === ville))?.l; };

export const COEF_DETOUR = 1.1;
export const KM_PAR_DEFAUT = 6;
export interface PointLocal { x: number; y: number }
/** Position d'une gare (km, repère local de sa ville) ; absente si la gare n'est pas répertoriée. */
export const positionGare = (gareId: string) => GARES_POSITION[gareId];
/** Distance par la route (km, arrondie, au moins 1) entre un lieu et une gare de la même ville ; 6 km si on ne sait pas. */
export function kmVersGare(lieu: Lieu | string | undefined, gareId: string): number {
  const g = GARES_POSITION[gareId], l = typeof lieu === 'string' ? trouverLieu(lieu, g?.ville) : lieu;
  if (!g || !l || l.libre || l.ville !== g.ville) return KM_PAR_DEFAUT;
  return Math.max(1, Math.round(Math.hypot(l.x - g.x, l.y - g.y) * COEF_DETOUR));
}
/** Un lieu saisi à la main (absent de la liste) : placé au centre de la ville, distance par défaut. */
export const lieuLibre = (nom: string, ville: string): Lieu => ({ nom: nom.trim(), ville, type: 'repère', x: 0, y: 0, libre: true });

/** Découpe un nom de lieu autour de la saisie pour la mettre en gras : [avant, trouvé, après] (insensible aux accents et à la casse). Sans correspondance : [nom, '', '']. */
export function surligner(nom: string, saisie: string): [string, string, string] {
  const q = normaliser(saisie), car = [...nom].map((c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`\-–]/g, ' '));
  const plat = car.join(''), debut = q ? plat.indexOf(q) : -1; if (debut < 0 || car.some((c) => c.length !== 1)) return [nom, '', ''];
  const chars = [...nom]; return [chars.slice(0, debut).join(''), chars.slice(debut, debut + q.length).join(''), chars.slice(debut + q.length).join('')];
}
