import { describe, expect, it } from 'vitest';
import { ajouterRecent, entree, filtrer, grouper, normaliser } from './recherche.ts';
import { bornesGrille, cibleHebdo, dureeProposee, hmin, joursDeLaSemaine, numeroSemaine, trouverCreneau } from './semaine.ts';
import { chargeDuJour, grilleMois, hauteurCharge, partEcoulee, statsMois } from './mois.ts';
import { depuisAffichage, versAffichage } from './saisie.ts';
import { jourValide, moisValide } from './navigation.ts';

describe('recherche', () => {
  const index = [
    entree('projets', 'L’évangélisation', 'Service à Dieu · 2 sous-projets', '#34D1B6', '/p1'),
    entree('taches', 'Prière seule', 'Tous les jours · 06:15 – 07:00', '#9D8CFF', '/t1', ['PA']),
    entree('notes', 'Mt 7:24 : bâtir sur le roc', '5 oct. · Lecture de la Bible · note', '#9D8CFF', '/n1'),
    entree('sous', '7 chapitres par jour', 'La lecture de la Bible · 23 chapitres sur 217', '#9D8CFF', '/s1')
  ];
  it('ignore accents et casse', () => {
    expect(normaliser('ÉVANGÉLISATION')).toBe('evangelisation');
    expect(filtrer(index, 'evangelisation').map((e) => e.href)).toEqual(['/p1']);
    expect(filtrer(index, 'priere').map((e) => e.href)).toEqual(['/t1']);
    expect(filtrer(index, 'BATIR').map((e) => e.href)).toEqual(['/n1']);
  });
  it('exige tous les mots et respecte le filtre', () => {
    expect(filtrer(index, 'bible').map((e) => e.href)).toEqual(['/n1', '/s1']);
    expect(filtrer(index, 'bible note').map((e) => e.href)).toEqual(['/n1']);
    expect(filtrer(index, 'bible', 'sous').map((e) => e.href)).toEqual(['/s1']);
    expect(filtrer(index, '   ')).toEqual([]);
  });
  it('cherche aussi dans les mots associés (code du point)', () => {
    expect(filtrer(index, 'pa').map((e) => e.href)).toContain('/t1');
  });
  it('groupe dans l’ordre projets, sous-projets, tâches, notes, rapports', () => {
    expect(grouper(filtrer(index, 'e')).map((g) => g.type)).toEqual(['projets', 'sous', 'taches', 'notes']);
  });
  it('garde 6 recherches récentes sans doublon', () => {
    let l: string[] = [];
    for (const q of ['bible', 'budget', 'Bïble', 'a', 'b', 'c', 'd', 'e']) l = ajouterRecent(l, q);
    expect(l).toEqual(['e', 'd', 'c', 'b', 'a', 'Bïble']);
  });
});

