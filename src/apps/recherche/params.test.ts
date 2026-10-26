import { describe, expect, it } from 'vitest';
import { AEROPORTS } from '../../data/seed.ts';
import { PARTOUT, ajouterRecente, enRecente, fenetre, lireParams, ligneRecente, normaliser, rechercheVide, resoudreSaisie, suggerer, texteDe, validerRecherche, versFormulaire, versUrl, type Recherche } from './params.ts';

const codes = AEROPORTS.map((a) => a.code), AUJ = '2026-10-12';
const base = (p: Partial<Recherche> = {}): Recherche => ({ ...rechercheVide('YUL'), vers: 'CDG', jour: '2026-12-18', ...p });

describe('adresse des résultats', () => {
  it('lit l’adresse de la maquette', () => {
    const { recherche: r, problemes } = lireParams('?de=YUL&vers=CDG&jour=2026-12-18&n=1', codes);
    expect(problemes).toEqual({}); expect(r).toMatchObject({ de: 'YUL', vers: 'CDG', jour: '2026-12-18', n: 1, flex: false, revendable: false }); expect(r.sources).toEqual(['neuf', 'revente', 'agence', 'drop']);
  });
  it('accepte « partout », corrige les voyageurs et ignore ±3 sans date', () => {
    const { recherche: r } = lireParams('?vers=Partout&n=42&flex=1', codes); expect(r.vers).toBe(PARTOUT); expect(r.n).toBe(9); expect(r.flex).toBe(false); expect(r.de).toBe('YUL');
    expect(lireParams('?vers=CDG&n=abc', codes).recherche.n).toBe(1); expect(lireParams('?vers=CDG&n=0', codes).recherche.n).toBe(1);
  });
  it('signale ce qui ne peut pas être deviné', () => {
    expect(lireParams('', codes).problemes.vers).toMatch(/destination/); expect(lireParams('?vers=ZZZ', codes).problemes.vers).toMatch(/ZZZ/); expect(lireParams('?de=QQQ&vers=CDG', codes).problemes.de).toMatch(/QQQ/);
    expect(lireParams('?vers=CDG&jour=2026-02-30', codes).problemes.jour).toBeTruthy(); expect(lireParams('?vers=CDG&retour=bientot', codes).problemes.retour).toBeTruthy();
  });
  it('lit les sources et la revente seule', () => {
    const { recherche: r } = lireParams('?vers=CDG&src=revente,agence,inconnue&rev=1&flex=1&jour=2026-12-18&retour=2027-01-04', codes);
    expect(r.sources).toEqual(['revente', 'agence']); expect(r.revendable).toBe(true); expect(r.flex).toBe(true); expect(r.retour).toBe('2027-01-04'); expect(lireParams('?vers=CDG&src=', codes).recherche.sources).toEqual([]);
  });
  it('écrit l’adresse : les quatre premiers paramètres comme la maquette, puis seulement les écarts', () => {
    expect(versUrl(base())).toBe('/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1');
    expect(versUrl(base({ flex: true, n: 2, sources: ['revente'], revendable: true, retour: '2027-01-04' }))).toBe('/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=2&flex=1&retour=2027-01-04&src=revente&rev=1');
    expect(versUrl(base({ jour: undefined, flex: true }))).toBe('/resultats?de=YUL&vers=CDG&n=1'); expect(versFormulaire(base())).toBe('/rechercher?de=YUL&vers=CDG&jour=2026-12-18&n=1');
  });
  it('relit ce qu’elle écrit', () => {
    const r = base({ flex: true, n: 3, sources: ['neuf', 'drop'], revendable: true, retour: '2027-01-04', vers: PARTOUT });
    expect(lireParams(versUrl(r).split('?')[1], codes).recherche).toEqual(r);
  });
});

describe('validation du formulaire', () => {
  it('accepte une recherche complète', () => { expect(validerRecherche(base(), AEROPORTS, AUJ)).toEqual({}); expect(validerRecherche(base({ jour: undefined, vers: PARTOUT }), AEROPORTS, AUJ)).toEqual({}); });
  it('exige un départ et une arrivée', () => {
    expect(validerRecherche(base({ vers: '' }), AEROPORTS, AUJ).vers).toMatch(/destination/); expect(validerRecherche(base({ de: '' }), AEROPORTS, AUJ).de).toMatch(/départ/); expect(validerRecherche(base({ vers: 'XXX' }), AEROPORTS, AUJ).vers).toMatch(/liste/);
  });
  it('refuse départ = arrivée', () => { expect(validerRecherche(base({ vers: 'YUL' }), AEROPORTS, AUJ).vers).toMatch(/identiques/); });
  it('refuse une date passée mais accepte aujourd’hui', () => { expect(validerRecherche(base({ jour: '2026-10-11' }), AEROPORTS, AUJ).jour).toMatch(/passée/); expect(validerRecherche(base({ jour: AUJ }), AEROPORTS, AUJ).jour).toBeUndefined(); });
  it('valide le retour de l’aller-retour', () => {
    expect(validerRecherche(base(), AEROPORTS, AUJ, true).retour).toMatch(/retour/); expect(validerRecherche(base({ retour: '2026-12-10' }), AEROPORTS, AUJ).retour).toMatch(/précéder/); expect(validerRecherche(base({ retour: '2026-12-18' }), AEROPORTS, AUJ).retour).toBeUndefined();
  });
  it('exige une source et 1 à 9 voyageurs', () => { expect(validerRecherche(base({ sources: [] }), AEROPORTS, AUJ).sources).toBeTruthy(); expect(validerRecherche(base({ n: 0 }), AEROPORTS, AUJ).n).toBeTruthy(); expect(validerRecherche(base({ n: 10 }), AEROPORTS, AUJ).n).toBeTruthy(); });
});

