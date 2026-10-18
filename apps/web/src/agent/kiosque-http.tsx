import { useEffect, useMemo, useState, type ReactNode } from "react";
import { lire } from "@/coquille/stockage";
import { CLE_APPAREIL_ID, lireRepere } from "@/kiosque/etat";
import { FournisseurKiosque, type PropsFournisseurKiosque } from "@/kiosque/FournisseurKiosque";
import { creerCanalHttp, type CanalCommandes } from "@/kiosque/canal";
import { EVENEMENT_APPAREIL, entetesAppareil, lireAppareilEnrole } from "./stockage";

/**
 * L'identifiant de l'appareil à surveiller : le téléphone enrôlé ou, après un effacement (l'enrôlement est parti
 * avec le reste), l'identifiant gardé exprès. Un repère d'effacement sans identifiant verrouille quand même.
 */
export function appareilASurveiller(): string | null {
  const enrole = lireAppareilEnrole();
  if (enrole) return enrole.appareilId;
  if (lireRepere() !== null) return lire(CLE_APPAREIL_ID) ?? "inconnu";
  return null;
}

/** Tant que le téléphone n'est pas enrôlé il n'y a personne à interroger : aucun ordre, aucun accusé. */
const CANAL_INACTIF: CanalCommandes = {
  prochaineCommande: () => Promise.resolve(null),
  acquitter: () => Promise.resolve(),
};

interface Props {
  /** Vrai avec l'API réelle (mode http) : en démonstration il n'y a ni serveur ni appareil à effacer. */
  actif: boolean;
  /** Racine de l'API. */
  urlBase: string;
  /** Canal imposé (tests) ; sinon HTTP, authentifié par le secret de l'appareil. */
  canal?: CanalCommandes;
  /** Réglages du surveillant imposés (tests : intervalle, environnement d'effacement, mode kiosque). */
  reglages?: Partial<Omit<PropsFournisseurKiosque, "appareilId" | "canal" | "children">>;
  children: ReactNode;
}

/**
 * Branche l'effacement à distance (AM-172) sur l'application : tant que le téléphone n'est pas enrôlé il n'y a
 * rien à surveiller et l'application s'ouvre telle quelle ; dès qu'il l'est, le serveur est interrogé toutes les
 * 30 s avec le secret de l'appareil, et un ordre d'effacement remplace l'application par l'écran de verrouillage.
 *
 * L'identifiant est lu au démarrage et à l'enrôlement, jamais ailleurs : un effacement vide le stockage, l'écran
 * « Appareil effacé » doit rester affiché.
 */
export function KiosqueHttp({ actif, urlBase, canal, reglages, children }: Props) {
  const [appareilId, setAppareilId] = useState<string | null>(() =>
    actif ? appareilASurveiller() : null,
  );

  useEffect(() => {
    if (!actif) return;
    const relire = () => setAppareilId((courant) => lireAppareilEnrole()?.appareilId ?? courant);
    window.addEventListener(EVENEMENT_APPAREIL, relire);
    return () => window.removeEventListener(EVENEMENT_APPAREIL, relire);
  }, [actif]);

  const canalHttp = useMemo(
    () => canal ?? creerCanalHttp({ urlBase, entetes: entetesAppareil }),
    [canal, urlBase],
  );

  if (!actif) return <>{children}</>;
  // Le même arbre avant et après l'enrôlement : l'écran de connexion qui enrôle le téléphone n'est pas remonté.
  return (
    <FournisseurKiosque
      appareilId={appareilId ?? "non-enrole"}
      canal={appareilId === null ? CANAL_INACTIF : canalHttp}
      {...reglages}
    >
      {children}
    </FournisseurKiosque>
  );
}
