// Sélecteur de bus de la page « Billets » : libellés, choix du billet affiché et navigation clavier dans la liste. Pur.
export type StatutSelection = 'a_venir' | 'embarquement' | 'en_route' | 'a_bord' | 'passe' | 'annule';
export interface ItemBillet {
  id: string; /** Prénom du passager. */ passager: string; /** Le billet est à mon nom (sinon acheté pour un proche, ou pour moi par un proche). */ pourMoi: boolean;
  /** Prénom de la personne qui a payé, quand ce n'est pas la passagère. */ payePar?: string; trajet: string; jour: string; heure: string; departMs: number; statut: StatutSelection; siege: string | null;
}
const LIBELLE: Record<StatutSelection, string> = { a_venir: 'à venir', embarquement: 'embarquement', en_route: 'en route', a_bord: 'à bord', passe: 'passé', annule: 'annulé' };
export const libelleStatut = (s: StatutSelection) => LIBELLE[s];
/** Un billet « en cours ou à venir » : ni passé ni annulé. */
export const estEnCours = (i: Pick<ItemBillet, 'statut'>) => i.statut !== 'passe' && i.statut !== 'annule';
/** Les plus proches d'abord, les billets d'un même départ restent dans l'ordre d'achat. */
export const trierItems = <T extends Pick<ItemBillet, 'departMs'>>(items: T[]): T[] => items.map((x, i) => ({ x, i })).sort((a, b) => a.x.departMs - b.x.departMs || a.i - b.i).map((o) => o.x);
/** Ligne principale d'une entrée de la liste : « Yaoundé → Douala · mer. 08:00 ». */
export const libelleItem = (i: ItemBillet) => `${i.trajet} · ${i.jour} ${i.heure}`;
/** Qui voyage : « Toi », « Marie », « Marie · payé par toi ». */
export function libellePassager(i: ItemBillet): string {
  if (i.pourMoi) return i.payePar ? `Toi · payé par ${i.payePar}` : 'Toi';
  return i.payePar ? `${i.passager} · payé par ${i.payePar}` : i.passager;
}
/** Texte lu par un lecteur d'écran pour une entrée. */
export const descriptionItem = (i: ItemBillet) => `${libellePassager(i)}, ${libelleItem(i)}${i.siege ? `, place ${i.siege}` : ''}, ${libelleStatut(i.statut)}`;

/** Le billet affiché : celui demandé par le lien (`?billet=`), sinon le dernier choisi s'il est encore en cours, sinon le prochain départ. */
export function choisirBillet(o: { enCours: string[]; tous?: string[]; demande?: string | null; memorise?: string | null }): string | undefined {
  const { enCours, tous = enCours, demande, memorise } = o;
  if (demande && (tous.includes(demande) || enCours.includes(demande))) return demande;
  if (memorise && enCours.includes(memorise)) return memorise;
  return enCours[0];
}

/** Navigation clavier dans une liste de `n` options : renvoie la nouvelle option active, ou null si la touche ne déplace pas. */
export function deplacer(actif: number, touche: string, n: number): number | null {
  if (n <= 0) return null;
  if (touche === 'ArrowDown') return actif < 0 ? 0 : (actif + 1) % n;
  if (touche === 'ArrowUp') return actif < 0 ? n - 1 : (actif - 1 + n) % n;
  if (touche === 'Home') return 0;
  if (touche === 'End') return n - 1;
  return null;
}
