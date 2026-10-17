import { TARIFS, repartitionLivraison } from "../colis/regles";
import { normaliser } from "../relais/regles";
import { enMs, jourSemaine, minutesDuJour, type Instant } from "../relais/temps";
import type { LivreurStocke } from "./modele";

/**
 * Règles métier de la livraison moto, reprises des contrats (`@afrimove/contrats`, colis) et du domaine
 * (`TARIFS.livraison`, `repartitionLivraison`). Fonctions pures : aucune lecture d'horloge, aucun accès
 * extérieur.
 */

export { repartitionLivraison, TARIFS };

/** Un livreur a 30 secondes pour accepter une mission, puis elle passe au suivant. */
export const DELAI_ACCEPTATION_SECONDES = 30;

/** Destinataire absent : le livreur attend 10 minutes, puis dépose au relais le plus proche. */
export const ATTENTE_ABSENCE_MINUTES = 10;

/** Aucun livreur qui convienne après 60 minutes : la mission est abandonnée et le client est prévenu. */
export const ATTENTE_MAX_SANS_LIVREUR_MINUTES = 60;

/** Retrait des gains possible dès 5 000 F. */
export const SEUIL_RETRAIT = 5000;

/** Après avoir fait le tour des livreurs, la mission recommence (3 tours au plus), après une pause. */
export const TOURS_MAX = 3;
export const PAUSE_ENTRE_TOURS_SECONDES = 120;

/** Un livreur n'invite pas plus de 5 personnes par jour : le SMS d'invitation partirait vers n'importe qui. */
export const INVITATIONS_PAR_JOUR_MAX = 5;

/** Un lien de suivi partagé ne vit pas plus de 24 heures et n'est partagé que 5 fois par colis. */
export const DUREE_LIEN_SUIVI_HEURES = 24;
export const PARTAGES_PAR_COLIS_MAX = 5;

/** Le livreur est payé le soir, à partir de 20 h (heure de Douala). */
export const MINUTE_VERSEMENT_LIVREUR = 20 * 60;

/** Moto en ville : 300 m par minute (4,1 km en 14 minutes sur la maquette). */
export const METRES_PAR_MINUTE = 300;

/** Distance supposée quand les coordonnées de la gare ou de l'adresse sont inconnues. */
export const DISTANCE_PAR_DEFAUT_M = 3000;

export function dureeDeTrajet(distanceM: number): number {
  return Math.max(1, Math.ceil(distanceM / METRES_PAR_MINUTE));
}

/** La part du livreur dans le prix d'une livraison. */
export function gainLivreur(prixLivraison: number): number {
  return repartitionLivraison(Math.max(prixLivraison, TARIFS.livraison.minimum)).livreur;
}

/* ------------------------------------------------------------------ particularités du livreur */

export interface ZoneLivreur {
  ville: string;
  /** Quartiers servis, normalisés ; `null` : toute la ville. */
  secteurs: string[] | null;
}

/** « Bafoussam · Tamdja, Djeleng, centre » ou « Bafoussam · toute la ville ». */
export function lireZone(texte: string): ZoneLivreur | null {
  const [villeBrute, reste] = texte.split("·").map((s) => s.trim());
  if (!villeBrute) return null;
  if (reste === undefined || reste === "" || /toute la ville/i.test(reste)) {
    return { ville: villeBrute, secteurs: null };
  }
  const secteurs = reste
    .split(",")
    .map((s) => normaliser(s))
    .filter((s) => s.length > 0);
  return secteurs.length > 0 ? { ville: villeBrute, secteurs } : null;
}

export interface HeuresLivreur {
  /** 0 dimanche … 6 samedi. */
  jours: number[];
  debutMin: number;
  finMin: number;
}

const TOUS_LES_JOURS = [0, 1, 2, 3, 4, 5, 6];

