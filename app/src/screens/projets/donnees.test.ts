import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { MODELES } from '@core/modeles.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { session } from '../../data/auth.svelte.ts';
import { horloge } from '../../data/temps.svelte.ts';
import { creerDepuisModele, creerSousProjet } from '../../data/actions/projets.ts';
import { ajouterTache } from '../../data/actions/taches.ts';
import { terminerBloc } from '../../data/actions/blocs.ts';
import { assurerFinancesDuMois } from '../../data/actions/defauts.ts';
import { progressionSousProjet, valeursDuProjet, valeursDuSousProjet } from '../../data/requetes.ts';
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

describe('corriger un jour depuis un sous-projet reste local à ce sous-projet', () => {
  const m = { type: 'temps' as const, nom: 'Temps', unite: 'min', cible: 540, periode_cible: 'jour' as const, sens: 'plus' as const, dans_rapport: true };
  const prepare = () => {
    const p = projet('Mon projet d’entrepreneuriat');
    const a = creerSousProjet({ projetId: p.id, nom: 'A', debut: '2026-10-01', fin: null, reprisePasse: true, metriques: [m] });
    const b = creerSousProjet({ projetId: p.id, nom: 'B', debut: '2026-10-01', fin: null, reprisePasse: true, metriques: [m] });
    // Une saisie partagée du projet : 2 h 14 de temps le 19 (bloc, chrono…).
    saisirJour(p.id, '2026-10-19', [{ cle: 'temps', type: 'temps', num: 8040 }], '2026-10-20');
    return { p, a: magasin.trouver('sous_projets', a)!, b: magasin.trouver('sous_projets', b)! };
  };
  const temps = (vs: { cle: string; jour: string; valeur: number }[]) => vs.filter((x) => x.cle === 'temps' && x.jour === '2026-10-19').reduce((s, x) => s + x.valeur, 0);

  it('le sous-projet voit son temps corrigé ; l’autre sous-projet et le projet gardent le temps partagé', () => {
    const { p, a, b } = prepare();
    expect(temps(valeursDuSousProjet(a))).toBe(8040);
    saisirJour(p.id, '2026-10-19', [{ cle: 'temps', type: 'temps', num: 3600 }], '2026-10-20', undefined, a.id);
    expect(temps(valeursDuSousProjet(a))).toBe(3600);
    expect(temps(valeursDuSousProjet(b))).toBe(8040);
    expect(temps(valeursDuProjet(p.id))).toBe(8040); // ce que lit le rapport
  });

  it('rouvrir la correction montre le total corrigé, et la corriger de nouveau ne crée pas de doublon', () => {
    const { p, a } = prepare();
    saisirJour(p.id, '2026-10-19', [{ cle: 'temps', type: 'temps', num: 3600 }], '2026-10-20', undefined, a.id);
    expect(contenuDuJour(p.id, '2026-10-19', a.id).get('temps')!.manuel).toBe(3600 - 8040);
    saisirJour(p.id, '2026-10-19', [{ cle: 'temps', type: 'temps', num: 9000 }], '2026-10-20', undefined, a.id);
    expect(temps(valeursDuSousProjet(a))).toBe(9000);
    expect(magasin.lignes.saisies.filter((x) => x.sous_projet_id === a.id)).toHaveLength(1);
    // La saisie partagée n'a pas bougé.
    expect(contenuDuJour(p.id, '2026-10-19').get('temps')!.manuel).toBe(8040);
  });
});

describe('plusieurs temps dans un sous-projet', () => {
  it('un bloc terminé donne son temps réel à chaque temps nommé de la tâche, en plus du temps total', () => {
    const p = projet('Mon projet d’entrepreneuriat');
    const sp = creerSousProjet({
      projetId: p.id, nom: 'En vrai', debut: '2026-10-01', fin: null, reprisePasse: true,
      metriques: [
        { type: 'temps', nom: 'Prière', unite: 'min', cible: 3600, periode_cible: 'semaine', sens: 'plus', dans_rapport: true, cle: 'temps:priere' },
        { type: 'temps', nom: 'Évangélisation', unite: 'min', cible: 7200, periode_cible: 'jour', sens: 'plus', dans_rapport: false, cle: 'temps:evangelisation' }
      ]
    });
    const tache = ajouterTache({ titre: 'Sortie', projetId: p.id, regle: { frequence: 'une_fois', debut: '2026-10-05', fin: { type: 'aucune' } }, heureDebut: 330, dureeMin: 45, rappelMin: null, sousProjetIds: [sp], attendus: [{ cle: 'temps', valeur: 2700 }, { cle: 'temps:evangelisation', valeur: 2700 }] });
    const occ = magasin.lignes.occurrences.find((o) => o.tache_id === tache && o.jour === '2026-10-05')!;
    terminerBloc(occ.id);
    const v = valeursDuProjet(p.id).filter((x) => x.jour === '2026-10-05');
    expect(v.find((x) => x.cle === 'temps')!.valeur).toBe(2700);
    expect(v.find((x) => x.cle === 'temps:evangelisation')!.valeur).toBe(2700);
    expect(v.find((x) => x.cle === 'temps:priere')).toBeUndefined();
  });

  it('un temps nommé saisi à la main entre aussi dans le temps total du jour', () => {
    const p = projet('Mon projet d’entrepreneuriat');
    saisirJour(p.id, '2026-10-05', [{ cle: 'temps:priere', type: 'temps', num: 3600 }], '2026-10-05');
    saisirJour(p.id, '2026-10-05', [{ cle: 'temps:priere', type: 'temps', num: 5400 }], '2026-10-05');
    const v = valeursDuProjet(p.id).filter((x) => x.jour === '2026-10-05');
    expect(v.filter((x) => x.cle === 'temps:priere').reduce((s, x) => s + x.valeur, 0)).toBe(5400);
    expect(v.filter((x) => x.cle === 'temps').reduce((s, x) => s + x.valeur, 0)).toBe(5400);
  });
});

describe('finances', () => {
  it('« Gestion de mes finances du mois » est créé une fois par défaut, avec entrées, sorties et épargne', () => {
    assurerFinancesDuMois('2026-10-11');
    assurerFinancesDuMois('2026-10-11');
    const p = projet('La gestion de mes finances');
    const sps = magasin.lignes.sous_projets.filter((x) => x.projet_id === p.id && x.nom === 'Gestion de mes finances du mois');
    expect(sps).toHaveLength(1);
    expect(sps[0]).toMatchObject({ debut: '2026-10-01', fin: null, statut: 'en_cours' });
    expect(magasin.lignes.metriques.filter((m) => m.sous_projet_id === sps[0].id).map((m) => m.cle)).toEqual(['montant:entrees', 'montant:sorties', 'montant:epargne']);
  });

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
