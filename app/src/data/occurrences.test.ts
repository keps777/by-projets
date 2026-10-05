// Intégrité des occurrences et des rappels : suppressions durables, série modifiée, délai par défaut changé.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { idOccurrence } from '@core/ids.ts';
import { magasin } from './magasin.svelte.ts';
import { session } from './auth.svelte.ts';
import { horloge } from './temps.svelte.ts';
import { ajouterTache, materialiserTache, prolongerHorizon, reporter, supprimerOccurrences } from './actions/taches.ts';
import { changerDelaiDefaut } from './actions/reglages.ts';
import { modifierSerie } from '../screens/fil/edition.ts';

const NOW = Date.parse('2026-10-05T09:00:00Z'); // 05:00 à Montréal

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
  horloge.maintenant = NOW;
  await session.demarrer();
});

const quotidien = { frequence: 'quotidien' as const, debut: '2026-10-05', fin: { type: 'aucune' as const } };
const tache = (rappelMin: number | null = 10) => ajouterTache({ titre: 'RDQD', projetId: null, regle: quotidien, heureDebut: 18 * 60, dureeMin: 30, rappelMin });
const occsDe = (id: string) => magasin.lignes.occurrences.filter((o) => o.tache_id === id);

describe('suppressions durables', () => {
  it('« cette occurrence » ne revient pas quand l’horizon est prolongé', () => {
    const id = tache();
    const o = idOccurrence(id, '2026-10-07');
    supprimerOccurrences(id, 'cette', o);
    prolongerHorizon();
    materialiserTache(id, '2026-10-05');
    expect(magasin.trouver('occurrences', o)).toBeUndefined();
  });

  it('« celle-ci et les suivantes » arrête la série la veille', () => {
    const id = tache();
    supprimerOccurrences(id, 'suivantes', idOccurrence(id, '2026-10-10'));
    expect(magasin.trouver('taches', id)!.regle.fin).toEqual({ type: 'date', date: '2026-10-09' });
    // Plus tard, au-delà de l'ancien horizon : rien ne revient.
    expect(materialiserTache(id, '2027-01-10')).toBe(0);
    expect(occsDe(id).every((o) => o.jour <= '2026-10-09')).toBe(true);
  });
});

describe('toute la série', () => {
  it('une tâche « ce jour seulement » déplacée puis ramenée garde exactement un bloc', () => {
    const base = { titre: 'Rdv', projetId: null, heureDebut: 600, dureeMin: 30, rappelMin: 10 };
    const id = ajouterTache({ ...base, regle: { frequence: 'une_fois', debut: '2026-10-08', fin: { type: 'aucune' } } });
    modifierSerie(id, { ...base, regle: { frequence: 'une_fois', debut: '2026-10-09', fin: { type: 'aucune' } } }, '2026-10-05');
    expect(occsDe(id).map((o) => o.jour)).toEqual(['2026-10-09']);
    modifierSerie(id, { ...base, regle: { frequence: 'une_fois', debut: '2026-10-08', fin: { type: 'aucune' } } }, '2026-10-05');
    expect(occsDe(id).map((o) => o.jour)).toEqual(['2026-10-08']);
  });

  it('garde les blocs reportés et faits', () => {
    const id = tache();
    const o6 = idOccurrence(id, '2026-10-06');
    reporter(o6, { jour: '2026-10-07', debutMin: 20 * 60, rappelMin: 10 });
    modifierSerie(id, { titre: 'RDQD', projetId: null, regle: quotidien, heureDebut: 19 * 60, dureeMin: 30, rappelMin: 10 }, '2026-10-05');
    expect(magasin.trouver('occurrences', o6)!.jour).toBe('2026-10-07');
    // Le jour du report a aussi son bloc régulier : deux blocs le 7, la série reste intacte.
    expect(occsDe(id).filter((o) => o.jour === '2026-10-07')).toHaveLength(2);
  });
});

describe('délai de rappel par défaut', () => {
  it('replanifie les rappels des tâches qui suivaient l’ancien défaut, et seulement elles', () => {
    const suit = tache(10);
    const autre = tache(5);
    const enAttente = (id: string) => magasin.lignes.rappels.filter((r) => r.etat === 'en_attente' && occsDe(id).some((o) => o.id === r.occurrence_id));
    const avant = enAttente(suit).length;
    changerDelaiDefaut(15);
    expect(magasin.lignes.profils[0].rappel_defaut_min).toBe(15);
    expect(magasin.trouver('taches', suit)!.rappel_min).toBe(15);
    const nouveaux = enAttente(suit);
    expect(nouveaux).toHaveLength(avant);
    expect(nouveaux.every((r) => r.cle_unique.endsWith(':15'))).toBe(true);
    const o = magasin.trouver('occurrences', idOccurrence(suit, '2026-10-06'))!;
    expect(nouveaux.find((r) => r.occurrence_id === o.id)!.envoyer_a).toBe(new Date(Date.parse(o.debut) - 15 * 60000).toISOString());
    expect(magasin.lignes.rappels.filter((r) => r.cle_unique.endsWith(':10') && r.etat === 'en_attente')).toHaveLength(0);
    expect(magasin.trouver('taches', autre)!.rappel_min).toBe(5);
    expect(enAttente(autre).every((r) => r.cle_unique.endsWith(':5'))).toBe(true);
  });
});
