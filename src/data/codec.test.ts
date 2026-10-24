import { describe, expect, it } from 'vitest';
import { decoder, encoder } from './codec.ts';
import { etatInitial } from './seed.ts';
import { genererHistorique } from '../apps/patron/historique.ts';
import { aujourdhui, maintenant } from './horloge.ts';

describe('codec de stockage', () => {
  it('aller-retour sans perte sur le monde de démonstration avec son historique', () => {
    const e = etatInitial(); genererHistorique(e.monde, { jour: aujourdhui(), now: maintenant() });
    e.monde.billets[3].scanneLe = 123; (e.monde.billets[4] as unknown as Record<string, unknown>).siege = null;
    const texte = encoder(e);
    expect(decoder(texte)).toEqual(JSON.parse(JSON.stringify(e)));
  });
  it('divise la taille du monde de démonstration par plus de 1,7', () => {
    const e = etatInitial(); genererHistorique(e.monde, { jour: aujourdhui(), now: maintenant() });
    expect(encoder(e).length).toBeLessThan(JSON.stringify(e).length / 1.7);
  });
  it('relit aussi le format complet (état injecté à la main) et distingue absent et null', () => {
    const e = etatInitial(); expect(decoder(JSON.stringify(e))).toEqual(JSON.parse(JSON.stringify(e)));
    const lignes = Array.from({ length: 9 }, (_, i) => (i % 2 ? { a: 1, b: null, l: ['1A', '2B'], t: 'x' } : { a: 2, l: [], t: '⟦ 1A' }));
    const m = decoder(encoder({ version: 1, monde: { x: lignes }, session: {}, tranches: {} })) as { monde: { x: unknown[] } };
    expect(m.monde.x).toEqual(lignes); expect('b' in (m.monde.x[0] as object)).toBe(false);
  });
});
