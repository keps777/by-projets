import type { ReactNode } from "react";
import styles from "./BulleWhatsApp.module.css";
import { classes } from "./internes/classes";

export interface BulleWhatsAppProps {
  /** `recu` : message d'AfriMove, à gauche. `envoye` : message du client ou du patron, à droite. */
  sens: "recu" | "envoye";
  /**
   * - `ecran` : bulle de l'écran Rapport du soir (13 px, coin de 16 px) ;
   * - `compacte` : bulle de la conversation de la planche USSD (12 px, coin de 12 px).
   */
  taille?: "ecran" | "compacte";
  children: ReactNode;
  /** Ligne de mention sous la bulle, ex. « 21:00 · signé Essono (Akwa) ». */
  mention?: string;
  /** Qui parle, pour les lecteurs d'écran (« AfriMove » ou « Vous » par défaut). */
  auteur?: string;
  /** Message sous forme de carte : fond surface et bord, pour le rapport structuré. */
  carte?: boolean;
  className?: string;
}

/**
 * Bulle de conversation WhatsApp. Planches : RapportSoir (rapport, question, réponse) et USSD
 * (conversation d'achat d'un billet).
 */
export function BulleWhatsApp({
  sens,
  taille = "ecran",
  children,
  mention,
  auteur,
  carte = false,
  className,
}: BulleWhatsAppProps) {
  const nom = auteur ?? (sens === "recu" ? "AfriMove" : "Vous");
  return (
    <div className={classes(styles.ligne, className)} data-sens={sens}>
      <div
        className={styles.bulle}
        data-sens={sens}
        data-taille={taille}
        data-carte={carte ? "oui" : undefined}
        role="group"
        aria-label={`Message de ${nom}`}
      >
        {children}
      </div>
      {mention ? <span className={styles.mention}>{mention}</span> : null}
    </div>
  );
}

export interface ConversationWhatsAppProps {
  /** Libellé de la conversation, lu par les lecteurs d'écran. */
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}

/** Fond de conversation (carte sombre, bord trait) qui empile les bulles. Planche : USSD. */
export function ConversationWhatsApp({
  ariaLabel,
  children,
  className,
}: ConversationWhatsAppProps) {
  return (
    <div role="log" aria-label={ariaLabel} className={classes(styles.conversation, className)}>
      {children}
    </div>
  );
}
