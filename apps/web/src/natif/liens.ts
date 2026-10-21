/**
 * Liens entrants dans l'application emballée (AM-184) : un lien web (`https://<hôte>/depart/12`) ou un lien à schéma
 * propre (`com.afrimove.app://depart/12`) ouvre l'application, qui doit alors afficher la même page que le navigateur.
 *
 * Ce module ne dépend ni de Capacitor ni de React : il ne fait que traduire une adresse en chemin interne, puis
 * le donner au routeur. Il tourne donc à l'identique dans le navigateur (où il ne sert à rien) et dans l'application.
 */

/** Schéma propre de l'application : le même que l'`appId` Capacitor (capacitor.config.ts). */
export const SCHEMA_APPLICATION = "com.afrimove.app";

/** Hôtes des liens web qui ouvrent l'application : `VITE_LIENS_HOTES=afrimove.exemple.org,www.afrimove.exemple.org`. */
export function hotesDeLiens(brut: string | undefined): string[] {
  return (brut ?? "")
    .split(",")
    .map((hote) => hote.trim().toLowerCase())
    .filter((hote) => hote !== "");
}

/**
 * Chemin interne (`/depart/12?x=1#haut`) d'un lien entrant, ou `null` s'il ne faut pas le suivre : adresse illisible,
 * hôte inconnu, autre schéma (`http`, `javascript`, `intent`…). Seuls un chemin local de l'application peut sortir de
 * cette fonction : jamais d'adresse absolue ni de chemin commençant par `//` (redirection ouverte).
 */
export function cheminInterne(url: string, hotes: readonly string[]): string | null {
  let adresse: URL;
  try {
    adresse = new URL(url);
  } catch {
    return null;
  }

  let chemin: string;
  if (adresse.protocol === "https:") {
    if (!hotes.includes(adresse.hostname.toLowerCase())) return null;
    chemin = adresse.pathname;
  } else if (adresse.protocol === `${SCHEMA_APPLICATION}:`) {
    // com.afrimove.app://depart/12 : « depart » est lu comme l'hôte, com.afrimove.app:///depart/12 comme le chemin.
    chemin = `${adresse.host}${adresse.pathname}`;
  } else {
    return null;
  }

  chemin = `/${chemin.replace(/^\/+/, "")}`;
  // Pas de caractère de contrôle ni d'antislash (certains navigateurs les lisent comme « / »).
  if (/[\u0000-\u001f\\]/.test(chemin)) return null;
  return `${chemin}${adresse.search}${adresse.hash}`;
}

/**
 * Affiche `chemin` dans l'application sans la recharger. Le routeur (React Router) écoute `popstate` : empiler
 * l'entrée d'historique puis émettre l'événement le fait réagir comme à un lien interne, et le bouton retour
 * revient à la page précédente. Sans effet si on y est déjà.
 */
export function naviguerVers(chemin: string, fenetre: Window = window): void {
  const { pathname, search, hash } = fenetre.location;
  if (`${pathname}${search}${hash}` === chemin) return;
  fenetre.history.pushState(null, "", chemin);
  fenetre.dispatchEvent(new PopStateEvent("popstate", { state: null }));
}
