// Routeur minimal basé sur l'API History : un chemin, des paramètres de recherche, une pile de retour.
class Routeur {
  chemin = $state(location.pathname);
  recherche = $state(location.search);
  hash = $state(location.hash);
  /** Nombre de navigations internes faites depuis l'ouverture (pour savoir si `history.back()` reste dans l'app). */
  #profondeur = 0;

  constructor() {
    addEventListener('popstate', () => { if (this.#profondeur > 0) this.#profondeur--; this.#lire(); });
  }

  #lire(): void {
    this.chemin = location.pathname;
    this.recherche = location.search;
    this.hash = location.hash;
  }

  get params(): URLSearchParams { return new URLSearchParams(this.recherche); }

  /** Va à `cible` (chemin + recherche + hash). `remplacer` ne crée pas d'entrée d'historique. */
  aller(cible: string, remplacer = false): void {
    if (cible === location.pathname + location.search + location.hash) return;
    if (remplacer) history.replaceState(null, '', cible);
    else { history.pushState(null, '', cible); this.#profondeur++; }
    this.#lire();
    if (!remplacer) document.querySelector('.defile')?.scrollTo({ top: 0 });
  }

  /** Revient en arrière si l'on vient de l'app, sinon va à `repli`. */
  retour(repli = '/'): void {
    if (this.#profondeur > 0) history.back();
    else this.aller(repli, true);
  }

  /** Change un paramètre de recherche sans empiler d'historique. */
  definir(cle: string, valeur: string | null): void {
    const p = new URLSearchParams(location.search);
    if (valeur === null) p.delete(cle); else p.set(cle, valeur);
    const s = p.toString();
    this.aller(location.pathname + (s ? '?' + s : '') + location.hash, true);
  }
}
export const routeur = new Routeur();

/** Intercepte les clics sur les liens internes pour naviguer sans recharger. */
export function interceptionLiens(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || a.target || a.hasAttribute('download') || a.origin !== location.origin) return;
  e.preventDefault();
  routeur.aller(a.pathname + a.search + a.hash);
}
