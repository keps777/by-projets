import { ErreurHttp, patron } from "@afrimove/api-client";
import { patron as contrats } from "@afrimove/contrats";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { ApercuVue, type EtatApercu } from "./apercu-vue";
import { remettreLeFichier } from "./telechargement";

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
  const [onglet, setOnglet] = useState<string | undefined>(undefined);
  const requete = patron.useApercuExport(exportId, undefined, onglet);
  const fichier = patron.useFichierExport();
  const versComptable = () => void navigate(urlPlanche("Comptable"));
  return (
    <ApercuVue
      etat={etatDe(requete)}
      apercu={requete.data}
      {...(onglet !== undefined ? { ongletActif: onglet } : {})}
      onChoisirOnglet={setOnglet}
      onReessayer={() => void requete.refetch()}
      onFermer={versComptable}
      enTelechargement={fichier.isPending}
      erreurTelechargement={fichier.isError}
      onTelecharger={() => {
        // Le vrai fichier de l'export (pas un extrait de l'aperçu) : XLSX, CSV ou PDF, avec son empreinte.
        fichier.mutate(
          { exportId },
          {
            onSuccess: (recu) => {
              remettreLeFichier(recu);
              versComptable();
            },
          },
        );
      }}
    />
  );
}

/**
 * Écran Aperçu d'un export (AM-112, planche ComptableApercu.dc.html) : le pop-up que « Aperçu » ouvre par-dessus le
 * Comptable, pour l'export dont l'identifiant est dans l'adresse.
 *
 * Tout vient de `useApercuExport(exportId, mois, onglet)` (`GET /patron/comptable/exports/:exportId/apercu`) : toucher un
 * onglet lit son tableau. « Télécharger » va chercher le vrai fichier de l'export (`useFichierExport`,
 * `GET …/fichier`) et le remet à l'appareil tel quel ; « Fermer » et « Télécharger » ramènent au Comptable, « Envoyer au
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
