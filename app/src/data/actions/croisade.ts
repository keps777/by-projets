// Croisade (spec §9) : configuration et suivi quotidien gardés dans des notes cachées (synchronisées comme le reste, sans colonne de plus).
import type { Jour } from '@core/types.ts';
import type { Croisade } from '@core/croisade.ts';
import { magasin } from '../magasin.svelte.ts';
import { ajouterNote, modifierNote, toutesLesNotes } from './notes.ts';
import { CROISADE, CROISADE_SUIVI } from './livres.ts';

const CFG = `${CROISADE}cfg`;
const note = (label: string) => toutesLesNotes().find((n) => n.source_label === label);

export const croisadeParDefaut = (debut: Jour): Croisade => ({
  titre: 'Croisade de 40jrs de Consolation « Bâtir la vie qui correspond à mon appel »', regle: 'un profil ZTF à écouter par jour', suivi: 'Un profil ZTF écouté',
  debut, jours: 40, heures: 6, codes: ['DDEWG', 'PA', 'BR', 'CL']
});

export function croisadeConfiguree(): Croisade | null {
  const n = note(CFG);
  if (!n) return null;
  try { const j = JSON.parse(n.texte) as Croisade; return j && j.titre && j.debut && j.jours > 0 ? { ...croisadeParDefaut(j.debut), ...j } : null; } catch { return null; }
}
export function enregistrerCroisade(c: Croisade): void {
  const texte = JSON.stringify(c); const n = note(CFG);
  if (n) modifierNote(n.id, texte); else ajouterNote({ texte, origine: 'libre', sourceLabel: CFG });
}
export function supprimerCroisade(): void {
  const n = note(CFG); if (n) magasin.supprimer('notes', n.id);
  for (const s of toutesLesNotes().filter((x) => x.source_label?.startsWith(CROISADE_SUIVI))) magasin.supprimer('notes', s.id);
}
export const suiviDuJour = (jour: Jour): boolean => !!note(CROISADE_SUIVI + jour);
export function basculerSuivi(jour: Jour): void {
  const n = note(CROISADE_SUIVI + jour);
  if (n) magasin.supprimer('notes', n.id); else ajouterNote({ texte: '1', origine: 'libre', sourceLabel: CROISADE_SUIVI + jour });
}
/** Nombre de jours suivis jusqu'à `jour` compris. */
export const totalSuivi = (jour: Jour): number => toutesLesNotes().filter((n) => n.source_label?.startsWith(CROISADE_SUIVI) && n.source_label.slice(CROISADE_SUIVI.length) <= jour).length;
