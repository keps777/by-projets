import { describe, expect, it } from 'vitest';
import { courbe as courbeSeed } from '../../data/seed.ts';
import { bornesSeuil, calerSeuil, descriptionGraphique, ecartSeuil, echelle, fenetre, libellePeriode, lignesTableau, pasGraduation, probabilite, reperesDates, seuilParDefaut, serieOffre, tracer, variation, volumes, zoneSeuil } from './cours.ts';
import { chances, prixRapides } from './demandes.ts';
import { fenetreJours, jourCourt, jourSemaine, jours } from './format.ts';
import { courbe, dateVente, estimation, horizon, modeDe, pointsReference, xCurseur, yPrix } from './liquidite.ts';
import { bornesVente, caleVente, rangAnnonce, recu } from './vente.ts';

const NBSP = ' ', J = 86_400_000, MAINT = Date.parse('2026-10-12T09:00');

describe('formats', () => {
  it('dates courtes en français', () => {
    expect(jourCourt(MAINT)).toBe(`12${NBSP}oct.`); expect(jourSemaine(Date.parse('2026-12-18T18:05'))).toBe(`ven. 18${NBSP}déc.`);
    expect(fenetreJours('2027-02-15', '2027-02-28')).toBe(`15–28${NBSP}févr. 2027`); expect(fenetreJours('2027-02-25', '2027-03-04')).toBe(`25${NBSP}févr. – 4${NBSP}mars 2027`); expect(jours(1)).toBe('1 jour'); expect(jours(6)).toBe('6 jours');
  });
});

describe('courbe de cours', () => {
  const neuf = courbeSeed(2050, 816);
  it('garde les derniers points de chaque période', () => {
    expect(fenetre(neuf, '1S')).toHaveLength(8); expect(fenetre(neuf, '1M')).toHaveLength(31); expect(fenetre(neuf, '3M')).toHaveLength(90); expect(fenetre(neuf, 'Tout')).toHaveLength(90); expect(fenetre([1, 2], '1M')).toEqual([1, 2]);
    expect(fenetre(neuf, '1S').at(-1)).toBe(2050);
  });
  it('reconstitue la meilleure offre en finissant sur le prix du jour', () => {
    const o = serieOffre(neuf, 1500)!; expect(o).toHaveLength(90); expect(o.at(-1)).toBe(1500); expect(o.every((v) => v > 1000 && v < 2200)).toBe(true); expect(serieOffre(neuf, undefined)).toBeUndefined();
    expect(serieOffre(neuf, 1500)).toEqual(o);
  });
  it('variation signée', () => {
    expect(variation([1566, 1500])).toMatchObject({ sens: 'baisse', texte: `−4,2${NBSP}%` }); expect(variation([1000, 1100]).texte).toBe(`+10${NBSP}%`); expect(variation([5]).sens).toBe('stable'); expect(variation([100, 100]).texte).toBe(`0${NBSP}%`);
  });
  it('libellés de période et repères de dates', () => {
    expect(libellePeriode('1S', 8, MAINT)).toBe('sur 7 jours'); expect(libellePeriode('1M', 31, MAINT)).toBe('sur 1 mois'); expect(libellePeriode('3M', 90, MAINT)).toBe('sur 3 mois'); expect(libellePeriode('Tout', 90, MAINT)).toBe(`depuis le 15${NBSP}juil.`);
    expect(reperesDates(8, MAINT)).toEqual([`5${NBSP}oct.`, `9${NBSP}oct.`, `12${NBSP}oct.`]);
  });
  it('compte les transactions par jour', () => {
    expect(volumes([MAINT, MAINT - 2 * J, MAINT - 30 * J, MAINT], 8, MAINT)).toEqual([0, 0, 0, 0, 0, 1, 0, 2]);
  });
  it('trace les chemins SVG et les graduations', () => {
    const n = fenetre(neuf, '1S'), o = serieOffre(n, 1500)!, t = tracer(o, n, new Array(8).fill(0));
    expect(t.ligne.startsWith('M8.0,')).toBe(true); expect(t.ligne.match(/L/g)).toHaveLength(7); expect(t.dernierX).toBe(286); expect(t.aire.endsWith('Z')).toBe(true); expect(t.graduations.length).toBeGreaterThanOrEqual(3); expect(t.graduations.length).toBeLessThanOrEqual(6);
    expect(t.yNeuf).toBeLessThan(t.dernierY); expect(t.barres).toBe(''); expect(tracer(undefined, n, new Array(8).fill(1)).ligne).toBe('');
    expect(pasGraduation(1000, 2100)).toBe(500); expect(pasGraduation(1400, 2100)).toBe(200);
  });
  it('décrit le graphique et propose un tableau', () => {
    const n = fenetre(neuf, '1S'); expect(descriptionGraphique([1566, 1500], n, 'sur 7 jours', 3)).toContain('3 transactions'); expect(descriptionGraphique(undefined, n, 'sur 7 jours', 0)).toContain('Aucune offre');
    const l = lignesTableau(serieOffre(neuf, 1500), neuf, MAINT); expect(l.length).toBeLessThanOrEqual(8); expect(l.at(-1)).toMatchObject({ jour: `12${NBSP}oct.`, offre: 1500, neuf: 2050 });
  });
});

