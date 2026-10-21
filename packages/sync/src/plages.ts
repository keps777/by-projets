import { NB_GUICHETS_AVEC_PLAGE, plageConvoyeur, plageGuichet } from "@afrimove/domain";
import type { Plage } from "@afrimove/domain";

/**
 * Répartition des plages de numéros entre les appareils d'une gare.
 *
 * Hors ligne, deux appareils ne peuvent pas se concerter : chacun reçoit une plage qui n'appartient
 * qu'à lui (guichet 1 : 0001–0999, guichet 2 : 1001–1999, guichet 3 : 2001–2999, convoyeurs
 * 3001–3999 découpé en parts égales). Ce fichier fabrique la répartition et prouve qu'elle est
 * disjointe ; le serveur l'attribue pour de bon (AM-161) et la renvoie à l'appareil à chaque
 * synchronisation.
 */

export type GenreAppareil = "guichet" | "convoyeur";

export interface AppareilAPlage {
  appareilId: string;
  genre: GenreAppareil;
}

export class RepartitionImpossible extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepartitionImpossible";
  }
}

/**
 * Une plage par appareil, dans l'ordre : les guichets reçoivent les rangs 1, 2, 3 ; les convoyeurs
 * se partagent 3001–3999. Plus de trois guichets, ou plus de 999 convoyeurs : refusé (il faudrait
 * étendre le plan de numérotation, pas le contourner).
 */
export function repartirPlages(appareils: readonly AppareilAPlage[]): Map<string, Plage> {
  const ids = new Set<string>();
  for (const a of appareils) {
    if (ids.has(a.appareilId))
      throw new RepartitionImpossible(`Appareil en double : ${a.appareilId}`);
    ids.add(a.appareilId);
  }
  const guichets = appareils.filter((a) => a.genre === "guichet");
  const convoyeurs = appareils.filter((a) => a.genre === "convoyeur");
  if (guichets.length > NB_GUICHETS_AVEC_PLAGE) {
    throw new RepartitionImpossible(
      `${guichets.length} guichets pour ${NB_GUICHETS_AVEC_PLAGE} plages disponibles`,
    );
  }
  const plages = new Map<string, Plage>();
  guichets.forEach((a, i) => plages.set(a.appareilId, plageGuichet(i + 1)));
  convoyeurs.forEach((a, i) => {
    try {
      plages.set(a.appareilId, plageConvoyeur(i + 1, convoyeurs.length));
    } catch (e) {
      throw new RepartitionImpossible(e instanceof Error ? e.message : String(e));
    }
  });
  verifierPlagesDisjointes([...plages.values()]);
  return plages;
}

/** Lève si deux plages se recouvrent : un numéro ne doit appartenir qu'à un seul appareil. */
export function verifierPlagesDisjointes(plages: readonly Plage[]): void {
  const triees = [...plages].sort((a, b) => a.debut - b.debut);
  for (let i = 1; i < triees.length; i++) {
    const avant = triees[i - 1]!;
    const apres = triees[i]!;
    if (apres.debut <= avant.fin) {
      throw new RepartitionImpossible(
        `Plages qui se recouvrent : ${avant.debut}–${avant.fin} et ${apres.debut}–${apres.fin}`,
      );
    }
  }
}

export function tailleDePlage(plage: Plage): number {
  return plage.fin - plage.debut + 1;
}
