import { patron as c } from "@afrimove/contrats";
import { useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ErreurApi } from "../infra/erreurs";
import { useMutationApi, useRequete } from "../infra/react";
import type { OptionsRequete } from "../infra/react";
import { OP_CHANGER_MODULE, OP_MODULES } from "../patron/operations";
import { CATALOGUE_MODULES, codeDuModule, idWebDuModule } from "./catalogue";
import type { CodeModule, IdModuleWeb } from "./catalogue";
import type { ContexteModules, ModulesActifs } from "./contrat";
import { OP_MODULES_ACTIFS } from "./operations";

/**
 * Hooks des modules pour toutes les apps (voyageur, guichet, patron).
 *
 * Un module masqué disparaît : pas de bouton grisé, pas de « bientôt ». Les apps lisent l'état au
 * chargement, au retour sur l'onglet et à la reconnexion (« prochain rafraîchissement ») ; le
 * patron qui masque un module voit ses propres menus se mettre à jour tout de suite
 * (`useChangerModule`).
 *
 * En cas d'échec ou tant que la première réponse n'est pas arrivée, **tout est affiché** : un
 * guichet hors ligne ne doit jamais perdre une fonction parce que le réseau est coupé. Dès qu'une
 * réponse est connue, la dernière valeur reste en place même si un rafraîchissement échoue.
 */

type Lecture<R> = UseQueryResult<R, ErreurApi>;

/** Les modules visibles pour moi, vus de ma gare (ou de la gare, de la ville, de l'agence demandée). */
export function useModulesActifs(
  contexte: ContexteModules = {},
  options?: OptionsRequete<ModulesActifs>,
): Lecture<ModulesActifs> {
  return useRequete(OP_MODULES_ACTIFS, contexte, {
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    ...options,
  });
}

function codeOuErreur(idOuCode: string): CodeModule {
  const code = codeDuModule(idOuCode);
  if (!code) throw new Error(`useModule : module inconnu « ${idOuCode} »`);
  return code;
}

/**
 * Le module est-il actif ? Même forme que `useModule(id)` de la coquille web : vrai si on doit
 * afficher ses entrées. Accepte l'identifiant web (`"covoit"`) ou le code API (`"covoit_vendeurs"`).
 */
export function useModule(idOuCode: IdModuleWeb | CodeModule, contexte?: ContexteModules): boolean {
  const code = codeOuErreur(idOuCode);
  const { data } = useModulesActifs(contexte);
  if (!data) return true;
  return data.modules.find((m) => m.code === code)?.actif ?? true;
}

/**
 * Les modules masqués, en identifiants web : la liste attendue par `<ModulesProvider masques>` de la
 * coquille. Vide tant que l'état n'est pas connu. Le socle n'y figure jamais.
 */
export function useModulesMasques(contexte?: ContexteModules): readonly IdModuleWeb[] {
  const { data } = useModulesActifs(contexte);
  return useMemo(
    () =>
      data
        ? CATALOGUE_MODULES.filter(
            (m) => !m.socle && data.modules.some((x) => x.code === m.code && !x.actif),
          ).map((m) => idWebDuModule(m.code))
        : [],
    [data],
  );
}

/**
 * Allumer ou masquer un module pour l'agence, une gare ou une ville (signé par le PIN, voir
 * `patron.useSignaturePin`). Comme `patron.useChangerModule`, mais recharge aussi l'état des menus
 * (`useModulesActifs`) pour que l'app du patron change tout de suite.
 */
export function useChangerModule(): UseMutationResult<c.ModuleChange, ErreurApi, c.ChangerModule> {
  const cache = useQueryClient();
  return useMutationApi(OP_CHANGER_MODULE, {
    onSuccess: async () => {
      await Promise.all(
        [OP_MODULES, OP_MODULES_ACTIFS].map((o) => cache.invalidateQueries({ queryKey: [o.nom] })),
      );
    },
  });
}
