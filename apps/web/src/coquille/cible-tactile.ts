/**
 * Zone tactile minimale de 44 px, sans toucher à la mise en page.
 *
 * Les planches dessinent des puces, des onglets et des liens de 28 à 40 px : on ne les grossit pas (la fidélité aux
 * maquettes prime), mais un appui du doigt qui tombe à côté, dans la marge qui complète la cible à 44 px, est
 * renvoyé à l'élément le plus proche. Aucun effet à la souris, ni sur un appui qui touche déjà un contrôle.
 */

/** Taille minimale d'une cible tactile (points CSS). */
export const CIBLE_MIN = 44;

/** Éléments qui répondent à un appui. */
export const SELECTEUR_CIBLES =
  'button, a[href], summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"]';

export interface Rectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Candidat<T> {
  element: T;
  rect: Rectangle;
}

/**
 * Rectangle agrandi pour atteindre `minimum` dans chaque dimension (de part et d'autre, à parts égales). Une cible
 * déjà assez grande ne change pas.
 */
export function zoneTactile(rect: Rectangle, minimum = CIBLE_MIN): Rectangle {
  const dx = Math.max(0, (minimum - (rect.right - rect.left)) / 2);
  const dy = Math.max(0, (minimum - (rect.bottom - rect.top)) / 2);
  return {
    left: rect.left - dx,
    top: rect.top - dy,
    right: rect.right + dx,
    bottom: rect.bottom + dy,
  };
}

function contient(rect: Rectangle, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function distanceAuCentre(rect: Rectangle, x: number, y: number): number {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  return Math.hypot(cx - x, cy - y);
}

/**
 * Parmi les cibles, celle dont la zone tactile (agrandie à 44 px) contient le point d'appui, la plus proche en
 * cas d'égalité. `null` si aucune : l'appui reste un appui dans le vide.
 */
export function choisirCible<T>(
  candidats: ReadonlyArray<Candidat<T>>,
  x: number,
  y: number,
  minimum = CIBLE_MIN,
): T | null {
  let meilleur: Candidat<T> | null = null;
  let distanceMeilleur = Infinity;
  for (const candidat of candidats) {
    const largeur = candidat.rect.right - candidat.rect.left;
    const hauteur = candidat.rect.bottom - candidat.rect.top;
    // Une cible déjà assez grande aurait reçu l'appui elle-même : seules les petites ont une marge à rattraper.
    if (largeur >= minimum && hauteur >= minimum) continue;
    if (!contient(zoneTactile(candidat.rect, minimum), x, y)) continue;
    const distance = distanceAuCentre(candidat.rect, x, y);
    if (distance < distanceMeilleur) {
      meilleur = candidat;
      distanceMeilleur = distance;
    }
  }
  return meilleur?.element ?? null;
}

/** Vrai quand l'appareil se pilote au doigt (écran tactile, pointeur imprécis). */
export function pointeurTactile(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Pour un appui qui n'a touché aucun contrôle : le contrôle de `racine` à qui le renvoyer, s'il y en a un.
 * Un contrôle caché derrière une fenêtre modale (son centre n'est pas celui qu'on voit en haut de la pile) est
 * écarté : toucher le voile ne déclenche jamais ce qui est dessous.
 */
export function cibleDeSecours(
  racine: Element,
  cible: Element,
  x: number,
  y: number,
): Element | null {
  if (cible.closest(SELECTEUR_CIBLES) || cible.closest("input, select, textarea, label"))
    return null;
  const candidats: Array<Candidat<Element>> = [];
  for (const element of racine.querySelectorAll(SELECTEUR_CIBLES)) {
    if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true")
      continue;
    const r = element.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    candidats.push({
      element,
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    });
  }
  const choisi = choisirCible(candidats, x, y);
  if (!choisi) return null;
  const r = choisi.getBoundingClientRect();
  const dessus =
    typeof document.elementFromPoint === "function"
      ? document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
      : choisi;
  return dessus && choisi.contains(dessus) ? choisi : null;
}
