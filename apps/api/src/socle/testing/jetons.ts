import { TokensService } from "../auth/tokens.service";
import { METHODE_PAR_ROLE, type Role } from "../auth/roles";
import type { AppTest } from "./app-test";

let compteur = 100;

/** Crée un compte portant `role` (secrets valides par défaut) et renvoie son jeton d'accès. */
export async function jetonPour(
  t: AppTest,
  role: Role,
  options: { compagnieId?: string | null; rolesDuCompte?: Role[] } = {},
): Promise<{ jeton: string; id: string }> {
  compteur += 1;
  const methode = METHODE_PAR_ROLE[role];
  const personne = await t.creerCompte({
    nom: `Test ${role}`,
    telephone: `+2376550${String(compteur).padStart(5, "0")}`,
    roles: options.rolesDuCompte ?? [role],
    compagnieId: options.compagnieId ?? null,
    pin: "482915",
    ...(methode === "motdepasse_sms" ||
    options.rolesDuCompte?.some((r) => METHODE_PAR_ROLE[r] === "motdepasse_sms")
      ? { motDePasse: "Un-mot-de-passe-solide" }
      : {}),
  });
  const { accessToken } = await t.app.get(TokensService).emettre({
    sub: personne.id,
    role,
    cid: personne.compagnieId,
    gid: personne.gareId,
  });
  return { jeton: accessToken, id: personne.id };
}
