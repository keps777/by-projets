import { ErreurHttp, patron } from "@afrimove/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { DemandeVue, type EtatDemande, type MessageRetrait } from "./demande-vue";
import { FeuilleSignature } from "./signature";

/**
 * Écran « Dossier envoyé · suivi » (AM-131, planche FinancementDemande.dc.html) : l'avance demandée au partenaire
 * financier, ses conditions, les pièces jointes automatiques et la frise de suivi.
 *
 * Le dossier vient de `useDossierFinancement`. Le patron peut retirer la demande tant qu'elle n'est pas versée :
 * « Retirer la demande » signe le retrait avec son PIN (`useRetirerDemande`), puis mène au Financement. AfriMove ne
 * prête pas : il présente le dossier et exécute le prélèvement convenu, rien d'autre ne se passe sur cet écran.
 */
export function EcranFinancementDemande({ dossierId }: { dossierId: string | undefined }) {
  const { t } = useTranslation("FinancementDemande");
  const navigate = useNavigate();
  const requete = patron.useDossierFinancement(dossierId ?? "");
  const [signature, setSignature] = useState(false);
  const [message, setMessage] = useState<MessageRetrait | null>(null);

  // Un dossier inconnu répond 404 : il n'y a rien à suivre, ce n'est pas une panne.
  const introuvable = requete.error instanceof ErreurHttp && requete.error.statut === 404;
  const etat: EtatDemande = requete.data
    ? "pret"
    : introuvable
      ? "vide"
      : requete.isError
        ? "erreur"
        : requete.isPending
          ? "chargement"
          : "vide";

  return (
    <>
      <DemandeVue
        etat={etat}
        dossier={requete.data}
        messageRetrait={message}
        onReessayer={() => void requete.refetch()}
        onRetirer={() => {
          setMessage(null);
          setSignature(true);
        }}
      />
      <FeuilleSignature
        dossier={requete.data}
        ouverte={signature}
        titre={t("actions.retirer")}
        onFermer={() => setSignature(false)}
        onRetiree={() => {
          setSignature(false);
          void navigate(urlPlanche("Financement"));
        }}
        onEchec={(cause) => {
          setMessage(cause);
          // Le serveur fait foi : on relit le dossier pour voir s'il est encore retirable.
          void requete.refetch();
        }}
      />
    </>
  );
}

export default EcranFinancementDemande;
