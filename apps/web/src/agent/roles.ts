import type { Espace } from "@/coquille/roles";

/**
 * Les comptes qui se connectent par l'écran des agents. `methode` suit `METHODE_PAR_ROLE` de l'API : un PIN à
 * 6 chiffres, ou bien mot de passe puis code à 6 chiffres reçu par SMS (direction).
 *
 * `espace` est l'espace de l'application où le compte atterrit. AfriMove n'a pas d'espace dans l'application
 * (console à part) : il n'est pas proposé. Le comptable travaille dans l'espace du patron (planche « Comptable »).
 */
export type MethodeAgent = "pin" | "motdepasse_sms";

export interface RoleAgent {
  /** Rôle de l'API. */
  role: string;
  espace: Espace;
  methode: MethodeAgent;
}

export const ROLES_AGENT: readonly RoleAgent[] = [
  { role: "guichetier", espace: "guichet", methode: "pin" },
  { role: "convoyeur", espace: "bus", methode: "pin" },
  { role: "chauffeur", espace: "bus", methode: "pin" },
  { role: "vendeur", espace: "vendeur", methode: "pin" },
  { role: "controleur", espace: "controle", methode: "pin" },
  { role: "relais", espace: "relais", methode: "pin" },
  { role: "livreur", espace: "livreur", methode: "pin" },
  { role: "superviseur", espace: "superviseur", methode: "motdepasse_sms" },
  { role: "patron", espace: "patron", methode: "motdepasse_sms" },
  { role: "comptable", espace: "patron", methode: "motdepasse_sms" },
];

export function roleAgent(role: string): RoleAgent | undefined {
  return ROLES_AGENT.find((r) => r.role === role);
}

/** L'espace d'un rôle de l'API, ou `null` si l'application n'en a pas pour lui. */
export function espaceDe(role: string): Espace | null {
  return roleAgent(role)?.espace ?? null;
}
