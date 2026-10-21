import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router";
import { BandeauMiseAJour } from "./bandeau-mise-a-jour";
import { cibleDeSecours, pointeurTactile } from "./cible-tactile";
import {
  HAUTEUR_ECRAN,
  HAUTEUR_LIGNE_DEMO,
  echelleCadre,
  modeAffichage,
  useFenetre,
} from "./mode-affichage";
import { useModeDemo } from "./parametres";
import { SelecteurRole } from "./selecteur-role";
import styles from "./cadre.module.css";

/**
 * Cadre de l'application. Sur téléphone (jusqu'à 600 px de large, ou fenêtre trop courte) l'écran remplit toute
 * la fenêtre, sans bande ni cadre. Sur ordinateur et tablette (plus de 600 px de large et au moins 760 px de
 * haut) il est montré dans un boîtier d'iPhone : écran de 390 x 844 mis à l'échelle pour tenir dans la fenêtre,
 * contenu défilant à l'intérieur. `fluide` (salle de contrôle, pages de développement) reste plein écran, sans cadre.
 *
 * L'arbre React est le même dans les deux modes (seul le CSS change, via `data-mode`) : redimensionner ou faire
 * pivoter l'appareil ne remonte donc jamais l'écran. L'écran intérieur est un contenant (`contain: paint`) :
 * les feuilles modales, le clavier PIN et les toasts en `position: fixed` s'y ancrent et restent dans le cadre.
 *
 * Sur écran tactile, les appuis qui tombent à côté d'une petite cible sont renvoyés à celle-ci (zone de 44 px, sans
 * changer la mise en page : voir cible-tactile.ts).
 *
 * Le cadre intercepte aussi les liens internes (`<a href="/...">`, comme ceux du kit UI) pour les traiter
 * comme des navigations de l'application : on ne recharge pas la page, donc le flag conception, l'horloge et
 * le scénario passés dans l'URL au démarrage ne se perdent pas.
 */
export function Cadre({ fluide = false, children }: { fluide?: boolean; children: ReactNode }) {
  const navigate = useNavigate();
  const demo = useModeDemo();
  const { largeur, hauteur } = useFenetre();
  const mode = fluide ? "plein" : modeAffichage(largeur, hauteur);
  const echelle = echelleCadre(largeur, hauteur, demo ? HAUTEUR_LIGNE_DEMO : 0);
  // Hauteur vue par les pages : la fenêtre en plein écran, 844 px dans le cadre.
  const retrecit = mode === "plein" && hauteur < HAUTEUR_ECRAN ? 0 : 1;

  function surClic(evenement: MouseEvent<HTMLElement>) {
    if (evenement.defaultPrevented || evenement.button !== 0) return;
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    const cible = evenement.target;
    if (!(cible instanceof Element)) return;
    // Doigt : un appui juste à côté d'une petite cible (puce, onglet, lien) est renvoyé à cette cible (zone de 44 px).
    if (evenement.detail > 0 && pointeurTactile()) {
      const secours = cibleDeSecours(
        evenement.currentTarget,
        cible,
        evenement.clientX,
        evenement.clientY,
      );
      if (secours instanceof HTMLElement) {
        evenement.preventDefault();
        secours.click();
        return;
      }
    }
    const lien = cible.closest("a[href]");
    if (!lien || lien.hasAttribute("download")) return;
    const cibleFenetre = lien.getAttribute("target");
    if (cibleFenetre && cibleFenetre !== "_self") return;
    const href = lien.getAttribute("href") ?? "";
    // Interne = chemin absolu de l'application ; `#ancre`, `//hote`, `mailto:` restent au navigateur.
    if (!href.startsWith("/") || href.startsWith("//")) return;
    evenement.preventDefault();
    void navigate(href);
  }

  return (
    <div
      className={fluide ? `${styles.cadre} ${styles.fluide}` : styles.cadre}
      data-mode={mode}
      style={{ "--echelle": echelle, "--am-retrecit": retrecit } as CSSProperties}
      onClick={surClic}
    >
      {demo && !fluide && <SelecteurRole flottant />}
      <div className={styles.boitier}>
        <div className={styles.corps}>
          <div className={styles.ecran}>
            {children}
            {/* Dans l'écran : en mode cadre, le bandeau reste dans l'iPhone et ne flotte pas sur la page. */}
            <BandeauMiseAJour />
          </div>
          <span className={styles.ilot} aria-hidden="true" />
          <span className={styles.barreAccueil} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
