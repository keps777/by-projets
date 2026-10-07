import { describe, expect, it, vi } from 'vitest';

vi.mock('../../data/config.ts', () => ({ SUPABASE_URL: 'https://abc.supabase.co' }));
const { lienCalendrier, nouveauJetonCalendrier } = await import('./calendrier.ts');

describe('lien du calendrier', () => {
  it('génère des jetons longs, sûrs et différents', () => {
    const a = nouveauJetonCalendrier(), b = nouveauJetonCalendrier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
  it('donne le lien https et le lien webcal d’abonnement', () => {
    expect(lienCalendrier('jeton')).toBe('https://abc.supabase.co/functions/v1/calendrier?jeton=jeton');
    expect(lienCalendrier('jeton', 'webcal')).toBe('webcal://abc.supabase.co/functions/v1/calendrier?jeton=jeton');
  });
});
