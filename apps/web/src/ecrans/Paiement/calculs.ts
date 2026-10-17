import type { voyageur as contrats } from "@afrimove/contrats";

/** « 4250 » -> « 4 250 » (espace de groupement, comme dans la planche). */
export function formaterMontant(montant: number): string {
  const signe = montant < 0 ? "− " : "";
  return signe + String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Vrai quand l'instant `limite` (ISO) est atteint à `maintenant`. */
export function delaiDepasse(limite: string, maintenant: Date): boolean {
  const fin = Date.parse(limite);
  return !Number.isNaN(fin) && maintenant.getTime() >= fin;
}

/** Moyens qu'on choisit d'un toucher puis qu'on paie avec le bouton ; « un proche » est un lien, pas un choix. */
export const MOYENS_CHOISISSABLES = ["mtn_momo", "orange_money", "carte"] as const;
export type MoyenChoisissable = (typeof MOYENS_CHOISISSABLES)[number];

export function estMoyenChoisissable(code: contrats.MoyenPaiement): code is MoyenChoisissable {
  return (MOYENS_CHOISISSABLES as readonly string[]).includes(code);
}

export type MoyenPropose = contrats.MoyenPaiementVue & { code: MoyenChoisissable };

/**
 * Les moyens que l'écran propose pour cette commande, dans l'ordre de l'API. Une commande réglée dans une autre
 * devise (`conversion`) ne se paie que par carte : le serveur refuse le paiement mobile (422).
 */
export function moyensProposes(
  moyens: readonly contrats.MoyenPaiementVue[],
  commande: Pick<contrats.Commande, "conversion">,
): MoyenPropose[] {
  return moyens.filter(
    (moyen): moyen is MoyenPropose =>
      estMoyenChoisissable(moyen.code) &&
      (commande.conversion === undefined || moyen.code === "carte"),
  );
}

/** Le moyen coché au départ : celui que l'API présélectionne, sinon le premier proposé. */
export function moyenInitial(proposes: readonly MoyenPropose[]): MoyenChoisissable | undefined {
  return (proposes.find((moyen) => moyen.choisi) ?? proposes[0])?.code;
}

/** Le texte de garantie dépend de qui reçoit le prix : le conducteur d'un covoiturage, sinon la compagnie. */
export function garantieDe(type: contrats.TypeCommande): "covoiturage" | "compagnie" {
  return type === "covoiturage" ? "covoiturage" : "compagnie";
}

/** « 1290 », « CAD » -> « 12,90 CAD » (unité mineure entière, deux décimales). */
export function formaterDevise(montantMineur: number, devise: string): string {
  const entier = Math.trunc(montantMineur / 100);
  const centimes = String(montantMineur % 100).padStart(2, "0");
  return `${formaterMontant(entier)},${centimes} ${devise}`;
}

/** Une adresse qu'on peut ouvrir sans risque : https seulement. */
export function adresseHttps(adresse: string | undefined): string | undefined {
  if (adresse === undefined) return undefined;
  try {
    return new URL(adresse).protocol === "https:" ? adresse : undefined;
  } catch {
    return undefined;
  }
}

/** « tu confirmes sur ton téléphone » -> « Tu confirmes sur ton téléphone. » (consigne du serveur en phrase). */
export function enPhrase(texte: string): string {
  const net = texte.trim();
  if (net === "") return "";
  const phrase = net.charAt(0).toLocaleUpperCase("fr") + net.slice(1);
  return /[.!?…]$/.test(phrase) ? phrase : `${phrase}.`;
}

export type EtatPaiement = "attente" | "reussi" | "echoue" | "expire";

/**
 * Issue d'un paiement à partir de ce que disent la réponse au paiement, le temps réel et la relève : un statut
 * définitif l'emporte sur « en attente », et l'échéance de la commande (15 min) clôt l'attente si le serveur ne
 * l'a pas fait.
 */
export function issuePaiement(
  statuts: ReadonlyArray<contrats.StatutPaiement | undefined>,
  commandeExpiree: boolean,
): EtatPaiement {
  if (statuts.includes("reussi")) return "reussi";
  if (statuts.includes("echoue")) return "echoue";
  if (statuts.includes("expire") || commandeExpiree) return "expire";
  return "attente";
}
