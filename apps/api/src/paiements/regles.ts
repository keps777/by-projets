import type { ConfigPaiements } from "./config";
import {
  sommeMontants,
  type LigneReversement,
  type MoyenPaiement,
  type OperateurMobile,
} from "./modeles";

/**
 * Règles pures des paiements : répartition du prix et des frais, jeton de carte, numéros,
 * textes affichés. Sans Nest ni état : tout est testé tel quel.
 */

/** Code de la ligne de commande qui porte les frais d'AfriMove (la billetterie le pose à 250 F). */
export const CODE_LIGNE_FRAIS = "frais_voyageur";

/** Textes que le serveur écrit lui-même (consignes et messages), tous en français. */
export const TEXTES = {
  consigne: {
    mtn_momo: "Confirme le paiement sur ton téléphone avec ton code MoMo.",
    orange_money: "Compose #150# ou confirme dans l'app Orange avec ton code.",
    carte: "Authentifie le paiement auprès de ta banque.",
    sieges_perdus:
      "Les places ont été reprises avant la confirmation du paiement : tu es remboursé.",
    commande_annulee: "La commande avait été annulée : tu es remboursé.",
    doublon: "Cette commande était déjà payée : ce second paiement est remboursé.",
    expire: "Le délai de confirmation est dépassé. Rien n'a été débité.",
    echoue: "Le paiement n'a pas abouti. Rien n'a été débité.",
  },
  modeDegrade:
    "Le paiement en ligne est momentanément indisponible. Réserve ta place, puis paie au guichet " +
    "de la gare ou en MoMo marchand de l'agence.",
  moyens: {
    mtn_momo: { nom: "MTN Mobile Money", sigle: "MTN", detail: "tu confirmes sur ton téléphone" },
    orange_money: {
      nom: "Orange Money",
      sigle: "OM",
      detail: "code #150# ou confirmation dans l'app Orange",
    },
    carte: { nom: "Carte bancaire", detail: "Visa, Mastercard · aussi depuis l'étranger" },
    proche: {
      nom: "Demander à un proche de payer",
      detail: "il reçoit un lien, tu reçois le billet",
    },
  },
  lienProche: (voyageur: string, trajet: string, total: string, lien: string): string =>
    `AfriMove : ${voyageur} vous demande de payer son voyage ${trajet} (${total}). Payer : ${lien}`,
} as const;

/**
 * Le prénom du voyageur tel qu'il apparaît dans le SMS du proche : lettres, espaces, tirets et
 * apostrophes seulement, 30 caractères au plus. Un nom de compte ne peut pas glisser une adresse
 * (point, barre oblique) dans un SMS qui part sous le nom d'AfriMove.
 */
