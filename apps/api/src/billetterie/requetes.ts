import type { FiltresDeparts } from "./schemas";
import { jourValide } from "./temps";
import { DonneesInvalides, parametre, parametreBooleen, parametreEntier } from "./validation";

/**
 * Paramètres de requête (`GET`) : mêmes noms que l'adaptateur HTTP du client d'API
 * (`voyageur.departs.rechercher`, `voyageur.departs.optionsFiltres`, `voyageur.commandes.devis`).
 */

export type Requete = Record<string, unknown>;

function requis(q: Requete, cle: string): string {
  const v = parametre(q, cle);
  if (v === undefined || v === "") throw new DonneesInvalides(cle, "paramètre obligatoire");
  return v;
}

function ville(q: Requete, cle: string): string {
  const v = requis(q, cle);
  if (v.length > 32) throw new DonneesInvalides(cle, "texte trop long");
  return v;
}

function jour(q: Requete): string | undefined {
  const v = parametre(q, "jour");
  if (v === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !jourValide(v)) {
    throw new DonneesInvalides("jour", "jour AAAA-MM-JJ attendu");
  }
  return v;
}

const CLASSES = ["toutes", "vip", "classique"] as const;

/** Les filtres présents dans l'URL ; `undefined` si aucun n'est donné (les filtres mémorisés servent). */
function filtres(q: Requete): FiltresDeparts | undefined {
  const sortie: FiltresDeparts = {};
  const classe = parametre(q, "classe");
  if (classe !== undefined) {
    if (!(CLASSES as readonly string[]).includes(classe)) {
      throw new DonneesInvalides("classe", `valeur attendue : ${CLASSES.join(", ")}`);
    }
    sortie.classe = classe as (typeof CLASSES)[number];
  }
  const compagnies = parametre(q, "compagnies");
  if (compagnies !== undefined) {
    const liste = compagnies.split(",").filter((c) => c !== "");
    if (liste.some((c) => c.length > 128) || liste.length > 100) {
      throw new DonneesInvalides("compagnies", "liste invalide");
    }
    sortie.compagnies = liste;
  }
  const preferees = parametreBooleen(q, "preferees");
  if (preferees !== undefined) sortie.preferees = preferees;
  const covoit = parametreBooleen(q, "covoit");
  if (covoit !== undefined) sortie.inclureCovoit = covoit;
  const matin = parametreBooleen(q, "matin");
  if (matin !== undefined) sortie.matinSeulement = matin;
  const coteACote = parametreBooleen(q, "coteACote");
  if (coteACote !== undefined) sortie.placesCoteACote = coteACote;
  const prixMax = parametreEntier(q, "prixMax", { min: 0 });
  if (prixMax !== undefined) sortie.prixMax = prixMax;
  return Object.keys(sortie).length > 0 ? sortie : undefined;
}

export function lireRechercheDeparts(q: Requete) {
  return {
    depart: ville(q, "depart"),
    arrivee: ville(q, "arrivee"),
    jour: jour(q),
    filtres: filtres(q),
  };
}

export function lireOptionsFiltres(q: Requete) {
  return { depart: ville(q, "depart"), arrivee: ville(q, "arrivee"), jour: jour(q) };
}

export function lireDemandeDevis(q: Requete) {
  const departId = requis(q, "departId");
  if (departId.length > 128) throw new DonneesInvalides("departId", "texte trop long");
  const places = parametreEntier(q, "places", { min: 1 });
  const codePromo = parametre(q, "codePromo");
  if (codePromo !== undefined && codePromo.length > 64) {
    throw new DonneesInvalides("codePromo", "texte trop long");
  }
  return { departId, places, codePromo, enLigne: parametreBooleen(q, "enLigne") };
}

export function lireSiege(brut: string): number {
  if (!/^\d{1,4}$/.test(brut) || Number(brut) < 1) {
    throw new DonneesInvalides("siege", "numéro de siège invalide");
  }
  return Number(brut);
}

export function lirePrixPartiel(q: Requete) {
  return { depuis: requis(q, "depuis"), vers: requis(q, "vers") };
}

export function lireIdOptionnel(q: Requete, cle: string): string | undefined {
  const v = parametre(q, cle);
  if (v === undefined) return undefined;
  if (v === "" || v.length > 128) throw new DonneesInvalides(cle, "identifiant invalide");
  return v;
}
