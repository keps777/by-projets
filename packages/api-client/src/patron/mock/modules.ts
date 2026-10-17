import { patron as c } from "@afrimove/contrats";
import { implementer } from "../../infra/scenarios";
import { OP_CHANGER_MODULE, OP_MODULES } from "../operations";
import { conflit, creerJournal, introuvable, lireCommande } from "./contexte";
import type { ContributionMock, SourceFixtures } from "./contexte";

/** Les 12 modules (planche « Modules »). `guichet_caisse` est le socle : il ne s'éteint jamais. */

const SOCLE = new Set(["guichet_caisse"]);

const memePortee = (a: c.PorteeModule, b: c.PorteeModule): boolean =>
  a.type === b.type &&
  (a.type === "agence" ||
    (a.type === "gare" && b.type === "gare" && a.id === b.id) ||
    (a.type === "ville" && b.type === "ville" && a.nom === b.nom));

export function mockModules(src: SourceFixtures): ContributionMock {
  const journal = creerJournal();
  const modules = new Map<string, c.ModuleAgence>(
    src.ecran("Modules").donnees.modules.map((m) => [
      m._code,
      {
        code: m._code,
        nom: m.nom,
        actif: m.actif,
        socle: SOCLE.has(m._code),
        detail: m.detail,
        exceptions: [],
      },
    ]),
  );

  return {
    operations: [
      implementer(OP_MODULES, (): c.ModulesAgence => {
        const liste = [...modules.values()];
        return {
          modules: liste,
          actifs: liste.filter((m) => m.actif).length,
          total: liste.length,
        };
      }),
      implementer(OP_CHANGER_MODULE, (params): c.ModuleChange => {
        const cmd = lireCommande(c.ChangerModuleSchema, params);
        const module = modules.get(cmd.code);
        if (!module) throw introuvable("Module", "MODULE_INCONNU", cmd.code);
        if (module.socle && !cmd.actif) {
          throw conflit("Le socle guichet et caisse ne peut pas être masqué", "MODULE_SOCLE");
        }
        const modifie: c.ModuleAgence =
          cmd.portee.type === "agence"
            ? { ...module, actif: cmd.actif, exceptions: [] }
            : {
                ...module,
                exceptions: [
                  ...module.exceptions.filter((x) => !memePortee(x.portee, cmd.portee)),
                  { portee: cmd.portee, actif: cmd.actif },
                ],
              };
        modules.set(cmd.code, modifie);
        return { ...journal(cmd.signature.signeA), module: modifie };
      }),
    ],
    flux: [],
  };
}
