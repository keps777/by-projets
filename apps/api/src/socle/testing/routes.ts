import { RequestMethod, type INestApplication } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ModulesContainer } from "@nestjs/core";
import { CLE_PUBLIC, CLE_ROLES, CLE_TOUT_AUTHENTIFIE, CLE_VENTE } from "../auth/decorateurs";
import type { Role } from "../auth/roles";

export interface InfoRoute {
  methode: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "ALL";
  /** Chemin complet, paramètres sous la forme `:id`. */
  chemin: string;
  controleur: string;
  publique: boolean;
  toutAuthentifie: boolean;
  vente: boolean;
  roles: Role[] | undefined;
}

const METHODES: Record<number, InfoRoute["methode"]> = {
  [RequestMethod.GET]: "GET",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.DELETE]: "DELETE",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.ALL]: "ALL",
  [RequestMethod.OPTIONS]: "OPTIONS",
  [RequestMethod.HEAD]: "HEAD",
};

function joindre(...morceaux: string[]): string {
  const chemin = morceaux
    .flatMap((m) => m.split("/"))
    .filter(Boolean)
    .join("/");
  return `/${chemin}`;
}

/**
 * Inventaire de TOUTES les routes HTTP de l'application avec leurs règles d'accès, lu dans les
 * métadonnées des contrôleurs. Sert aux tests de rôles : une nouvelle route est vérifiée sans
 * qu'on ait à penser à l'ajouter à une liste.
 */
export function listerRoutes(app: INestApplication): InfoRoute[] {
  const routes: InfoRoute[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const classe = wrapper.metatype;
      if (!classe || typeof classe !== "function") continue;
      const prefixe = (Reflect.getMetadata(PATH_METADATA, classe) as string | undefined) ?? "";
      const proto = classe.prototype as Record<string, unknown>;
      for (const nom of Object.getOwnPropertyNames(proto)) {
        const handler = proto[nom];
        if (typeof handler !== "function" || nom === "constructor") continue;
        const methode = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (methode === undefined) continue;
        const chemin = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? "";
        const lire = <T>(cle: string): T | undefined =>
          (Reflect.getMetadata(cle, handler) as T | undefined) ??
          (Reflect.getMetadata(cle, classe) as T | undefined);
        routes.push({
          methode: METHODES[methode] ?? "ALL",
          chemin: joindre(prefixe, chemin),
          controleur: `${classe.name}.${nom}`,
          publique: lire<boolean>(CLE_PUBLIC) === true,
          toutAuthentifie: lire<boolean>(CLE_TOUT_AUTHENTIFIE) === true,
          vente: lire<boolean>(CLE_VENTE) === true,
          roles: lire<Role[]>(CLE_ROLES),
        });
      }
    }
  }
  return routes;
}
