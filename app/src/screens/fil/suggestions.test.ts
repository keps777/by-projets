import { describe, expect, it } from 'vitest';
import { suggerer, normaliser } from './suggestions.ts';

const t = (id: string, titre: string, created_at: string) => ({ id, titre, created_at });
const taches = [
  t('1', 'RDQD du matin', '2026-10-01T10:00:00Z'),
  t('2', 'Rencontre avec Christopher', '2026-10-03T10:00:00Z'),
  t('3', 'Rencontre avec Christopher', '2026-10-04T10:00:00Z'),
  t('4', 'Prière avec les frères', '2026-10-02T10:00:00Z')
];

describe('suggestions de titre', () => {
  it('sans texte : les tâches récentes d’abord (sans doublon), puis des titres génériques', () => {
    const s = suggerer('', taches);
    expect(s.slice(0, 3).map((x) => x.texte)).toEqual(['Rencontre avec Christopher', 'Prière avec les frères', 'RDQD du matin']);
    expect(s.slice(0, 3).every((x) => x.origine === 'deja')).toBe(true);
    expect(s[3].origine).toBe('generique');
    expect(s.find((x) => x.texte === 'Rencontre avec Christopher')!.tacheId).toBe('3');
  });
  it('avec du texte : ce qui commence par, puis ce qui contient ; déjà créées avant génériques ; insensible aux accents', () => {
    expect(suggerer('renc', taches).map((x) => x.texte)).toEqual(['Rencontre avec Christopher', 'Rencontre avec ']);
    expect(suggerer('priere', taches).map((x) => x.texte)[0]).toBe('Prière avec les frères');
    expect(suggerer('frere', taches).map((x) => x.texte)).toEqual(['Prière avec les frères']);
  });
  it('ne propose pas ce qui est déjà tapé en entier, ni un générique déjà utilisé', () => {
    expect(suggerer('Rencontre avec Christopher', taches).map((x) => x.texte)).not.toContain('Rencontre avec Christopher');
    expect(suggerer('', [t('9', 'Lecture', '2026-10-05T00:00:00Z')]).filter((x) => x.texte === 'Lecture')).toHaveLength(1);
  });
  it('normalise accents et espaces', () => { expect(normaliser('  Prière   AVEC ')).toBe('priere avec'); });
});
