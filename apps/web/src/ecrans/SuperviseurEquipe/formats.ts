import type { agence } from "@afrimove/api-client";
import { estFeminin } from "./genre";

/** Ce que `useSuperviseurEquipe` renvoie (@afrimove/contrats n'est pas lu directement ici). */
export type Equipe = NonNullable<ReturnType<typeof agence.useSuperviseurEquipe>["data"]>;
export type Personne = Equipe["enService"][number];
export type RoleEquipe = Personne["role"];
export type ActionEquipe = NonNullable<Equipe["fiche"]>["actions"][number];

/** Actions de la fiche, dans l'ordre de la planche, quand le serveur n'en envoie pas. */
export const ACTIONS_PAR_DEFAUT: readonly ActionEquipe[] = [
  "renouveler_pin",
  "changer_affectation",
  "voir_journal",
  "desactiver",
];

export const ROLES: readonly RoleEquipe[] = [
  "guichetier",
  "convoyeur",
  "chauffeur",
  "controleur",
  "superviseur",
];

export { heureDouala, montant, prenom } from "@/ecrans/SuperviseurValider/formats";

/** Contexte i18next de l'accord (`roles.guichetier_f`) : absent au masculin. */
export function contexteGenre(nom: string): { context?: "f" } {
  return estFeminin(nom) ? { context: "f" } : {};
}

/** Tonalité de l'avatar : ambre si le PIN est à renouveler, gris si le compte est bloqué, vert pour la route. */
export type TonAvatar = "ambre" | "bleu" | "vert" | "gris";

export function tonAvatar(p: Personne): TonAvatar {
  if (p.pin.etat === "bloque") return "gris";
  if (p.pin.etat === "a_renouveler") return "ambre";
  if (p.role === "convoyeur" || p.role === "chauffeur") return "vert";
  return "bleu";
}

/** Rangs des guichets connus de l'équipe : « guichet 2 » -> 2 (le contrat ne liste pas les guichets). */
export function rangsDesGuichets(equipe: Equipe): number[] {
  const rangs = new Set<number>();
  for (const p of equipe.enService) {
    const rang = /^guichet (\d+)$/i.exec(p.affectation ?? "")?.[1];
    if (rang) rangs.add(Number(rang));
  }
  return [...rangs].sort((a, b) => a - b);
}

/**
 * Identifiant d'un guichet du réseau : `guichet-<compagnie>-<gare>-<rang>` (« gare-alp-dla » -> « guichet-alp-dla-2 »).
 * Convention des données de démonstration ; le contrat de l'équipe ne donne pas les identifiants des guichets.
 */
export function idGuichet(gareId: string, rang: number): string {
  return `guichet-${gareId.replace(/^gare-/, "")}-${rang}`;
}

/** Les personnes dont le compte est bloqué : celles de la liste, plus celles que la fiche propose de débloquer. */
export function personnesADebloquer(equipe: Equipe): { id: string; nom: string }[] {
  const liste = equipe.enService
    .filter((p) => p.statut === "bloquee")
    .map((p) => ({ id: p.personneId, nom: p.nom }));
  const connues = new Set(equipe.enService.map((p) => p.personneId));
  const ailleurs = (equipe.fiche?.personnesADebloquer ?? []).filter((x) => !connues.has(x.id));
  return [...liste, ...ailleurs];
}
