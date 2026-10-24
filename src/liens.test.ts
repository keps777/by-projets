// @vitest-environment jsdom
// Garde-fou des liens : tout lien interne écrit dans le code (href, aller(), retourVers, `lien:` des notifications, docks…) doit pointer vers une route déclarée
// dans un `routes.ts`, que le rôle de l'écran qui porte le lien a le droit d'ouvrir ; les chemins sont uniques et chaque route a un titre.
import { describe, expect, it } from 'vitest';
import { ROUTES, resoudre } from './router.svelte.ts';
import { peut, TOUS_ROLES } from './domain/acces.ts';
import type { Role } from './domain/types.ts';
import type { ItemDock } from './ui/Dock.svelte';
import { dockVoyageur } from './ui/dockVoyageur.ts';
import { dockAgent as dockGuichet } from './apps/guichet/dock.ts';
import { dockSuperviseur } from './apps/superviseur/dock.ts';
import { dockPatron } from './apps/patron/dockPatron.ts';
import { dockAgent as dockTerrain } from './apps/terrain/dock.ts';

const sources = import.meta.glob('./**/*.{svelte,ts}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const fichiers = Object.entries(sources).filter(([f]) => !/\.test\.ts$/.test(f));

/** Un chemin interne écrit dans une chaîne : `'/pass'`, `` `/siege?depart=${id}` ``, `"/quai?scan=1"`. Les chemins construits (`/${x}`) ne sont pas vérifiés. */
const LIEN = /(['"`])(\/(?:[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*)?)(?:([?#][^'"`\s]*)|(?=\1))/g;
interface Lien { fichier: string; ligne: number; chemin: string; requete: string; texte: string }
function liensDe(fichier: string, texte: string): Lien[] {
  const res: Lien[] = [];
  texte.split('\n').forEach((ligne, i) => { if (/^\s*(\/\/|\/\*|\*|<!--)/.test(ligne)) return; for (const m of ligne.matchAll(LIEN)) if (!(m[2] === '/' && /(join|split|replace|startsWith|endsWith|includes|indexOf)\(\s*$/.test(ligne.slice(0, m.index)))) res.push({ fichier, ligne: i + 1, chemin: m[2], requete: (m[3] ?? '').replace(/^[?#]/, ''), texte: ligne }); });
  return res;
}
const tous = fichiers.flatMap(([f, t]) => liensDe(f, t));

describe('routes déclarées', () => {
  it('chaque route a un chemin unique', () => {
    const vus = new Map<string, number>(); for (const r of ROUTES) vus.set(r.chemin, (vus.get(r.chemin) ?? 0) + 1);
    expect([...vus].filter(([, n]) => n > 1).map(([c]) => c)).toEqual([]);
  });
  it('chaque route a un titre non vide et un composant', () => {
    expect(ROUTES.filter((r) => !r.titre?.trim()).map((r) => r.chemin)).toEqual([]);
    expect(ROUTES.filter((r) => typeof r.composant !== 'function').map((r) => r.chemin)).toEqual([]);
  });
  it('les titres sont uniques (un titre par page, utile à l’onglet du navigateur)', () => {
    const vus = new Map<string, string[]>(); for (const r of ROUTES) vus.set(r.titre, [...(vus.get(r.titre) ?? []), r.chemin]);
    expect([...vus].filter(([, c]) => c.length > 1)).toEqual([]);
  });
  it('les rôles cités existent', () => { for (const r of ROUTES) for (const x of r.roles ?? []) expect(TOUS_ROLES, `${r.chemin} : ${x}`).toContain(x); });
});

describe('liens internes', () => {
  it('on trouve des liens (le détecteur fonctionne)', () => { expect(tous.length).toBeGreaterThan(300); });
  it('chaque lien pointe vers une route déclarée', () => {
    const inconnus = tous.filter((l) => !resoudre(ROUTES, l.chemin)).map((l) => `${l.fichier}:${l.ligne} → ${l.chemin}`);
    expect(inconnus).toEqual([]);
  });
  it('les paramètres de requête sont bien formés (nom=valeur)', () => {
    const mal = tous.filter((l) => l.requete && !/^([a-zA-Z_]+=[^&]*)(&[a-zA-Z_]+=[^&]*)*$/.test(l.requete.replace(/\$\{[^}]*\}/g, 'x'))).map((l) => `${l.fichier}:${l.ligne} → ${l.chemin}?${l.requete}`);
    expect(mal).toEqual([]);
  });
});

// ------------------------------------------------------------------ droits : le rôle qui voit un lien peut l'ouvrir
/** Rôles de chaque écran : ceux des routes qui l'affichent (`routes.ts` : `composant: () => import('./X.svelte')`). */
function rolesParFichier(): Map<string, Role[]> {
  const res = new Map<string, Role[]>();
  for (const [f, t] of Object.entries(sources)) {
    if (!/\/apps\/[^/]+\/routes\.ts$/.test(f)) continue;
    const dossier = f.replace(/routes\.ts$/, '');
    for (const m of t.matchAll(/chemin:\s*'([^']+)'[^\n]*?import\('\.\/([A-Za-z0-9]+\.svelte)'\)/g)) {
      const route = ROUTES.find((r) => r.chemin === m[1]); if (!route?.roles) continue;
      const cle = dossier + m[2]; res.set(cle, [...new Set([...(res.get(cle) ?? []), ...route.roles])]);
    }
  }
  return res;
}
/** Liens qui changent de personne avant d'ouvrir l'écran (démo : « Agent de gare », « Patron » de l'orbe) ou réservés au patron par une condition du code. */
const EXCEPTIONS = /\bqui:|role === 'patron'/;
describe('droits des liens', () => {
  it('un écran ne propose pas de lien vers une page fermée à tous les rôles qui peuvent l’ouvrir', () => {
    // Un écran partagé par plusieurs rôles (Relais : voyageuse, relais, livreur) affiche certains liens à un seul rôle : il suffit qu'un des rôles de l'écran puisse suivre le lien.
    const roles = rolesParFichier(), mauvais: string[] = [];
    for (const l of tous) {
      const qui = roles.get(l.fichier); if (!qui || EXCEPTIONS.test(l.texte)) continue;
      const cible = resoudre(ROUTES, l.chemin)?.route; if (!cible?.roles) continue;
      if (!qui.some((r) => peut(r, cible.roles!))) mauvais.push(`${l.fichier}:${l.ligne} (${qui.join('/')}) → ${l.chemin}`);
    }
    expect([...new Set(mauvais)]).toEqual([]);
  });
  it('chaque barre du bas ne mène qu’à des écrans ouverts au rôle qui la voit', () => {
    const barres: [Role, ItemDock[]][] = [
      ['voyageur', dockVoyageur()], ['guichet', dockGuichet()], ['superviseur', dockGuichet()], ['superviseur', dockSuperviseur()], ['patron', dockPatron()],
      ...(['quai', 'chauffeur', 'convoyeur', 'controleur', 'conducteur', 'vendeur'] as Role[]).map((r): [Role, ItemDock[]] => [r, dockTerrain(r, '')])
    ];
    const mauvais: string[] = [];
    for (const [role, items] of barres) for (const it of items) {
      const cible = resoudre(ROUTES, it.href.split('?')[0])?.route;
      if (!cible) mauvais.push(`${role} → ${it.href} (route inconnue)`); else if (cible.roles && !peut(role, cible.roles)) mauvais.push(`${role} → ${it.href}`);
    }
    expect(mauvais).toEqual([]);
  });
});
