import type { voyageur as c } from "@afrimove/contrats";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useParametres } from "@/coquille/parametres";

/**
 * Temps laissé au téléphone pour donner sa position avant de laisser le serveur décider. Le délai de
 * `getCurrentPosition` ne compte pas l'attente de la permission : le minuteur est ici, pas dans ses options.
 */
export const DELAI_POSITION_MS = 4000;
/** Une position de moins d'une minute suffit : le voyageur est à l'arrêt. */
const AGE_MAX_POSITION_MS = 60_000;

function nombre(valeur: string | null): number | undefined {
  if (valeur === null || valeur.trim() === "") return undefined;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : undefined;
}

/** Le lieu donné par l'adresse : `?arretId=pouma` ou `?lat=3.8&lng=10.4`. */
export function demandeDepuisUrl(params: URLSearchParams): c.DemandeMonteeEnRoute | undefined {
  const arretId = params.get("arretId");
  if (arretId !== null && arretId !== "") return { arretId };
  const latitude = nombre(params.get("lat"));
  const longitude = nombre(params.get("lng"));
  if (latitude !== undefined && longitude !== undefined) return { latitude, longitude };
  return undefined;
}

/**
 * Où est le voyageur : l'arrêt de l'adresse, sinon la position GPS du téléphone. Sans position (refusée, absente,
 * trop longue), la demande part sans lieu et le serveur répond ou refuse ; une position qui arrive ensuite relance la
 * demande. Dans une démonstration (scénario imposé par l'adresse), le lieu est celui de la planche : la position
 * n'est pas demandée. `undefined` : la position est encore attendue, il ne faut pas interroger le serveur.
 */
export function useDemandeMontee(): c.DemandeMonteeEnRoute | undefined {
  const [params] = useSearchParams();
  const { demo, scenario } = useParametres();
  const depuisUrl = useMemo(() => demandeDepuisUrl(params), [params]);
  const sansPosition = depuisUrl !== undefined || (demo && scenario !== null);

  // `undefined` : en attente ; `null` : pas de position ; sinon la position.
  const [gps, setGps] = useState<c.DemandeMonteeEnRoute | null | undefined>(undefined);
  useEffect(() => {
    if (sansPosition) return;
    const geolocalisation = typeof navigator === "undefined" ? undefined : navigator.geolocation;
    if (!geolocalisation) {
      setGps(null);
      return;
    }
    let actif = true;
    const minuteur = setTimeout(() => {
      if (actif) setGps((courant) => (courant === undefined ? null : courant));
    }, DELAI_POSITION_MS);
    geolocalisation.getCurrentPosition(
      (p) => {
        if (actif) setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude });
      },
      () => {
        if (actif) setGps(null);
      },
      { maximumAge: AGE_MAX_POSITION_MS },
    );
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [sansPosition]);

  return useMemo(() => {
    if (depuisUrl !== undefined) return depuisUrl;
    if (sansPosition) return {};
    if (gps === undefined) return undefined;
    return gps ?? {};
  }, [depuisUrl, sansPosition, gps]);
}
