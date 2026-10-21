/**
 * Rôles et règles d'accès de l'API.
 *
 * Les valeurs reprennent exactement `Role` de @afrimove/domain ; le domaine n'est pas importé à
 * l'exécution (il n'est pas compilé : voir le README), un test vérifie que les listes restent
 * identiques (roles.test.ts).
 */

export const ROLES = [
  "voyageur",
  "guichetier",
  "convoyeur",
  "chauffeur",
  "vendeur",
  "controleur",
  "superviseur",
  "patron",
  "comptable",
  "relais",
  "livreur",
  "afrimove",
] as const;

export type Role = (typeof ROLES)[number];

/** Comment chaque rôle prouve son identité. */
export type MethodeConnexion = "otp" | "pin" | "motdepasse_sms";

export const METHODE_PAR_ROLE: Readonly<Record<Role, MethodeConnexion>> = {
  voyageur: "otp",
  guichetier: "pin",
  convoyeur: "pin",
  chauffeur: "pin",
  vendeur: "pin",
  controleur: "pin",
  relais: "pin",
  livreur: "pin",
  superviseur: "motdepasse_sms",
  patron: "motdepasse_sms",
  comptable: "motdepasse_sms",
  afrimove: "motdepasse_sms",
};

export function rolesAvecMethode(methode: MethodeConnexion): Role[] {
  return ROLES.filter((r) => METHODE_PAR_ROLE[r] === methode);
}

export const ROLES_PIN = rolesAvecMethode("pin");
export const ROLES_DIRECTION = rolesAvecMethode("motdepasse_sms");

/**
 * Rôles qui vendent ou achètent un billet (canaux guichet, convoyeur, vendeur ambulant, en ligne).
 * AfriMove n'en fait jamais partie : la plateforme ne vend jamais un billet.
 */
export const ROLES_VENTE = [
  "voyageur",
  "guichetier",
  "convoyeur",
  "vendeur",
] as const satisfies readonly Role[];
export type RoleVente = (typeof ROLES_VENTE)[number];

/** Rôles de l'espace patron : /patron/**. Le terrain (guichet, bus, quai) n'y accède jamais. */
export const ROLES_ESPACE_PATRON = ["patron", "comptable"] as const satisfies readonly Role[];

export function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === "string" && (ROLES as readonly string[]).includes(valeur);
}

export class RolesInvalides extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RolesInvalides";
  }
}

/** Valide un ensemble de rôles pour un compte : non vide, connu, et AfriMove ne cumule rien qui vende. */
export function validerRoles(roles: readonly string[]): Role[] {
  if (roles.length === 0) throw new RolesInvalides("Un compte a au moins un rôle");
  const uniques = [...new Set(roles)];
  for (const r of uniques) if (!estRole(r)) throw new RolesInvalides(`Rôle inconnu : ${r}`);
  const valides = uniques as Role[];
  if (
    valides.includes("afrimove") &&
    valides.some((r) => (ROLES_VENTE as readonly Role[]).includes(r))
  ) {
    throw new RolesInvalides(
      "AfriMove ne vend jamais : le rôle afrimove ne se cumule avec aucun rôle de vente",
    );
  }
  return valides;
}
