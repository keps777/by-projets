import { describe, it, expect } from 'vitest';
import { formaterRapport, enteteRapport, mesuresDuPoint, attenduDuJour, attenduEntre, formaterMesure, itemsDesLivres, formaterPoint } from './rapport.ts';
import type { Metrique, ValeurSaisie } from './types.ts';
import { MODELES, modelesDeLaRubrique } from './modeles.ts';
import { RUBRIQUES_DEFAUT, POINTS_DEFAUT } from './defauts.ts';
import { ORDRE_TYPES, TYPES, cleMetrique } from './metriques.ts';

const min = (n: number) => n * 60;

describe('rapport : format de référence de la spec §9', () => {
  const texte = formaterRapport({
    langue: 'en', nom: 'Luther Kevin K.', entete: { type: 'jour', debut: '2026-10-04' },
    points: [
      { code: 'DDEWG', mesures: [{ type: 'fois', fait: 2, attendu: 3 }, { type: 'temps', fait: min(28), approx: true, details: ['0h12', '~0h16'] }] },
      { code: 'PA', mesures: [{ type: 'temps', fait: min(135), attendu: min(120), approx: true }] },
      { code: 'BR', mesures: [{ type: 'nombre', unite: 'ch', fait: 0, attendu: 7 }, { type: 'reference', fait: null, texte: '' }, { type: 'temps', fait: 0, attendu: min(45) }] },
      { code: 'CL', mesures: [], items: [{ titre: 'L’agressivité spirituelle', auteur: 'ZTF', mesures: [
        { type: 'nombre', unite: 'p.', fait: 166, attendu: 417 }, { type: 'nombre', unite: 'p.', fait: 24, prefixe: '+' }, { type: 'temps', fait: min(35), attendu: min(30) }] }] },
      { code: 'PWO', mesures: [{ type: 'temps', fait: 0, attendu: min(60) }] }
    ]
  });
  it('reproduit exactement le rapport de l’utilisateur, métriques séparées par des points-virgules', () => {
    expect(texte).toBe([
      '*Report · October 4, 2026 · Luther Kevin K.*',
      '',
      '1. *DDEWG* : 2/3; ~0h28',
      '',
      '2. *PA* : ~2h15/2h00',
      '',
      '3. *BR* : 0/7 ch; ref. —; 0h00/0h45',
      '',
      '4. *CL* :',
      '   • _L’agressivité spirituelle_ (ZTF) : 166/417 p.; +24 p.; 0h35/0h30',
      '',
      '5. *PWO* : 0h00/1h00'
    ].join('\n'));
  });
  it('s’écrit aussi en français', () => {
    expect(enteteRapport({ type: 'jour', debut: '2026-10-04' }, 'Luther', 'fr')).toBe('*Rapport · 4 octobre 2026 · Luther*');
    expect(enteteRapport({ type: 'mois', debut: '2026-09-01' }, 'Luther', 'fr')).toBe('*Rapport du mois · septembre 2026 · Luther*');
    expect(enteteRapport({ type: 'semaine', debut: '2026-09-28', fin: '2026-10-04' }, 'Luther', 'en')).toBe('*Weekly report · Sep 28 – Oct 4, 2026 · Luther*');
    expect(formaterMesure({ type: 'reference', fait: null, texte: 'Mt 8–10' }, 'fr')).toBe('réf. Mt 8–10');
  });
  it('formate les autres types', () => {
    expect(formaterMesure({ type: 'montant', fait: 5000, attendu: 5000 })).toBe('50 $/50 $');
    expect(formaterMesure({ type: 'montant', fait: 6840 })).toBe('68,40 $');
    expect(formaterMesure({ type: 'oui_non', fait: 1 })).toBe('oui');
    expect(formaterMesure({ type: 'choix', fait: 0.5 })).toBe('Partiel');
    expect(formaterMesure({ type: 'distance', fait: 5000, attendu: 5000 })).toBe('5/5 km');
    expect(formaterMesure({ type: 'heure', fait: 310 })).toBe('05:10');
  });
});

describe('construction des mesures depuis les saisies', () => {
  const sp = { debut: '2026-10-01', fin: '2026-10-31' };
  const chap: Metrique = { id: 'a', cle: 'nombre:chapitres', type: 'nombre', nom: 'Chapitres', unite: 'ch', cible: 7, periode: 'jour', sens: 'plus', dansRapport: true };
  const tps: Metrique = { id: 'b', cle: 'temps', type: 'temps', nom: 'Temps', unite: 'min', cible: min(45), periode: 'jour', sens: 'plus', dansRapport: true };
  const ref: Metrique = { id: 'c', cle: 'reference:passages', type: 'reference', nom: 'Passages', unite: '', cible: null, periode: 'jour', sens: 'plus', dansRapport: true };
  const v: ValeurSaisie[] = [
    { cle: 'nombre:chapitres', jour: '2026-10-05', valeur: 3 }, { cle: 'temps', jour: '2026-10-05', valeur: min(22) },
    { cle: 'reference:passages', jour: '2026-10-05', valeur: 0, texte: 'Matthieu 8–10' }
  ];
  it('un jour : fait et attendu', () => {
    const ms = mesuresDuPoint([{ metrique: chap, sousProjet: sp }, { metrique: ref, sousProjet: sp }, { metrique: tps, sousProjet: sp }], v, '2026-10-05', '2026-10-05');
    expect(ms.map((m) => formaterMesure(m, 'fr')).join('; ')).toBe('3/7 ch; réf. Matthieu 8–10; 0h22/0h45');
  });
  it('une semaine : somme du fait et de l’attendu', () => {
    const ms = mesuresDuPoint([{ metrique: chap, sousProjet: sp }], v, '2026-10-05', '2026-10-11');
    expect(formaterMesure(ms[0], 'fr')).toBe('3/49 ch');
  });
  it('attendu d’une journée selon la période de la cible', () => {
    expect(attenduDuJour({ ...chap, cible: 260, periode: 'total' }, sp, '2026-10-05')).toBeCloseTo(260 / 31);
    expect(attenduDuJour({ ...chap, cible: 14, periode: 'semaine' }, sp, '2026-10-05')).toBe(2);
    expect(attenduDuJour(chap, sp, '2026-11-02')).toBeNull();
    expect(attenduEntre(chap, sp, '2026-10-01', '2026-10-31')).toBe(217);
  });
});

