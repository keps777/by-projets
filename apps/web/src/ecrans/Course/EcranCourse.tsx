import { ErreurHttp, voyageur } from "@afrimove/api-client";
import { useSearchParams } from "react-router";
import { EXEMPLES_PARAMS } from "@/coquille/planches";
import { useModeDemo } from "@/coquille/parametres";
import { CourseVue } from "./CourseVue";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";

/** Pas de course à proposer : billet inconnu ou pas à cette personne (404, 403), ou plus de bus à rejoindre (409). */
function sansCourse(erreur: unknown): boolean {
  return (
    erreur instanceof ErreurHttp &&
    (erreur.statut === 404 || erreur.statut === 403 || erreur.statut === 409)
  );
}

/**
 * Planche « Course » (8 · Moto ou taxi vers la gare). Elle s'ouvre depuis le billet (`?billetId=…`) ; en démonstration,
 * sans billet dans l'adresse, elle prend celui du monde de démonstration. La proposition (heure de départ, modes, chauffeur,
 * prix payé avec le billet) vient de `usePropositionCourse` ; la réservation passe par `useReserverCourse`.
 */
export function EcranCourse() {
  const [adresse] = useSearchParams();
  const demo = useModeDemo();
  const billetId = adresse.get("billetId") ?? (demo ? (EXEMPLES_PARAMS["billetId"] ?? "") : "");
  const actif = billetId !== "";
  const requete = voyageur.usePropositionCourse({ billetId }, { enabled: actif });

  if (!actif || sansCourse(requete.error)) return <EtatVide billetId={billetId} />;
  if (requete.data !== undefined) {
    return <CourseVue key={billetId} proposition={requete.data} />;
  }
  if (requete.isError) {
    return <EtatErreur billetId={billetId} onReessayer={() => void requete.refetch()} />;
  }
  return <EtatChargement billetId={billetId} />;
}
