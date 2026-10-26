// Ce que les écrans des drops affichent, en fonctions pures : compte à rebours, paliers annoncés, prochains drops, reventes du même trajet, chronologie d'un drop épuisé.
import type { Drop, DropAVenir, Monde, Vol } from '../../domain/types.ts';

const p2 = (n: number) => String(n).padStart(2, '0');
export interface Groupe { unite: string; chiffres: string[] }
export interface Rebours { groupes: Groupe[]; /** « Fin du drop dans 4 min 31 s » */ libelle: string; secondes: number }
/** Les chiffres du compte à rebours : minutes et secondes ; les heures s'ajoutent s'il en reste (jamais de jours). Chaque groupe fait au moins deux chiffres. */
export function chiffresRebours(ms: number): Rebours {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const g = (n: number, unite: string): Groupe => ({ unite, chiffres: [...String(n).padStart(2, '0')] });
  const groupes = h > 0 ? [g(h, 'Heures'), g(m, 'Minutes'), g(s, 'Secondes')] : [g(m, 'Minutes'), g(s, 'Secondes')];
  const libelle = `Fin du drop dans ${h > 0 ? `${h} h ` : ''}${h > 0 || m > 0 ? `${m} min ` : ''}${s} s`;
  return { groupes, libelle, secondes: t };
}
/** Les seuils (en secondes) auxquels le temps restant est annoncé à voix haute : jamais à chaque seconde. */
export const PALIERS = [600, 300, 60, 30, 10] as const;
/** Le palier atteint : le plus petit seuil au-dessus du temps restant ; `null` tant qu'il reste plus de 10 minutes ; 0 quand c'est fini. */
export function palier(ms: number): number | null {
  const t = Math.max(0, Math.ceil(ms / 1000)); if (t <= 0) return 0;
  const p = [...PALIERS].reverse().find((x) => t <= x); return p ?? null;
}
const ANNONCES: Record<number, string> = { 600: 'Moins de 10 minutes avant la fin du drop.', 300: 'Moins de 5 minutes avant la fin du drop.', 60: 'Moins d’une minute avant la fin du drop.', 30: 'Moins de 30 secondes avant la fin du drop.', 10: 'Moins de 10 secondes avant la fin du drop.', 0: 'Le drop est terminé.' };
/** Le message annoncé (`aria-live="polite"`) pour le palier atteint ; vide entre deux paliers. */
export const annoncePalier = (ms: number): string => { const p = palier(ms); return p === null ? '' : ANNONCES[p]; };

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export interface LigneProchain { id: string; jour: string; jourLong: string; heure: string; zone: string; alerte: boolean; ouvre: number }
/** Un prochain drop : « jeu. » « 12:00 » « Europe » ; la destination reste masquée jusqu'à l'ouverture. */
export function ligneProchain(d: DropAVenir, compteId: string | null | undefined): LigneProchain {
  const x = new Date(d.ouvre);
  return { id: d.id, jour: JOURS[x.getDay()], jourLong: JOURS_LONGS[x.getDay()], heure: `${p2(x.getHours())}:${p2(x.getMinutes())}`, zone: d.zone, alerte: !!compteId && d.alerteIds.includes(compteId), ouvre: d.ouvre };
}
/** « jeu. 12:00 · Europe · destination masquée » */
export const phraseProchain = (l: Pick<LigneProchain, 'jour' | 'heure' | 'zone'>): string => `${l.jour} ${l.heure} · ${l.zone} · destination masquée`;

/** « 19:00:00,8 » : l'heure à la dixième de seconde près, `plusMs` ajoutés. */
export function horodatage(ms: number, plusMs = 0): string {
  const t = ms + plusMs, x = new Date(t); return `${p2(x.getHours())}:${p2(x.getMinutes())}:${p2(x.getSeconds())},${Math.floor((((t % 1000) + 1000) % 1000) / 100)}`;
}
/** « 0,8 » + « seconde » / « 1,5 » + « seconde » / « 3,2 » + « secondes » (le pluriel commence à 2). */
export function dureeParti(ms: number): { valeur: string; unite: string } { const s = Math.round(ms / 100) / 10; return { valeur: s.toFixed(1).replace('.', ','), unite: s < 2 ? 'seconde' : 'secondes' }; }
/** « une demi-seconde » pour 500 ms, sinon « 0,5 seconde ». */
export const DELAI_DEMANDE_MS = 500;

export interface Alternative { droitId: string; offreId: string; de: string; vers: string; jour: string; heure: string; compagnie: string; escales: string; prix: number; prixEquivalent: number; etiquette: string; memeVol: boolean }
const J = 86_400_000;
/** Reventes en cours sur le même trajet, hors annonces du compte : le même vol d'abord, puis les dates les plus proches. */
export function alternatives(monde: Pick<Monde, 'droits' | 'vols' | 'compagnies'>, vol: Vol, compteId: string | null | undefined, limite = 2): Alternative[] {
  const depart = (v: Vol) => Date.parse(`${v.jour}T${v.heureDepart}`), ref = depart(vol);
  return monde.droits.filter((d) => d.statut === 'en_vente' && d.annonce && d.detenteurId !== compteId)
    .flatMap((d) => { const v = monde.vols.find((x) => x.id === d.volId); return v && v.de === vol.de && v.vers === vol.vers ? [{ d, v }] : []; })
    .sort((a, b) => Number(b.v.id === vol.id) - Number(a.v.id === vol.id) || Math.abs(depart(a.v) - ref) - Math.abs(depart(b.v) - ref) || a.d.annonce!.prix - b.d.annonce!.prix)
    .slice(0, limite).map(({ d, v }) => {
      const ecart = Math.round((depart(v) - ref) / J), memeVol = v.id === vol.id;
      const etiquette = memeVol ? 'Même vol que le drop' : Math.abs(ecart) >= 5 && Math.abs(ecart) <= 9 ? (ecart > 0 ? 'Une semaine plus tard' : 'Une semaine plus tôt') : ecart > 0 ? 'Plus tard' : 'Plus tôt';
      return { droitId: d.id, offreId: `revente:${d.id}`, de: v.de, vers: v.vers, jour: v.jour, heure: v.heureDepart, compagnie: monde.compagnies.find((c) => c.id === v.compagnieId)?.nom ?? '', escales: v.escales.length ? `${v.escales.length} escale${v.escales.length > 1 ? 's' : ''}` : 'direct', prix: d.annonce!.prix, prixEquivalent: v.prixNeuf, etiquette, memeVol };
    });
}
/** Étapes affichées sous « Parti en 0,8 seconde » : ouverture, dernière place attribuée, demande du membre (si elle a eu lieu). */
export interface EtapeEpuise { heure: string; texte: string; fort: boolean }
export function chronologieEpuise(drop: Pick<Drop, 'ouvre' | 'places'>, dureeMs: number, demande: boolean): EtapeEpuise[] {
  const l: EtapeEpuise[] = [{ heure: horodatage(drop.ouvre), texte: 'Ouverture du drop', fort: false }, { heure: horodatage(drop.ouvre, dureeMs), texte: `${drop.places} places sur ${drop.places} attribuées`, fort: true }];
  if (demande) l.push({ heure: horodatage(drop.ouvre, dureeMs + DELAI_DEMANDE_MS), texte: 'Votre demande — non retenue', fort: false });
  return l;
}