describe('données de départ', () => {
  it('24 projets, sans le projet 24', () => {
    const projets = RUBRIQUES_DEFAUT.flatMap((r) => r.projets);
    expect(projets).toHaveLength(24);
    expect(projets.some((p) => p.numero === 24)).toBe(false);
  });
  it('chaque point de rapport est rattaché à un projet qui existe', () => {
    const numeros = new Set(RUBRIQUES_DEFAUT.flatMap((r) => r.projets.map((p) => p.numero)));
    expect(POINTS_DEFAUT).toHaveLength(12);
    for (const p of POINTS_DEFAUT) expect(numeros.has(p.projet)).toBe(true);
  });
  it('les modèles couvrent les quatre rubriques et utilisent des types connus', () => {
    for (const r of ['dieu', 'service', 'travail', 'vie'] as const) expect(modelesDeLaRubrique(r).length).toBeGreaterThan(2);
    for (const m of MODELES) for (const x of m.metriques) expect(ORDRE_TYPES).toContain(x.type);
    expect(ORDRE_TYPES.every((t) => t in TYPES)).toBe(true);
    expect(cleMetrique('nombre', 'chapitres')).toBe(MODELES[0].metriques[0].cle);
  });

  it('le détail des séances ne sort que pour l’affichage de la page, jamais dans le texte exporté', () => {
    const m = { type: 'temps' as const, fait: 11280, attendu: 10800, details: ['1h55', '0h40', '0h10', '0h02', '0h03', '0h08', '0h09'] };
    expect(formaterMesure(m)).toBe('3h08/3h00');
    expect(formaterMesure(m, 'fr', true)).toBe('3h08/3h00 (1h55; 0h40; 0h10; 0h02; 0h03; 0h08; 0h09)');
  });

  describe('livres d’un point (CL)', () => {
    const livres = [
      { id: 'a', titre: 'Le chemin de la vie', auteur: 'ZTF', total: 120, depart: 92, actif: true },
      { id: 'b', titre: 'Le chemin de l’obéissance', auteur: 'ZTF', total: 130, depart: 85, actif: true },
      { id: 'c', titre: 'Pas lu aujourd’hui', auteur: '', total: 200, depart: 10, actif: true },
      { id: 'd', titre: 'Retiré', auteur: '', total: 50, depart: 0, actif: false }
    ];
    const lectures = [
      { cle: 'livre:a', jour: '2026-10-06', valeur: 0 }, { cle: 'livre:a', jour: '2026-10-07', valeur: 8 },
      { cle: 'livre:b', jour: '2026-10-07', valeur: 5 }, { cle: 'livre:b', jour: '2026-10-08', valeur: 40 },
      { cle: 'livre:d', jour: '2026-10-07', valeur: 9 }
    ];
    it('liste les livres lus ce jour-là, cumul sur total, sans les livres retirés', () => {
      const items = itemsDesLivres(livres, lectures, '2026-10-07', '2026-10-07');
      expect(items.map((i) => i.titre)).toEqual(['Le chemin de la vie', 'Le chemin de l’obéissance']);
      expect(items[0].livre).toEqual({ cumul: 100, total: 120, periode: 8 });
      expect(items[1].livre).toEqual({ cumul: 90, total: 130, periode: 5 }); // la lecture du 8 n'est pas comptée
    });
    it('écrit le point dans le format du rapport : mesures du point, puis une ligne par livre', () => {
      const items = itemsDesLivres(livres, lectures, '2026-10-07', '2026-10-07');
      const point = { code: 'CL', mesures: [{ type: 'nombre' as const, unite: 'pages', fait: 12 }, { type: 'temps' as const, fait: 1800 }], items };
      expect(formaterPoint(4, point)).toBe([
        '4. *CL* : 12 pages; 0h30',
        '   • Le chemin de la vie (ZTF) : 100/120p (+8p auj.)',
        '   • Le chemin de l’obéissance (ZTF) : 90/130p (+5p auj.)'
      ].join('\n'));
      expect(formaterPoint(4, point, 'en')).toContain('100/120p (+8p today)');
    });
    it('sur une période, pas de « auj. » ; sans total, juste les pages', () => {
      const items = itemsDesLivres([{ ...livres[0], total: null }], lectures, '2026-10-05', '2026-10-11');
      expect(formaterPoint(1, { code: 'CL', mesures: [], items }, 'fr', false)).toBe('1. *CL* :\n   • Le chemin de la vie (ZTF) : 100p (+8p)');
    });
  });
});
