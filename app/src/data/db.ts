// Base locale (IndexedDB via Dexie) : copie des lignes du serveur + file d'écritures à envoyer.
import Dexie, { type Table } from 'dexie';
import { TABLES, type LignesParTable, type NomTable } from '@core/lignes.ts';

export interface Sortie { cle: string; table: NomTable; id: string; at: number }
export interface Meta { cle: string; valeur: unknown }

const INDEX: Record<NomTable, string> = {
  profils: 'id',
  rubriques: 'id, updated_at',
  projets: 'id, rubrique_id, updated_at',
  sous_projets: 'id, projet_id, updated_at',
  metriques: 'id, sous_projet_id, updated_at',
  taches: 'id, projet_id, updated_at',
  tache_alimente: 'id, tache_id, updated_at',
  tache_attendus: 'id, tache_id, updated_at',
  occurrences: 'id, jour, tache_id, updated_at',
  saisies: 'id, jour, projet_id, occurrence_id, updated_at',
  saisie_valeurs: 'id, saisie_id, cle, updated_at',
  points_rapport: 'id, updated_at',
  presets_export: 'id, updated_at',
  rapports: 'id, jour, updated_at',
  rappels: 'id, occurrence_id, updated_at',
  abonnements_push: 'id, updated_at'
};

export class BaseLocale extends Dexie {
  meta!: Table<Meta, string>;
  sortie!: Table<Sortie, string>;

  constructor(nom: string) {
    super(nom);
    this.version(1).stores({ meta: 'cle', sortie: 'cle, table', ...INDEX });
  }

  lignes<K extends NomTable>(t: K): Table<LignesParTable[K], string> { return this.table(t) as Table<LignesParTable[K], string>; }
}

export const nomBase = (userId: string) => `luther-life-${userId}`;
export { TABLES };
