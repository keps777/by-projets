import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { decouperOffreId, obstacleAchat, trouverOffre, volIdDeOffre } from './offre.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });

describe('identifiant d’offre', () => {
  it('se découpe au premier deux-points', () => {
    expect(decouperOffreId('revente:d-r816')).toEqual({ type: 'revente', ref: 'd-r816' }); expect(decouperOffreId('agence:oa-1')).toEqual({ type: 'agence', ref: 'oa-1' });
    expect(decouperOffreId('neuf:v:x')).toEqual({ type: 'neuf', ref: 'v:x' });
  });
  it('refuse un identifiant mal formé ou d’un type inconnu', () => {
    for (const x of ['', 'd-r816', ':d-r816', 'revente:', 'cadeau:42']) expect(decouperOffreId(x)).toBeNull();
  });
  it('retrouve le vol de chaque type d’offre', () => {
    expect(volIdDeOffre(app.monde, 'revente:d-r816')).toBe('v-ae816'); expect(volIdDeOffre(app.monde, 'neuf:v-ae816')).toBe('v-ae816'); expect(volIdDeOffre(app.monde, 'agence:oa-1')).toBe('v-no220');
    expect(volIdDeOffre(app.monde, 'revente:inconnu')).toBeUndefined(); expect(volIdDeOffre(app.monde, 'neuf:v-zzz')).toBeUndefined();
  });
});
describe('offre à payer', () => {
  it('rend l’offre avec son prix du marché', () => {
    expect(trouverOffre('revente:d-r816')).toMatchObject({ type: 'revente', prix: 1500, volId: 'v-ae816' }); expect(trouverOffre('neuf:v-ae816')).toMatchObject({ type: 'neuf', prix: 2050 }); expect(trouverOffre('agence:oa-1')).toMatchObject({ type: 'agence', prix: 1690 });
  });
  it('rend undefined quand l’annonce n’existe plus (billet retiré)', () => {
    const d = app.monde.droits.find((x) => x.id === 'd-r816')!; d.statut = 'detenu'; delete d.annonce; expect(trouverOffre('revente:d-r816')).toBeUndefined();
  });
  it('signale l’obstacle : drop masqué, annonce de soi-même', () => {
    const o = trouverOffre('revente:d-hav')!; expect(obstacleAchat(o, 'ACC-0412')).toMatch(/propre annonce/); expect(obstacleAchat(o, 'ACC-0187')).toBeNull();
    expect(obstacleAchat({ ...o, type: 'drop' }, 'ACC-0187')).toMatch(/drop/);
  });
});
