// Garde-fou d'intégration : tout lien interne écrit dans le code doit pointer vers une route réellement déclarée.
import { describe, expect, it } from 'vitest';
// Sources lues telles quelles (hors tests) : routes déclarées, composants Svelte et modules TypeScript.
const sources = import.meta.glob<string>(['/src/**/*.{ts,svelte}', '!/src/**/*.test.ts'], { query: '?raw', import: 'default', eager: true });

/** Chemins déclarés dans les `routes.ts` (hors tests). */
const declarees = Object.entries(sources).filter(([f]) => /\/(screens|portals)\/[^/]+\/routes\.ts$/.test(f))
  .flatMap(([, brut]) => [...brut.matchAll(/chemin:\s*'([^']+)'/g)].map((m) => m[1]));

const motif = (chemin: string) => new RegExp('^' + chemin.split('/').map((s) => (s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$');
const motifs = declarees.map(motif);
const existe = (chemin: string) => motifs.some((m) => m.test(chemin));

/** Littéraux de chaîne qui ressemblent à un lien interne (« /ecole », `/coffres/${id}`, "/sante/facture/{f.id}"). */
function liens(source: string): string[] {
  const trouves: string[] = [];
  for (const m of source.matchAll(/(['"`])(\/[a-z][-a-z0-9_/${}.:?=&A-Za-z]*)\1/g)) {
    let l = m[2].replace(/\$\{[^}]*\}|\{[^}]*\}/g, 'X');
    l = l.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    if (/\.[a-z0-9]{2,5}$/i.test(l)) continue; // fichiers (icônes, polices)
    trouves.push(l);
  }
  return trouves;
}

describe('liens internes', () => {
  it('les routes déclarées sont découvertes', () => {
    expect(declarees.length).toBeGreaterThan(40);
    expect(existe('/')).toBe(true);
    expect(existe('/coffres/abc')).toBe(true);
  });
  it('aucun lien interne ne pointe vers une route inexistante', () => {
    const morts: string[] = [];
    let vus = 0;
    for (const [f, brut] of Object.entries(sources)) {
      for (const l of liens(brut)) { vus++; if (!existe(l)) morts.push(`${f} → ${l}`); }
    }
    expect(vus).toBeGreaterThan(150); // le détecteur voit bien les liens
    expect(morts).toEqual([]);
  });
});
