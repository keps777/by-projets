import { describe, expect, it } from 'vitest';
import { quaiDe } from './quai.ts';
import { quaiDe as quaiRoute } from './arrets.ts';

describe('quai', () => {
  it('stable, entre 1 et 6', () => {
    for (const id of ['d-2026-11-03-BX-Classique-mvan-aller-0700', 'd-2026-11-04-AV-VIP-nsam-aller-0600', 'x']) { const q = quaiDe(id); expect(q).toBeGreaterThanOrEqual(1); expect(q).toBeLessThanOrEqual(6); expect(quaiDe(id)).toBe(q); }
  });
  it('la voyageuse (arrets.ts) et les agents lisent le même calcul', () => { expect(quaiRoute('d-1')).toBe(quaiDe('d-1')); });
});
