import type {
  ActionRapprochement,
  CauseRapprochement,
  LigneReleve,
  ResultatRapprochement,
  TransactionRapprochee,
  VenteComptable,
  VenteProche,
} from "./modele";
import type { FaitsRapprochement } from "./ports";
import { enMs } from "./temps";

/**
 * Rapprochement d'un mois : chaque ligne du relevé de l'opérateur doit être portée par une vente (sa
 * référence est sur le billet ou le colis). Celles qu'aucune vente ne porte sont « sans correspondance » ;
 * pour chacune, on devine la cause la plus probable et l'action à proposer. Règles pures, sauf les
 * questions posées à `FaitsRapprochement`.
 */

/** Un second paiement du même montant dans ces minutes après le premier est un doublon (réseau lent). */
export const FENETRE_DOUBLON_MINUTES = 10;
/** Le siège réservé en ligne est tenu 15 minutes. */
export const EXPIRATION_SIEGE_MINUTES = 15;
/** Un paiement qui arrive moins d'une heure après l'expiration est « arrivé après l'expiration ». */
export const FENETRE_EXPIRATION_MINUTES = 60;

/** « 6 77 •• •• 41 » : le premier chiffre, l'indicatif de l'opérateur et les deux derniers chiffres. */
export function masquerTelephone(telephone: string): string {
  let chiffres = telephone.replace(/\D/g, "");
  if (chiffres.length === 12 && chiffres.startsWith("237")) chiffres = chiffres.slice(3);
  if (chiffres.length === 9) {
    return `${chiffres.slice(0, 1)} ${chiffres.slice(1, 3)} •• •• ${chiffres.slice(7)}`;
  }
  return `•• •• ${chiffres.slice(-2)}`;
}

/** Pourcentage arrondi à une décimale (99,8). Rien à rapprocher vaut 100. */
export function arrondirPct(valeur: number): number {
  return Math.round(valeur * 10) / 10;
}

/**
 * Part des références du relevé que portait une vente. Sans relevé du tout alors que des ventes mobiles
 * existent, rien n'a été rapproché : 0 plutôt qu'un 100 trompeur.
 */
export function tauxRapprochePct(
  references: number,
  rapprochees: number,
  ventesMobiles: number,
): number {
  if (references === 0) return ventesMobiles > 0 ? 0 : 100;
  return arrondirPct((100 * rapprochees) / references);
}

export function ecartSecondes(avant: string, apres: string): number {
  return Math.round((enMs(apres) - enMs(avant)) / 1000);
}

function duree(secondes: number): string {
  return secondes < 120 ? `${secondes} s` : `${Math.round(secondes / 60)} min`;
}

/** « billet DLA → BAF 10:00 » ou « colis C-ALP-DLA-261217-0141 ». */
function nomDeLaVente(vente: Pick<VenteProche, "genre" | "numero" | "ligne" | "depart">): string {
  if (vente.genre === "colis") return `colis ${vente.numero}`;
  const trajet = vente.ligne.replace(/-/g, " → ");
  return vente.depart ? `billet ${trajet} ${vente.depart}` : `billet ${trajet}`;
}

interface Cause {
  cause: CauseRapprochement;
  explication: string;
  actionProposee: ActionRapprochement;
  cibleSuggeree: string | null;
}

