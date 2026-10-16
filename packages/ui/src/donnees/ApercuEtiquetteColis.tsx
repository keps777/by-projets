import styles from "./ApercuEtiquetteColis.module.css";
import { CartePapier } from "./internes/CartePapier";
import { CodeBarres } from "./internes/CodeBarres";

export interface ApercuEtiquetteColisProps {
  /** Trajet en villes abrégées, ex. « DLA → BAF ». */
  trajet: string;
  /** Destinataire, téléphone masqué, ex. « Ngo Thérèse · ···· 18 22 ». */
  destinataire: string;
  /** Référence du colis, ex. « C-ALP-DLA-270105-0042 ». Les barres en sont tirées. */
  reference: string;
  /** Poids affiché, ex. « 2 kg ». */
  poids: string;
  /** Heure du départ, ex. « 08:15 ». */
  heure: string;
  /** Ligne du bas, ex. « Alpha Voyages · afrimove.cm · pas de code ici ». */
  mention?: string;
  /** État de l'imprimante dans l'en-tête, ex. « imprimante OK ». */
  statutImprimante?: string;
}

/**
 * Aperçu de l'étiquette colis 58 × 40 mm, telle qu'elle sortira de l'imprimante. Le code de
 * retrait n'y figure pas : il n'est envoyé qu'au destinataire. Planche : GuichetColis.
 */
export function ApercuEtiquetteColis({
  trajet,
  destinataire,
  reference,
  poids,
  heure,
  mention,
  statutImprimante,
}: ApercuEtiquetteColisProps) {
  return (
    <CartePapier
      titre="Aperçu de l'étiquette · 58 × 40 mm"
      statut={statutImprimante}
      ariaLabel={`Aperçu de l'étiquette colis ${reference}`}
    >
      <div className={styles.corps}>
        <span className={styles.texte}>
          <span className={styles.trajet}>{trajet}</span>
          <span className={styles.destinataire}>{destinataire}</span>
          <span className={styles.reference}>
            {reference} · {poids} · {heure}
          </span>
          {mention ? <span className={styles.mention}>{mention}</span> : null}
        </span>
        <CodeBarres texte={reference} libelle="Code-barres du colis" />
      </div>
    </CartePapier>
  );
}
