import { formaterFcfa } from "../colis/regles";
import { normaliser, operateurProbable, type OperateurMobile } from "../relais/regles";
import {
  debutDeJour,
  debutDeSemaine,
  enMs,
  heureCourte,
  jourSemaine,
  versIsoDouala,
} from "../relais/temps";
import type { Instant } from "../relais/temps";
import type { Agrement, ClasseDepart, Vente } from "./modele";

/**
 * Règles métier des vendeurs ambulants, reprises du ticket AM-149, du contrat (`@afrimove/contrats`,
 * `colis/vendeur.ts`) et de la planche « Vendeur ». Fonctions pures : aucune lecture d'horloge,
 * aucun accès extérieur.
 */

export { normaliser, operateurProbable };
export type { OperateurMobile };

/* ------------------------------------------------------------------ commissions */

/** Commission par billet classique quand l'agence n'en fixe pas d'autre : 100 F. */
export const COMMISSION_CLASSIQUE_DEFAUT = 100;

/** Commission par billet VIP quand l'agence n'en fixe pas d'autre : 150 F. */
export const COMMISSION_VIP_DEFAUT = 150;

/** Une agence ne peut pas promettre plus de 2 000 F de commission par billet (garde-fou de saisie). */
export const COMMISSION_MAX = 2000;

/** La commission d'un billet de cette classe chez cette agence. */
export function commissionPour(
  classe: ClasseDepart,
  agrement: Pick<Agrement, "commissionClassique" | "commissionVip">,
): number {
  return classe === "vip" ? agrement.commissionVip : agrement.commissionClassique;
}

/** « commission 100 F / billet » : le libellé de l'écran de vente. */
export function libelleCommission(montant: number): string {
  return `commission ${formaterFcfa(montant)} / billet`;
}

/* ------------------------------------------------------------------ délais */

/** Le vendeur paie l'agence « dans la minute » : on attend au plus 60 s la confirmation de l'opérateur. */
export const DELAI_REGLEMENT_MS = 60_000;

/** On regarde l'état du paiement toutes les secondes pendant cette attente. */
export const SONDAGE_REGLEMENT_MS = 1_000;

/**
 * Le siège reste retenu 10 minutes pour une opérateur lent : passé ce délai sans paiement, la vente
 * expire et le siège revient à la vente.
 */
export const RETENUE_SIEGE_MINUTES = 10;

/** Un paiement arrivé après coup sur une vente refusée ou expirée est encore guetté pendant 24 h. */
export const VEILLE_TARDIVE_HEURES = 24;

/** Un vendeur retrouve ses clients des 12 derniers mois. */
export const FENETRE_CLIENTS_MOIS = 12;

/** Nombre de clients proposés sur l'écran « revendre en 1 touche ». */
export const CLIENTS_AFFICHES = 20;

/* ------------------------------------------------------------------ versement du lundi */

/** Les commissions sont versées chaque lundi, à partir de 8 h (heure de Douala). */
export const MINUTE_VERSEMENT = 8 * 60;

/** Le jour de versement tel que l'écran l'annonce (« versé le lundi »). */
export const LIBELLE_VERSEMENT = "lundi";

/**
 * Vrai quand le versement est dû : le lundi, de 8 h à minuit (heure de Douala). Pas les autres
 * jours : une commission gagnée le mardi attend le lundi suivant, comme l'annonce l'écran.
 */
export function versementDu(instant: Instant, debutSemaine: Instant): boolean {
  const ecoule = enMs(instant) - enMs(debutSemaine);
  return ecoule >= MINUTE_VERSEMENT * 60_000 && ecoule < 24 * 3_600_000;
}

/** Clé d'idempotence du versement de la semaine commençant ce lundi (« commissions:<id>:261102 »). */
export function cleVersement(vendeurId: string, aammjjLundi: string): string {
  return `commissions:${vendeurId}:${aammjjLundi}`;
}

export { debutDeSemaine };

/* ------------------------------------------------------------------ mois */

const DECALAGE_MS = 3_600_000;

/** Le jour de `instant` à Douala, « 2026-11-03 ». */
export const jourDouala = (instant: Instant): string => versIsoDouala(instant).slice(0, 10);

/** Minuit (Douala) du jour « AAAA-MM-JJ ». */
export const debutDuJourDouala = (jour: string): string => `${jour}T00:00:00.000+01:00`;

/** Le 1er du mois à minuit (Douala) du mois de `instant`. */
export function debutDeMois(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return versIsoDouala(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - DECALAGE_MS);
}

/** Le 1er du mois suivant à minuit (Douala). */
export function debutDuMoisSuivant(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return versIsoDouala(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - DECALAGE_MS);
}

/* ------------------------------------------------------------------ numéros et téléphones */

/** 412 → « V-0412 ». */
export function codeVendeur(numero: number): string {
  return `V-${String(numero).padStart(4, "0")}`;
}

/** « +237670123456 » → « 6 70 … » : le client tel que l'écran le montre, jamais le numéro complet. */
export function masquerTelephone(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  const national = chiffres.length > 9 ? chiffres.slice(-9) : chiffres;
  return `${national.slice(0, 1)} ${national.slice(1, 3)} …`;
}

/* ------------------------------------------------------------------ jours et habitudes */

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const MOIS_COURTS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

export const nomDuJour = (jour: number): string => JOURS[jour] ?? "";

