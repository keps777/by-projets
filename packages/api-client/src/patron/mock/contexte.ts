import { patron as c } from "@afrimove/contrats";
import { KAMGA_PATRON, ecrans } from "@afrimove/fixtures";
import type { Ecran } from "@afrimove/fixtures";
import type { z } from "zod";
import { ErreurHttp } from "../../infra/erreurs";
import type { FluxMock, ImplementationMock } from "../../infra/scenarios";

/** Ce qu'un scénario patron apporte au scénario central : des réponses et des flux. */
export interface ContributionMock {
  readonly operations: ImplementationMock[];
  readonly flux: FluxMock[];
}

export type EcransFixtures = typeof ecrans;
export type NomEcran = keyof EcransFixtures;

/**
 * Accès aux scénarios de `@afrimove/fixtures`. La planche du scénario actif vient de
 * `donneesScenario` (ce que le composeur central a chargé) ; les autres planches viennent des
 * fixtures, pour que l'application réponde aussi quand on navigue d'un écran à l'autre.
 */
export interface SourceFixtures {
  /** Nom du scénario actif (une planche, ou « defaut »). */
  readonly scenario: string;
  ecran<K extends NomEcran>(nom: K): EcransFixtures[K];
}

export function creerSourceFixtures(
  scenario: string,
  donneesScenario: Ecran<unknown> | undefined,
): SourceFixtures {
  return {
    scenario,
    ecran<K extends NomEcran>(nom: K): EcransFixtures[K] {
      if (donneesScenario && donneesScenario.planche === nom) {
        return donneesScenario as unknown as EcransFixtures[K];
      }
      return ecrans[nom];
    },
  };
}

/* ----------------------------------------------------------------------- signature PIN */

/** PIN que le mock refuse (démonstration d'un PIN erroné). Tout autre PIN à 6 chiffres passe. */
export const PIN_REFUSE_PAR_LE_MOCK = "000000";

/**
 * Reproduit côté mock ce que fera l'API : refuser toute écriture sans signature PIN valide
 * (401 `PIN_REQUIS`), refuser un PIN faux (403 `PIN_INCORRECT`), puis valider le corps entier.
 */
export function lireCommande<S extends z.ZodType>(schema: S, brut: unknown): z.infer<S> {
  const signature = (brut as { signature?: unknown } | null | undefined)?.signature;
  const sig = c.SignaturePinSchema.safeParse(signature);
  if (!sig.success) {
    throw new ErreurHttp(401, "Signature PIN requise pour modifier un réglage", "PIN_REQUIS", {
      issues: sig.error.issues,
    });
  }
  if (sig.data.pin === PIN_REFUSE_PAR_LE_MOCK) {
    throw new ErreurHttp(403, "PIN incorrect", "PIN_INCORRECT");
  }
  const corps = schema.safeParse(brut);
  if (!corps.success) {
    throw new ErreurHttp(422, "Corps de la commande invalide", "COMMANDE_INVALIDE", {
      issues: corps.error.issues,
    });
  }
  return corps.data;
}

/** Compteur de journal propre à chaque client mock. */
export function creerJournal(): (signeA: string) => c.AccuseSigne {
  let n = 0;
  return (signeA) => ({
    journalId: `jrn-${String(++n).padStart(4, "0")}`,
    signeA,
    signePar: KAMGA_PATRON.id,
  });
}

export function introuvable(quoi: string, code: string, id: string): ErreurHttp {
  return new ErreurHttp(404, `${quoi} « ${id} » introuvable dans ce scénario`, code);
}

export function conflit(message: string, code: string): ErreurHttp {
  return new ErreurHttp(409, message, code);
}
