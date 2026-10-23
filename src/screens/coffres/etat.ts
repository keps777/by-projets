// Tranche 'coffres' : les coffres d'épargne du membre. Les autres fonctionnalités (école…) les lisent, ne les modifient pas.
import { app, maintenant, tranche } from '../../data/store.svelte.ts';
import { jourDe, ajouterMois, type Jour } from '../../core/dates.ts';
import { moisDe, moisPrecedent, type MoisCle } from '../../core/coffres.ts';

export type TypeOperation = 'ouverture' | 'versement' | 'auto' | 'interet' | 'retrait';
export interface OperationCoffre { id: string; ts: number; type: TypeOperation; montant: number; note?: string }
export interface Coffre {
  id: string;
  /** Rentrée, Voiture, Maison, Mariage, Libre ou Urgences. */
  genre: string;
  nom: string;
  objectif: number;
  epargne: number;
  /** Versement mensuel total du coffre (toutes parts comprises si partagé). */
  mensuel: number;
  /** Versement automatique actif le jour de paie. */
  auto: boolean;
  cree: Jour;
  partage: boolean;
  membres: number;
  /** Dernier mois dont les intérêts ont été crédités (« 2026-09 »). */
  interetsMois: MoisCle;
  operations: OperationCoffre[];
}
export interface EtatCoffres {
  coffres: Coffre[];
  /** Mois où les points de score d'un versement ont déjà été gagnés (une fois par mois, pas de gain en série). */
  pointsMois: MoisCle | null;
  /** Années où le retrait d'urgence gratuit a été utilisé. */
  urgences: number[];
}

const op = (jours: number, type: TypeOperation, montant: number, note?: string): OperationCoffre => {
  const d = new Date(maintenant()); d.setDate(d.getDate() - jours); d.setHours(9, 0, 0, 0);
  return { id: `o-${jours}-${type}-${montant}`, ts: d.getTime(), type, montant, note };
};
/** Compte démo d'Aïcha : trois coffres (voir maquette « Coffres »). */
function demo(): EtatCoffres {
  const auj = jourDe(new Date(maintenant()));
  const dernier = moisPrecedent(moisDe(auj));
  const mk = (id: string, genre: string, nom: string, objectif: number, epargne: number, mensuel: number, ageJours: number, extra: Partial<Coffre> = {}): Coffre => ({
    id, genre, nom, objectif, epargne, mensuel, auto: true, cree: ajouterMois(auj, -Math.round(ageJours / 30)), partage: false, membres: 1, interetsMois: dernier,
    operations: [op(24, 'auto', mensuel, 'Versement automatique'), op(ageJours, 'ouverture', epargne - mensuel)], ...extra
  });
  return {
    coffres: [
      mk('cf-rentree', 'Rentrée', 'Rentrée 2027', 600_000, 160_000, 25_000, 240),
      mk('cf-voiture', 'Voiture', 'Apport voiture', 1_200_000, 500_000, 40_000, 330),
      mk('cf-urgences', 'Urgences', 'Urgences famille', 200_000, 120_000, 10_000, 180, { partage: true, membres: 4 })
    ],
    pointsMois: null, urgences: []
  };
}
const initial = (): EtatCoffres => (app.mode === 'demo' ? demo() : { coffres: [], pointsMois: null, urgences: [] });
/** Tranche, créée à la première lecture. À appeler depuis un script ou une action (jamais depuis un $derived : elle écrit dans l'état). */
export const etatCoffres = (): EtatCoffres => tranche<EtatCoffres>('coffres', initial);

/** Lecture sans écriture (sûre dans un $derived) : avant la création de la tranche, on lit la valeur initiale sans la stocker. */
export const coffres = (): Coffre[] => ((app.tranches['coffres'] as EtatCoffres | undefined) ?? initial()).coffres;
export const trouverCoffre = (id: string) => coffres().find((c) => c.id === id);
export const totalEpargne = () => coffres().reduce((t, c) => t + c.epargne, 0);

/** Lecture seule pour l'école : le coffre « Rentrée » (le premier du genre), ou null. */
export function coffreRentree(): Readonly<Coffre> | null {
  return coffres().find((c) => c.genre === 'Rentrée') ?? null;
}
