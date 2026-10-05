import { describe, it, expect, vi } from 'vitest';
import { egaliteConstante, lireCorps, secretValide, servir } from './http.ts';

const SECRET = 'un-secret-de-test-assez-long';
const req = (entetes: Record<string, string> = {}, corps?: string, methode = 'POST') =>
  new Request('https://exemple.test/fn', { method: methode, headers: entetes, body: corps });

describe('outils HTTP', () => {
  it('compare les secrets', () => {
    expect(egaliteConstante('abc', 'abc')).toBe(true);
    expect(egaliteConstante('abc', 'abd')).toBe(false);
    expect(egaliteConstante('abc', 'abcd')).toBe(false);
  });

  it('vérifie le secret partagé (en-tête dédié ou Bearer) et refuse un secret serveur absent', () => {
    expect(secretValide(req({ 'x-cron-secret': SECRET }), SECRET)).toBe(true);
    expect(secretValide(req({ authorization: `Bearer ${SECRET}` }), SECRET)).toBe(true);
    expect(secretValide(req({ 'x-cron-secret': 'faux' }), SECRET)).toBe(false);
    expect(secretValide(req({ 'x-cron-secret': '' }), undefined)).toBe(false);
  });

  it('lit un corps JSON facultatif', async () => {
    expect(await lireCorps(req({}, '{"jours": 30}'))).toEqual({ jours: 30 });
    expect(await lireCorps(req({}, 'pas du json'))).toEqual({});
    expect(await lireCorps(req())).toEqual({});
  });

  it('enveloppe une fonction serveur', async () => {
    const f = servir(SECRET, async () => ({ bilan: { n: 1 } }));
    expect((await f(req({ 'x-cron-secret': 'faux' }))).status).toBe(401);
    expect((await f(req({ 'x-cron-secret': SECRET }, undefined, 'GET'))).status).toBe(405);
    const r = await f(req({ 'x-cron-secret': SECRET }));
    expect(await r.json()).toEqual({ ok: true, bilan: { n: 1 } });
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    const panne = servir(SECRET, async () => { throw new Error('détail privé'); });
    const p = await panne(req({ 'x-cron-secret': SECRET }));
    expect(p.status).toBe(500);
    expect(await p.text()).not.toContain('privé');
    expect(journal).toHaveBeenCalledOnce();
    journal.mockRestore();
  });
});
