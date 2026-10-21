import { voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { codeDeVille, formaterMontant, prochainDepart } from "./formats";
import styles from "./reseau.module.css";

/**
 * Où mène une ligne de bus : le siège et le paiement de son prochain départ. Le réseau ne donne pas l'identifiant
 * du départ, on le retrouve dans la recherche de départs du trajet (celui qui part à l'heure annoncée). Tant qu'il
 * n'est pas connu, la ligne mène à l'écran du départ sous l'identifiant de la ligne.
 */
function useAdresseBus(ligne: c.LigneReseau, maintenant: string): string {
  const recherche = voyageur.useRechercheDeparts(
    { depart: codeDeVille(ligne.depart), arrivee: codeDeVille(ligne.arrivee) },
    { enabled: ligne.mode === "bus" },
  );
  // La réponse doit être celle du trajet de la ligne : jamais le départ d'un autre trajet.
  const donnees = recherche.data;
  const memeTrajet =
    donnees?.depart.code === codeDeVille(ligne.depart) &&
    donnees.arrivee.code === codeDeVille(ligne.arrivee);
  const depart =
    donnees && memeTrajet ? prochainDepart(ligne, donnees.departs, maintenant) : undefined;
  return urlPlanche("SiegePay", { departId: depart?.id ?? ligne.id });
}

/** Une ligne du réseau : trajet, prochains départs, prix. Un covoiturage est en pointillés et en vert. */
export function LigneReseau({ ligne, maintenant }: { ligne: c.LigneReseau; maintenant: string }) {
  const { t } = useTranslation("Reseau");
  const adresseBus = useAdresseBus(ligne, maintenant);
  const covoit = ligne.mode === "covoiturage";
  const montant = formaterMontant(ligne.prix);

  return (
    <a
      href={covoit ? urlPlanche("Covoit") : adresseBus}
      className={covoit ? styles.ligneCovoit : styles.ligne}
      data-mode={ligne.mode}
    >
      <span className={styles.ligneTextes}>
        <span className={covoit ? styles.trajetCovoit : styles.trajet}>
          {ligne.depart} → {ligne.arrivee}
          {ligne.via && (
            <>
              {" "}
              <span className={styles.via}>{t("lignes.via", { ville: ligne.via })}</span>
            </>
          )}
          {covoit && (
            <>
              {" "}
              <span className={styles.mode}>{t("lignes.covoiturage")}</span>
            </>
          )}
        </span>
        <span className={styles.detail}>{ligne.resume}</span>
      </span>
      <span className={covoit ? styles.prixCovoit : styles.prix}>
        {ligne.prixEstUnMinimum ? t("lignes.des", { prix: montant }) : montant}
      </span>
    </a>
  );
}
