import type { ConventionStockee, LigneVoyageurs, Renouvellement } from "./modele";
import {
  ATTENTE_SECOND_BUS_MINUTES,
  FRAIS_AFRIMOVE_COLIS_FCFA,
  GARANTIE_CORRESPONDANCE_MINUTES,
  PLAFOND_REMBOURSEMENT_FCFA,
  PREAVIS_SORTIE_JOURS,
} from "./regles";

/**
 * Les textes affichés ou envoyés par le module. Ceux des planches `InterAgences` et `InterAgencesConvention`
 * sont repris mot pour mot (ponctuation comprise : « Responsabilité au scan. », « Correspondance voyageurs : »).
 * Les autres (SMS, messages d'erreur, vide) sont inventés et listés dans le rapport du ticket.
 */

/** `3000` → `3 000`. */
export function milliers(n: number): string {
  return String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/* ------------------------------------------------------------------ planche InterAgences */

export const TITRE_INTER_AGENCES = "Entre compagnies";
export const SOUS_TITRE_INTER_AGENCES =
  "Un colis change de bus en route. Chacun est payé pour son tronçon.";
export const TITRE_REGLEMENT = "Règlement entre compagnies · semaine";
export const JOUR_REGLEMENT = "lundi";
export const MOYEN_REGLEMENT = "MoMo";
export const TITRE_VOYAGEURS = "Aussi pour les voyageurs";
/** Inventé : la planche montre toujours un billet. */
export const VOYAGEURS_AUCUN = "Aucun billet en correspondance n'est proposé pour le moment.";

export function libelleConvention(a: string, b: string): string {
  return `Convention ${a} – ${b}`;
}

export function regleDuTransfert(cedant: string, preneur: string, ville: string): string {
  return (
    `À ${ville}, le convoyeur ${cedant} scanne « remis à ${preneur} », le convoyeur ${preneur} ` +
    "scanne « reçu ». Le client suit un seul numéro. La responsabilité passe au scan."
  );
}

export function texteVoyageurs(
  ligne: LigneVoyageurs,
  premiere: string,
  seconde: string,
  garantie: number,
  attente: number,
): string {
  return (
    `${ligne.origine} → ${ligne.destination} en un seul billet : ${premiere} jusqu'à ${ligne.via}, ` +
    `${seconde} ensuite, correspondance de ${garantie} min garantie. Si le premier bus est en retard, ` +
    `le second attend ${attente} min ou le voyageur est replacé gratuitement.`
  );
}

/* ------------------------------------------------------------------ planche InterAgencesConvention */

export function renouvellementEnTexte(r: Renouvellement): string {
  return r === "trimestriel" ? "renouvelée chaque trimestre" : "renouvelée chaque année";
}

export const TITRE_PARTS = "Tronçons et parts";
export const AIDE_PARTS_TYPE = (poidsKg: number): string => `colis · ${poidsKg} kg type`;
export const ENTETE_TRONCON = "tronçon";
export const TITRE_REGLES = "Les 5 règles";
export const LIBELLE_TRANSBORDEMENT = (ville: string): string => `Transbordement à ${ville}`;
export const PIED_CONVENTION =
  "Texte complet (2 pages) et historique des règlements dans les exports du comptable.";

export function libelleTotal(prix: number): string {
  return `Client paie ${milliers(prix)} · AfriMove ${FRAIS_AFRIMOVE_COLIS_FCFA} (payé par l'émetteur)`;
}

export interface ReglesDeLaConvention {
  /** Délais de la correspondance de cette convention (25 et 15 minutes par défaut). */
  garantieMinutes: number;
  attenteMinutes: number;
}

/** Les cinq règles de la planche, avec les chiffres de la convention. Les titres portent leur ponctuation. */
export function reglesDeLaConvention(
  voyageurs: ReglesDeLaConvention = {
    garantieMinutes: GARANTIE_CORRESPONDANCE_MINUTES,
    attenteMinutes: ATTENTE_SECOND_BUS_MINUTES,
  },
): { rang: number; titre: string; texte: string }[] {
  return [
    {
      rang: 1,
      titre: "Responsabilité au scan.",
      texte:
        "Le colis est à celui dont le dernier scan est enregistré. Perte ou casse : il rembourse le " +
        `client à la valeur déclarée (max ${milliers(PLAFOND_REMBOURSEMENT_FCFA)}).`,
    },
    {
      rang: 2,
      titre: "Règlement le lundi 08:00",
      texte:
        "par MoMo, solde net calculé par AfriMove sur les scans de la semaine. Contestation possible " +
        "jusqu'au dimanche 20:00.",
    },
    {
      rang: 3,
      titre: "Correspondance voyageurs :",
      texte:
        `${voyageurs.garantieMinutes} min garanties · le second bus attend ${voyageurs.attenteMinutes} min · ` +
        "au-delà, replacement gratuit sur le départ suivant, à la charge du retardataire.",
    },
    {
      rang: 4,
      titre: "Un seul numéro",
      texte:
        "pour le client, un seul SMS par étape. Chacun voit le colis sur son écran, personne ne voit " +
        "les ventes de l'autre.",
    },
    {
      rang: 5,
      titre: "Sortie",
      texte: `à tout moment avec ${PREAVIS_SORTIE_JOURS} jours de préavis · les colis en route vont au bout.`,
    },
  ];
}

export function reglesDe(convention: Pick<ConventionStockee, "voyageurs">) {
  return reglesDeLaConvention(convention.voyageurs);
}

/* ------------------------------------------------------------------ SMS et messages (inventés) */

export const SMS = {
  invitation: (de: string, compagnie: string): string =>
    `AfriMove : ${de} invite ${compagnie} à signer une convention entre compagnies (colis et billets ` +
    "en correspondance). Connectez-vous avec votre compte patron pour la lire et la signer.",
  proposition: (de: string): string =>
    `AfriMove : ${de} vous propose une convention entre compagnies. Lisez-la dans « Entre compagnies » ` +
    "puis signez-la avec votre PIN.",
  signee: (avec: string): string =>
    `AfriMove : la convention avec ${avec} est signée des deux côtés. Elle est en vigueur.`,
  sortie: (de: string, effet: string): string =>
    `AfriMove : ${de} quitte la convention. Elle prend fin le ${effet} ; les colis en route vont au bout.`,
  colisPris: (numero: string, preneur: string, lieu: string): string =>
    `AfriMove : votre colis ${numero} a changé de bus à ${lieu} et voyage maintenant avec ${preneur}. ` +
    "Même numéro, même suivi.",
  billetAttente: (numero: string, minutes: number): string =>
    `AfriMove : billet ${numero}, votre second bus vous attend ${minutes} min. Rejoignez-le au plus vite.`,
  billetReplace: (numero: string, heure: string): string =>
    `AfriMove : billet ${numero}, vous avez manqué la correspondance. Vous êtes replacé gratuitement ` +
    `sur le départ de ${heure}.`,
  contestation: (de: string, reference: string): string =>
    `AfriMove : ${de} conteste une partie du relevé de la semaine (${reference}). Les opérations ` +
    "contestées ne sont pas réglées lundi ; AfriMove vous écrit pour trancher.",
  reglement: (montant: number, avec: string, sens: "recu" | "verse"): string =>
    sens === "recu"
      ? `AfriMove : règlement entre compagnies, ${milliers(montant)} F reçus de ${avec} par MoMo.`
      : `AfriMove : règlement entre compagnies, ${milliers(montant)} F versés à ${avec} par MoMo.`,
} as const;
