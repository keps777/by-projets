import { useEffect, useRef, useState } from "react";
import { creerScanner } from "./scanner";

/** `inactif` : l'appareil est en mode code ; `demarrage` : caméra en cours d'ouverture ; `indisponible` : repli sur le code. */
export type EtatCamera = "inactif" | "demarrage" | "actif" | "indisponible";

/**
 * Scan continu par la caméra. Le `<video>` reste caché : la planche n'a pas de viseur, seulement la pastille « scan »
 * et la carte « Dernier scan ». `surCode` reçoit le contenu de chaque QR lu.
 */
export function useScanContinu(actif: boolean, surCode: (contenu: string) => void) {
  const refVideo = useRef<HTMLVideoElement>(null);
  const dernier = useRef(surCode);
  dernier.current = surCode;
  const [etat, setEtat] = useState<EtatCamera>(actif ? "demarrage" : "inactif");

  useEffect(() => {
    if (!actif) {
      setEtat("inactif");
      return;
    }
    const video = refVideo.current;
    const scanner = creerScanner();
    if (!video || !scanner) {
      setEtat("indisponible");
      return;
    }
    let annule = false;
    setEtat("demarrage");
    scanner
      .demarrer(video, (contenu) => dernier.current(contenu))
      .then(() => {
        if (!annule) setEtat("actif");
      })
      .catch(() => {
        if (!annule) setEtat("indisponible");
      });
    return () => {
      annule = true;
      scanner.arreter();
    };
  }, [actif]);

  return { etat, refVideo };
}