describe('semaine', () => {
  it('donne les 7 jours du lundi au dimanche', () => {
    expect(joursDeLaSemaine('2026-10-08')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  });
  it('calcule le numéro de semaine ISO', () => {
    expect(numeroSemaine('2026-10-05')).toBe(41);
    expect(numeroSemaine('2026-01-01')).toBe(1);
    expect(numeroSemaine('2027-01-01')).toBe(53);
  });
  it('élargit la grille quand un bloc déborde de 05:00 – 23:00', () => {
    expect(bornesGrille([])).toEqual({ debut: 300, fin: 1380 });
    expect(bornesGrille([{ debutMin: 270, finMin: 300 }, { debutMin: 1380, finMin: 1410 }])).toEqual({ debut: 240, fin: 1440 });
    expect(hmin(750)).toBe('12h30');
  });
  it('ramène un objectif à la semaine', () => {
    const sp = { debut: '2026-10-01', fin: null };
    expect(cibleHebdo({ cible: 7200, periode: 'jour' }, sp, '2026-10')).toBe(50400);
    expect(cibleHebdo({ cible: 18000, periode: 'semaine' }, sp, '2026-10')).toBe(18000);
    expect(cibleHebdo({ cible: 3100, periode: 'mois' }, sp, '2026-10')).toBe(700);
    expect(cibleHebdo({ cible: 100, periode: 'total' }, sp, '2026-10')).toBeNull();
    expect(dureeProposee(10 * 60)).toBeNull();
    expect(dureeProposee(50 * 60)).toBe(60);
    expect(dureeProposee(10 * 3600)).toBe(120);
  });
  it('trouve un créneau libre le soir, sinon dans la journée, en évitant les jours déjà servis', () => {
    const occupe = { debut: 18 * 60, fin: 22 * 60, titre: 'Soirée' };
    const c = { '2026-10-06': [occupe], '2026-10-07': [] };
    expect(trouverCreneau(c, ['2026-10-06', '2026-10-07'], 60)).toEqual({ jour: '2026-10-07', debut: 18 * 60 });
    expect(trouverCreneau(c, ['2026-10-06'], 60)).toEqual({ jour: '2026-10-06', debut: 7 * 60 });
    expect(trouverCreneau(c, ['2026-10-07'], 60, { jour: '2026-10-07', min: 19 * 60 + 10 })).toEqual({ jour: '2026-10-07', debut: 19 * 60 + 30 });
    expect(trouverCreneau({}, ['2026-10-06', '2026-10-07'], 60, undefined, new Set(['2026-10-06']))).toEqual({ jour: '2026-10-07', debut: 18 * 60 });
  });
});

describe('mois', () => {
  it('commence la grille le lundi', () => {
    const g = grilleMois('2026-10');
    expect(g.avant).toBe(3);
    expect(g.jours).toHaveLength(31);
  });
  it('additionne la charge par rubrique', () => {
    const c = chargeDuJour([{ debutMin: 300, finMin: 330, couleur: '#A', fait: true }, { debutMin: 400, finMin: 460, couleur: '#B', fait: false }, { debutMin: 500, finMin: 530, couleur: '#A', fait: false }]);
    expect(c).toEqual({ minutes: 120, segments: [{ couleur: '#A', minutes: 60 }, { couleur: '#B', minutes: 60 }], faits: 1, total: 3 });
    expect(hauteurCharge(720)).toBe(34);
    expect(hauteurCharge(30)).toBe(8);
  });
  it('donne la part du mois écoulée et les statistiques', () => {
    expect(partEcoulee('2026-10', '2026-10-05')).toBe(16);
    expect(partEcoulee('2026-09', '2026-10-05')).toBe(100);
    expect(partEcoulee('2026-11', '2026-10-05')).toBe(0);
    const ch = (minutes: number, faits: number, total: number) => ({ minutes, segments: [], faits, total });
    const s = statsMois([{ jour: '2026-10-01', charge: ch(600, 1, 2) }, { jour: '2026-10-02', charge: ch(900, 2, 2) }, { jour: '2026-10-09', charge: ch(300, 0, 1) }], '2026-10-05');
    expect(s).toEqual({ moyenneMin: 600, accompliPct: 75, pic: '2026-10-02' });
  });
});

describe('saisie directe et paramètres', () => {
  it('convertit l’unité affichée en unité de base', () => {
    expect(versAffichage('temps', 2700)).toBe(45);
    expect(depuisAffichage('temps', '20')).toBe(1200);
    expect(depuisAffichage('montant', '68,40')).toBe(6840);
    expect(depuisAffichage('distance', '5,5')).toBe(5500);
    expect(depuisAffichage('nombre', 'abc')).toBeNull();
    expect(depuisAffichage('nombre', '-2')).toBeNull();
  });
  it('valide les jours et les mois passés dans l’adresse', () => {
    expect(jourValide('2026-10-05')).toBe('2026-10-05');
    expect(jourValide('2026-02-30')).toBeNull();
    expect(jourValide('hier')).toBeNull();
    expect(moisValide('2026-13')).toBeNull();
    expect(moisValide('2026-10')).toBe('2026-10');
  });
});
