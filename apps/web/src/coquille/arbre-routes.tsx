import type { ComponentType } from "react";
import { Navigate, type RouteObject } from "react-router";
import { Chargement } from "./chargement";
import { NonTrouvee } from "./non-trouvee";
import { moduleDeLUrl, modulesMasquesValides } from "./modules";
import { analyserRoute } from "./planches";
import { ACCUEIL_ESPACE } from "./roles";
import { useSession } from "./session";

export type Chargeur = () => Promise<{ default: ComponentType }>;

/** Fichiers découverts par `import.meta.glob` : clé = chemin `./routes/...tsx`, valeur = import dynamique. */
export interface SourcesRoutes {
  pages: Record<string, Chargeur>;
  layouts: Record<string, Chargeur>;
}

export interface RouteDeclaree {
  /** Chemin du fichier sous `routes/`, sans `.tsx` : `(voyageur)/depart/[departId]`. */
  fichier: string;
  /** Même chose avec le `/` de tête, c'est la notation de docs/tickets.md. */
  route: string;
  /** Motif d'URL de React Router (groupe retiré, `[x]` devenu `:x`). */
  url: string;
  /** Dossier du layout qui l'enveloppe (`(voyageur)`, `controle`, `""` pour la racine). */
  layout: string;
  chargeur: Chargeur;
}

const MOTIF_FICHIER = /^\.\/routes\/(.+)\.tsx$/;

/** `./routes/(voyageur)/layout.tsx` -> `(voyageur)` ; `./routes/layout.tsx` -> `` (racine). */
export function dossierDeLayout(cle: string): string | null {
  const fichier = cle.match(MOTIF_FICHIER)?.[1];
  if (fichier === undefined || !/(^|\/)layout$/.test(fichier)) return null;
  return fichier.replace(/\/?layout$/, "");
}

/**
 * Layout d'une page : le plus proche, sans empilement. D'abord le dossier du segment lui-même
 * (`routes/controle/layout.tsx` pour `routes/controle.tsx`), puis chaque dossier parent jusqu'à la racine.
 */
export function layoutDe(fichier: string, dossiers: ReadonlySet<string>): string | null {
  const segments = fichier.split("/");
  const candidats = [fichier];
  for (let n = segments.length - 1; n >= 0; n--) candidats.push(segments.slice(0, n).join("/"));
  return candidats.find((dossier) => dossiers.has(dossier)) ?? null;
}

/** Toutes les pages de `routes/`, layouts exclus, avec leur URL et leur layout. */
export function declarerRoutes(sources: SourcesRoutes): RouteDeclaree[] {
  const dossiers = new Set<string>();
  for (const cle of Object.keys(sources.layouts)) {
    const dossier = dossierDeLayout(cle);
    if (dossier !== null) dossiers.add(dossier);
  }
  const declarees: RouteDeclaree[] = [];
  for (const [cle, chargeur] of Object.entries(sources.pages)) {
    const fichier = cle.match(MOTIF_FICHIER)?.[1];
    if (fichier === undefined || dossierDeLayout(cle) !== null) continue;
    const layout = layoutDe(fichier, dossiers);
    if (layout === null) throw new Error(`Aucun layout pour la route ${fichier}`);
    declarees.push({
      fichier,
      route: `/${fichier}`,
      url: analyserRoute(`/${fichier}`).url,
      layout,
      chargeur,
    });
  }
  return declarees.sort((a, b) => a.url.localeCompare(b.url));
}

function lazyDe(chargeur: Chargeur): NonNullable<RouteObject["lazy"]> {
  return async () => ({ Component: (await chargeur()).default });
}

/** `/` : envoie vers l'accueil de l'espace du rôle courant. */
function RedirectionAccueil() {
  const { role } = useSession();
  return <Navigate to={ACCUEIL_ESPACE[role]} replace />;
}

/**
 * Construit l'arbre de routes de React Router. Chaque layout est une route sans chemin qui enveloppe les pages
 * de son dossier ; les pages portent leur URL complète. Un module masqué (`masques`) retire ses routes : l'adresse
 * tombe alors sur « introuvable ».
 */
export function construireRoutes(
  sources: SourcesRoutes,
  masques: readonly string[] = [],
): RouteObject[] {
  const masquesValides = new Set<string>(modulesMasquesValides(masques));
  const parLayout = new Map<string, RouteObject[]>();

  for (const route of declarerRoutes(sources)) {
    const module = moduleDeLUrl(route.url);
    if (module !== null && masquesValides.has(module)) continue;
    const liste = parLayout.get(route.layout) ?? [];
    liste.push({ path: route.url, lazy: lazyDe(route.chargeur) });
    parLayout.set(route.layout, liste);
  }

  const racine = parLayout.get("") ?? [];
  racine.push(
    { path: "/", element: <RedirectionAccueil /> },
    { path: "*", element: <NonTrouvee /> },
  );
  parLayout.set("", racine);

  const chargeursLayouts = new Map<string, Chargeur>();
  for (const [cle, chargeur] of Object.entries(sources.layouts)) {
    const dossier = dossierDeLayout(cle);
    if (dossier !== null) chargeursLayouts.set(dossier, chargeur);
  }

  return [...parLayout.entries()].map(([dossier, enfants]) => {
    const chargeur = chargeursLayouts.get(dossier);
    if (!chargeur) throw new Error(`Layout introuvable pour le dossier « ${dossier} »`);
    return {
      id: `layout:${dossier || "racine"}`,
      lazy: lazyDe(chargeur),
      HydrateFallback: Chargement,
      children: enfants,
    };
  });
}
