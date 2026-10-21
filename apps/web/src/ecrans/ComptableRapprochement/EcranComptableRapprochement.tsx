import { ErreurHttp, patron } from "@afrimove/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { lignesOuvertes } from "./formats";
import { RapprochementVue, type EtatEcran } from "./rapprochement-vue";
import { FeuilleSignature } from "./signature";

/**
 * Écran « Sans correspondance » (AM-111, planche ComptableRapprochement.dc.html) : les transactions MoMo reçues sur
 * le compte marchand qu'aucun billet ni colis ne porte, avec la cause probable et l'action proposée.
 *
 * Les lignes viennent de `useRapprochementMomo`. « Appliquer les N · mon PIN » signe les décisions proposées par
 * `useAppliquerRapprochement`, puis mène à la clôture : le mois ne se clôture que lorsque plus aucune ligne n'est
 * ouverte (le serveur le refuse sinon).
 */
export function EcranComptableRapprochement() {
  const { t } = useTranslation("ComptableRapprochement");
  const navigate = useNavigate();
  const requete = patron.useRapprochementMomo();
  const [signature, setSignature] = useState(false);

  const donnees = requete.data;
  // Un mois sans aucune transaction à traiter peut répondre 404 : c'est un état vide, pas une panne.
  const introuvable = requete.error instanceof ErreurHttp && requete.error.statut === 404;
  const etat: EtatEcran = donnees
    ? donnees.lignes.length === 0
      ? "vide"
      : "pret"
    : introuvable
      ? "vide"
      : requete.isError
        ? "erreur"
        : requete.isPending
          ? "chargement"
          : "vide";

  const ouvertes = donnees ? lignesOuvertes(donnees.lignes).length : 0;

  return (
    <>
      <RapprochementVue
        etat={etat}
        rapprochement={donnees}
        onReessayer={() => void requete.refetch()}
        onAppliquer={() => setSignature(true)}
      />
      <FeuilleSignature
        rapprochement={donnees}
        ouverte={signature}
        titre={t("boutons.appliquer", { count: ouvertes })}
        onFermer={() => setSignature(false)}
        onApplique={() => {
          setSignature(false);
          void navigate(urlPlanche("ComptableCloture"));
        }}
      />
    </>
  );
}

export default EcranComptableRapprochement;
