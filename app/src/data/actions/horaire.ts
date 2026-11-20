// Poser ou retirer l'horaire type : une tâche récurrente par bloc de `HORAIRE_TYPE`, sans projet et sans rappel.
import type { Jour } from '@core/types.ts';
import type { Regle } from '@core/recurrence.ts';
import { magasin } from '../magasin.svelte.ts';
import { HORAIRE_TYPE, type BlocType } from '../horaire-type.ts';
import { aujourdhui } from '../temps.svelte.ts';
import { ajouterTache, supprimerOccurrences } from './taches.ts';

const titres = new Set(HORAIRE_TYPE.map((b) => b.titre));
/** Tâches actives de l'horaire type déjà présentes (même titre, sans projet). */
const presentes = () => magasin.lignes.taches.filter((t) => t.actif && !t.projet_id && titres.has(t.titre));

export const horaireTypePose = (): number => new Set(presentes().map((t) => t.titre)).size;

function regleDe(b: BlocType, depuis: Jour): Regle {
  const fin = { type: 'aucune' } as const;
  if (b.mensuel) return { frequence: 'mensuel', debut: depuis, mensuel: { mode: 'rang', rang: b.mensuel.rang, jour: b.jours[0] }, fin };
  return b.jours.length === 7 ? { frequence: 'quotidien', debut: depuis, fin } : { frequence: 'hebdo', debut: depuis, jours: b.jours, fin };
}

/** Crée les blocs qui manquent, à partir de `depuis` (aujourd'hui par défaut). Rend le nombre de tâches créées. */
export function poserHoraireType(depuis: Jour = aujourdhui()): number {
  const deja = new Set(presentes().map((t) => t.titre));
  let n = 0;
  for (const b of HORAIRE_TYPE) {
    if (deja.has(b.titre)) continue;
    ajouterTache({ titre: b.titre, projetId: null, heureDebut: b.debut, dureeMin: b.fin - b.debut, rappelMin: null, regle: regleDe(b, depuis) });
    n++;
  }
  return n;
}

/** Supprime les séries de l'horaire type (les blocs déjà faits sont gardés). Rend le nombre de tâches retirées. */
export function retirerHoraireType(): number {
  const t = presentes();
  for (const x of t) supprimerOccurrences(x.id, 'toute');
  return t.length;
}

// ------------------------------------------------------------------ pose automatique (une fois par appareil)
const CLE = 'luther-life:horaire-type';
const lire = (): string | null => { try { return localStorage.getItem(CLE); } catch { return null; } };
const ecrire = (v: string): void => { try { localStorage.setItem(CLE, v); } catch { /* sans stockage : on réessaie à la prochaine ouverture, la pose est idempotente */ } };

/** À l'ouverture : pose l'horaire type une seule fois sur cet appareil (sauf s'il a été retiré à la main). Rend le nombre de tâches créées. */
export function assurerHoraireType(depuis: Jour = aujourdhui()): number {
  if (lire() !== null) return 0;
  const n = poserHoraireType(depuis);
  // Le drapeau n'est écrit qu'après quelques secondes : si l'app se ferme avant que les tâches soient enregistrées, la pose reprend à l'ouverture suivante (idempotente).
  setTimeout(() => { if (lire() === null) ecrire('pose'); }, 3000);
  return n;
}

/** Pose à la demande (Réglages) : réactive la pose automatique. */
export function poserHoraireTypeManuel(depuis: Jour = aujourdhui()): number { ecrire('pose'); return poserHoraireType(depuis); }

/** Retire l'horaire type et ne le repose plus tout seul sur cet appareil. */
export function retirerHoraireTypeDefinitivement(): number { ecrire('retire'); return retirerHoraireType(); }
