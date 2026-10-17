import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useHorloge } from "@/coquille/horloge";
import { BilletVue } from "./BilletVue";
import { useCacheBillet } from "./cache-billet";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";

/** Lecture de la copie chiffrée de l'appareil : en cours, ou terminée (avec ou sans billet). */
type Copie = { lue: false } | { lue: true; billet: c.BilletVoyageur | null };

/** Le serveur dit que ce billet n'existe pas ou n'est pas à cette personne : la copie locale ne vaut plus rien. */
function billetRefuse(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/**
 * Planche « Pass » (3 · Billet : QR et code à 4 chiffres). Le billet vient de `useBillet`. À chaque réponse du
 * serveur il est gardé, chiffré, sur l'appareil : sans réseau, l'écran affiche cette copie au lieu d'une erreur,
 * pour que le QR reste présentable au quai. La lecture ne s'arrête pas quand le réseau manque (`networkMode:
 * "always"`) : elle échoue vite et l'écran bascule sur la copie.
 */
export function EcranPass() {
  const { billetId = "" } = useParams();
  const horloge = useHorloge();
  const cache = useCacheBillet();
  const requete = voyageur.useBillet(
    { billetId },
    { networkMode: "always", enabled: billetId !== "" },
  );
  const [copie, setCopie] = useState<Copie>({ lue: false });

  // Copie locale : lue au chargement de l'écran, avant même la réponse du serveur.
  useEffect(() => {
    let abandonne = false;
    setCopie({ lue: false });
    void cache.lire(billetId, horloge.maintenant().getTime()).then((billet) => {
      if (!abandonne) setCopie({ lue: true, billet });
    });
    return () => {
      abandonne = true;
    };
  }, [cache, billetId, horloge]);

  const refuse = billetRefuse(requete.error);
  const recu = requete.data;

  // Chaque réponse du serveur remplace la copie ; un refus (404, 403) l'efface.
  useEffect(() => {
    if (recu !== undefined) void cache.ecrire(billetId, recu, horloge.maintenant().getTime());
  }, [cache, billetId, horloge, recu]);
  useEffect(() => {
    if (refuse) cache.retirer(billetId);
  }, [cache, billetId, refuse]);

  if (billetId === "" || refuse) return <EtatVide />;

  const billet = recu ?? (copie.lue ? copie.billet : null) ?? undefined;
  if (billet !== undefined) {
    // La copie locale est montrée dès qu'elle est lue, sans attendre le serveur. Le bandeau n'apparaît que si la
    // lecture a échoué : c'est alors la copie qui fait foi.
    return <BilletVue billet={billet} copieLocale={recu === undefined && requete.isError} />;
  }

  if (requete.isError && copie.lue)
    return <EtatErreur onReessayer={() => void requete.refetch()} />;
  return <EtatChargement />;
}
