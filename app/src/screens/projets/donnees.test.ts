import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { MODELES } from '@core/modeles.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { session } from '../../data/auth.svelte.ts';
import { horloge } from '../../data/temps.svelte.ts';
import { creerDepuisModele } from '../../data/actions/projets.ts';
import { progressionSousProjet, valeursDuProjet } from '../../data/requetes.ts';
import { ajouterMouvement, contenuDuJour, lireDetail, saisiesDuProjet, saisirJour } from './donnees.ts';

beforeEach(async () => {
  await magasin.fermer();
  await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
  horloge.maintenant = Date.parse('2026-10-05T14:00:00Z');
  await session.demarrer();
});

const projet = (nom: string) => magasin.lignes.projets.find((p) => p.nom === nom)!;
const total = (pid: string, cle: string, jour: string) => valeursDuProjet(pid).filter((v) => v.cle === cle && v.jour === jour).reduce((s, v) => s + v.valeur, 0);

describe('saisie manuelle d’un jour', () => {
  it('le total du jour devient la valeur tapée, sans doublon', () => {
    const p = projet('La lecture de la Bible');
    saisirJour(p.id, '2026-10-02', [{ cle: 'nombre:chapitres', type: 'nombre', num: 9 }, { cle: 'reference:passages', type: 'reference', txt: 'Marc 1–9' }], '2026-10-05');
    saisirJour(p.id, '2026-10-02', [{ cle: 'nombre:chapitres', type: 'nombre', num: 6 }], '2026-10-05');
    expect(total(p.id, 'nombre:chapitres', '2026-10-02')).toBe(6);
    expect(magasin.lignes.saisies.filter((s) => s.projet_id === p.id)).toHaveLength(1);
    expect(magasin.lignes.saisies[0].source).toBe('rattrapage');
    expect(contenuDuJour(p.id, '2026-10-02').get('reference:passages')?.manuelTxt).toBe('Marc 1–9');
  });

  it('ajuste par différence quand un bloc a déjà enregistré une valeur', () => {
    const p = projet('La lecture de la Bible');
    magasin.ecrireLot([
      ['saisies', { id: 's1', projet_id: p.id, occurrence_id: null, jour: '2026-10-05', source: 'bloc', note: null, approx: false }],
      ['saisie_valeurs', { id: 'v1', saisie_id: 's1', cle: 'nombre:chapitres', valeur_num: 3, valeur_txt: null, detail: null }]
    ]);
    saisirJour(p.id, '2026-10-05', [{ cle: 'nombre:chapitres', type: 'nombre', num: 7 }], '2026-10-05');
    expect(total(p.id, 'nombre:chapitres', '2026-10-05')).toBe(7);
    expect(magasin.trouver('saisie_valeurs', 'v1')?.valeur_num).toBe(3);
  });

  it('nourrit la progression du sous-projet (spec §5 : 23 / 217 → 11 %)', () => {
    const p = projet('La lecture de la Bible');
    const id = creerDepuisModele(MODELES[0], p.id, '2026-10-01', '2026-10-31');
    [7, 9, 4, 0, 3].forEach((n, i) => saisirJour(p.id, `2026-10-0${i + 1}`, [{ cle: 'nombre:chapitres', type: 'nombre', num: n }], '2026-10-05'));
    const r = progressionSousProjet(magasin.trouver('sous_projets', id)!, '2026-10', '2026-10-05');
    expect(r.progression?.realise).toBe(23);
    expect(r.progression?.pct).toBe(11);
  });
});

describe('finances', () => {
  it('un mouvement = une saisie avec sa catégorie', () => {
    const p = projet('La gestion de mes finances');
    ajouterMouvement(p.id, '2026-10-05', 'montant:sorties', 6840, { libelle: 'Épicerie', categorie: 'Alimentation' }, '2026-10-05');
    ajouterMouvement(p.id, '2026-10-01', 'montant:entrees', 290000, { libelle: 'Salaire' }, '2026-10-05');
    const s = saisiesDuProjet(p.id, '2026-10-01', '2026-10-31');
    expect(s).toHaveLength(2);
    expect(s[0].valeurs[0].detail).toEqual({ libelle: 'Épicerie', categorie: 'Alimentation' });
    expect(total(p.id, 'montant:entrees', '2026-10-01')).toBe(290000);
    // Forme fixe { libelle, categorie } : champ absent = null ; anciennes formes relues.
    expect(s[1].valeurs[0].detail).toEqual({ libelle: 'Salaire', categorie: null });
    expect(lireDetail({ nom: 'Loyer', 'catégorie': 'Logement' })).toEqual({ libelle: 'Loyer', categorie: 'Logement' });
    expect(lireDetail([{ livre: 'Mt' }])).toEqual({ libelle: null, categorie: null });
  });
});
