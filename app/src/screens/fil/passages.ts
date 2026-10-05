// Passages de la Bible d'un bloc : lus dans la saisie (détail structuré, sinon le texte relu), écrits avec le nombre de chapitres.
import { compterChapitres, formaterPassages, lirePassages, type Passage } from '@core/bible.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { saisirBloc, type ValeurEntree } from '../../data/actions/blocs.ts';
import { idSaisie } from '@core/ids.ts';

export const CLE_PASSAGES = 'reference:passages';
export const CLE_CHAPITRES = 'nombre:chapitres';

const estPassage = (p: unknown): p is Passage => !!p && typeof p === 'object' && typeof (p as Passage).livre === 'string' && Number.isInteger((p as Passage).de) && Number.isInteger((p as Passage).a);

/** Passages enregistrés pour un bloc : le détail structuré s'il existe, sinon le texte saisi à la main relu. */
export function passagesEnregistres(occId: string, cle = CLE_PASSAGES): Passage[] {
  const v = magasin.lignes.saisie_valeurs.find((x) => x.saisie_id === idSaisie(occId) && x.cle === cle);
  if (!v) return [];
  if (Array.isArray(v.detail)) return v.detail.filter(estPassage);
  return v.valeur_txt ? lirePassages(v.valeur_txt) : [];
}

/** Valeurs à écrire pour des passages : la référence (texte + détail) et, si le bloc la suit, le nombre de chapitres. */
export function valeursDePassages(passages: Passage[], avecChapitres: boolean): ValeurEntree[] {
  const v: ValeurEntree[] = [{ cle: CLE_PASSAGES, txt: passages.length ? formaterPassages(passages) : null, detail: passages }];
  if (avecChapitres) v.push({ cle: CLE_CHAPITRES, num: compterChapitres(passages) });
  return v;
}

export function enregistrerPassages(occId: string, passages: Passage[], avecChapitres: boolean): void {
  saisirBloc(occId, valeursDePassages(passages, avecChapitres), { source: 'bloc' });
}