/** « Soirs 17 h – 21 h », « Matins 6 h – 12 h », « Toute la journée », « Week-ends ». */
export function lireHeures(texte: string): HeuresLivreur | null {
  const brut = texte.trim();
  const plage = /(\d{1,2}) ?h(?: ?(\d{2}))? ?[–-] ?(\d{1,2}) ?h(?: ?(\d{2}))?/u.exec(brut);
  if (plage) {
    const debutMin = Number(plage[1]) * 60 + Number(plage[2] ?? 0);
    const finMin = Number(plage[3]) * 60 + Number(plage[4] ?? 0);
    if (!(debutMin >= 0 && finMin <= 24 * 60 && debutMin < finMin)) return null;
    return { jours: TOUS_LES_JOURS, debutMin, finMin };
  }
  if (/week/i.test(brut)) return { jours: [6, 0], debutMin: 0, finMin: 24 * 60 };
  if (/journ[ée]e/i.test(brut)) return { jours: TOUS_LES_JOURS, debutMin: 0, finMin: 24 * 60 };
  return null;
}

export function dansLesHeures(heures: HeuresLivreur, instant: Instant): boolean {
  const minutes = minutesDuJour(instant);
  return (
    heures.jours.includes(jourSemaine(instant)) &&
    minutes >= heures.debutMin &&
    minutes < heures.finMin
  );
}

/** « 10 kg · colis courants » → 10. */
export function lireChargeKg(texte: string): number | null {
  const m = /(\d+) ?kg/.exec(texte);
  return m ? Number(m[1]) : null;
}

/* ------------------------------------------------------------------ à qui proposer une mission */

export interface CibleMission {
  /** La ville de la gare d'arrivée. */
  ville: string;
  /** L'adresse de livraison saisie par l'expéditeur. */
  adresse: string | null;
  poidsKg: number;
}

/**
 * Un livreur convient quand il est actif et disponible, qu'il sert la ville et le quartier du
 * destinataire (« zone »), qu'il travaille à cette heure (« heures ») et qu'il porte ce poids
 * (« charge »). Sans adresse connue, seuls ceux qui servent toute la ville conviennent.
 */
export function livreurConvient(
  livreur: Pick<
    LivreurStocke,
    "actif" | "disponible" | "zone" | "heures" | "chargeMax" | "deplacement" | "pieces"
  >,
  cible: CibleMission,
  instant: Instant,
): boolean {
  if (!livreur.actif || !livreur.disponible || !piecesAJour(livreur, instant)) return false;
  const zone = lireZone(livreur.zone);
  if (!zone || normaliser(zone.ville) !== normaliser(cible.ville)) return false;
  if (zone.secteurs !== null) {
    const adresse = cible.adresse === null ? "" : normaliser(cible.adresse);
    if (!zone.secteurs.some((s) => adresse.includes(s))) return false;
  }
  const heures = lireHeures(livreur.heures);
  if (!heures || !dansLesHeures(heures, instant)) return false;
  const charge = lireChargeKg(livreur.chargeMax);
  return charge !== null && cible.poidsKg <= charge;
}

/** Une date AAAA-MM-JJ est encore valable le jour même (jusqu'à minuit, heure de Douala). */
export function encoreValable(dernierJour: string, instant: Instant): boolean {
  return enMs(`${dernierJour}T23:59:59.999+01:00`) >= enMs(instant);
}

/**
 * Permis et assurance à jour. Seuls ceux qui roulent (moto, tricycle) ont ces pièces ; une pièce dont
 * la date n'a pas été relevée n'est pas à jour.
 */
export function piecesAJour(
  livreur: Pick<LivreurStocke, "deplacement" | "pieces">,
  instant: Instant,
): boolean {
  if (livreur.deplacement !== "moto") return true;
  const { permisValideJusqua, assuranceExpireLe } = livreur.pieces;
  return (
    permisValideJusqua !== null &&
    assuranceExpireLe !== null &&
    encoreValable(permisValideJusqua, instant) &&
    encoreValable(assuranceExpireLe, instant)
  );
}

/** « valide 2028 » : l'année du dernier jour de validité du permis. */
export function libellePermis(aaaaMmJj: string): string {
  return `valide ${aaaaMmJj.slice(0, 4)}`;
}

/** « expire 02/27 » : mois et année de fin de l'assurance. */
export function libelleAssurance(aaaaMmJj: string): string {
  return `expire ${aaaaMmJj.slice(5, 7)}/${aaaaMmJj.slice(2, 4)}`;
}

export const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
