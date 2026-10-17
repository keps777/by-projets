/**
 * Le client des modules (AM-126) : `useChangerModule`, `useModulesActifs`, `installerMockModules`.
 *
 * `packages/api-client/src/index.ts` ne l'exporte pas encore (`export * as modules from "./modules/index"`, étape 1 du
 * README du client des modules) et ce fichier n'est pas dans le périmètre d'AM-125 : on passe donc par le chemin du
 * source. Quand l'export existe, remplacer cette ligne par `export { modules } from "@afrimove/api-client";`.
 */
export * as modules from "../../../../../packages/api-client/src/modules/index";
