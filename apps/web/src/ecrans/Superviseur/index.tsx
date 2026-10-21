import { agence } from "@afrimove/api-client";
import { useEffect, useMemo, useState } from "react";
import { DIRECT_VIDE, avecDirect, recevoir, type Direct } from "./direct";
import { GareVue, type EtatGare } from "./gare-vue";

/**
 * Écran Superviseur (AM-090, planche Superviseur.dc.html) : l'accueil du superviseur de gare.
 *
 * Les données viennent de `useSuperviseurGare` (lecture) et de `useGareDirect` (temps réel : une demande qui arrive,
 * un guichet qui bouge, un départ qui se remplit). Aucune écriture ici : valider une clôture ou une annulation se fait
 * sur les écrans suivants, avec le PIN ; la fusion de deux départs est seulement proposée, jamais faite.
 * `networkMode: "always"` : la lecture est locale, elle se recharge aussi hors ligne (AM-160).
 */
export function EcranSuperviseur() {
  const requete = agence.useSuperviseurGare(
    {},
    { networkMode: "always", refetchOnMount: "always" },
  );
  const direct = agence.useGareDirect();
  const [recu, setRecu] = useState<Direct>(DIRECT_VIDE);

  // Chaque message est appliqué tout de suite, puis la lecture est rechargée : le hook du direct ne garde que le
  // dernier message, la lecture rattrape ceux qu'une rafale aurait fait sauter et remplace les messages qu'elle
  // contient déjà (`avecDirect` ignore ceux qui sont plus anciens qu'elle).
  const { refetch } = requete;
  useEffect(() => {
    const message = direct.dernier;
    if (!message) return;
    setRecu((avant) => recevoir(avant, message));
    void refetch();
  }, [direct.dernier, refetch]);

  const lecture = requete.data;
  const gare = useMemo(() => (lecture ? avecDirect(lecture, recu) : undefined), [lecture, recu]);

  let etat: EtatGare;
  if (gare) etat = "pret";
  else if (requete.isError) etat = "erreur";
  else if (requete.isPending) etat = "chargement";
  else etat = "vide";

  return <GareVue etat={etat} gare={gare} onReessayer={() => void requete.refetch()} />;
}

export default EcranSuperviseur;
