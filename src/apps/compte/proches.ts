// Voyageurs enregistrés : les proches d'un compte (identifiants de comptes NexG-TT), ajout par courriel ou téléphone, retrait.
import { compteDe, trouverCompte } from '../../domain/compte.ts';
import type { Compte } from '../../domain/types.ts';

export const initiales = (c: Pick<Compte, 'prenom' | 'nom'>): string => `${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`.toUpperCase() || '·';
/** « Alex T. » */
export const nomCourt = (c: Pick<Compte, 'prenom' | 'nom'>): string => `${c.prenom} ${c.nom ? `${c.nom[0]}.` : ''}`.trim() || 'Voyageur';
/** Les proches enregistrés (comptes encore actifs), dans l'ordre d'ajout. */
export const prochesDe = (compteId: string): Compte[] => (compteDe(compteId)?.proches ?? []).map((id) => compteDe(id)).filter((c): c is Compte => !!c && c.actif);
export type ResultatProche = { ok: true; proche: Compte } | { ok: false; message: string };
/** Ajoute un proche déjà inscrit à NexG-TT, retrouvé par courriel ou téléphone. Refuse soi-même, un doublon et un compte inconnu. */
export function ajouterProche(compteId: string, identifiant: string): ResultatProche {
  const moi = compteDe(compteId); if (!moi) return { ok: false, message: 'Connectez-vous pour ajouter un proche.' };
  if (!identifiant.trim()) return { ok: false, message: 'Indiquez le courriel ou le téléphone de votre proche.' };
  const p = trouverCompte(identifiant);
  if (!p || !p.actif) return { ok: false, message: 'Aucun compte NexG-TT ne correspond. Votre proche peut aussi recevoir un droit sans compte, au moment du transfert.' };
  if (p.id === moi.id) return { ok: false, message: 'C’est votre propre compte : vous êtes déjà dans la liste.' };
  if (moi.proches.includes(p.id)) return { ok: false, message: `${nomCourt(p)} est déjà dans vos proches.` };
  moi.proches.push(p.id); return { ok: true, proche: p };
}
export function retirerProche(compteId: string, procheId: string): boolean {
  const moi = compteDe(compteId); if (!moi || !moi.proches.includes(procheId)) return false;
  moi.proches = moi.proches.filter((id) => id !== procheId); return true;
}
