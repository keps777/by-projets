import { agence, useClientApi } from "@afrimove/api-client";
import { aleaCrypto, genererCodeBillet, plageConvoyeur } from "@afrimove/domain";
import type { EtatGenerateur } from "@afrimove/domain";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

/**
 * L'appareil du convoyeur : c'est lui qui crée chaque vente en route, avec son UUID, l'heure et le numéro pris dans
 * sa plage (3001–3999), hors ligne comme en ligne (AM-160 branchera la file d'envoi et la plage attribuée).
 *
 * Points en attendant AM-160 / la session : l'agence et la gare ne sont pas dans `ConvoyeurEtat` (ALP et DLA, comme
 * les planches), et le rang du convoyeur dans la plage 3xxx n'est pas connu (un seul convoyeur : toute la plage).
 */
export const AGENCE_CONVOYEUR = "ALP";
export const GARE_CONVOYEUR = "DLA";

const CLE_ETAT = "afrimove.convoyeur.numeros";

function lireEtat(convoyeurId: string): EtatGenerateur | undefined {
  try {
    const brut = window.localStorage.getItem(`${CLE_ETAT}.${convoyeurId}`);
    return brut ? (JSON.parse(brut) as EtatGenerateur) : undefined;
  } catch {
    return undefined;
  }
}

/** Garde le compteur de numéros : un redémarrage hors ligne ne doit ni réutiliser un numéro ni en sauter un. */
export function memoriserEtat(convoyeurId: string, etat: EtatGenerateur): void {
  try {
    window.localStorage.setItem(`${CLE_ETAT}.${convoyeurId}`, JSON.stringify(etat));
  } catch {
    // Stockage indisponible (navigation privée) : la vente continue, le compteur repart de la plage.
  }
}

export function FournisseurConvoyeur({
  convoyeurId,
  children,
}: {
  convoyeurId: string;
  children: ReactNode;
}) {
  const client = useClientApi();
  const appareil = useMemo(() => {
    const etat = lireEtat(convoyeurId);
    return agence.creerAppareilAgence({
      appareilId: `appareil-convoyeur-${convoyeurId}`,
      auteurId: convoyeurId,
      agence: AGENCE_CONVOYEUR,
      gare: GARE_CONVOYEUR,
      plage: plageConvoyeur(1, 1),
      horloge: client.horloge,
      ...(etat ? { etat } : {}),
    });
  }, [convoyeurId, client]);
  return (
    <agence.FournisseurAppareilAgence appareil={appareil}>
      {children}
    </agence.FournisseurAppareilAgence>
  );
}

/** Code à 4 chiffres du billet (embarquer sans scanner). */
export function nouveauCodeBillet(): string {
  return genererCodeBillet(aleaCrypto());
}

export interface PositionGps {
  latitude: number;
  longitude: number;
  precisionM: number;
}

const ATTENTE_GPS_MS = 3000;

/**
 * Suit la position de l'appareil pendant que l'écran est ouvert. `position()` rend le dernier relevé, ou en demande un
 * (3 s au plus : la vente ne doit jamais attendre le GPS), ou `null` quand l'appareil n'en donne pas.
 */
export function useGps(): () => Promise<PositionGps | null> {
  const derniere = useRef<PositionGps | null>(null);

  useEffect(() => {
    const geo = typeof navigator === "undefined" ? undefined : navigator.geolocation;
    if (!geo) return;
    const suivi = geo.watchPosition(
      (p) => {
        derniere.current = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          precisionM: p.coords.accuracy,
        };
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => geo.clearWatch(suivi);
  }, []);

  return () => {
    if (derniere.current) return Promise.resolve(derniere.current);
    const geo = typeof navigator === "undefined" ? undefined : navigator.geolocation;
    if (!geo) return Promise.resolve(null);
    return new Promise((resoudre) => {
      geo.getCurrentPosition(
        (p) =>
          resoudre({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            precisionM: p.coords.accuracy,
          }),
        () => resoudre(null),
        { timeout: ATTENTE_GPS_MS, maximumAge: 60_000 },
      );
    });
  };
}
