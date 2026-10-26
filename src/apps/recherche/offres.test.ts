import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { instant } from '../../data/horloge.ts';
import { offresDuVol } from '../../domain/marche.ts';
import { ONGLETS, barometre, compter, datesProches, echelle, elargir, estDirect, existeTrajet, filtrerOnglet, filtrerSources, fmtEcart, grouperParVol, meilleureAffaire, revendable, trier, volsDuTrajet, type LigneOffre } from './offres.ts';
import { PARTOUT, rechercheVide, type Recherche } from './params.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const NOW = instant('2026-10-12', '09:00');
const cdg = (p: Partial<Recherche> = {}): Recherche => ({ ...rechercheVide('YUL'), vers: 'CDG', jour: '2026-12-18', ...p });
const lignes = (r: Recherche, pass = false): LigneOffre[] => volsDuTrajet(app.monde.vols, r, NOW).flatMap((vol) => offresDuVol(vol.id, pass).map((offre) => ({ offre, vol })));

describe('vols d’une recherche', () => {
  it('YUL → CDG le 18 décembre : trois vols, par heure de départ', () => {
    expect(volsDuTrajet(app.monde.vols, cdg(), NOW).map((v) => v.numero)).toEqual(['NO 220', 'AE 816', 'NO 224']);
  });
  it('±3 jours élargit la fenêtre ; sans date, tous les départs à venir ; « Partout » prend toutes les destinations', () => {
    expect(volsDuTrajet(app.monde.vols, cdg({ jour: '2026-12-16', flex: true }), NOW).map((v) => v.numero)).toEqual(['AE 812', 'NO 220', 'AE 816', 'NO 224']);
    expect(volsDuTrajet(app.monde.vols, cdg({ jour: '2026-12-16' }), NOW)).toEqual([]);
    expect(volsDuTrajet(app.monde.vols, cdg({ jour: undefined }), NOW).length).toBeGreaterThan(5);
    const partout = volsDuTrajet(app.monde.vols, { ...cdg(), vers: PARTOUT, jour: '2026-12-18' }, NOW); expect(partout.map((v) => v.numero)).toEqual(['NO 220', 'AE 816', 'NO 224']);
    expect(new Set(volsDuTrajet(app.monde.vols, { ...cdg(), vers: PARTOUT, jour: undefined }, NOW).map((v) => v.vers)).size).toBeGreaterThan(5);
  });
  it('n’affiche pas les vols déjà partis', () => { expect(volsDuTrajet(app.monde.vols, cdg({ jour: '2026-10-14' }), instant('2026-10-14', '20:00'))).toEqual([]); });
  it('un trajet sans vol : liste vide', () => { expect(volsDuTrajet(app.monde.vols, { ...cdg(), vers: 'LIS' }, NOW)).toEqual([]); expect(existeTrajet(app.monde.vols, { ...cdg(), vers: 'LIS' })).toBe(true); expect(existeTrajet(app.monde.vols, { ...cdg(), vers: 'LAX' })).toBe(false); expect(existeTrajet(app.monde.vols, { ...cdg(), de: 'CDG', vers: 'YUL' })).toBe(false); });
});

