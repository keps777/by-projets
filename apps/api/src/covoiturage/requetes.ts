import { corps as lireCorps, ou400 } from "../billetterie/http";
import {
  DonneesInvalides,
  booleen,
  entier,
  enumeration,
  idOpaque,
  isoDouala,
  objet,
  optionnel,
  parametre,
  parametreEntier,
  tableau,
  telephone,
  texte,
  type Lecteur,
} from "../billetterie/validation";
import { jourCalendaireValide } from "./regles";
import { TYPES_PIECES, type MomentJournee, type TypePiece } from "./modeles";

/**
 * Lecteurs des corps et des paramètres. Les formes des routes qui ont un contrat dans
 * `@afrimove/contrats` (recherche, réservation, publication, proposition, trajet régulier,
 * recherche en ville) sont comparées aux schémas zod dans `contrats.test.ts` ; les autres routes
 * (vérification, demandes, notes, annulation) n'ont pas encore de schéma partagé : elles sont décrites
 * dans le README.
 */

export { ou400 };
export const corps = lireCorps;

export type Requete = Record<string, unknown>;

const PLACES_MAX = 8;
const places = entier({ min: 1, max: PLACES_MAX });

const ville = texte({ min: 1, max: 60 });
const point = texte({ min: 1, max: 120 });

const jourCalendaire: Lecteur<string> = (v, chemin) => {
  const jour = texte({ min: 10, max: 10 })(v, chemin);
  if (!jourCalendaireValide(jour)) throw new DonneesInvalides(chemin, "jour AAAA-MM-JJ attendu");
  return jour;
};

const heure = texte({
  min: 5,
  max: 5,
  motif: /^([01]\d|2[0-3]):[0-5]\d$/,
  message: "HH:MM attendu",
});

/* ------------------------------------------------------------------ passager */

export const FILTRES_COVOIT = ["clim", "femmes", "grand_bagage", "prix_max"] as const;
export type FiltreCovoit = (typeof FILTRES_COVOIT)[number];

function liste<T extends string>(q: Requete, cle: string, valeurs: readonly T[]): T[] | undefined {
  const v = parametre(q, cle);
  if (v === undefined || v === "") return undefined;
  const elements = v.split(",").filter((x) => x !== "");
  if (elements.some((x) => !(valeurs as readonly string[]).includes(x))) {
    throw new DonneesInvalides(cle, `valeurs attendues : ${valeurs.join(", ")}`);
  }
  return [...new Set(elements)] as T[];
}

function requis(q: Requete, cle: string, max = 60): string {
  const v = parametre(q, cle);
  if (v === undefined || v.trim() === "") throw new DonneesInvalides(cle, "paramètre obligatoire");
  if (v.length > max) throw new DonneesInvalides(cle, "texte trop long");
  return v.trim();
}

/** `GET /voyageur/covoit` : mêmes noms que `SchemaRechercheCovoit`. */
export function lireRechercheCovoit(q: Requete) {
  const apartirDe = parametre(q, "apartirDe");
  if (apartirDe !== undefined) isoDouala(apartirDe, "apartirDe");
  return {
    depart: requis(q, "depart"),
    arrivee: requis(q, "arrivee"),
    apartirDe,
    filtres: liste(q, "filtres", FILTRES_COVOIT),
    prixMax: parametreEntier(q, "prixMax", { min: 0, max: 10_000_000 }),
  };
}

export const lireReserver = objet({ places });

export const TYPES_OFFRE_VILLE = ["covoiturage", "moto_taxi", "bus_ville"] as const;
export const QUAND_VILLE = ["maintenant", "dans_1h", "chaque_matin"] as const;