describe('seuil d’un ordre à cours limité', () => {
  it('bornes et calage au pas de 10 $, jamais au-dessus du plafond', () => {
    expect(bornesSeuil(2050)).toEqual({ min: 1000, max: 2050 }); expect(calerSeuil(2100, bornesSeuil(2050))).toBe(2050); expect(calerSeuil(1004, bornesSeuil(2050))).toBe(1000); expect(calerSeuil(1451, bornesSeuil(2050))).toBe(1450);
    expect(seuilParDefaut(1500, 2050)).toBe(1450); expect(seuilParDefaut(undefined, 2050)).toBe(1440);
  });
  it('écart signé avec la meilleure offre', () => {
    expect(ecartSeuil(1450, 1500)).toEqual({ texte: `−50${NBSP}$ (−3,3${NBSP}%) sous la meilleure offre`, sens: 'baisse' }); expect(ecartSeuil(1500, 1500).sens).toBe('egal'); expect(ecartSeuil(1550, 1500).texte).toBe(`+50${NBSP}$ (+3,3${NBSP}%) au-dessus de la meilleure offre`); expect(ecartSeuil(1400, undefined).sens).toBe('aucune');
  });
  it('zone du seuil', () => {
    expect(zoneSeuil(1500, 1500, 1420).zone).toBe('immediat'); expect(zoneSeuil(1450, 1500, 1420).zone).toBe('meilleure_demande'); expect(zoneSeuil(1400, 1500, 1420).zone).toBe('attente'); expect(zoneSeuil(1400, undefined, undefined).zone).toBe('meilleure_demande');
  });
  it('probabilité d’exécution selon l’écart et la validité', () => {
    expect(probabilite(1500, 1500, 2050, 'jour')).toEqual({ pct: 100, niveau: 'Immédiate' });
    const j = probabilite(1450, 1500, 2050, 'jour'), s = probabilite(1450, 1500, 2050, 'semaine'), d = probabilite(1450, 1500, 2050, 'depart');
    expect(j.pct).toBeLessThan(s.pct); expect(s.pct).toBeLessThan(d.pct); expect(s).toEqual({ pct: 48, niveau: 'Moyenne' }); expect(probabilite(1000, 1500, 2050, 'jour')).toEqual({ pct: 2, niveau: 'Faible' }); expect(probabilite(1500, undefined, 2050, 'semaine').niveau).toBe('Faible');
  });
  it('échelle autour des repères', () => { const e = echelle(1450, 1500, 1420); expect(e).toMatchObject({ lo: 1300, hi: 1600 }); expect(e.pos(1450)).toBeCloseTo(50); });
});

