import { BadRequestException, Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../../socle/auth/decorateurs";
import {
  CurseurJournalInvalide,
  JournalSigneService,
  type ParamsLectureJournal,
} from "./journal.service";

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Lit les paramètres de requête de `agence.journal.lister` (`SchemaParamsJournal`). */
export function lireParamsJournal(requete: Record<string, unknown>): ParamsLectureJournal {
  const texte = (cle: string): string | undefined => {
    const v = requete[cle];
    if (v === undefined || v === "") return undefined;
    if (typeof v !== "string" || v.length > 128) {
      throw new BadRequestException({
        code: "PARAMETRES_INVALIDES",
        message: `Paramètre « ${cle} » invalide`,
      });
    }
    return v;
  };
  const jour = texte("jour");
  if (jour !== undefined && !JOUR.test(jour)) {
    throw new BadRequestException({
      code: "PARAMETRES_INVALIDES",
      message: "« jour » : AAAA-MM-JJ attendu",
    });
  }
  const limiteBrute = texte("limite");
  let limite: number | undefined;
  if (limiteBrute !== undefined) {
    limite = Number(limiteBrute);
    if (!Number.isInteger(limite) || limite < 1 || limite > 200) {
      throw new BadRequestException({
        code: "PARAMETRES_INVALIDES",
        message: "« limite » : entier de 1 à 200 attendu",
      });
    }
  }
  const personneId = texte("personneId");
  const sessionId = texte("sessionId");
  const apres = texte("apres");
  return {
    ...(personneId !== undefined ? { personneId } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(jour !== undefined ? { jour } : {}),
    ...(apres !== undefined ? { apres } : {}),
    ...(limite !== undefined ? { limite } : {}),
  };
}

@ApiTags("Journal de l'agence")
@Controller("agence")
export class JournalController {
  constructor(private readonly journal: JournalSigneService) {}

  @Roles("superviseur", "patron")
  @Get("journal")
  @ApiOperation({
    summary: "Journal signé : le superviseur lit celui de sa gare, le patron celui de sa compagnie",
    description:
      "Du plus récent au plus ancien, avec un curseur (`apres`). `chaineValide` est faux si la " +
      "chaîne d'empreintes de la compagnie est rompue. Sans `sessionId`, le jour par défaut est aujourd'hui.",
  })
  async lister(@Query() requete: Record<string, unknown>, @UtilisateurCourant() u: Utilisateur) {
    const params = lireParamsJournal(requete);
    if (u.role === "superviseur" && !u.gareId) {
      throw new ForbiddenException({
        code: "GARE_REQUISE",
        message: "Ce compte n'est rattaché à aucune gare",
      });
    }
    if (u.role === "patron" && !u.compagnieId) {
      throw new ForbiddenException({
        code: "COMPAGNIE_REQUISE",
        message: "Ce compte n'est rattaché à aucune compagnie",
      });
    }
    try {
      return await this.journal.lire(params, {
        compagnieId: u.compagnieId,
        ...(u.role === "superviseur" ? { gareId: u.gareId } : {}),
      });
    } catch (e) {
      if (e instanceof CurseurJournalInvalide) {
        throw new BadRequestException({ code: "CURSEUR_INVALIDE", message: e.message });
      }
      throw e;
    }
  }
}
