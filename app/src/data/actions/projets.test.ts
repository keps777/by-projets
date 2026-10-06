import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from '../magasin.svelte.ts';
import { session } from '../auth.svelte.ts';
import { horloge } from '../temps.svelte.ts';
import { metriquesDe, sousProjetsDe } from '../requetes.ts';
import { cataloguerMesures } from '../../screens/fil/catalogue-metriques.ts';
import { ajouterProjet, creerSousProjetRapide } from './projets.ts';

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
  horloge.maintenant = Date.parse('2026-10-05T18:30:00Z');
  await session.demarrer();
});

describe('création rapide depuis « Nouvelle tâche »', () => {
  it('crée un sous-projet avec les mesures choisies dans le catalogue', () => {
    const rubrique = magasin.lignes.rubriques[0].id;
    const projet = ajouterProjet(rubrique, 'Projet éclair');
    const catalogue = cataloguerMesures(magasin.lignes.metriques);
    const prendre = (...cles: string[]) => catalogue.filter((c) => cles.includes(c.cle)).map((c) => c.metrique);
    const a = creerSousProjetRapide(projet, 'Sprint', prendre('temps', 'fois', 'distance'), '2026-10-05');
    const b = creerSousProjetRapide(projet, 'Court', prendre('temps'), '2026-10-05');
    expect(sousProjetsDe(projet).map((s) => s.nom)).toEqual(['Sprint', 'Court']);
    expect(metriquesDe(a).map((m) => m.type)).toEqual(['temps', 'fois', 'distance']);
    expect(metriquesDe(b).map((m) => m.type)).toEqual(['temps']);
    expect(sousProjetsDe(projet)[0].statut).toBe('en_cours');
  });

  it('le catalogue n’a aucun doublon et contient les mesures des modèles et des projets', () => {
    const catalogue = cataloguerMesures(magasin.lignes.metriques);
    const cles = catalogue.map((c) => c.cle);
    expect(new Set(cles).size).toBe(cles.length);
    expect(cles).toEqual(expect.arrayContaining(['temps', 'fois', 'distance', 'poids', 'note', 'oui_non', 'heure', 'pourcentage', 'nombre:chapitres', 'reference:passages']));
    expect(catalogue.find((c) => c.cle === 'temps')?.nom).toBe('Temps');
    expect(catalogue.find((c) => c.cle === 'montant:entrees')?.nom).toBe('Entrées');
  });
});
