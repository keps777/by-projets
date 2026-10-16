import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router";
import { useModeDemo } from "./parametres";
import { SelecteurRole } from "./selecteur-role";
import styles from "./cadre.module.css";

/**
 * Cadre de l'application : sur téléphone l'écran occupe toute la largeur ; sur ordinateur il reste une colonne de
 * 390 px centrée (comme les planches). `fluide` (salle de contrôle, pages de développement) prend toute la
 * largeur.
 *
 * Le cadre intercepte aussi les liens internes (`<a href="/...">`, comme ceux du kit UI) pour les traiter
 * comme des navigations de l'application : on ne recharge pas la page, donc le flag conception, l'horloge et
 * le scénario passés dans l'URL au démarrage ne se perdent pas.
 */
export function Cadre({ fluide = false, children }: { fluide?: boolean; children: ReactNode }) {
  const navigate = useNavigate();
  const demo = useModeDemo();

  function surClic(evenement: MouseEvent<HTMLElement>) {
    if (evenement.defaultPrevented || evenement.button !== 0) return;
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    const cible = evenement.target;
    if (!(cible instanceof Element)) return;
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
    <div className={fluide ? `${styles.cadre} ${styles.fluide}` : styles.cadre} onClick={surClic}>
      {children}
      {demo && !fluide && <SelecteurRole flottant />}
    </div>
  );
}
