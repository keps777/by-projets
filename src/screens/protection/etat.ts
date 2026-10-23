// Tranche « protection » : assurés, souscription (prime mensuelle sur salaire) et dossiers de sinistre.
import { app, tranche } from '../../data/store.svelte.ts';
import type { Jour } from '../../core/dates.ts';

export type Lien = 'vous' | 'conjoint' | 'enfant' | 'parent' | 'autre';
export const LIENS: Record<Lien, string> = { vous: 'Vous', conjoint: 'Conjoint(e)', enfant: 'Enfant', parent: 'Parent', autre: 'Autre' };
export type Quand = 'aujourdhui' | 'hier' | 'semaine';
export const QUAND: Record<Quand, string> = { aujourdhui: "Aujourd'hui", hier: 'Hier', semaine: 'Cette semaine' };
export interface AssureP { id: string; nom: string; lien: Lien; age: number | null; ville: string; /** Dans la sélection en cours. */ couvert: boolean; /** Numéro du dossier de sinistre, s'il y en a un. */ dossier?: string }
export interface Souscription { ts: number; depuis: Jour; capital: number; prime: number; assureIds: string[]; primesPayees: number }
export interface Sinistre { id: string; numero: string; ts: number; assureId: string; nom: string; ville: string; quand: Quand; capital: number; versementPrevu: number; verse: boolean }
export interface EtatProtection { assures: AssureP[]; capital: number; souscription: Souscription | null; sinistres: Sinistre[] }

function defaut(): EtatProtection {
  if (app.mode !== 'demo') return { capital: 1_000_000, souscription: null, sinistres: [], assures: [{ id: 'moi', nom: 'Vous', lien: 'vous', age: null, ville: '', couvert: true }] };
  return {
    capital: 2_000_000, souscription: null, sinistres: [],
    assures: [
      { id: 'moi', nom: 'Vous', lien: 'vous', age: 34, ville: 'Douala', couvert: true },
      { id: 'conjoint', nom: 'Conjoint', lien: 'conjoint', age: 38, ville: 'Douala', couvert: true },
      { id: 'maman', nom: 'Maman', lien: 'parent', age: 64, ville: 'Douala', couvert: true },
      { id: 'papa', nom: 'Papa', lien: 'parent', age: 69, ville: 'Bafoussam', couvert: false },
      { id: 'lisa', nom: 'Lisa', lien: 'enfant', age: 13, ville: 'Douala', couvert: true },
      { id: 'marc', nom: 'Marc', lien: 'enfant', age: 9, ville: 'Douala', couvert: false }
    ]
  };
}
/** À relire à chaque usage : la tranche est remplacée quand on bascule démo / vierge. */
export const etat = () => tranche<EtatProtection>('protection', defaut);
