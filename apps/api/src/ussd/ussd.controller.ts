import { createHash, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { Public, Roles } from "../socle/auth/decorateurs";
import { CONFIG_USSD, OPERATEURS_USSD, type ConfigUssd, type OperateurUssd } from "./config";
import { CONNECTEURS, RequeteUssdIllisible } from "./connecteurs";
import { DialogueUssdService } from "./dialogue.service";
import { JournalisationUssd } from "./journalisation.service";
import {
  ECHANGES_WHATSAPP_APERCU,
  LEGENDE_VOCAL,
  MOT_CLE_WHATSAPP,
  NOTE_APERCU,
  TOUCHES_CLAVIER,
  lignesApercu,
} from "./textes";

const empreinte = (valeur: string): Buffer => createHash("sha256").update(valeur).digest();

/** Comparaison en temps constant (les deux côtés sont réduits à 32 octets). */
function memeJeton(attendu: string, recu: string): boolean {
  return timingSafeEqual(empreinte(attendu), empreinte(recu));
}

/** Le jeton de l'opérateur : `Authorization: Bearer <jeton>` ou `x-ussd-jeton`. */
function jetonRecu(req: Request): string {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && /^Bearer\s+\S+$/i.test(auth))
    return auth.replace(/^Bearer\s+/i, "");
  const entete = req.headers["x-ussd-jeton"];
  return typeof entete === "string" ? entete : "";
}

@ApiTags("USSD")
@Controller()
export class UssdController {
  constructor(
    private readonly dialogue: DialogueUssdService,
    private readonly journal: JournalisationUssd,
    @Inject(CONFIG_USSD) private readonly config: ConfigUssd,
  ) {}

  /**
   * Appelé par l'opérateur à chaque réponse du voyageur. Route publique : l'appel est authentifié par
   * le jeton propre à chaque opérateur (variable `USSD_<OPERATEUR>_JETON`), pas par un compte ; le
   * numéro du voyageur est celui que l'opérateur certifie.
   */
  @Public()
  @SkipThrottle()
  @Post("ussd/:operateur")
  @HttpCode(200)
  @ApiOperation({
    summary: "Échange USSD d'un opérateur (MTN, Orange) : une réponse du voyageur, l'écran suivant",
    description:
      "Le format de la requête et de la réponse dépend de l'opérateur (voir `connecteurs.ts`). " +
      "Aucune session n'est ouverte sans le jeton de l'opérateur.",
  })
  @ApiResponse({ status: 400, description: "Requête illisible" })
  @ApiResponse({ status: 401, description: "Jeton absent ou invalide" })
  @ApiResponse({ status: 404, description: "Opérateur inconnu ou connecteur inactif" })
  async recevoir(
    @Param("operateur") nom: string,
    @Body() corps: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const operateur = (OPERATEURS_USSD as readonly string[]).includes(nom)
      ? (nom as OperateurUssd)
      : null;
    const attendu = operateur !== null ? this.config.jetons[operateur] : null;
    if (operateur === null || attendu === null) {
      throw new NotFoundException({
        code: "CONNECTEUR_INCONNU",
        message: "Ce connecteur n'existe pas ou n'est pas activé",
      });
    }
    if (!memeJeton(attendu, jetonRecu(req))) {
      await this.journal.noter({ operateur, evenement: "refus_jeton" });
      throw new UnauthorizedException({ code: "JETON_INVALIDE", message: "Appel non authentifié" });
    }

    const connecteur = CONNECTEURS[operateur];
    let entree;
    try {
      entree = connecteur.lire(corps);
    } catch (e) {
      if (e instanceof RequeteUssdIllisible) {
        await this.journal.noter({ operateur, evenement: "requete_illisible" });
        throw new BadRequestException({ code: "REQUETE_ILLISIBLE", message: e.raison });
      }
      throw e;
    }
    const reponse = connecteur.ecrire(await this.dialogue.traiter(entree));
    res.type(reponse.contentType);
    return reponse.corps;
  }

  /**
   * L'aperçu de l'écran « Sans internet » de l'application. Ses écrans USSD viennent des mêmes
   * constantes que les vrais écrans (`textes.ts`) : ils ne peuvent pas diverger.
   */
  @Roles("voyageur")
  @Get("voyageur/sans-internet")
  @ApiOperation({
    summary: "Aperçu « Sans internet » : l'écran USSD *123# et la conversation WhatsApp",
  })
  apercu() {
    return {
      ussd: {
        code: this.config.codeService,
        lignes: lignesApercu(),
        touches: [...TOUCHES_CLAVIER],
        note: NOTE_APERCU,
      },
      whatsapp: {
        motCle: MOT_CLE_WHATSAPP,
        echanges: ECHANGES_WHATSAPP_APERCU.map((e) => ({ de: e.de, lignes: [...e.lignes] })),
        vocal: LEGENDE_VOCAL,
      },
    };
  }
}
