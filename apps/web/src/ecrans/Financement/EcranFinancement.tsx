import { patron } from "@afrimove/api-client";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { VueFinancement, type EtatFinancement } from "./vue";

/**
 * Écran Financement (AM-130, planche Financement.dc.html) : avance sur recettes, crédit matériel, paie des équipages
 * et paiement en 2 fois pour les voyageurs.
 *
 * Les données viennent de `useOffreFinancement`. « Demander 6 M » signe le mandat avec le PIN (toute écriture du
 * patron est signée), crée le dossier par `useDemanderAvance` puis ouvre FinancementDemande sur ce dossier.
 */
export function EcranFinancement() {
  const offre = patron.useOffreFinancement();
  const demander = patron.useDemanderAvance();
  const signer = patron.useSignaturePin();
  const navigate = useNavigate();

  let etat: EtatFinancement;
  if (offre.data) etat = "pret";
  else if (offre.isError) etat = "erreur";
  else if (offre.isPending) etat = "chargement";
  else etat = "vide";

  return (
    <VueFinancement
      etat={etat}
      offre={offre.data}
      onReessayer={() => void offre.refetch()}
      onDemander={async (montant, pin) => {
        const reponse = await demander.mutateAsync({ montant, signature: signer(pin) });
        void navigate(urlPlanche("FinancementDemande", { dossierId: reponse.dossier.id }));
      }}
    />
  );
}

export default EcranFinancement;