describe('autocomplétion des aéroports', () => {
  it('ignore accents et casse', () => { expect(normaliser('Montréal (YUL)')).toBe('montrealyul'); expect(normaliser('  São  Paulo ')).toBe('saopaulo'); });
  it('propose par ville, code ou pays, le code exact d’abord', () => {
    expect(suggerer(AEROPORTS, 'par')[0].valeur).toBe('CDG'); expect(suggerer(AEROPORTS, 'cdg')[0].valeur).toBe('CDG'); expect(suggerer(AEROPORTS, 'mexique').map((s) => s.valeur)).toEqual(['MEX']);
    expect(suggerer(AEROPORTS, 'mont')[0].valeur).toBe('YUL'); expect(suggerer(AEROPORTS, 'zzzz')).toEqual([]);
  });
  it('liste tout sans saisie, sans l’aéroport exclu, et « Partout » en tête pour l’arrivée', () => {
    const tous = suggerer(AEROPORTS, '', { exclure: 'YUL', partout: true }); expect(tous[0].valeur).toBe(PARTOUT); expect(tous.some((s) => s.valeur === 'YUL')).toBe(false); expect(tous).toHaveLength(AEROPORTS.length);
    expect(suggerer(AEROPORTS, 'part', { partout: true })[0].valeur).toBe(PARTOUT); expect(suggerer(AEROPORTS, 'part')[0]?.valeur).not.toBe(PARTOUT);
  });
  it('résout un texte exact et affiche une valeur', () => {
    expect(resoudreSaisie(AEROPORTS, 'Paris (CDG)')).toBe('CDG'); expect(resoudreSaisie(AEROPORTS, 'montreal')).toBe('YUL'); expect(resoudreSaisie(AEROPORTS, 'Par')).toBeUndefined(); expect(resoudreSaisie(AEROPORTS, 'Partout')).toBeUndefined();
    expect(resoudreSaisie(AEROPORTS, 'partout', { partout: true })).toBe(PARTOUT); expect(texteDe(AEROPORTS, 'CDG')).toBe('Paris (CDG)'); expect(texteDe(AEROPORTS, PARTOUT)).toBe('Partout'); expect(texteDe(AEROPORTS, '')).toBe('');
  });
});

describe('recherches récentes', () => {
  it('met la plus récente en tête, sans doublon, cinq au plus', () => {
    let l = [enRecente(base({ vers: 'PUJ' }))]; l = ajouterRecente(l, enRecente(base())); l = ajouterRecente(l, enRecente(base({ vers: 'PUJ' })));
    expect(l.map((r) => r.vers)).toEqual(['PUJ', 'CDG']);
    for (const v of ['LIS', 'FCO', 'KEF', 'HAV', 'BOG']) l = ajouterRecente(l, enRecente(base({ vers: v }))); expect(l).toHaveLength(5); expect(l[0].vers).toBe('BOG');
  });
  it('affiche la ligne de la maquette', () => {
    const l = ligneRecente({ de: 'YUL', vers: 'PUJ', jour: '2027-02-21', flex: false, n: 2 }, AEROPORTS);
    expect(l).toMatchObject({ code: 'PUJ', titre: 'Montréal → Punta Cana', sous: 'févr. 2027 · 2 voyageurs' }); expect(l.url).toBe('/resultats?de=YUL&vers=PUJ&jour=2027-02-21&n=2');
    expect(ligneRecente({ de: 'YUL', vers: 'PPT', jour: '2027-05-09', flex: true, n: 1 }, AEROPORTS).sous).toBe('mai 2027 · 1 voyageur · ±3 jours'); expect(ligneRecente({ de: 'YUL', vers: PARTOUT, flex: false, n: 1 }, AEROPORTS)).toMatchObject({ code: '···', titre: 'Montréal → Partout', sous: 'Toutes les dates · 1 voyageur' });
  });
  it('fenêtre de dates', () => { expect(fenetre({ jour: '2026-12-18', flex: false })).toEqual(['2026-12-18', '2026-12-18']); expect(fenetre({ jour: '2026-12-18', flex: true })).toEqual(['2026-12-15', '2026-12-21']); expect(fenetre({ flex: true })).toBeUndefined(); });
});
