import { ErreurHttp, patron } from "@afrimove/api-client";
import { patron as contrats } from "@afrimove/contrats";
import { useNavigate, useParams } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { ApercuVue, type EtatApercu } from "./apercu-vue";
import { telechargerApercu } from "./telechargement";

/** L'état de l'écran d'après la lecture de l'aperçu. Un export inconnu (404) n'est pas une panne. */
export function etatDe(requete: {
  data: contrats.ApercuExport | undefined;
  error: unknown;
  isError: boolean;
  isPending: boolean;
}): EtatApercu {
  if (requete.data) return requete.data.tableau.lignes.length === 0 ? "vide" : "pret";
  if (requete.isError) {
    return requete.error instanceof ErreurHttp && requete.error.statut === 404
      ? "introuvable"
      : "erreur";
  }
  return requete.isPending ? "chargement" : "introuvable";
}

function ApercuDeLExport({ exportId }: { exportId: contrats.IdExport }) {
  const navigate = useNavigate();
  const requete = patron.useApercuExport(exportId);
  const versComptable = () => void navigate(urlPlanche("Comptable"));
  return (
    <ApercuVue
      etat={etatDe(requete)}
      apercu={requete.data}
      onReessayer={() => void requete.refetch()}
      onFermer={versComptable}
      onTelecharger={() => {
        if (!requete.data) return;
        telechargerApercu(requete.data);
        versComptable();
      }}
    />
  );
}

/**
 * Écran Aperçu d'un export (AM-112, planche ComptableApercu.dc.html) : le pop-up que « Aperçu » ouvre par-dessus le
 * Comptable, pour l'export dont l'identifiant est dans l'adresse.
 *
 * Tout vient de `useApercuExport(exportId)` (`GET /patron/comptable/exports/:exportId/apercu`). « Télécharger » remet à
 * l'appareil le tableau que le pop-up montre ; « Fermer » et « Télécharger » ramènent au Comptable, « Envoyer au
 * cabinet » mène à la clôture.
 */
export function EcranComptableApercu() {
  const navigate = useNavigate();
  const { exportId } = useParams();
  const id = contrats.IdExportSchema.safeParse(exportId);
  // Un identifiant qui n'est pas celui d'un des cinq exports n'appelle pas l'API : il n'existe pas.
  if (!id.success) {
    return (
      <ApercuVue
        etat="introuvable"
        onFermer={() => void navigate(urlPlanche("Comptable"))}
        onTelecharger={() => undefined}
      />
    );
  }
  return <ApercuDeLExport exportId={id.data} />;
}

export default EcranComptableApercu;
