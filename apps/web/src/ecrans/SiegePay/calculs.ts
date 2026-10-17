import type { voyageur as contrats } from "@afrimove/contrats";

/** « 7500 » -> « 7 500 » (espace de groupement, comme dans la planche). */
export function formaterMontant(montant: number): string {
  const signe = montant < 0 ? "− " : "";
  return signe + String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * « +237691221008 » -> « 6 91 22 10 08 » : numéro camerounais écrit comme dans la planche (un chiffre, puis quatre
 * paires). Un autre indicatif ou un numéro d'une autre longueur reste tel que l'API le donne.
 */
export function formaterTelephone(telephone: string): string {
  const n = /^\+237(\d{9})$/.exec(telephone)?.[1];
  if (!n) return telephone;
  return `${n.slice(0, 1)} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
}

/** `2027-01-05T08:00:00.000+01:00` -> `08:00` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** 210 -> « 3 h 30 », 120 -> « 2 h », 45 -> « 45 min » (durée du trajet sous le nom de la compagnie). */
export function formaterDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}

/** Vrai quand l'instant `limite` (ISO) est atteint à `maintenant`. */
export function delaiDepasse(limite: string, maintenant: Date): boolean {
  const fin = Date.parse(limite);
  return !Number.isNaN(fin) && maintenant.getTime() >= fin;
}

/** Moyens de paiement proposés sur l'écran : « demander à un proche de payer » est propre à l'écran Paiement. */
export const MOYENS_AFFICHES = ["mtn_momo", "orange_money", "carte"] as const;
export type MoyenAffiche = (typeof MOYENS_AFFICHES)[number];

export function estMoyenAffiche(code: contrats.MoyenPaiement): code is MoyenAffiche {
  return (MOYENS_AFFICHES as readonly string[]).includes(code);
}

/**
 * Sièges que je ne peux pas toucher : pris, ou bloqués par un autre voyageur. Mon propre blocage (`a_moi`) n'en fait
 * pas partie : le siège que je tiens est celui que l'écran m'affiche comme choisi.
 */
export function siegesIndisponibles(plan: contrats.PlanSiegesVue): number[] {
  return plan.sieges.filter((s) => s.etat === "pris" || s.etat === "bloque").map((s) => s.numero);
}

/** Emplacement d'un siège (« côté fenêtre · près de la porte »), absent si l'API ne le donne pas. */
export function emplacementDe(plan: contrats.PlanSiegesVue, numero: number): string | undefined {
  return plan.sieges.find((s) => s.numero === numero)?.emplacement;
}

export type EtatPaiement = "attente" | "reussi" | "echoue" | "expire";

/**
 * Issue d'un paiement MoMo / Orange Money à partir de ce que disent le temps réel et la relève : un statut
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
