import { describe, expect, it } from 'vitest';
import { catalogueDeLivres, LIVRES_ZTF, normaliser, proposerLivres } from './catalogue-livres.ts';

const livre = (titre: string, extra = {}) => ({ id: titre, titre, auteur: '', total: null as number | null, depart: 0, actif: true, ...extra });

describe('catalogue de livres', () => {
  it('connaît les livres de ZTF, dont les 13 du Chemin Chrétien', () => {
    expect(LIVRES_ZTF.filter((l) => l.titre.startsWith('Le Chemin ')).length).toBe(13);
    expect(LIVRES_ZTF.every((l) => l.auteur === 'ZTF')).toBe(true);
  });
  it('reconnaît un titre sans accents ni apostrophes', () => {
    expect(normaliser('L’École de la Vérité')).toBe(normaliser('L ecole de la verite'));
  });
  it('un livre ajouté par l’utilisateur entre au catalogue, avec ses pages, sans doublon', () => {
    const c = catalogueDeLivres([{ livres: [livre('Le chemin de la vie', { auteur: 'ZTF', total: 120 }), livre('Mon livre à moi', { total: 200 })] }, { livres: [livre('Le chemin de la vie', { actif: false })] }]);
    expect(c.filter((l) => normaliser(l.titre) === 'le chemin de la vie')).toEqual([{ titre: 'Le Chemin de la Vie', auteur: 'ZTF', total: 120 }]);
    expect(c.find((l) => l.titre === 'Mon livre à moi')).toEqual({ titre: 'Mon livre à moi', auteur: '', total: 200 });
    expect(c.length).toBe(LIVRES_ZTF.length + 1);
  });
  it('propose ce qui contient les mots tapés, sans les livres déjà suivis', () => {
    const c = catalogueDeLivres([]);
    expect(proposerLivres('chemin vie', c, []).map((l) => l.titre)).toContain('Le Chemin de la Vie');
    expect(proposerLivres('chemin vie', c, [livre('Le Chemin de la Vie')]).map((l) => l.titre)).not.toContain('Le Chemin de la Vie');
    expect(proposerLivres('', c, []).length).toBe(8);
    expect(proposerLivres('zzz', c, [])).toEqual([]);
  });
});
