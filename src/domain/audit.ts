// Journal d'audit : toute action d'administration (gel d'un droit, création d'un drop, changement d'agence…) y laisse une ligne.
import { app, nouvelId, maintenant } from '../data/store.svelte.ts';
import type { Audit } from './types.ts';
/** Ajoute une ligne au journal d'audit (la plus récente en premier) et la renvoie. */
export function consigner(acteur: string, action: string, cible: string, detail: string, gravite: Audit['gravite'] = 'info'): Audit {
  const ligne: Audit = { id: nouvelId('a'), quand: maintenant(), acteur, action, cible, detail, gravite };
  app.monde.audit.unshift(ligne); return ligne;
}
