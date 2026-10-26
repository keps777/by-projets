// Journal d'audit : filtres, tri, pagination et export CSV (fonctions pures, testées). Le journal est en ajout seul : rien ici ne modifie une ligne.
import type { Audit } from '../../domain/types.ts';

export type Periode = 'heure' | 'jour' | 'semaine' | 'tout';
export type CategorieAction = 'toutes' | 'gel' | 'drops' | 'agences' | 'connexions' | 'exports' | 'rapprochement' | 'autres';
export type CleTri = 'quand' | 'acteur' | 'action' | 'cible' | 'gravite';
export type Gravite = Audit['gravite'];
export interface Filtres { periode: Periode; gravite: Gravite | 'toutes'; acteur: string; action: CategorieAction; recherche: string }
export const FILTRES_INITIAUX: Filtres = { periode: 'semaine', gravite: 'toutes', acteur: '', action: 'toutes', recherche: '' };
export const TAILLE_PAGE = 10;
const H = 3_600_000;
export const DUREES: Record<Periode, number> = { heure: H, jour: 24 * H, semaine: 7 * 24 * H, tout: Infinity };
export const RANG_GRAVITE: Record<Gravite, number> = { info: 0, attention: 1, critique: 2 };

/** Catégorie d'une action du journal (pour le filtre « Action »). */
export function categorie(action: string): CategorieAction {
  const a = action.toLowerCase();
  if (/gel|dégel/.test(a)) return 'gel'; if (/drop/.test(a)) return 'drops'; if (/agence/.test(a)) return 'agences';
  if (/connexion/.test(a)) return 'connexions'; if (/export/.test(a)) return 'exports'; if (/rapprochement/.test(a)) return 'rapprochement'; return 'autres';
}
const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Lignes qui passent tous les filtres. La recherche porte sur l'objet, l'action et le détail ; l'acteur se compare au début de l'identifiant ou au contenu. */
export function filtrer(lignes: Audit[], f: Filtres, now: number): Audit[] {
  const q = norm(f.recherche.trim()), ac = norm(f.acteur.trim()), debut = now - DUREES[f.periode];
  return lignes.filter((l) => l.quand >= debut && l.quand <= now + 60_000 * 5
    && (f.gravite === 'toutes' || l.gravite === f.gravite) && (f.action === 'toutes' || categorie(l.action) === f.action)
    && (!ac || norm(l.acteur).includes(ac)) && (!q || norm(`${l.cible} ${l.action} ${l.detail}`).includes(q)));
}
/** Tri stable ; à égalité, le plus récent d'abord. */
export function trier(lignes: Audit[], cle: CleTri, sens: 'asc' | 'desc'): Audit[] {
  const m = sens === 'asc' ? 1 : -1;
  const v = (l: Audit): number | string => (cle === 'quand' ? l.quand : cle === 'gravite' ? RANG_GRAVITE[l.gravite] : norm(l[cle]));
  return [...lignes].sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * m || b.quand - a.quand; });
}
export const nbPages = (n: number, taille = TAILLE_PAGE): number => Math.max(1, Math.ceil(n / taille));
export const page = <T,>(lignes: T[], p: number, taille = TAILLE_PAGE): T[] => lignes.slice((p - 1) * taille, p * taille);

/** Neutralise l'injection de formules des tableurs (cellule commençant par = + - @) et protège les séparateurs. */
export function celluleCsv(t: string): string {
  const s = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const GRAVITES: Record<Gravite, string> = { info: 'Info', attention: 'Attention', critique: 'Critique' };
/** Export CSV simulé : une ligne d'en-tête, puis une ligne par entrée (instants en ISO UTC). Aucune donnée de voyageur : le journal n'en contient pas. */
export function versCsv(lignes: Audit[]): string {
  const tete = ['horodatage_utc', 'acteur', 'action', 'objet', 'detail', 'gravite'];
  return [tete, ...lignes.map((l) => [new Date(l.quand).toISOString(), l.acteur, l.action, l.cible, l.detail, GRAVITES[l.gravite]])].map((r) => r.map(celluleCsv).join(',')).join('\r\n') + '\r\n';
}
