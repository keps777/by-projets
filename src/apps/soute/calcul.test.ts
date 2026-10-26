import { describe, expect, it } from 'vitest';
import {
  EMPLACEMENTS, appariement, bornesPrix, caler, carnetDemandes, carnetOffres, casesDe, codeCase, codeVendeur, compterCases, disposition, ecartComptoir, ecartPlafond, ilYA, libelleVariation,
  lectureDemande, netVente, positionCase, positionRail, prixMaxSuggere, prixValide, prixVenteSuggere, rangOffre, transactions, trierOffres
} from './calcul.ts';

const NB = ' ';
const offre = (id: string, prix: number) => ({ id, prix, vendeurId: `v-${id}` });

describe('prix', () => {
  it('bornes de 50 $ au plafond, au pas de 5 $', () => {
    expect(bornesPrix(150)).toEqual({ min: 50, max: 150, pas: 5 }); expect(bornesPrix(40).min).toBe(40);
  });
  it('cale un prix dans les bornes sans jamais dépasser le prix compagnie', () => {
    expect(caler(101, 150)).toBe(100); expect(caler(500, 150)).toBe(150); expect(caler(3, 150)).toBe(50); expect(caler(NaN, 150)).toBe(50); expect(caler(148, 150)).toBe(150);
  });
  it('valide : positif, dans les bornes, jamais au-dessus du plafond', () => {
    expect(prixValide(100, 150)).toBe(true); expect(prixValide(150, 150)).toBe(true); expect(prixValide(151, 150)).toBe(false); expect(prixValide(0, 150)).toBe(false); expect(prixValide(49, 150)).toBe(false); expect(prixValide(NaN, 150)).toBe(false);
  });
  it('écart au plafond : montant sous le prix compagnie ou « au plafond »', () => {
    expect(ecartPlafond(100, 150)).toEqual({ sous: 50, auPlafond: false }); expect(ecartPlafond(150, 150)).toEqual({ sous: 0, auPlafond: true });
  });
  it('compare au comptoir avec un écart toujours signé', () => {
    expect(ecartComptoir(90, 150)).toEqual({ abs: -60, libelle: `−60${NB}$`, sens: 'moins' });
    expect(ecartComptoir(170, 150)).toMatchObject({ libelle: `+20${NB}$`, sens: 'plus' }); expect(ecartComptoir(150, 150)).toMatchObject({ abs: 0, sens: 'egal' });
  });
  it('suggère un prix de vente et un prix maximum calés', () => {
    expect(prixVenteSuggere([90, 120], 150)).toBe(90); expect(prixVenteSuggere([], 150)).toBe(100);
    expect(prixMaxSuggere([90, 120], [95], 150)).toBe(90); expect(prixMaxSuggere([], [95], 150)).toBe(95); expect(prixMaxSuggere([], [], 150)).toBe(90);
  });
});

describe('net après commission', () => {
  it('membre Pass : 10 % ; sans Pass : 12,5 % ; l’autre taux sert de comparaison', () => {
    expect(netVente(100, true)).toMatchObject({ commission: 10, net: 90, taux: 0.1, autreTaux: 0.125, autreNet: 87.5 });
    expect(netVente(100, false)).toMatchObject({ commission: 12.5, net: 87.5, autreNet: 90 });
    expect(netVente(150, true).net).toBe(135);
  });
});

