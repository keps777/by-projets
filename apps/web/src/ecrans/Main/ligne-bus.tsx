import { voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { LigneDepart } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { CAPACITE_REFERENCE, SEUIL_URGENCE, heureDouala } from "./formats";
import styles from "./main.module.css";

/**
 * Une ligne de bus de la liste des départs. Les places suivent le plan de sièges en temps réel : quand un autre
 * voyageur prend un siège, le nombre de places et la jauge changent sans recharger l'écran. Tant que le plan n'est
 * pas arrivé (ou s'il est en panne), la ligne garde le nombre de places de la recherche.
 */
export function LigneBus({ depart }: { depart: c.DepartVoyageur }) {
  const { t } = useTranslation("Main");
  const { plan } = voyageur.usePlanSiegesTempsReel({ departId: depart.id });

  // Un plan d'un autre départ (ou d'une version plus ancienne de la recherche) ne doit jamais s'afficher ici.
  const direct = plan?.departId === depart.id ? plan : undefined;
  const placesLibres = direct ? direct.libres : depart.placesLibres;
  const capacite = direct ? direct.capacite : CAPACITE_REFERENCE;
  const presqueComplet = direct ? placesLibres <= SEUIL_URGENCE : depart.presqueComplet;

  return (
    <LigneDepart
      heure={heureDouala(depart.heureDepart)}
      compagnie={depart.compagnie.nom}
      classe={t(`classes.${depart.classe}`)}
      classePremium={depart.classe === "vip"}
      placesLibres={placesLibres}
      capacite={Math.max(capacite, placesLibres)}
      // Le serveur dit « presque complet » : la ligne passe en rouge même au-dessus du seuil habituel.
      seuilUrgence={presqueComplet ? Math.max(placesLibres, SEUIL_URGENCE) : SEUIL_URGENCE}
      prix={depart.prix}
      href={urlPlanche("SiegePay", { departId: depart.id })}
      className={styles.ligneDepart}
    />
  );
}
