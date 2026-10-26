// Transactions de l'achat et du nommage : un mince habillage des transactions du marché (`acheter`, `nommerVoyageur`) qui traduit les erreurs en messages clairs.
import { app } from '../../data/store.svelte.ts';
import { compteDe } from '../../domain/compte.ts';
import { acheter, droitDe, ErreurMarche, nommerVoyageur } from '../../domain/marche.ts';
import type { Droit, Voyageur } from '../../domain/types.ts';
import { issueSimulee, type ChoixMoyen } from './moyens.ts';
import { obstacleAchat, trouverOffre } from './offre.ts';

export type ResultatPaiement = { ok: true; droit: Droit } | { ok: false; motif: 'refus' | 'indisponible' | 'echeance' | 'autre'; message: string };
/** Règle le paiement de démonstration : le « prestataire » répond d'après la saisie (refus simulé), puis le marché crée ou transfère le droit. L'offre est relue au dernier moment. */
export function payer(offreId: string, compteId: string, moyen: ChoixMoyen, saisie: { numero?: string; mobile?: string }): ResultatPaiement {
  const compte = compteDe(compteId); if (!compte) return { ok: false, motif: 'autre', message: 'Connectez-vous pour acheter.' };
  const offre = trouverOffre(offreId, compte.pass.actif);
  if (!offre) return { ok: false, motif: 'indisponible', message: 'Cette offre n’est plus disponible : le billet vient d’être vendu ou retiré.' };
  const obstacle = obstacleAchat(offre, compteId); if (obstacle) return { ok: false, motif: 'indisponible', message: obstacle };
  const issue = issueSimulee(moyen, saisie); if (!issue.ok) return { ok: false, motif: 'refus', message: issue.message };
  try { return { ok: true, droit: acheter(offre, compteId, moyen) }; }
  catch (e) {
    if (e instanceof ErreurMarche) return { ok: false, motif: e.code === 'echeance' ? 'echeance' : e.code === 'offre_indisponible' || e.code === 'soi_meme' ? 'indisponible' : 'autre', message: e.message };
    throw e;
  }
}

/** Référence de la compagnie (PNR) d'un droit : celle de l'achat ; à défaut, une référence fictive stable dérivée de la référence NXG. */
export function pnrDe(d: Pick<Droit, 'ref' | 'pnr'>): string {
  if (d.pnr) return d.pnr;
  const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; let x = 7; for (const c of d.ref) x = (Math.imul(x, 31) + c.charCodeAt(0)) >>> 0;
  let s = ''; for (let i = 0; i < 6; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; s += A[(x >>> 8) % A.length]; } return s;
}
export type ResultatNommage = { ok: true; droit: Droit } | { ok: false; message: string };
/** Transmet le voyageur à la compagnie : le billet devient nominatif (plus de revente ni de transfert) et reçoit sa référence compagnie. */
export function transmettreVoyageur(droitId: string, compteId: string, voyageur: Voyageur): ResultatNommage {
  try { const d = nommerVoyageur(droitId, compteId, voyageur); d.pnr = pnrDe(d); return { ok: true, droit: d }; }
  catch (e) { if (e instanceof ErreurMarche) return { ok: false, message: e.message }; throw e; }
}
/** Le droit s'il appartient bien au compte connecté (sinon `undefined` : introuvable ou à quelqu'un d'autre). */
export function droitDuCompte(droitId: string, compteId: string | null | undefined): Droit | undefined {
  const d = droitDe(droitId); return d && compteId && d.detenteurId === compteId ? d : undefined;
}
export const compteConnecte = () => compteDe(app.session.compteId);