describe('carnet de la soute', () => {
  const o = [offre('o1', 100), offre('o2', 125), offre('o3', 90), offre('o4', 110), offre('o5', 95), offre('o6', 140), offre('o7', 100)];
  it('trie du moins cher au plus cher, à égalité par identifiant', () => { expect(trierOffres(o).map((x) => x.id)).toEqual(['o3', 'o5', 'o1', 'o7', 'o4', 'o2', 'o6']); });
  it('affiche du plus cher au moins cher, cumul croissant vers le bas, meilleure = la moins chère', () => {
    const c = carnetOffres(o);
    expect(c.map((l) => l.offre.id)).toEqual(['o6', 'o2', 'o4', 'o7', 'o1', 'o5', 'o3']); expect(c.map((l) => l.cumul)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(c.map((l) => l.profondeur)).toEqual([100, 86, 71, 57, 43, 29, 14]); expect(c.filter((l) => l.meilleure).map((l) => l.offre.id)).toEqual(['o3']);
  });
  it('carnet vide', () => { expect(carnetOffres([])).toEqual([]); });
  it('groupe les demandes par prix, la plus haute d’abord, barres relatives au nombre d’offres', () => {
    const d = carnetDemandes([85, 95, 80, 95], 7);
    expect(d.map((l) => [l.prix, l.nombre, l.cumul, l.profondeur, l.meilleure])).toEqual([[95, 2, 2, 29, true], [85, 1, 3, 43, false], [80, 1, 4, 57, false]]);
    expect(carnetDemandes([], 0)).toEqual([]); expect(carnetDemandes([90], 0)[0].profondeur).toBe(100);
  });
  it('appariement : la demande rencontre l’offre si elle est supérieure ou égale', () => {
    expect(appariement(90, 95)).toMatchObject({ possible: true, libelle: 'appariement à confirmer par la compagnie' }); expect(appariement(90, 90)?.possible).toBe(true);
    expect(appariement(100, 95)).toMatchObject({ possible: false }); expect(appariement(undefined, 95)).toBeUndefined(); expect(appariement(90, undefined)).toBeUndefined();
  });
  it('rang parmi les offres des autres, avec égalités', () => {
    const autres = [90, 95, 100, 100, 110, 125, 140];
    expect(rangOffre(100, autres)).toEqual({ rang: 3, sur: 8, egalite: 2, libelle: '3e moins chère sur 8 · à égalité avec 2 autres' });
    expect(rangOffre(80, autres).libelle).toBe('1re moins chère sur 8'); expect(rangOffre(95, autres).libelle).toBe('2e moins chère sur 8 · à égalité avec 1 autre'); expect(rangOffre(50, []).libelle).toBe('1re moins chère sur 1');
  });
  it('position sur le rail et lecture de la demande', () => {
    expect(positionRail(100, 150)).toBe(50); expect(positionRail(150, 150)).toBe(100); expect(positionRail(10, 150)).toBe(0);
    expect(lectureDemande(90, 95)).toEqual({ genre: 'correspond', ecart: 5 }); expect(lectureDemande(100, 95)).toEqual({ genre: 'attend', ecart: 5 }); expect(lectureDemande(100, undefined).genre).toBe('aucune');
  });
});

describe('anonymat et ancienneté', () => {
  it('code vendeur stable, anonyme', () => { expect(codeVendeur('ACC-0187')).toMatch(/^P-\d{2}$/); expect(codeVendeur('ACC-0187')).toBe(codeVendeur('ACC-0187')); });
  it('ancienneté en français', () => {
    const h = () => '21:10';
    expect(ilYA(25 * 60_000, 0, h)).toBe('il y a 25 min'); expect(ilYA(3 * 3_600_000, 0, h)).toBe('il y a 3 h'); expect(ilYA(30 * 3_600_000, 0, h)).toBe('hier, 21:10'); expect(ilYA(2 * 86_400_000, 0, h)).toBe('il y a 2 jours');
  });
});

describe('carte de la soute', () => {
  it('24 emplacements : les cases de la planche pour 7 proposés, 3 achetés, 3 libres', () => {
    const d = disposition(7, 3); expect(d.length).toBe(EMPLACEMENTS); expect(d.join('')).toBe('UUOUBUOLUOUUOUBLUOUOLBOU');
    expect(compterCases(d)).toEqual({ U: 11, O: 7, B: 3, L: 3 }); expect(casesDe(d, 'O')).toEqual([2, 6, 9, 12, 17, 19, 22]);
  });
  it('sans offre ni achat, il reste des bagages utilisés et des emplacements libres', () => { expect(compterCases(disposition(0, 0))).toEqual({ U: 21, O: 0, B: 0, L: 3 }); });
  it('déborde proprement : jamais plus de 24 cases', () => {
    const d = disposition(30, 5); expect(d.length).toBe(24); expect(compterCases(d)).toMatchObject({ O: 24, B: 0, L: 0, U: 0 });
    expect(compterCases(disposition(10, 2, 3))).toEqual({ U: 9, O: 10, B: 2, L: 3 });
  });
  it('codes et positions d’emplacement', () => {
    expect(codeCase(0)).toBe('AV-1'); expect(codeCase(11)).toBe('AV-12'); expect(codeCase(12)).toBe('AR-1'); expect(codeCase(23)).toBe('AR-12');
    expect(positionCase(0)).toEqual({ gauche: 81, haut: 152 }); expect(positionCase(2)).toEqual({ gauche: 177, haut: 152 }); expect(positionCase(12)).toEqual({ gauche: 81, haut: 362 });
  });
});

describe('dernières transactions', () => {
  it('la plus récente en haut ; la variation compare à la précédente ; la première n’en a pas', () => {
    const t = transactions([{ quand: 1, prix: 110 }, { quand: 3, prix: 105 }, { quand: 2, prix: 98 }], ['AR-10', 'AV-5', 'AR-3']);
    expect(t.map((x) => [x.prix, x.code, x.variation])).toEqual([[105, 'AR-3', 7], [98, 'AV-5', -12], [110, 'AR-10', null]]);
    expect(transactions([], [])).toEqual([]);
  });
  it('limite à 5 lignes et libelle la variation avec son signe', () => {
    expect(transactions(Array.from({ length: 8 }, (_, i) => ({ quand: i, prix: 100 + i })), []).length).toBe(5);
    expect(libelleVariation(7)).toBe(`+7${NB}$`); expect(libelleVariation(-12)).toBe(`−12${NB}$`); expect(libelleVariation(0)).toBe(`0${NB}$`); expect(libelleVariation(null)).toBe('—');
  });
});
