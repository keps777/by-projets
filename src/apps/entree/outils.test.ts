import { describe, expect, it } from 'vitest';
import { LANGUES, t } from './i18n.ts';
import { NOTES_JINGLE, DUREE_JINGLE } from './jingle.ts';
import { creerPasskey, passkeyPossible, tenterPasskey } from './webauthn.ts';
import { etatAffiche, FICHES } from './permissions.ts';

describe('i18n', () => {
  it('traduit selon la langue et retombe sur le français', () => {
    expect(t('commencer', 'fr')).toBe('Commencer'); expect(t('commencer', 'en')).toBe('Get started'); expect(t('commencer', 'pcm')).toBe('Make we start');
    expect(LANGUES.map((l) => l.id)).toEqual(['fr', 'en', 'pcm']);
  });
});
describe('jingle', () => { it('tient en 2 secondes', () => { expect(DUREE_JINGLE).toBeLessThanOrEqual(2); expect(NOTES_JINGLE.length).toBeGreaterThan(2); }); });
describe('passkey', () => {
  it('indisponible sans navigator.credentials', async () => { expect(await tenterPasskey({ credentials: undefined })).toBe('indisponible'); expect(passkeyPossible(undefined)).toBe(false); });
  it('ok si l’appareil répond, refusé si NotAllowedError, indisponible pour une autre erreur', async () => {
    const ok = { get: async () => ({ id: 'x' }), create: async () => ({ id: 'x' }) };
    expect(await tenterPasskey({ credentials: ok })).toBe('ok'); expect(await creerPasskey({ credentials: ok, nom: 'A', id: 'p' })).toBe('ok');
    const non = { get: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); }, create: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } };
    expect(await tenterPasskey({ credentials: non })).toBe('refuse'); expect(await creerPasskey({ credentials: non, nom: 'A', id: 'p' })).toBe('refuse');
    const ko = { get: async () => { throw new Error('boom'); }, create: async () => null };
    expect(await tenterPasskey({ credentials: ko })).toBe('indisponible'); expect(await creerPasskey({ credentials: ko, nom: 'A', id: 'p' })).toBe('refuse');
  });
  it('délai dépassé', async () => { expect(await tenterPasskey({ credentials: { get: () => new Promise(() => {}), create: async () => null }, delaiMs: 20 })).toBe('delai'); });
});
describe('autorisations', () => {
  it('texte affiché selon l’état', () => {
    const cam = FICHES[0];
    expect(etatAffiche(cam, true, 'accorde')).toEqual({ texte: 'autorisé · seulement quand l’app est ouverte', ton: 'okc' }); expect(etatAffiche(cam, false, 'accorde').texte).toBe('sans : code MoMo à taper');
    expect(etatAffiche(cam, true, 'refuse').ton).toBe('erc'); expect(etatAffiche(cam, true, 'a_demander').texte).toContain('touche pour demander'); expect(etatAffiche(cam, true, 'indisponible', 'Aucune caméra détectée').texte).toBe('Aucune caméra détectée');
    expect(FICHES).toHaveLength(5);
  });
});
