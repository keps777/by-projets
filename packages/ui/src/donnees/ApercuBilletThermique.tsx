import styles from "./ApercuBilletThermique.module.css";
import { CartePapier } from "./internes/CartePapier";
import { CodeBarres } from "./internes/CodeBarres";

export interface ApercuBilletThermiqueProps {
  compagnie: string;
  /** Trajet en villes abrégées, ex. « DLA → YDE ». */
  trajet: string;
  /** Départ en toutes lettres, ex. « Mar 5 janv. · 08:30 ». */
  depart: string;
  siege: string;
  voyageur: string;
  /** Montant déjà formaté, ex. « 4 000 F ». */
  montant: string;
  /** Mode de paiement, ex. « Cash ». */
  mode: string;
  /** Numéro du billet, ex. « ALP-DLA-270105-0185 ». Les barres en sont tirées. */
  numero: string;
  /** Ligne du bas, ex. « afrimove.cm ». */
  mention?: string;
  /** État de l'imprimante dans l'en-tête, ex. « imprimante OK ». */
  statutImprimante?: string;
}

/**
 * Aperçu du billet imprimé au guichet sur papier thermique de 58 mm. Le papier est dessiné à
 * sa largeur réelle (58 mm) au centre d'une carte claire, comme l'étiquette colis.
 */
export function ApercuBilletThermique({
  compagnie,
  trajet,
  depart,
  siege,
  voyageur,
  montant,
  mode,
  numero,
  mention,
  statutImprimante,
}: ApercuBilletThermiqueProps) {
  return (
    <CartePapier
      titre="Aperçu du billet · 58 mm"
      statut={statutImprimante}
      ariaLabel={`Aperçu du billet ${numero}`}
    >
      <div className={styles.fond}>
        <div className={styles.papier}>
          <span className={styles.compagnie}>{compagnie}</span>
          <span className={styles.trajet}>{trajet}</span>
          <span className={styles.depart}>{depart}</span>
          <dl className={styles.details}>
            <div>
              <dt>Siège</dt>
              <dd>{siege}</dd>
            </div>
            <div>
              <dt>Voyageur</dt>
              <dd>{voyageur}</dd>
            </div>
            <div>
              <dt>{mode}</dt>
              <dd>{montant}</dd>
            </div>
          </dl>
          <CodeBarres texte={numero} libelle="Code-barres du billet" largeur={180} hauteur={36} />
          <span className={styles.numero}>{numero}</span>
          {mention ? <span className={styles.mention}>{mention}</span> : null}
        </div>
      </div>
    </CartePapier>
  );
}