/** La cause la plus probable d'une transaction sans correspondance, par ordre de certitude. */
export async function devinerCause(
  compagnieId: string,
  ligne: LigneReleve,
  faits: FaitsRapprochement,
): Promise<Cause> {
  // 1. Le même billet payé deux fois : une vente du même montant, payée par le même numéro, juste avant.
  const proches = await faits.ventesAutour(
    compagnieId,
    ligne.telephone,
    ligne.recueA,
    FENETRE_EXPIRATION_MINUTES,
  );
  const doublons = proches
    .filter(
      (v) =>
        v.montant === ligne.montant &&
        v.referenceOperateur !== null &&
        v.referenceOperateur !== ligne.reference &&
        enMs(v.at) < enMs(ligne.recueA) &&
        enMs(ligne.recueA) - enMs(v.at) <= FENETRE_DOUBLON_MINUTES * 60_000,
    )
    .sort((a, b) => enMs(b.at) - enMs(a.at));
  const premier = doublons[0];
  if (premier) {
    return {
      cause: "doublon_paiement",
      explication: `Probable : ${nomDeLaVente(premier)} payé 2 fois, 2e paiement ${duree(ecartSecondes(premier.at, ligne.recueA))} après le 1er (réseau)`,
      actionProposee: "rembourser",
      cibleSuggeree: null,
    };
  }

  // 2. Le paiement est arrivé après l'expiration du siège (15 minutes).
  const expires = (
    await faits.paiementsExpires(
      compagnieId,
      ligne.telephone,
      ligne.recueA,
      FENETRE_EXPIRATION_MINUTES,
    )
  ).filter((p) => p.montant === ligne.montant && enMs(p.expireA) <= enMs(ligne.recueA));
  const expire = expires.sort((a, b) => enMs(b.expireA) - enMs(a.expireA))[0];
  if (expire) {
    const repaye = proches.some(
      (v) =>
        v.canal === "guichet" && v.montant === ligne.montant && enMs(v.at) >= enMs(expire.expireA),
    );
    return {
      cause: "paiement_apres_expiration",
      explication:
        `Probable : paiement arrivé après l'expiration du siège (${EXPIRATION_SIEGE_MINUTES} min)` +
        (repaye ? " · le client a repayé au guichet" : ""),
      actionProposee: "rembourser",
      cibleSuggeree: null,
    };
  }

  // 3. Un colis payé à l'arrivée au relais, dont le scan de dépôt manque.
  const colis = (await faits.colisSansDepot(compagnieId, ligne.telephone, ligne.montant))[0];
  if (colis) {
    return {
      cause: "scan_depot_manquant",
      explication:
        `Probable : colis payé à l'arrivée${colis.relais ? ` au relais ${colis.relais}` : ""}, ` +
        `scan de dépôt manquant · à rattacher au colis ${colis.numero}`,
      actionProposee: "rattacher",
      cibleSuggeree: colis.numero,
    };
  }

  // 4. Rien ne l'explique : on demande la pièce à l'opérateur.
  const connu = await faits.numeroConnu(compagnieId, ligne.telephone);
  return {
    cause: "inconnue",
    explication: connu
      ? "Inconnu : aucun billet ni colis ne porte cette référence, numéro déjà connu · demander la pièce à l'opérateur"
      : "Inconnu : aucun billet, aucun colis, numéro jamais vu · demander la pièce à l'opérateur",
    actionProposee: "demander",
    cibleSuggeree: null,
  };
}

export interface EntreeRapprochement {
  compagnieId: string;
  /** Le relevé du mois (lignes reçues dans le mois). */
  releve: readonly LigneReleve[];
  /** Les ventes du mois, vues à la fin du mois (une annulation postérieure n'en fait pas une vente annulée). */
  ventes: readonly VenteComptable[];
  /** Parmi les références du relevé, celles qu'une vente porte (à n'importe quelle date). */
  referencesConnues: ReadonlySet<string>;
  faits: FaitsRapprochement;
}

const estMobile = (v: VenteComptable): boolean => v.moyen === "mtn" || v.moyen === "orange";

/** Le rapprochement du mois : taux, montants et lignes sans correspondance, de la plus ancienne à la plus récente. */
export async function calculerRapprochement(
  entree: EntreeRapprochement,
): Promise<ResultatRapprochement> {
  // Une référence ne compte qu'une fois, même si le relevé la répète.
  const vues = new Set<string>();
  const releve = entree.releve.filter((l) => {
    if (vues.has(l.reference)) return false;
    vues.add(l.reference);
    return true;
  });
  const orphelines = releve.filter((l) => !entree.referencesConnues.has(l.reference));
  const sansCorrespondance: TransactionRapprochee[] = [];
  for (const ligne of orphelines) {
    const cause = await devinerCause(entree.compagnieId, ligne, entree.faits);
    sansCorrespondance.push({
      reference: ligne.reference,
      recueA: ligne.recueA,
      telephoneMasque: masquerTelephone(ligne.telephone),
      operateur: ligne.operateur,
      montant: ligne.montant,
      ...cause,
    });
  }
  sansCorrespondance.sort(
    (a, b) => enMs(a.recueA) - enMs(b.recueA) || a.reference.localeCompare(b.reference),
  );

  const mobiles = entree.ventes.filter(estMobile);
  const valides = mobiles.filter((v) => v.annuleeA === null);
  return {
    references: releve.length,
    rapprochees: releve.length - orphelines.length,
    recuMarchand: releve.reduce((somme, l) => somme + l.montant, 0),
    ventesMobile: {
      nombre: valides.length,
      montant: valides.reduce((somme, v) => somme + v.prix, 0),
    },
    montantMobileBrut: mobiles.reduce((somme, v) => somme + v.prix, 0),
    sansCorrespondance,
  };
}
