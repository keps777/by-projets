// Chaîne de détention présentée à l'acheteur : « 2e détenteur de ce billet », puis les étapes Émission → … → Vendeur → Vous.
// Fonctions pures, calculées depuis `Droit.chaine` (registre interne NexG-TT).
import type { Droit, Maillon } from '../../domain/types.ts';

/** Types de maillons qui changent de détenteur (le nommage, le gel et le dégel n'en font pas partie). */
const CHANGE_DE_DETENTEUR: Maillon['type'][] = ['achat_neuf', 'drop', 'revente', 'agence', 'import', 'transfert'];
/** « 1er », « 2e », « 3e »… */
export const ordinal = (n: number): string => (n === 1 ? '1er' : `${n}e`);
/** Rang du détenteur actuel : nombre de changements de détenteur dans la chaîne (au moins 1). */
export const rangDetenteur = (droit: Pick<Droit, 'chaine'>): number => Math.max(1, droit.chaine.filter((m) => CHANGE_DE_DETENTEUR.includes(m.type)).length);

export interface EtapeChaine { libelle: string; etat: 'origine' | 'passe' | 'vendeur' | 'vous' | 'suite' }
export interface Chaine { titre: string; sous: string; etapes: EtapeChaine[] }
/** Étapes pour une offre : revente (détenteurs successifs), neuf (émis par NexG-TT) ou agence. Au-delà de trois détenteurs, le début est abrégé (« … »). */
export function chaineDe(type: 'revente' | 'neuf' | 'agence' | 'drop', opts: { droit?: Pick<Droit, 'chaine'>; agence?: string } = {}): Chaine {
  if (type === 'revente' && opts.droit) {
    const rang = rangDetenteur(opts.droit), etapes: EtapeChaine[] = [{ libelle: 'Émission', etat: 'origine' }];
    if (rang > 3) etapes.push({ libelle: '…', etat: 'suite' }, { libelle: `${ordinal(rang - 1)} détenteur`, etat: 'passe' });
    else for (let i = 1; i < rang; i++) etapes.push({ libelle: `${ordinal(i)} détenteur`, etat: 'passe' });
    etapes.push({ libelle: `${ordinal(rang)} · vendeur`, etat: 'vendeur' }, { libelle: 'Vous', etat: 'vous' });
    return { titre: 'Détenteur vérifié', sous: `${ordinal(rang)} détenteur de ce billet`, etapes };
  }
  if (type === 'agence') return { titre: opts.agence ?? 'Agence partenaire', sous: 'Billet émis puis vendu par une agence partenaire', etapes: [{ libelle: 'Émission', etat: 'origine' }, { libelle: 'Agence · vendeur', etat: 'vendeur' }, { libelle: 'Vous', etat: 'vous' }] };
  return { titre: 'NexG-TT', sous: 'Billet neuf émis via NexG-TT', etapes: [{ libelle: 'Émission', etat: 'origine' }, { libelle: 'NexG-TT · vendeur', etat: 'vendeur' }, { libelle: 'Vous', etat: 'vous' }] };
}
