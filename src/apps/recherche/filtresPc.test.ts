import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { instant } from '../../data/horloge.ts';
import { offresDuVol } from '../../domain/marche.ts';
import { appliquerFiltresPc, basculerTriPc, bornesPrix, filtresDefaut, trierPc } from './filtresPc.ts';
import { volsDuTrajet, type LigneOffre } from './offres.ts';
import { rechercheVide } from './params.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const NOW = instant('2026-10-12', '09:00');
const lignes = (pass = false): LigneOffre[] => volsDuTrajet(app.monde.vols, { ...rechercheVide('YUL'), vers: 'CDG', jour: '2026-12-18' }, NOW).flatMap((vol) => offresDuVol(vol.id, pass).map((offre) => ({ offre, vol })));

describe('filtres PC', () => {
  it('sans filtre, tout passe ; une source décochée disparaît', () => {
    const l = lignes(); expect(appliquerFiltresPc(l, filtresDefaut(), NOW)).toHaveLength(l.length);
    const f = filtresDefaut(); f.sources.revente = false;
    expect(appliquerFiltresPc(l, f, NOW).some((x) => x.offre.type === 'revente')).toBe(false);
  });
  it('« direct seulement » retire les vols avec escale', () => {
    const f = { ...filtresDefaut(), direct: true }; const r = appliquerFiltresPc(lignes(), f, NOW);
    expect(r.length).toBeGreaterThan(0); expect(r.every((x) => x.vol.escales.length === 0)).toBe(true);
  });
  it('« revendable seulement » écarte les agences ; le prix maximum écarte les offres chères mais jamais un drop masqué', () => {
    const l = lignes(false); expect(appliquerFiltresPc(l, { ...filtresDefaut(), revendable: true }, NOW).some((x) => x.offre.type === 'agence')).toBe(false);
    const bas = appliquerFiltresPc(l, { ...filtresDefaut(), prixMax: 1500 }, NOW);
    expect(bas.every((x) => x.offre.masquee || x.offre.prix <= 1500)).toBe(true); expect(bas.some((x) => x.offre.masquee)).toBe(l.some((x) => x.offre.masquee));
  });
  it('bornes du curseur : centaines entières autour des prix visibles', () => {
    const b = bornesPrix(lignes()); expect(b.min % 100).toBe(0); expect(b.max % 100).toBe(0);
    const p = lignes().filter((x) => !x.offre.masquee).map((x) => x.offre.prix); expect(b.min).toBeLessThanOrEqual(Math.min(...p)); expect(b.max).toBeGreaterThanOrEqual(Math.max(...p));
  });
});

describe('tri PC', () => {
  it('prix croissant puis décroissant, les drops masqués toujours en dernier', () => {
    const l = lignes(false), asc = trierPc(l, { cle: 'prix', sens: 'asc' }), desc = trierPc(l, { cle: 'prix', sens: 'desc' });
    const v = (x: LigneOffre[]) => x.filter((y) => !y.offre.masquee).map((y) => y.offre.prix);
    expect(v(asc)).toEqual([...v(asc)].sort((a, b) => a - b)); expect(v(desc)).toEqual([...v(asc)].reverse());
    expect(asc.at(-1)!.offre.masquee).toBe(l.some((x) => x.offre.masquee)); expect(desc.at(-1)!.offre.masquee).toBe(l.some((x) => x.offre.masquee));
  });
  it('heure de départ, et bascule du sens', () => {
    const asc = trierPc(lignes(), { cle: 'depart', sens: 'asc' }).map((x) => x.vol.heureDepart);
    expect(asc).toEqual([...asc].sort()); expect(trierPc(lignes(), { cle: 'depart', sens: 'desc' }).map((x) => x.vol.heureDepart)).toEqual([...asc].reverse().length ? [...asc].sort().reverse() : []);
    expect(basculerTriPc({ cle: 'prix', sens: 'asc' }, 'prix')).toEqual({ cle: 'prix', sens: 'desc' }); expect(basculerTriPc({ cle: 'prix', sens: 'desc' }, 'depart')).toEqual({ cle: 'depart', sens: 'asc' });
  });
});