describe('vendre ou attendre', () => {
  it('modes du curseur', () => { expect([0, 15, 16, 50, 70, 71, 100].map(modeDe)).toEqual(['rachat', 'rachat', 'annonce', 'annonce', 'annonce', 'attente', 'attente']); });
  it('horizon : J-7 quand le départ est loin, J-1 sinon', () => {
    const dep = Date.parse('2026-12-14T18:05'), ech = dep - J; expect(horizon(dep, ech, MAINT)).toMatchObject({ label: 'J-7', jours: 56 });
    const proche = Date.parse('2026-10-15T09:00'); expect(horizon(proche, proche - J, MAINT)).toMatchObject({ label: 'J-1', jours: 2 });
  });
  it('trois points croissants, jamais au-dessus du prix neuf', () => {
    const [a, b, c] = pointsReference(2000, 56); expect(a.prix).toBeLessThan(b.prix); expect(b.prix).toBeLessThan(c.prix); expect(c.prix).toBeLessThanOrEqual(2000); expect([a.jours, b.jours, c.jours]).toEqual([1, 4, 56]); expect(b.prix).toBe(1640);
    expect(pointsReference(2000, 2)[1].jours).toBe(1);
  });
  it('estimation : rachat fixe net, annonce au prix suggéré avec commission Pass, attente plus haute mais moins certaine', () => {
    const r = estimation(0, 2000, 56, true); expect(r).toMatchObject({ mode: 'rachat', prix: 1280, net: 1280, commission: 0, jours: 0, mot: 'Élevée' });
    const a = estimation(50, 2000, 56, true); expect(a).toMatchObject({ mode: 'annonce', prix: 1640, jours: 4, commission: 164, net: 1476, mot: 'Moyenne' }); expect(estimation(50, 2000, 56, false).net).toBe(1435);
    const w = estimation(100, 2000, 56, true); expect(w.mode).toBe('attente'); expect(w.prix).toBeGreaterThan(a.prix); expect(w.cert).toBeLessThan(a.cert); expect(w.haut).toBeLessThanOrEqual(2000); expect(w.bas).toBeLessThan(w.prix); expect(w.jours).toBe(56);
    expect(estimation(30, 2000, 56, true).prix).toBeLessThan(a.prix); expect(estimation(30, 2000, 56, true).prix).toBeGreaterThan(estimation(16, 2000, 56, true).prix - 1);
  });
  it('géométrie : rachat sur la ligne de 1 280 $, plafond en haut', () => {
    const c = courbe(2000, 56); expect(c.rachat[2]).toBe(137.2); expect(c.yPlafond).toBe(22); expect(c.grille.map((g) => g.texte)).toEqual([1900, 1700, 1500, 1300]); expect(xCurseur(50)).toBe(174); expect(yPrix(1500, 2000)).toBe(102); expect(c.annonce).toHaveLength(3); expect(c.bande.split(' ')).toHaveLength(6);
  });
  it('date estimée de la vente', () => { expect(dateVente(6, MAINT)).toBe(`18${NBSP}oct.`); });
});

describe('revendre', () => {
  it('bornes, calage, jamais au-dessus du plafond ni à 0', () => {
    expect(bornesVente(2000)).toEqual({ min: 500, max: 2000 }); expect(caleVente(2500, 2000)).toBe(2000); expect(caleVente(10, 2000)).toBe(500); expect(caleVente(1234, 2000)).toBe(1230); expect(caleVente(0, 2000)).toBeUndefined(); expect(caleVente(NaN, 2000)).toBeUndefined(); expect(caleVente(-5, 2000)).toBeUndefined();
  });
  it('rang parmi les annonces', () => {
    expect(rangAnnonce(1500, [1380, 1520, 1700]).label).toBe('2e moins chère sur 4'); expect(rangAnnonce(1300, [1380, 1520, 1700])).toMatchObject({ rang: 1, total: 4, label: 'La moins chère des 4' }); expect(rangAnnonce(900, []).label).toBe('Seule annonce sur ce vol'); expect(rangAnnonce(1380, [1380]).rang).toBe(1);
  });
  it('ce que le vendeur reçoit, taux Pass ou non', () => {
    const p = recu(1500, 1000, true); expect(p).toMatchObject({ commission: 150, net: 1350, diff: 350, sens: 'hausse', tauxLabel: `10${NBSP}%`, tauxSansPass: `12,5${NBSP}%` });
    expect(recu(1500, 1000, false)).toMatchObject({ commission: 187.5, net: 1312.5, tauxLabel: `12,5${NBSP}%` }); expect(recu(1000, 1000, true)).toMatchObject({ net: 900, diff: -100, sens: 'baisse' });
  });
});

describe('proposer son billet à un acheteur', () => {
  it('chances d’acceptation', () => {
    expect(chances(400, 400, true, true)).toMatchObject({ niveau: 'Certaine', immediate: true, barres: 3 }); expect(chances(450, 400, true, true)).toMatchObject({ niveau: 'Bonnes', barres: 2 }); expect(chances(500, 400, true, true).niveau).toBe('Bonnes');
    expect(chances(600, 400, true, true).niveau).toBe('Moyennes'); expect(chances(900, 400, true, true).niveau).toBe('Faibles'); expect(chances(400, 400, false, true)).toMatchObject({ niveau: 'Bonnes', immediate: false }); expect(chances(450, 400, true, false)).toMatchObject({ niveau: 'Faibles', barres: 0 });
  });
  it('prix rapides', () => { expect(prixRapides(400, 940, true)).toEqual([400, 450, 500]); expect(prixRapides(400, 940, false)).toEqual([400]); expect(prixRapides(400, 420, true)).toEqual([400]); });
});
