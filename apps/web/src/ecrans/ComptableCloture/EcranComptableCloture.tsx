import { ErreurHttp, patron } from "@afrimove/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ClotureVue, type EtatEcran } from "./cloture-vue";
import { enMinuscules, nomDuMois } from "./formats";
import { FeuilleSignature } from "./signature";

/**
 * Écran « Mois clôturé et envoyé au cabinet » (AM-113, planche ComptableCloture.dc.html) : le total encaissé, le mois
 * verrouillé, les fichiers envoyés au cabinet et l'aperçu du journal des ventes.
 *
 * Les données viennent de `useClotureMois`. On y arrive de « Clôturer · tout envoyer » (Comptable) ou après avoir
 * appliqué les décisions du rapprochement (signées par le PIN) : tant que le mois est ouvert, « Clôturer · mon PIN »
 * signe la clôture avec `useCloturerMois`, puis l'écran montre le mois clôturé. Un mois clôturé n'accepte plus aucune
 * modification, seulement des écritures du mois suivant (le serveur refuse le reste).
 */
export function EcranComptableCloture() {
  const { t } = useTranslation("ComptableCloture");
  const [signature, setSignature] = useState(false);
  const requete = patron.useClotureMois();
  const donnees = requete.data;

  // Le nombre de transactions sans correspondance traitées vient du rapprochement (même mois par défaut que la
  // clôture) ; sans lui, la phrase du verrou garde seulement sa seconde moitié.
  const rapprochement = patron.useRapprochementMomo();
  const traitees = rapprochement.data?.lignes.filter((l) => l.decision !== null).length;

  // Un mois inconnu répond 404 : il n'y a rien à clôturer, ce n'est pas une panne.
  const introuvable = requete.error instanceof ErreurHttp && requete.error.statut === 404;
  const etat: EtatEcran = donnees
    ? donnees.statut === "cloture"
      ? "cloture"
      : "a_cloturer"
    : introuvable
      ? "vide"
      : requete.isError
        ? "erreur"
        : requete.isPending
          ? "chargement"
          : "vide";

  const mois = donnees ? enMinuscules(nomDuMois(donnees.libelle)) : "";

  return (
    <>
      <ClotureVue
        etat={etat}
        cloture={donnees}
        traitees={traitees}
        onReessayer={() => void requete.refetch()}
        onCloturer={() => setSignature(true)}
      />
      <FeuilleSignature
        cloture={donnees}
        ouverte={signature}
        titre={t("boutons.cloturer", { mois })}
        onFermer={() => setSignature(false)}
        onCloture={() => setSignature(false)}
      />
    </>
  );
}

export default EcranComptableCloture;
