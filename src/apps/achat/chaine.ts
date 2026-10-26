// Chaîne de détention d'un droit, présentée en étapes lisibles (registre interne NexG-TT). Fonctions pures sur le monde.
import { fmt } from '../../core/argent.ts';
import type { Droit, Maillon, Monde } from '../../domain/types.ts';
import { jourMois, jourMoisSiAnnee } from './dates.ts';

export interface EtapeChaine { id: string; date: string; titre: string; detail: string; type: Maillon['type']; /** Étape de finalisation (voyageur nommé). */ finale: boolean }
/** « Alex T. », « NexG-TT », « Agence Horizon » : la partie d'un maillon (`de` / `vers`). */
export function nomPartie(id: string | null, monde: Pick<Monde, 'comptes' | 'agences'>): string {
  if (!id) return 'Origine'; if (id === 'nexgtt') return 'NexG-TT';
  if (id.startsWith('agence:')) return monde.agences.find((a) => a.id === id.slice(7))?.nom ?? 'Une agence';
  const c = monde.comptes.find((x) => x.id === id); return c ? `${c.prenom}${c.nom ? ` ${c.nom[0].toUpperCase()}.` : ''}` : 'Un détenteur';
}
const TITRES: Record<Maillon['type'], string> = { achat_neuf: 'Achat neuf', drop: 'Achat au drop', revente: 'Revente', agence: 'Achat auprès d’une agence', import: 'Import d’un billet', transfert: 'Transfert à un proche', rachat: 'Rachat par NexG-TT', nommage: 'Finalisation — voyageur nommé', gel: 'Gel administratif', degel: 'Dégel' };
export const titreMaillon = (t: Maillon['type']): string => TITRES[t];
export function etapesChaine(d: Pick<Droit, 'chaine' | 'voyageur'>, monde: Pick<Monde, 'comptes' | 'agences'>, maintenant: number): EtapeChaine[] {
  return [...d.chaine].sort((a, b) => a.quand - b.quand).map((m) => {
    const vers = nomPartie(m.vers, monde), de = nomPartie(m.de, monde);
    const detail = m.type === 'nommage' ? `${d.voyageur ? `${d.voyageur.prenom} ${d.voyageur.nom}` : vers}, transmis à la compagnie. Revente et transfert fermés.${m.note ? ` ${m.note}.` : ''}`
      : m.type === 'transfert' ? `${de} → ${vers}` : m.type === 'gel' || m.type === 'degel' ? (m.note ?? vers) : `${vers} devient détenteur${m.prix ? ` · ${fmt(m.prix)}` : ''}`;
    return { id: m.id, date: jourMoisSiAnnee(m.quand, maintenant), titre: TITRES[m.type], detail, type: m.type, finale: m.type === 'nommage' };
  });
}
/** Date de la finalisation (dernier maillon de nommage), ou `fallback` si le droit n'a pas été nommé via la chaîne. */
export function dateFinalisation(d: Pick<Droit, 'chaine'>, fallback: number): number { return [...d.chaine].reverse().find((m) => m.type === 'nommage')?.quand ?? fallback; }
export const dateCourte = jourMois;
