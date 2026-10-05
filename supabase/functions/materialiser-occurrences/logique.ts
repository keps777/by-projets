// Matérialisation des occurrences sur 90 jours glissants et de leurs rappels (spec §7.2, §10). Aucune API Deno ici.
// Les identifiants sont déterministes (ids.ts) : l'app et le serveur créent les mêmes lignes, sans doublon.
import { ajouterJours, cleRappelBloc, delaisRappel, idOccurrence, idRappel, localVersUtc, occurrencesEntre, utcVersLocal, type Regle } from '../_shared/core/index.ts';

export interface TacheSource {
  id: string; user_id: string; regle: Regle; heure_debut: number; duree_min: number;
  rappel_min: number | null; rappels_avant_min?: number[] | null; actif: boolean; supprime_le: string | null;
}
export interface OccurrenceNouvelle { id: string; user_id: string; tache_id: string; jour: string; debut: string; fin: string }
export interface OccurrenceExistante { id: string; user_id: string; tache_id: string; debut: string; etat: string; supprime_le: string | null }
export interface RappelNouveau {
  id: string; user_id: string; type: 'bloc'; occurrence_id: string; rapport_id: null; envoyer_a: string; cle_unique: string;
}

export interface FiltreMaterialisation { user_id?: string; tache_id?: string; jours?: number }

export interface DepotOccurrences {
  /** Fuseau de chaque utilisateur (profils non supprimés). */
  fuseaux(userId?: string): Promise<Map<string, string>>;
  /** Tâches, y compris inactives ou supprimées (pour annuler leurs rappels). */
  taches(filtre: { user_id?: string; tache_id?: string }): Promise<TacheSource[]>;
  /** Insère en ignorant tout conflit ; rend les identifiants créés. */
  insererOccurrences(lignes: OccurrenceNouvelle[]): Promise<string[]>;
  occurrences(ids: string[]): Promise<OccurrenceExistante[]>;
  insererRappels(lignes: RappelNouveau[]): Promise<string[]>;
  /** Passe à « annule » les rappels futurs en attente de ces tâches ; rend leur nombre. */
  annulerRappels(tacheIds: string[]): Promise<number>;
}

export const FUSEAU_DEFAUT = 'America/Toronto';
export const JOURS_DEFAUT = 90;

/** Occurrences théoriques d'une tâche entre deux jours locaux (inclus), converties en instants UTC. */
export function planifierOccurrences(t: TacheSource, fuseau: string, de: string, a: string): OccurrenceNouvelle[] {
  return occurrencesEntre(t.regle, de, a).map((jour) => {
    const debut = localVersUtc(jour, t.heure_debut, fuseau);
    return {
      id: idOccurrence(t.id, jour), user_id: t.user_id, tache_id: t.id, jour,
      debut: new Date(debut).toISOString(), fin: new Date(debut + t.duree_min * 60_000).toISOString()
    };
  });
}

/** Rappels à venir des occurrences RÉELLES (une occurrence déplacée garde son heure), encore prévues. */
export function rappelsDesOccurrences(t: TacheSource, occs: OccurrenceExistante[], maintenant: number): RappelNouveau[] {
  const delais = delaisRappel(t);
  if (!delais.length || !t.actif || t.supprime_le) return [];
  const res: RappelNouveau[] = [];
  for (const o of occs) {
    if (o.tache_id !== t.id || o.supprime_le || o.etat !== 'prevue') continue;
    for (const delai of delais) {
      const envoyer = Date.parse(o.debut) - delai * 60_000;
      if (envoyer <= maintenant) continue;
      const cle = cleRappelBloc(o.id, delai);
      res.push({ id: idRappel(cle), user_id: o.user_id, type: 'bloc', occurrence_id: o.id, rapport_id: null, envoyer_a: new Date(envoyer).toISOString(), cle_unique: cle });
    }
  }
  return res;
}

export interface BilanMaterialisation { taches: number; occurrencesCreees: number; rappelsCrees: number; rappelsAnnules: number; erreurs: string[] }

const PAQUET = 500;
/** Lecture par identifiants : paquets plus petits, la liste passe dans l'adresse de la requête. */
const LECTURE = 100;
async function parPaquets<T>(lignes: T[], f: (l: T[]) => Promise<string[]>): Promise<number> {
  let n = 0;
  for (let i = 0; i < lignes.length; i += PAQUET) n += (await f(lignes.slice(i, i + PAQUET))).length;
  return n;
}

export async function materialiser(depot: DepotOccurrences, filtre: FiltreMaterialisation = {}, maintenant = Date.now()): Promise<BilanMaterialisation> {
  const jours = Math.min(366, Math.max(1, Math.floor(filtre.jours ?? JOURS_DEFAUT)));
  const bilan: BilanMaterialisation = { taches: 0, occurrencesCreees: 0, rappelsCrees: 0, rappelsAnnules: 0, erreurs: [] };
  const taches = await depot.taches({ user_id: filtre.user_id, tache_id: filtre.tache_id });
  const fuseaux = await depot.fuseaux(filtre.user_id);

  const inactives = taches.filter((t) => !t.actif || t.supprime_le).map((t) => t.id);
  if (inactives.length) bilan.rappelsAnnules = await depot.annulerRappels(inactives);

  const nouvelles: OccurrenceNouvelle[] = [];
  const actives = taches.filter((t) => t.actif && !t.supprime_le);
  for (const t of actives) {
    try {
      const fuseau = fuseaux.get(t.user_id) ?? FUSEAU_DEFAUT;
      const aujourdhui = utcVersLocal(maintenant, fuseau).jour;
      nouvelles.push(...planifierOccurrences(t, fuseau, ajouterJours(aujourdhui, -1), ajouterJours(aujourdhui, jours)));
      bilan.taches++;
    } catch (e) {
      bilan.erreurs.push(`tâche ${t.id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  bilan.occurrencesCreees = await parPaquets(nouvelles, (l) => depot.insererOccurrences(l));

  // Les rappels se calculent sur les occurrences telles qu'elles sont en base (exceptions comprises).
  const existantes: OccurrenceExistante[] = [];
  const ids = nouvelles.map((o) => o.id);
  for (let i = 0; i < ids.length; i += LECTURE) existantes.push(...(await depot.occurrences(ids.slice(i, i + LECTURE))));
  const parTache = new Map<string, OccurrenceExistante[]>();
  for (const o of existantes) {
    const liste = parTache.get(o.tache_id);
    if (liste) liste.push(o); else parTache.set(o.tache_id, [o]);
  }
  const rappels = actives.flatMap((t) => rappelsDesOccurrences(t, parTache.get(t.id) ?? [], maintenant));
  bilan.rappelsCrees = await parPaquets(rappels, (l) => depot.insererRappels(l));
  return bilan;
}
