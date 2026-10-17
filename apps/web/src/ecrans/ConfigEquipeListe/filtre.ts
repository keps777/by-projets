import type { EtatPersonne, Personne, Role } from "./types";

/** Minuscules, sans accents, espaces réduits : « Élodie  AKWA » et « elodie akwa » se valent. */
function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Le filtre par rôle et la recherche se combinent : on garde les personnes du rôle choisi dont le nom ou le lieu (la
 * gare et le guichet : « Akwa · guichet 2 ») contient chaque mot cherché, dans n'importe quel ordre.
 * `role` à `null` : tous les rôles.
 */
export function filtrerPersonnes(
  personnes: readonly Personne[],
  role: Role | null,
  recherche: string,
): Personne[] {
  const mots = normaliser(recherche).split(" ").filter(Boolean);
  return personnes.filter((personne) => {
    if (role !== null && personne.role !== role) return false;
    const texte = normaliser(`${personne.nom} ${personne.lieu}`);
    return mots.every((mot) => texte.includes(mot));
  });
}

/** États qui comptent comme « en service » : la personne est au travail (au guichet, à bord, en route). */
const ETATS_EN_SERVICE: readonly EtatPersonne[] = ["en_service", "a_bord", "en_route"];

export interface ResumeListe {
  total: number;
  enService: number;
  bloquees: number;
}

/** Les trois nombres du pied de la liste : « 9 guichetiers · 8 en service · 1 bloquée ». */
export function resumer(personnes: readonly Personne[]): ResumeListe {
  return {
    total: personnes.length,
    enService: personnes.filter((p) => ETATS_EN_SERVICE.includes(p.etat)).length,
    bloquees: personnes.filter((p) => p.etat === "bloquee").length,
  };
}