/** Un client voyage « chaque vendredi » à partir de 3 voyages dont les deux tiers le même jour. */
export const HABITUDE_MIN_VOYAGES = 3;
export const HABITUDE_PART_MIN = 2 / 3;

/** Un client est « régulier » à partir de 3 billets achetés par ce vendeur. */
export const CLIENT_REGULIER_MIN_BILLETS = 3;

export interface Habitude {
  /** 0 dimanche … 6 samedi. */
  jour: number;
  /** « 08:30 » : l'heure de départ la plus fréquente ce jour-là. */
  heure: string;
}

/**
 * Le jour fixe d'un client : celui qui revient dans au moins deux tiers de ses voyages (3 voyages au
 * minimum), avec l'heure de départ qu'il prend le plus souvent ce jour-là. `null` sans habitude.
 */
export function habitudeDe(departs: readonly Instant[]): Habitude | null {
  if (departs.length < HABITUDE_MIN_VOYAGES) return null;
  const parJour = new Map<number, Instant[]>();
  for (const d of departs) {
    const j = jourSemaine(d);
    parJour.set(j, [...(parJour.get(j) ?? []), d]);
  }
  let meilleur: { jour: number; voyages: Instant[] } | null = null;
  for (const [jour, voyages] of parJour) {
    if (
      !meilleur ||
      voyages.length > meilleur.voyages.length ||
      (voyages.length === meilleur.voyages.length && jour < meilleur.jour)
    ) {
      meilleur = { jour, voyages };
    }
  }
  if (!meilleur || meilleur.voyages.length / departs.length < HABITUDE_PART_MIN) return null;
  const heures = new Map<string, number>();
  for (const v of meilleur.voyages)
    heures.set(heureCourte(v), (heures.get(heureCourte(v)) ?? 0) + 1);
  // Égalité : l'heure du voyage le plus récent l'emporte.
  const recent = [...meilleur.voyages].sort((a, b) => enMs(a) - enMs(b)).at(-1) as Instant;
  let heure = heureCourte(recent);
  let max = heures.get(heure) ?? 0;
  for (const [h, n] of [...heures].sort(([a], [b]) => a.localeCompare(b))) {
    if (n > max) {
      heure = h;
      max = n;
    }
  }
  return { jour: meilleur.jour, heure };
}

/** « chaque vendredi ». */
export const libelleHabitude = (h: Habitude): string => `chaque ${nomDuJour(h.jour)}`;

/** « vendredi 08:30 » : la proposition de revente en une touche. */
export const libelleProposition = (h: Habitude): string => `${nomDuJour(h.jour)} ${h.heure}`;

/** Le départ de la semaine qui tombe le jour et à l'heure de l'habitude, le plus proche d'abord. */
export function departHabituel<T extends { heureDepart: string }>(
  habitude: Habitude,
  candidats: readonly T[],
  maintenant: Instant,
): T | null {
  const limite = enMs(maintenant) + 7 * 24 * 3_600_000;
  const retenus = candidats
    .filter(
      (c) =>
        enMs(c.heureDepart) > enMs(maintenant) &&
        enMs(c.heureDepart) <= limite &&
        jourSemaine(c.heureDepart) === habitude.jour &&
        heureCourte(c.heureDepart) === habitude.heure,
    )
    .sort((a, b) => enMs(a.heureDepart) - enMs(b.heureDepart));
  return retenus[0] ?? null;
}

/** Minuit (Douala) du jour de départ d'un voyage : « le dernier voyage » d'un client. */
export const jourDuVoyage = (departA: Instant): string => debutDeJour(departA);

/** « 28 déc. » (pour les messages et les tests ; l'écran formate lui-même la date). */
export function jourCourt(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return `${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`;
}

/* ------------------------------------------------------------------ clients */

export interface ClientAgrege {
  voisinIndex: string;
  /** Le nom et le téléphone de la dernière vente. */
  nom: string;
  telephone: string;
  /** Les ventes terminées à ce voisin, de la plus ancienne à la plus récente. */
  ventes: Vente[];
  derniere: Vente;
}

/**
 * Regroupe les ventes terminées par numéro de téléphone du voisin (un client est un numéro : une
 * famille qui voyage ensemble reste un client). Les plus récents d'abord.
 */
export function regrouperClients(ventes: readonly Vente[]): ClientAgrege[] {
  const parVoisin = new Map<string, Vente[]>();
  for (const v of ventes) {
    if (v.etat !== "terminee") continue;
    parVoisin.set(v.voisinIndex, [...(parVoisin.get(v.voisinIndex) ?? []), v]);
  }
  const clients: ClientAgrege[] = [];
  for (const [voisinIndex, liste] of parVoisin) {
    const triees = [...liste].sort(
      (a, b) => enMs(a.departA) - enMs(b.departA) || a.id.localeCompare(b.id),
    );
    const derniere = [...liste]
      .sort((a, b) => enMs(a.creeA) - enMs(b.creeA) || a.id.localeCompare(b.id))
      .at(-1) as Vente;
    clients.push({
      voisinIndex,
      nom: derniere.voisin.nom,
      telephone: derniere.voisin.telephone,
      ventes: triees,
      derniere,
    });
  }
  return clients.sort(
    (a, b) => enMs(b.derniere.creeA) - enMs(a.derniere.creeA) || a.nom.localeCompare(b.nom, "fr"),
  );
}

export const estClientRegulier = (c: Pick<ClientAgrege, "ventes">): boolean =>
  c.ventes.length >= CLIENT_REGULIER_MIN_BILLETS;
