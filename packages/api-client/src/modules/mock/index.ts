import { patron as c } from "@afrimove/contrats";
import {
  ALPHA,
  GARES,
  KAMGA_PATRON,
  MODULES as MODULES_FIXTURES,
  ecrans,
} from "@afrimove/fixtures";
import type { z } from "zod";
import { ErreurHttp } from "../../infra/erreurs";
import { implementer } from "../../infra/scenarios";
import { OP_CHANGER_MODULE, OP_MODULES } from "../../patron/operations";
import type { ContributionMock } from "../../patron/mock/contexte";
import { CATALOGUE_MODULES } from "../catalogue";
import type { ModuleCatalogue } from "../catalogue";
import { OP_MODULES_ACTIFS } from "../operations";
import {
  cleVille,
  etatAgence,
  etatDans,
  etatHerite,
  memePortee,
  type ExceptionModule,
  type Portee,
  type ReglageModule,
} from "./regles";

/** PIN que le mock refuse (démonstration d'un PIN erroné), comme le mock patron. */
export const PIN_REFUSE_PAR_LE_MOCK = "000000";

export interface GareMock {
  id: string;
  ville: string;
}

export interface OptionsMockModules {
  /** Agence de la session (défaut : Alpha Voyages). */
  agenceId?: string;
  /** Gare que le serveur déduirait du compte quand l'écran n'en nomme pas (défaut : aucune). */
  gareParDefaut?: string | null;
  /** Gares de l'agence (défaut : celles d'Alpha dans les fixtures). */
  gares?: readonly GareMock[];
  /** État de départ des modules (défaut : les fixtures, 10 actifs sur 12). */
  modules?: readonly { code: string; actif: boolean }[];
}

function lire<S extends z.ZodType>(schema: S, brut: unknown): z.infer<S> {
  const signature = c.SignaturePinSchema.safeParse(
    (brut as { signature?: unknown } | null | undefined)?.signature,
  );
  if (!signature.success) {
    throw new ErreurHttp(401, "Signature PIN requise pour modifier un module", "PIN_REQUIS");
  }
  if (signature.data.pin === PIN_REFUSE_PAR_LE_MOCK) {
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

/**
 * Mock du moteur des modules. **Il remplace** les opérations `patron.modules.lister` et
 * `patron.modules.changer` du mock patron : il applique les mêmes règles que l'API (exceptions par
 * gare et ville, socle intouchable) et partage son état avec `modules.actifs`, si bien que masquer
 * un module dans l'écran « Modules » retire ses entrées des autres écrans, en démo comme en test.
 *
 * Le client mock retient la première implémentation d'une opération : placer ces
 * `operations` **avant** celles de `installerMockPatron`.
 *
 * Un état neuf à chaque appel : à appeler dans `SourceScenarios.charger`, une fois par client.
 */
export function installerMockModules(options: OptionsMockModules = {}): ContributionMock {
  const agenceId = options.agenceId ?? ALPHA.id;
  const gareParDefaut = options.gareParDefaut ?? null;
  const gares: readonly GareMock[] =
    options.gares ?? GARES.filter((g) => g.compagnieId === agenceId);
  const depart = options.modules ?? MODULES_FIXTURES;
  const details = new Map(ecrans.Modules.donnees.modules.map((m) => [m._code, m.detail] as const));

  const reglages = new Map<string, ReglageModule>(
    depart.map((m) => [m.code, { actif: m.actif, exceptions: [] }]),
  );
  let compteur = 0;

  const def = (code: string): ModuleCatalogue | undefined =>
    CATALOGUE_MODULES.find((m) => m.code === code);

  const vue = (d: ModuleCatalogue): c.ModuleAgence => {
    const reglage = reglages.get(d.code);
    const actif = etatAgence(d, reglage);
    const exceptions = d.socle ? [] : [...(reglage?.exceptions ?? [])];
    return {
      code: d.code,
      nom: d.nom,
      actif,
      socle: d.socle,
      detail: details.get(d.code) ?? "",
      exceptions: exceptions.map((e) => ({ portee: e.portee, actif: e.actif })),
    };
  };

  return {
    operations: [
      implementer(OP_MODULES, (): c.ModulesAgence => {
        const modules = CATALOGUE_MODULES.map((d) => vue(d));
        return { modules, actifs: modules.filter((m) => m.actif).length, total: modules.length };
      }),

      implementer(OP_CHANGER_MODULE, (params): c.ModuleChange => {
        const cmd = lire(c.ChangerModuleSchema, params);
        const d = def(cmd.code);
        if (!d) {
          throw new ErreurHttp(404, `Module « ${cmd.code} » inconnu`, "MODULE_INCONNU");
        }
        if (d.socle && !cmd.actif) {
          throw new ErreurHttp(
            409,
            "Le socle guichet et caisse ne peut pas être masqué",
            "MODULE_SOCLE",
          );
        }
        let portee: Portee = cmd.portee;
        let villeDeLaGare: string | null = null;
        if (portee.type === "gare") {
          const idGare = portee.id;
          const gare = gares.find((g) => g.id === idGare);
          if (!gare) throw new ErreurHttp(404, `Gare « ${idGare} » inconnue`, "GARE_INCONNUE");
          villeDeLaGare = gare.ville;
        } else if (portee.type === "ville") {
          const nom = portee.nom;
          const gare = gares.find((g) => cleVille(g.ville) === cleVille(nom));
          if (!gare) {
            throw new ErreurHttp(404, `Aucune gare de l'agence à « ${nom} »`, "VILLE_INCONNUE");
          }
          portee = { type: "ville", nom: gare.ville };
        }

        const avant = reglages.get(cmd.code);
        if (!d.socle) {
          if (portee.type === "agence") {
            reglages.set(cmd.code, { actif: cmd.actif, exceptions: [] });
          } else {
            const autres = (avant?.exceptions ?? []).filter((e) => !memePortee(e.portee, portee));
            const herite = etatHerite(d, avant, portee, villeDeLaGare);
            const exceptions: ExceptionModule[] =
              herite === cmd.actif ? autres : [...autres, { portee, actif: cmd.actif }];
            reglages.set(cmd.code, { actif: avant?.actif ?? null, exceptions });
          }
        }
        compteur += 1;
        return {
          journalId: `jrn-${String(compteur).padStart(4, "0")}`,
          signeA: cmd.signature.signeA,
          signePar: KAMGA_PATRON.id,
          module: vue(d),
        };
      }),

      implementer(OP_MODULES_ACTIFS, (params, ctx) => {
        const gareDemandee = params.gare ?? gareParDefaut;
        let gareId: string | null = null;
        let ville: string | null = params.ville ?? null;
        if (gareDemandee !== null && gareDemandee !== undefined) {
          const gare = gares.find((g) => g.id === gareDemandee);
          if (!gare) {
            throw new ErreurHttp(404, `Gare « ${gareDemandee} » inconnue`, "GARE_INCONNUE");
          }
          gareId = gare.id;
          ville = gare.ville;
        } else if (ville !== null) {
          const nom = ville;
          ville = gares.find((g) => cleVille(g.ville) === cleVille(nom))?.ville ?? nom;
        }
        return {
          agenceId,
          gareId,
          ville,
          calculeA: ctx.horloge.iso(),
          modules: CATALOGUE_MODULES.map((d) => ({
            code: d.code,
            actif: etatDans(d, reglages.get(d.code), { gareId, ville }),
          })),
        };
      }),
    ],
    flux: [],
  };
}