/** `GET /voyageur/ville/offres` : mêmes noms que `SchemaRechercheVille`. */
export function lireRechercheVille(q: Requete) {
  const quand = parametre(q, "quand");
  if (quand !== undefined && !(QUAND_VILLE as readonly string[]).includes(quand)) {
    throw new DonneesInvalides("quand", `valeur attendue : ${QUAND_VILLE.join(", ")}`);
  }
  const depart = parametre(q, "depart");
  const arrivee = parametre(q, "arrivee");
  if ((depart?.length ?? 0) > 120 || (arrivee?.length ?? 0) > 120) {
    throw new DonneesInvalides("depart", "texte trop long");
  }
  return {
    ville: requis(q, "ville"),
    depart: depart?.trim() || undefined,
    arrivee: arrivee?.trim() || undefined,
    quand: quand as (typeof QUAND_VILLE)[number] | undefined,
    types: liste(q, "types", TYPES_OFFRE_VILLE),
  };
}

export const lireNote = objet({
  note: entier({ min: 1, max: 5 }),
  commentaire: optionnel(texte({ min: 1, max: 500 })),
});

export const lireDemande = objet({
  depart: ville,
  arrivee: ville,
  jour: jourCalendaire,
  moment: optionnel(enumeration<MomentJournee>("matin", "apres_midi", "soir")),
  places,
});

/** `PUT /voyageur/covoit/ville/trajet-regulier` : `SchemaDefinirTrajetRegulier`. */
export const lireDefinirTrajetRegulier = objet({ actif: booleen });

export const lireCreerTrajetRegulier = objet({
  ville,
  depart: point,
  arrivee: point,
  departA: heure,
});

/* ------------------------------------------------------------------ conducteur */

const lieu = objet({ ville, point });

/** `POST …/conducteur/trajets` : `SchemaPublierTrajet`. */
export const lirePublierTrajet = objet({
  depart: lieu,
  arrivee: lieu,
  departA: isoDouala,
  places,
  prixParPlace: entier({ min: 0, max: 10_000_000 }),
  options: tableau(texte({ min: 1, max: 40 }), { max: 10 }),
  regulier: optionnel(booleen),
});

/** `POST …/demandes/:id/propositions` : `SchemaProposerADemande` sans `demandeId` (dans l'URL). */
export const lireProposition = objet({ trajetId: idOpaque });

export const lireDeposerPiece = objet({
  fichierId: texte({
    min: 3,
    max: 200,
    motif: /^[A-Za-z0-9_.:/-]+$/,
    message: "identifiant de fichier invalide",
  }),
  numero: optionnel(texte({ min: 3, max: 40 })),
  expireLe: optionnel(jourCalendaire),
});

export const lireVehicule = objet({
  marque: texte({ min: 1, max: 40 }),
  modele: texte({ min: 1, max: 40 }),
  couleur: texte({ min: 1, max: 30 }),
  immatriculation: texte({ min: 4, max: 20 }),
  places: entier({ min: 1, max: PLACES_MAX }),
  grandBagage: optionnel(booleen),
});

export const lireNumeroVersement = objet({ telephone });

export function lireTypePiece(brut: string): TypePiece {
  if (!(TYPES_PIECES as readonly string[]).includes(brut)) {
    throw new DonneesInvalides("type", `pièce attendue : ${TYPES_PIECES.join(", ")}`);
  }
  return brut as TypePiece;
}

/* ------------------------------------------------------------------ exploitation (AfriMove) */

export const lireDecisionPiece = objet({
  decision: enumeration<"validee" | "refusee">("validee", "refusee"),
  motif: optionnel(texte({ min: 1, max: 300 })),
});

export function lireStatutDossier(q: Requete) {
  const v = parametre(q, "statut");
  if (v === undefined) return undefined;
  const valeurs = ["incomplet", "en_verification", "refuse", "expire", "verifie"] as const;
  if (!(valeurs as readonly string[]).includes(v)) {
    throw new DonneesInvalides("statut", `valeur attendue : ${valeurs.join(", ")}`);
  }
  return v as (typeof valeurs)[number];
}

export function lireStatutVersement(q: Requete) {
  const v = parametre(q, "statut");
  if (v === undefined) return undefined;
  const valeurs = ["a_faire", "fait", "echoue"] as const;
  if (!(valeurs as readonly string[]).includes(v)) {
    throw new DonneesInvalides("statut", `valeur attendue : ${valeurs.join(", ")}`);
  }
  return v as (typeof valeurs)[number];
}
