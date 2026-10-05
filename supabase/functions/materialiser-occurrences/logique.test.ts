import { describe, it, expect } from 'vitest';
import { cleRappelBloc, idOccurrence, idRappel } from '../_shared/core/index.ts';
import {
  materialiser, planifierOccurrences,
  type DepotOccurrences, type OccurrenceExistante, type OccurrenceNouvelle, type RappelNouveau, type TacheSource
} from './logique.ts';

const U = 'u1';
const tache = (t: Partial<TacheSource> = {}): TacheSource => ({
  id: 't1', user_id: U, regle: { frequence: 'quotidien', debut: '2026-10-01', fin: { type: 'aucune' } },
  heure_debut: 300, duree_min: 30, rappel_min: 10, actif: true, supprime_le: null, ...t
});

/** Base en mémoire qui imite les fonctions SQL : conflits ignorés (identifiant, ou tâche + jour, ou clé de rappel). */
function depotMemoire(taches: TacheSource[], fuseau = 'America/Toronto') {
  const occs = new Map<string, OccurrenceExistante & { jour: string }>();
  const rappels = new Map<string, RappelNouveau & { etat: string }>();
  const depot: DepotOccurrences = {
    fuseaux: async () => new Map([[U, fuseau]]),
    taches: async (f) => taches.filter((t) => (!f.user_id || t.user_id === f.user_id) && (!f.tache_id || t.id === f.tache_id)),
    insererOccurrences: async (lignes: OccurrenceNouvelle[]) => lignes.filter((o) => {
      if (occs.has(o.id) || [...occs.values()].some((x) => x.tache_id === o.tache_id && x.jour === o.jour)) return false;
      occs.set(o.id, { ...o, etat: 'prevue', supprime_le: null });
      return true;
    }).map((o) => o.id),
    occurrences: async (ids) => ids.flatMap((id) => (occs.has(id) ? [occs.get(id)!] : [])),
    insererRappels: async (lignes) => lignes.filter((r) => {
      if (rappels.has(r.id) || [...rappels.values()].some((x) => x.cle_unique === r.cle_unique)) return false;
      rappels.set(r.id, { ...r, etat: 'en_attente' });
      return true;
    }).map((r) => r.id),
    annulerRappels: async (ids) => {
      let n = 0;
      for (const r of rappels.values()) {
        const o = occs.get(r.occurrence_id);
        if (o && ids.includes(o.tache_id) && r.etat === 'en_attente' && Date.parse(r.envoyer_a) > MAINTENANT) { r.etat = 'annule'; n++; }
      }
      return n;
    }
  };
  return { depot, occs, rappels };
}

// 5 oct. 2026, 12:00 à Toronto (16:00 UTC).
const MAINTENANT = Date.parse('2026-10-05T16:00:00Z');

describe('planifierOccurrences', () => {
  it('garde 05:00 à l’heure locale de part et d’autre du changement d’heure', () => {
    const o = planifierOccurrences(tache(), 'America/Toronto', '2026-10-31', '2026-11-02');
    expect(o.map((x) => x.debut)).toEqual(['2026-10-31T09:00:00.000Z', '2026-11-01T10:00:00.000Z', '2026-11-02T10:00:00.000Z']);
    expect(o[0]).toMatchObject({ id: idOccurrence('t1', '2026-10-31'), jour: '2026-10-31', fin: '2026-10-31T09:30:00.000Z' });
  });
});