describe('onglets et filtres', () => {
  it('compte les offres par source', () => {
    const c = compter(lignes(cdg())); expect(c).toEqual({ tous: 9, revente: 5, neuf: 3, agence: 1, drop: 0 });
    expect(ONGLETS.map((o) => o.id)).toEqual(['tous', 'revente', 'neuf', 'agence', 'drop']);
  });
  it('filtre par onglet et par source', () => {
    const l = lignes(cdg()); expect(filtrerOnglet(l, 'revente').every((x) => x.offre.type === 'revente')).toBe(true); expect(filtrerOnglet(l, 'tous')).toHaveLength(l.length);
    expect(compter(filtrerSources(l, ['revente', 'agence'], false, NOW))).toMatchObject({ tous: 6, neuf: 0 }); expect(filtrerSources(l, [], false, NOW)).toEqual([]);
  });
  it('« seulement revendables » écarte les vols dont l’échéance est passée', () => {
    const proche = lignes({ ...cdg(), jour: '2026-10-14' }); expect(proche.length).toBeGreaterThan(0);
    const tard = instant('2026-10-13', '20:00'); expect(revendable(proche[0].vol, NOW)).toBe(true); expect(revendable(proche[0].vol, tard)).toBe(false);
    expect(filtrerSources(proche, ['neuf', 'revente', 'agence', 'drop'], true, tard)).toEqual([]); expect(filtrerSources(proche, ['neuf', 'revente', 'agence', 'drop'], true, NOW)).toHaveLength(proche.length);
  });
  it('les drops masqués comptent dans l’onglet Drops', () => { const l = lignes({ ...cdg(), vers: 'PUJ', jour: '2027-02-21' }); expect(compter(l).drop).toBe(1); expect(l.find((x) => x.offre.type === 'drop')!.offre.masquee).toBe(true); });
});

describe('regroupement et tris', () => {
  it('regroupe les offres par vol', () => {
    const g = grouperParVol(lignes(cdg())); expect(g).toHaveLength(3); expect(g.find((x) => x.vol.numero === 'AE 816')!.lignes).toHaveLength(5); expect(g.reduce((n, x) => n + x.lignes.length, 0)).toBe(9);
  });
  it('« recommandé » : un vol après l’autre, directs d’abord, moins cher d’abord dans un vol', () => {
    const t = trier(lignes(cdg()), 'recommande'); expect(t.map((x) => x.vol.numero).filter((n, i, a) => a.indexOf(n) === i)).toEqual(['AE 816', 'NO 224', 'NO 220']);
    expect(t.slice(0, 5).map((x) => x.offre.prix)).toEqual([1500, 1520, 1610, 1700, 2050]); expect(estDirect(t[0].vol)).toBe(true);
    // chaque vol forme un bloc continu
    const suite = t.map((x) => x.vol.id); for (const id of new Set(suite)) expect(suite.lastIndexOf(id) - suite.indexOf(id) + 1).toBe(suite.filter((x) => x === id).length);
  });
  it('trie par prix, écart, départ, durée sans toucher la liste d’origine', () => {
    const l = lignes(cdg()), copie = [...l]; expect(trier(l, 'prix').map((x) => x.offre.prix)).toEqual([...l.map((x) => x.offre.prix)].sort((a, b) => a - b)); expect(l).toEqual(copie);
    expect(trier(l, 'ecart')[0].offre.ecartPct).toBe(Math.min(...l.map((x) => x.offre.ecartPct))); expect(trier(l, 'depart')[0].vol.numero).toBe('NO 220'); expect(trier(l, 'duree')[0].vol.dureeMin).toBe(425); expect(trier(l, 'duree').at(-1)!.vol.dureeMin).toBe(675);
  });
  it('place les drops masqués en dernier', () => { const t = trier(lignes({ ...cdg(), vers: 'PUJ', jour: '2027-02-21' }), 'prix'); expect(t.at(-1)!.offre.masquee).toBe(true); expect(trier(lignes({ ...cdg(), vers: 'PUJ', jour: '2027-02-21' }, true), 'prix')[0].offre.type).toBe('drop'); });
});

describe('meilleure affaire', () => {
  it('le prix le plus bas en direct, sous le prix neuf', () => { const m = meilleureAffaire(lignes(cdg()))!; expect(m.critere).toBe('direct'); expect(m.ligne.offre.id).toBe('revente:d-r816'); expect(m.ligne.offre.prix).toBe(1500); });
  it('à défaut de direct, le plus bas de tous', () => { const m = meilleureAffaire(lignes(cdg()).filter((x) => !estDirect(x.vol)))!; expect(m.critere).toBe('tous'); expect(m.ligne.offre.prix).toBe(1380); });
  it('pas de mise en avant quand rien n’est sous le prix neuf', () => { expect(meilleureAffaire(lignes({ ...cdg(), vers: 'PUJ', jour: '2027-02-21' }))).toBeUndefined(); expect(meilleureAffaire([])).toBeUndefined(); });
});

