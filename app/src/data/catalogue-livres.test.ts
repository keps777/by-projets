import { describe, expect, it } from 'vitest';
import { catalogueDeLivres, LIVRES_ZTF, normaliser, proposerLivres } from './catalogue-livres.ts';

const livre = (titre: string, extra = {}) => ({ id: titre, titre, auteur: '', total: null as number | null, depart: 0, actif: true, ...extra });

describe('catalogue de livres', () => {
  it('connaît les livres de ZTF, dont les 13 du Chemin Chrétien', () => {
    expect(LIVRES_ZTF.filter((l) => l.titre.startsWith('Le chemin ')).length).toBe(13);
    expect(LIVRES_ZTF.filter((l) => l.auteur === 'ZTF').length).toBeGreaterThan(30);
  });
  it('connaît les livres des rapports d’août à octobre, avec leurs pages et leur auteur', () => {
    const c = catalogueDeLivres([]);
    const pages = (t: string) => c.find((l) => normaliser(l.titre) === normaliser(t));
    expect(pages('L’agressivité spirituelle')).toMatchObject({ auteur: 'ZTF', total: 417 });
    expect(pages('Jouir du choix de ton conjoint')?.total).toBe(213);
    expect(pages('Le chemin de la vie')?.total).toBe(124);
    expect(pages('Le chemin du caractère chrétien')?.total).toBe(171);
    expect(pages('Sois rempli du Saint-Esprit')?.total).toBe(20);
    expect(pages('Réveil spirituel personnel')?.total).toBe(80);
    expect(pages('La Repentance, clé d’une réelle conversion biblique')).toMatchObject({ auteur: 'Samuel & Dorothée Hatzakortzian', total: 95 });
    expect(pages('Le chemin de l’obéissance')?.total).toBeNull(); // pas de pages connues
    expect(new Set(c.map((l) => normaliser(l.titre))).size).toBe(c.length);
  });
  it('reconnaît un titre sans accents ni apostrophes', () => {
    expect(normaliser('L’École de la Vérité')).toBe(normaliser('L ecole de la verite'));
  });
  it('un livre ajouté par l’utilisateur entre au catalogue, avec ses pages, sans doublon', () => {
    const c = catalogueDeLivres([{ livres: [livre('Le chemin de la vie', { auteur: 'ZTF', total: 120 }), livre('Mon livre à moi', { total: 200 })] }, { livres: [livre('Le chemin de la vie', { actif: false })] }]);
    expect(c.filter((l) => normaliser(l.titre) === 'le chemin de la vie')).toEqual([{ titre: 'Le chemin de la vie', auteur: 'ZTF', total: 120 }]);
    expect(c.find((l) => l.titre === 'Mon livre à moi')).toEqual({ titre: 'Mon livre à moi', auteur: '', total: 200 });
    expect(c.length).toBe(LIVRES_ZTF.length + 1);
  });
  it('propose ce qui contient les mots tapés, sans les livres déjà suivis', () => {
    const c = catalogueDeLivres([]);
    expect(proposerLivres('chemin vie', c, []).map((l) => l.titre)).toContain('Le chemin de la vie');
    expect(proposerLivres('chemin vie', c, [livre('Le chemin de la vie')]).map((l) => l.titre)).not.toContain('Le chemin de la vie');
    expect(proposerLivres('', c, []).length).toBe(8);
    expect(proposerLivres('zzz', c, [])).toEqual([]);
  });
});