describe('materialiser', () => {
  it('crée les occurrences d’hier à J+90 et les rappels futurs seulement', async () => {
    const m = depotMemoire([tache()]);
    const bilan = await materialiser(m.depot, {}, MAINTENANT);
    expect(bilan.occurrencesCreees).toBe(92); // 4 oct. → 3 janv.
    const jours = [...m.occs.values()].map((o) => o.jour).sort();
    expect([jours[0], jours.at(-1)]).toEqual(['2026-10-04', '2027-01-03']);
    // Les rappels d'hier et d'aujourd'hui (05:00, déjà passé) ne sont pas créés.
    expect(bilan.rappelsCrees).toBe(90);
    const occ = idOccurrence('t1', '2026-10-06');
    const r = m.rappels.get(idRappel(cleRappelBloc(occ, 10)))!;
    expect(r).toMatchObject({ type: 'bloc', occurrence_id: occ, cle_unique: `${occ}:10`, envoyer_a: '2026-10-06T08:50:00.000Z' });
  });

  it('est idempotente et n’écrase jamais une occurrence existante ni une exception', async () => {
    const m = depotMemoire([tache()]);
    await materialiser(m.depot, { jours: 5 }, MAINTENANT);
    // L'occurrence du 7 a été reportée à 07:00 par l'utilisateur.
    const id7 = idOccurrence('t1', '2026-10-07');
    m.occs.get(id7)!.debut = '2026-10-07T11:00:00Z';
    for (const r of [...m.rappels.values()]) if (r.occurrence_id === id7) m.rappels.delete(r.id);
    const bilan = await materialiser(m.depot, { jours: 5 }, MAINTENANT);
    expect(bilan.occurrencesCreees).toBe(0);
    expect(m.occs.get(id7)!.debut).toBe('2026-10-07T11:00:00Z');
    expect(bilan.rappelsCrees).toBe(1);
    expect(m.rappels.get(idRappel(cleRappelBloc(id7, 10)))!.envoyer_a).toBe('2026-10-07T10:50:00.000Z');
  });

  it('ignore le jour pris par une occurrence déplacée et ne rappelle pas un bloc fait ou supprimé', async () => {
    const m = depotMemoire([tache()]);
    m.occs.set('deplacee', { id: 'deplacee', user_id: U, tache_id: 't1', jour: '2026-10-08', debut: '2026-10-08T12:00:00Z', etat: 'prevue', supprime_le: null });
    m.occs.set(idOccurrence('t1', '2026-10-09'), { id: idOccurrence('t1', '2026-10-09'), user_id: U, tache_id: 't1', jour: '2026-10-09', debut: '2026-10-09T09:00:00Z', etat: 'faite', supprime_le: null });
    await materialiser(m.depot, { jours: 5 }, MAINTENANT);
    expect(m.occs.has(idOccurrence('t1', '2026-10-08'))).toBe(false);
    expect([...m.rappels.values()].some((r) => r.occurrence_id === idOccurrence('t1', '2026-10-09'))).toBe(false);
  });

  it('sans rappel prévu, aucune ligne de rappel', async () => {
    const m = depotMemoire([tache({ rappel_min: null })]);
    const bilan = await materialiser(m.depot, { jours: 3 }, MAINTENANT);
    expect(bilan.occurrencesCreees).toBe(5);
    expect(m.rappels.size).toBe(0);
  });

  it('annule les rappels futurs d’une tâche supprimée ou désactivée, sans créer d’occurrence', async () => {
    const taches = [tache(), tache({ id: 't2' })];
    const m = depotMemoire(taches);
    await materialiser(m.depot, { jours: 3 }, MAINTENANT);
    taches[0].supprime_le = '2026-10-05T15:00:00Z';
    taches[1].actif = false;
    const avant = m.occs.size;
    const bilan = await materialiser(m.depot, { jours: 10 }, MAINTENANT);
    expect(m.occs.size).toBe(avant);
    expect(bilan.rappelsAnnules).toBe(6);
    expect([...m.rappels.values()].every((r) => r.etat === 'annule')).toBe(true);
  });

  it('filtre par tâche et utilise le fuseau du profil', async () => {
    const m = depotMemoire([tache(), tache({ id: 't2' })], 'Europe/Paris');
    await materialiser(m.depot, { tache_id: 't2', jours: 1 }, MAINTENANT);
    expect(new Set([...m.occs.values()].map((o) => o.tache_id))).toEqual(new Set(['t2']));
    expect(m.occs.get(idOccurrence('t2', '2026-10-06'))!.debut).toBe('2026-10-06T03:00:00.000Z');
  });
});
