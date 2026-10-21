import { Controller, ForbiddenException, Get, Header, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import type { VueAnalyseBus, VueAnalyseLigne, VueAnalyses } from "./agregats";
import { AnalysesService } from "./analyses.service";
import { requeteInvalide } from "./erreurs";
import { PERIODES, type Periode } from "./periodes";

/** Lit la période de la requête : `semaine` par défaut, 400 pour une valeur ou un paramètre inconnu. */
export function lirePeriode(
  requete: Record<string, unknown>,
  defaut: Periode | null,
): Periode | null {
  const inconnus = Object.keys(requete).filter((cle) => cle !== "periode");
  if (inconnus.length > 0) throw requeteInvalide(`Paramètres inconnus : ${inconnus.join(", ")}`);
  const brut = requete["periode"];
  if (brut === undefined) return defaut;
  if (typeof brut !== "string" || !(PERIODES as readonly string[]).includes(brut)) {
    throw requeteInvalide(`periode : ${PERIODES.join(", ")} attendu`);
  }
  return brut as Periode;
}

function compagnieDe(u: Utilisateur): string {
  if (u.compagnieId === null) {
    throw new ForbiddenException({ code: "HORS_PERIMETRE", message: "Compte sans compagnie" });
  }
  return u.compagnieId;
}

const identifiant = (valeur: string, nom: string): string => {
  if (valeur.length === 0 || valeur.length > 100) throw requeteInvalide(`${nom} invalide`);
  return valeur;
};

/**
 * Les analyses du patron (`/(patron)/analyses`, `/analyses/ligne/[ligneId]`, `/analyses/bus/[busId]`).
 * Noms d'opérations de `packages/api-client/src/patron/operations.ts` : `patron.analyses.synthese`,
 * `patron.analyses.ligne`, `patron.analyses.bus`. Une compagnie ne lit que ses propres chiffres.
 */
@ApiTags("Analyses")
@Controller("patron/analyses")
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Roles("patron")
  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.analyses.synthese",
    summary: "Analyses : recette par jour, remplissage par ligne, net par bus",
    description:
      "Réponse conforme au contrat `Analyses` de `@afrimove/contrats`. La période se termine hier " +
      "(jamais un jour entamé) et se compare à la période d'avant, de même longueur.",
  })
  @ApiResponse({ status: 400, description: "Période inconnue (REQUETE_INVALIDE)" })
  @ApiResponse({ status: 503, description: "Chiffres indisponibles (SOURCE_INDISPONIBLE)" })
  synthese(
    @Query() requete: Record<string, unknown>,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<VueAnalyses> {
    return this.analyses.synthese(compagnieDe(u), lirePeriode(requete, "semaine")!);
  }

  @Roles("patron")
  @Get("lignes/:ligneId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.analyses.ligne",
    summary: "Analyse d'une ligne : départs, jours de la semaine, ventes en ligne et en route",
    description:
      "Réponse conforme au contrat `AnalyseLigne`. 404 `LIGNE_INCONNUE` hors de la compagnie.",
  })
  ligne(
    @Param("ligneId") ligneId: string,
    @Query() requete: Record<string, unknown>,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<VueAnalyseLigne> {
    return this.analyses.ligne(
      compagnieDe(u),
      identifiant(ligneId, "ligneId"),
      lirePeriode(requete, null) ?? "semaine",
    );
  }

  @Roles("patron")
  @Get("bus/:busId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.analyses.bus",
    summary: "Analyse d'un bus : recette, dépenses, net par semaine, trajet par trajet",
    description:
      "Réponse conforme au contrat `AnalyseBus`. 404 `BUS_INCONNU` hors de la compagnie.",
  })
  bus(
    @Param("busId") busId: string,
    @Query() requete: Record<string, unknown>,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<VueAnalyseBus> {
    if (Object.keys(requete).length > 0) {
      throw requeteInvalide(`Paramètres inconnus : ${Object.keys(requete).join(", ")}`);
    }
    return this.analyses.bus(compagnieDe(u), identifiant(busId, "busId"));
  }
}
