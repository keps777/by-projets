import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from '../magasin.svelte.ts';
import { session } from '../auth.svelte.ts';
import { horloge } from '../temps.svelte.ts';
import { metriquesDe, sousProjetsDe } from '../requetes.ts';
import { ajouterProjet, creerSousProjetRapide } from './projets.ts';

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
  horloge.maintenant = Date.parse('2026-10-05T18:30:00Z');
  await session.demarrer();
});

describe('création rapide depuis « Nouvelle tâche »', () => {
  it('crée un sous-projet qui mesure le temps, le nombre de fois ou les deux', () => {
    const rubrique = magasin.lignes.rubriques[0].id;
    const projet = ajouterProjet(rubrique, 'Projet éclair');
    const a = creerSousProjetRapide(projet, 'Sprint', 'les_deux', '2026-10-05');
    const b = creerSousProjetRapide(projet, 'Court', 'temps', '2026-10-05');
    expect(sousProjetsDe(projet).map((s) => s.nom)).toEqual(['Sprint', 'Court']);
    expect(metriquesDe(a).map((m) => m.type)).toEqual(['temps', 'fois']);
    expect(metriquesDe(b).map((m) => m.type)).toEqual(['temps']);
    expect(sousProjetsDe(projet)[0].statut).toBe('en_cours');
  });
});