describe('baromètre du marché', () => {
  it('compte les offres sous le neuf et le prix le plus bas', () => {
    const l = lignes(cdg()), m = meilleureAffaire(l)!; const b = barometre(l, m.ligne.offre.id);
    expect(b.sousNeuf).toBe(l.filter((x) => x.offre.ecartPct < 0).length); expect(b.sousNeuf).toBe(6); expect(b.des).toBe(1380); expect(b.neuf).toBe(2050); expect(b.points).toHaveLength(9); expect(b.points.filter((p) => p.meilleure)).toHaveLength(1);
    expect(b.posNeuf).toBeGreaterThan(b.posMin); expect(b.points.every((p) => p.pos >= 0 && p.pos <= 100)).toBe(true);
  });
  it('sans offre sous le neuf : aucun compte, prix neuf en repère', () => {
    const l = lignes({ ...cdg(), vers: 'PUJ', jour: '2027-02-21' }); const b = barometre(l, undefined); expect(b.sousNeuf).toBe(0); expect(b.des).toBe(940); expect(b.neuf).toBe(940); expect(b.masques).toBe(1); expect(b.points).toHaveLength(1);
  });
  it('un drop visible avec le Pass entre dans le baromètre', () => { const b = barometre(lignes({ ...cdg(), vers: 'PUJ', jour: '2027-02-21' }, true), undefined); expect(b.masques).toBe(0); expect(b.sousNeuf).toBe(1); expect(b.des).toBe(200); });
  it('vide : rien à mesurer', () => { const b = barometre([], undefined); expect(b).toMatchObject({ sousNeuf: 0, des: null, neuf: null, masques: 0 }); expect(b.points).toEqual([]); });
  it('échelle ronde en quatre intervalles égaux (maquette : 1 300 $ à 2 100 $)', () => {
    expect(echelle([1380, 1500, 1690, 2050])).toMatchObject({ min: 1300, max: 2100 }); expect(echelle([1380, 2050]).graduations.map((g) => g.prix)).toEqual([1300, 1500, 1700, 1900, 2100]);
    const e = echelle([510]); expect(e.min).toBe(400); expect(e.max).toBeGreaterThan(510); expect(e.graduations.at(-1)!.pos).toBe(100);
  });
});

describe('état vide utile', () => {
  it('propose les dates proches, les plus proches d’abord', () => {
    const d = datesProches(app.monde.vols, { ...cdg(), jour: '2026-12-16' }, '2026-10-12'); expect(d[0]).toMatchObject({ jour: '2026-12-14', ecart: -2 }); expect(d.map((x) => x.jour)).toContain('2026-12-18'); expect(d.length).toBeLessThanOrEqual(4);
  });
  it('rien sans date ni autre jour ; jamais le jour cherché ni un jour passé', () => {
    expect(datesProches(app.monde.vols, cdg({ jour: undefined }), '2026-10-12')).toEqual([]); expect(datesProches(app.monde.vols, cdg(), '2026-10-12').some((x) => x.jour === '2026-12-18')).toBe(false);
    expect(datesProches(app.monde.vols, { ...cdg(), jour: '2026-10-13' }, '2026-10-13').some((x) => x.jour < '2026-10-13')).toBe(false);
  });
  it('élargir : ±3 jours seulement avec une date', () => { expect(elargir(cdg()).flex).toBe(true); expect(elargir(cdg({ jour: undefined })).flex).toBe(false); });
});
it('écart signé arrondi', () => { expect(fmtEcart(-26.8)).toBe('−27 %'); expect(fmtEcart(4.4)).toBe('+4 %'); expect(fmtEcart(0)).toBe('0 %'); });
