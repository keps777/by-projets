import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from '../../data/magasin.svelte.ts';
import { session } from '../../data/auth.svelte.ts';
import { horloge } from '../../data/temps.svelte.ts';
import { ajouterTache } from '../../data/actions/taches.ts';
import { blocsDuJour } from '../../data/requetes.ts';
import { choixMensuels, construireRegle, prevuParDefaut, resume, texteJours, unionMesures, type MetriqueSource } from './tache.ts';
import { modifierOccurrence, modifierSerie, modifierSuivantes } from './edition.ts';
import { disposer } from './disposition.ts';

const M = (cle: string, type: MetriqueSource['type'], nom: string, unite = '', cible: number | null = null, periode_cible: MetriqueSource['periode_cible'] = 'jour'): MetriqueSource => ({ cle, type, nom, unite, cible, periode_cible, options: null });

describe('formulaire de tâche', () => {
  it('réunit les mesures des sous-projets sans doublon, le temps en dernier', () => {
    const u = unionMesures([
      { nom: '7 chapitres par jour', metriques: [M('nombre:chapitres', 'nombre', 'Chapitres lus', 'chapitres', 7), M('temps', 'temps', 'Temps', 'min', 2700), M('reference:passages', 'reference', 'Passages')] },
      { nom: 'Nouveau Testament', metriques: [M('nombre:chapitres', 'nombre', 'Chapitres', 'chapitres', 260, 'total')] }
    ]);
    expect(u.map((m) => m.cle)).toEqual(['nombre:chapitres', 'reference:passages', 'temps']);
    expect(u[0].alimente).toEqual(['7 chapitres par jour', 'Nouveau Testament']);
    expect(unionMesures([]).map((m) => m.cle)).toEqual(['temps']);
  });
  it('propose une valeur prévue à partir de l’objectif', () => {
    expect(prevuParDefaut({ type: 'temps', cible: null, periode: null, options: null }, 45, 1)).toBe(2700);
    expect(prevuParDefaut({ type: 'nombre', cible: 7, periode: 'jour', options: null }, 45, 1)).toBe(7);
    expect(prevuParDefaut({ type: 'fois', cible: 6, periode: 'semaine', options: null }, 45, 3)).toBe(2);
    expect(prevuParDefaut({ type: 'reference', cible: null, periode: null, options: null }, 45, 1)).toBeNull();
    expect(prevuParDefaut({ type: 'fois', cible: null, periode: null, options: null }, 45, 1)).toBe(1);
  });
  it('construit la règle de récurrence', () => {
    const base = { debut: '2026-10-08', jours: [3, 0, 3], mensuel: 'jour_du_mois' as const, fin: 'fois' as const, finDate: '2026-10-31', finFois: 10 };
    expect(construireRegle({ ...base, rec: 'hebdo' })).toEqual({ frequence: 'hebdo', debut: '2026-10-08', jours: [0, 3], fin: { type: 'fois', fois: 10 } });
    expect(construireRegle({ ...base, rec: 'une_fois' })).toEqual({ frequence: 'une_fois', debut: '2026-10-08', fin: { type: 'aucune' } });
    expect(construireRegle({ ...base, rec: 'mensuel', mensuel: 'rang' }).mensuel).toEqual({ mode: 'rang', rang: 2, jour: 3 });
    expect(choixMensuels('2026-10-08').map((c) => c.label)).toEqual(['Le 8 de chaque mois', 'Le 2ᵉ jeudi du mois']);
    expect(texteJours([2, 0])).toBe('2 fois par semaine · lun., mer.');
  });
  it('résume la tâche', () => {
    const regle = construireRegle({ debut: '2026-10-08', rec: 'hebdo', jours: [3], mensuel: 'jour_du_mois', fin: 'aucune', finDate: '', finFois: 1 });
    expect(resume({ titre: 'Rencontre avec Christopher', heure: 1140, duree: 45, regle, nbSousProjets: 1, avecProjet: true, rappel: 10 }))
      .toBe('Rencontre avec Christopher · 19:00–19:45 · chaque jeudi · alimente 1 sous-projet · rappel 10 min avant');
  });
});

describe('modifier une tâche (avec le magasin)', () => {
  const NOW = Date.parse('2026-10-05T09:00:00Z'); // 05:00 à Toronto, lundi
  const regle = { frequence: 'hebdo' as const, debut: '2026-10-05', jours: [0, 3], fin: { type: 'aucune' as const } };
  const base = { titre: 'Rencontre', projetId: null, regle, heureDebut: 19 * 60, dureeMin: 45, rappelMin: 10 };

  beforeEach(async () => {
    await magasin.fermer();
    await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
    horloge.maintenant = NOW;
    await session.demarrer();
  });

  it('toute la série : les occurrences à venir prennent la nouvelle heure', () => {
    const id = ajouterTache(base);
    modifierSerie(id, { ...base, heureDebut: 20 * 60 }, '2026-10-05');
    const b = blocsDuJour('2026-10-08').filter((x) => x.tache.id === id);
    expect(b).toHaveLength(1);
    expect(b[0].debutMin).toBe(20 * 60);
  });

  it('celle-ci et les suivantes : l’ancienne série s’arrête la veille', () => {
    const id = ajouterTache(base);
    const nouvelle = modifierSuivantes(id, '2026-10-12', { ...base, titre: 'Rencontre (nouvelle heure)', heureDebut: 18 * 60 });
    expect(blocsDuJour('2026-10-08').map((b) => b.tache.id)).toEqual([id]);
    const lundi = blocsDuJour('2026-10-12');
    expect(lundi.map((b) => b.tache.id)).toEqual([nouvelle]);
    expect(lundi[0].debutMin).toBe(18 * 60);
  });

  it('cette occurrence : seule elle change d’heure et de durée', () => {
    const id = ajouterTache(base);
    const occ = blocsDuJour('2026-10-08')[0].occ;
    modifierOccurrence(occ.id, '2026-10-08', 7 * 60, 30, 5);
    const b = blocsDuJour('2026-10-08')[0];
    expect([b.debutMin, b.finMin, b.occ.exception]).toEqual([7 * 60, 7 * 60 + 30, true]);
    expect(blocsDuJour('2026-10-12').find((x) => x.tache.id === id)?.debutMin).toBe(19 * 60);
  });

  it('dispose côte à côte deux blocs du même créneau', () => {
    ajouterTache(base);
    ajouterTache({ ...base, titre: 'Appel' });
    const blocs = blocsDuJour('2026-10-08');
    expect(disposer(blocs.map((b) => ({ debut: b.debutMin, fin: b.finMin }))).map((p) => p.cols)).toEqual([2, 2]);
  });
});

describe('résumé avec plusieurs rappels', () => {
  const base = { titre: 'Visite', heure: 600, duree: 60, regle: { frequence: 'une_fois', debut: '2026-10-06', fin: { type: 'aucune' } } as never, nbSousProjets: 0, avecProjet: false };
  it('nomme chaque délai, du plus lointain au plus proche', () => {
    expect(resume({ ...base, rappel: 10, rappelsAvant: [120, 1440] })).toContain('rappels 1 jour, 2 h, 10 min avant');
    expect(resume({ ...base, rappel: null, rappelsAvant: [] })).toContain('sans rappel');
    expect(resume({ ...base, rappel: 0 })).toContain('rappel à l’heure');
  });
});
