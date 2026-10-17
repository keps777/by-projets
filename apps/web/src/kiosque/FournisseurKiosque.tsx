import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { CanalCommandes } from "./canal";
import type { EnvEffacement } from "./effacement";
import { EcranAppareilEfface } from "./EcranAppareilEfface";
import { detecterModeKiosque } from "./mode";
import { SurveillantKiosque } from "./surveillant";
import { appliquerVerrouKiosque } from "./verrou";

export interface PropsFournisseurKiosque {
  /** Identifiant de la fiche appareil (le même que celui du moteur de synchronisation). */
  appareilId: string;
  canal: CanalCommandes;
  /** Force le mode kiosque (tests, banc) ; sinon il est détecté (`detecterModeKiosque`). */
  kiosque?: boolean;
  intervalleMs?: number;
  /** Dernière chance avant effacement (par exemple une synchronisation), bornée par `delaiAvantEffacementMs`. */
  avantEffacement?: () => Promise<void>;
  delaiAvantEffacementMs?: number;
  /** Environnement à effacer (tests). */
  env?: EnvEffacement;
  children: ReactNode;
}

/**
 * À placer AUTOUR de l'application (au-dessus du moteur de synchronisation) : tant que l'appareil n'est pas
 * effacé il rend `children`, en surveillant les ordres du serveur ; dès qu'un ordre d'effacement arrive, ou si
 * l'appareil est déjà effacé au démarrage, il démonte l'application et affiche l'écran de verrouillage.
 */
export function FournisseurKiosque(props: PropsFournisseurKiosque) {
  const { appareilId, canal, intervalleMs, avantEffacement, delaiAvantEffacementMs, env } = props;
  const kiosque = useMemo(() => props.kiosque ?? detecterModeKiosque().actif, [props.kiosque]);

  const surveillant = useMemo(
    () =>
      new SurveillantKiosque({
        appareilId,
        canal,
        ...(intervalleMs !== undefined ? { intervalleMs } : {}),
        ...(avantEffacement ? { avantEffacement } : {}),
        ...(delaiAvantEffacementMs !== undefined ? { delaiAvantEffacementMs } : {}),
        ...(env ? { env } : {}),
      }),
    [appareilId, canal, intervalleMs, avantEffacement, delaiAvantEffacementMs, env],
  );
  const etat = useSyncExternalStore(surveillant.abonner, () => surveillant.etat());

  useEffect(() => {
    surveillant.demarrer();
    return () => surveillant.arreter();
  }, [surveillant]);

  useEffect(() => (kiosque ? appliquerVerrouKiosque() : undefined), [kiosque]);

  if (etat.phase === "efface")
    return <EcranAppareilEfface incomplet={etat.termine && !etat.complet} />;
  return <>{props.children}</>;
}