export function prenomPourSms(prenom: string | null): string | null {
  if (prenom === null) return null;
  const net = prenom
    .replace(/[^\p{L}'’ -]+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30)
    .trim();
  return net === "" ? null : net;
}

/** Le lien sans `https://` : le gabarit SMS « système » refuse les adresses complètes (README). */
export const lienSansSchema = (url: string): string => url.replace(/^https:\/\//, "");

/* ------------------------------------------------------------------ répartition */

export class RepartitionImpossible extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepartitionImpossible";
  }
}

/**
 * Répartit l'encaissement entre la compagnie (prix du billet, bagages) et AfriMove (frais de
 * service). Les deux lignes sont distinctes dès la demande à l'agrégateur : AfriMove ne reçoit
 * jamais le prix du billet. Vérifie que rien ne se perd ni ne se crée.
 */
export function repartir(
  lignes: ReadonlyArray<{ code: string; montant: number }>,
  comptes: { compagnie: string; afrimove: string },
  total: number,
): LigneReversement[] {
  const frais = sommeMontants(lignes.filter((l) => l.code === CODE_LIGNE_FRAIS));
  const prix = sommeMontants(lignes.filter((l) => l.code !== CODE_LIGNE_FRAIS));
  if (!Number.isInteger(total) || total <= 0) {
    throw new RepartitionImpossible("Le total à encaisser doit être un entier positif");
  }
  if (lignes.some((l) => !Number.isInteger(l.montant) || l.montant < 0)) {
    throw new RepartitionImpossible("Montant de ligne invalide");
  }
  if (prix + frais !== total) {
    throw new RepartitionImpossible("Le total ne correspond pas à la somme des lignes");
  }
  const repartition: LigneReversement[] = [];
  if (prix > 0) {
    repartition.push({ beneficiaire: "compagnie", compteId: comptes.compagnie, montant: prix });
  }
  if (frais > 0) {
    repartition.push({ beneficiaire: "afrimove", compteId: comptes.afrimove, montant: frais });
  }
  return repartition;
}

/** Part d'un bénéficiaire dans un paiement. */
export const partDe = (
  repartition: ReadonlyArray<LigneReversement>,
  beneficiaire: LigneReversement["beneficiaire"],
): number => sommeMontants(repartition.filter((l) => l.beneficiaire === beneficiaire));

/** Frais d'AfriMove à rendre pour un billet d'une commande de `nombre` billets (arrondi vers le bas). */
export const fraisParBillet = (
  repartition: ReadonlyArray<LigneReversement>,
  nombre: number,
): number => (nombre > 0 ? Math.floor(partDe(repartition, "afrimove") / nombre) : 0);

/* ------------------------------------------------------------------ carte */

/** Algorithme de Luhn : vrai pour un numéro de carte bien formé. */
export function luhnValide(chiffres: string): boolean {
  if (!/^\d+$/.test(chiffres)) return false;
  let somme = 0;
  let double = false;
  for (let i = chiffres.length - 1; i >= 0; i--) {
    let n = Number(chiffres[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
    double = !double;
  }
  return somme % 10 === 0;
}

/** Un numéro de carte (12 à 19 chiffres, espaces et tirets permis) qui passerait pour un jeton. */
export function ressembleANumeroDeCarte(valeur: string): boolean {
  const chiffres = valeur.replace(/[\s-]/g, "");
  return /^\d{12,19}$/.test(chiffres) && luhnValide(chiffres);
}

export type VerdictJeton = "ok" | "numero_de_carte" | "format";

/**
 * Le jeton de carte vient du prestataire (champ de saisie hébergé) : AfriMove ne reçoit, ne
 * stocke et ne journalise jamais un numéro de carte. Un numéro bien formé est refusé net.
 */
export function verdictJetonCarte(jeton: string): VerdictJeton {
  if (ressembleANumeroDeCarte(jeton)) return "numero_de_carte";
  return /^[A-Za-z0-9_.-]{8,200}$/.test(jeton) ? "ok" : "format";
}

/* ------------------------------------------------------------------ téléphone */

/** `+237 ••••• 008` : les trois derniers chiffres seulement. */
export function masquerTelephone(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  const indicatif = telephone.startsWith("+237") ? "+237" : `+${chiffres.slice(0, 3)}`;
  return `${indicatif} ••••• ${chiffres.slice(-3)}`;
}

/** `6 91 22 10 08` pour un numéro camerounais, sinon le numéro tel quel. */
export function afficherTelephone(telephone: string): string {
  const m = /^\+237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(telephone);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : telephone;
}

/**
 * Opérateur le plus probable d'un numéro camerounais (indicatif seulement : un numéro porté peut
 * appartenir à l'autre réseau). Sert à présélectionner le moyen, jamais à refuser un paiement.
 */
export function operateurProbable(telephone: string): OperateurMobile | null {
  const m = /^\+237(6\d)(\d)\d{6}$/.exec(telephone);
  if (!m) return null;
  const prefixe = Number(m[1]);
  const suivant = Number(m[2]);
  if (prefixe === 67 || prefixe === 68) return "mtn";
  if (prefixe === 69) return "orange";
  if (prefixe === 65) return suivant <= 4 ? "mtn" : "orange";
  return null;
}

/* ------------------------------------------------------------------ délais et moyens */

export const estMobile = (moyen: MoyenPaiement): boolean =>
  moyen === "mtn_momo" || moyen === "orange_money";

export function delaiConfirmationMs(moyen: MoyenPaiement, config: ConfigPaiements): number {
  return moyen === "carte" ? config.delaiCarteMs : config.delaiMobileMs;
}

/** Attente avant le prochain essai d'un remboursement : 30 s, 1 min, 2 min… (plafonné à 6 h). */
export function attenteRemboursementMs(essaisFaits: number, premiereMs: number): number {
  return Math.min(premiereMs * 2 ** Math.max(0, essaisFaits - 1), 6 * 3_600_000);
}
