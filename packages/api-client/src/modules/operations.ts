import { definirOperation } from "../infra/operations";
import { ModulesActifsSchema } from "./contrat";
import type { ContexteModules, ModulesActifs } from "./contrat";

/**
 * Les modules visibles pour moi. `GET /modules/actifs?agence=&gare=&ville=` : ouvert à tout compte
 * connecté. Le réglage (`patron.modules.lister`, `patron.modules.changer`) reste dans le client
 * patron (`OP_MODULES`, `OP_CHANGER_MODULE`).
 */
export const OP_MODULES_ACTIFS = definirOperation<ContexteModules, ModulesActifs>({
  nom: "modules.actifs",
  methode: "GET",
  chemin: () => "/modules/actifs",
  requete: (p) => ({ agence: p.agence, gare: p.gare, ville: p.ville }),
  reponse: ModulesActifsSchema,
});
