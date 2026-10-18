import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { invalide } from "../caisse/erreurs";
import { Lecteur } from "../caisse/validation";
import { AppareilsService } from "./appareils.service";
import { texteDeRequete } from "./commun";
import { EquipeService } from "./equipe.service";
import { TYPES_AVEC_VALIDATION } from "./evenements";
import { PinSuperviseurService, PreuvesPinService } from "./pin.service";
import { SupervisionService } from "./supervision.service";

const CORPS_EVENEMENT = {
  schema: {
    type: "object" as const,
    description:
      "Un événement de l'agence : { id (UUID créé sur l'appareil), type, at, appareilId, auteurId, cible, numeroPlage: null, donnees }. " +
      "`donnees.validePar` porte la preuve du PIN du superviseur (voir POST /agence/superviseur/pin).",
  },
};

/** Ce que la route de preuve lit : le PIN, et l'événement tel qu'il sera envoyé (sans signature). */
function lireDemandePreuve(corps: unknown, u: Utilisateur) {
  const l = new Lecteur();
  const o = l.objet(corps, "");
  const evenement = o ? l.objet(o["evenement"], "evenement") : undefined;
  if (evenement) {
    l.uuid(evenement["id"], "evenement.id");
    l.choix(evenement["type"], "evenement.type", TYPES_AVEC_VALIDATION);
    const donnees = l.objet(evenement["donnees"], "evenement.donnees");
    const validePar = donnees
      ? l.objet(donnees["validePar"], "evenement.donnees.validePar")
      : undefined;
    if (validePar) {
      if (validePar["superviseurId"] !== u.id) {
        l.echec("evenement.donnees.validePar.superviseurId", "doit être le superviseur connecté");
      }
      if (validePar["methode"] !== "pin")
        l.echec("evenement.donnees.validePar.methode", "« pin » attendu");
    }
  }
  if (l.problemes.length > 0 || !o || !evenement) {
    throw invalide("DEMANDE_PREUVE_INVALIDE", "Demande de preuve invalide", l.problemes);
  }
  return { pin: o["pin"], evenement };
}

/**
 * Les routes du superviseur de gare, avec exactement les chemins et les noms d'opérations de
 * `packages/api-client/src/agence/operations.ts` :
 *
 * | Opération                          | Route                                         |
 * | ---------------------------------- | --------------------------------------------- |
 * | `agence.superviseur.gare`          | `GET  /agence/superviseur/gare`               |
 * | `agence.superviseur.cloture`       | `GET  /agence/superviseur/clotures/:sessionId` |
 * | `agence.superviseur.annulation`    | `GET  /agence/superviseur/annulations/:demandeId` |
 * | `agence.superviseur.equipe`        | `GET  /agence/superviseur/equipe`             |
 * | `agence.annulation.demandee`       | `POST /agence/annulations`                    |
 * | `agence.annulation.decidee`        | `POST /agence/superviseur/annulations`        |
 * | `agence.caisse.validee`            | `POST /agence/superviseur/validations`        |
 * | `agence.caisse.refusee`            | `POST /agence/superviseur/refus`              |
 * | `agence.equipe.pin_renouvele`      | `POST /agence/superviseur/equipe/pin`         |
 * | `agence.equipe.affectation_changee`| `POST /agence/superviseur/equipe/affectation` |
 * | `agence.equipe.compte_desactive`   | `POST /agence/superviseur/equipe/desactivation` |
 * | `agence.equipe.personne_debloquee` | `POST /agence/superviseur/equipe/deblocage`   |
 * | `agence.superviseur.appareil`      | `GET  /agence/superviseur/appareils/:appareilId` |
 * | `agence.appareil.debloque`         | `POST /agence/superviseur/appareils/deblocage` |
 *
 * En plus du contrat : `POST /agence/superviseur/pin` (preuve du PIN) et le paramètre `personneId`
 * de la lecture de l'équipe (fiche ouverte).
 */
@ApiTags("Supervision")
@Controller("agence")
export class SupervisionController {
  constructor(
    private readonly supervision: SupervisionService,
    private readonly equipe: EquipeService,
    private readonly pin: PinSuperviseurService,
    private readonly preuves: PreuvesPinService,
    private readonly appareils: AppareilsService,
  ) {}

  /* ------------------------------------------------------------------ lectures */

  @Roles("superviseur")
  @Get("superviseur/gare")
  @ApiOperation({
    summary: "L'accueil du superviseur : demandes à valider, guichets, départs de l'après-midi",
  })
  gare(@Query("gareId") gareId: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.supervision.gare(texteDeRequete(gareId), u);
  }

  @Roles("superviseur")
  @Get("superviseur/clotures/:sessionId")
  @ApiOperation({ summary: "Une clôture de caisse à valider avec le PIN" })
  cloture(@Param("sessionId") sessionId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.supervision.cloture(sessionId, u);
  }

  @Roles("superviseur")
  @Get("superviseur/annulations/:demandeId")
  @ApiOperation({ summary: "Une demande d'annulation à décider avec le PIN" })
  annulation(@Param("demandeId") demandeId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.supervision.annulation(demandeId, u);
  }

  @Roles("superviseur")
  @Get("superviseur/equipe")
  @ApiOperation({
    summary: "L'équipe de la gare : un compte et un PIN chacun",
    description:
      "`personneId` (facultatif) ouvre la fiche de cette personne ; sinon la première personne dont " +
      "le PIN est à renouveler, puis la première bloquée.",
  })
  lireEquipe(
    @Query("gareId") gareId: unknown,
    @Query("personneId") personneId: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    return this.equipe.lire(
      {
        ...(texteDeRequete(gareId) ? { gareId: texteDeRequete(gareId)! } : {}),
        ...(texteDeRequete(personneId) ? { personneId: texteDeRequete(personneId)! } : {}),
      },
      u,
    );
  }

  @Roles("superviseur")
  @Get("superviseur/appareils/:appareilId")
  @ApiOperation({
    summary:
      "Un téléphone de guichet hors ligne : règle des 12 h, diagnostic, façons de le débloquer",
    description:
      "Réservé aux appareils de la gare du superviseur (404 sinon). Provisoire : ventes, colis et cash en " +
      "attente valent 0 (le serveur ne voit pas la file locale du téléphone).",
  })
  @ApiResponse({ status: 404, description: "APPAREIL_INCONNU" })
  @ApiResponse({ status: 409, description: "APPAREIL_JAMAIS_SYNCHRONISE" })
  appareil(@Param("appareilId") appareilId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.appareils.lire(appareilId, u);
  }

  @Roles("superviseur")
  @Post("superviseur/appareils/deblocage")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Débloquer un appareil : synchroniser via mon téléphone, 4 h de plus, ou téléphone de secours",
    description:
      "Événement `appareil.debloque`, avec la preuve du PIN. L'octroi est lu par le téléphone à sa " +
      "prochaine synchronisation ; il est tracé au journal signé.",
  })
  @ApiBody(CORPS_EVENEMENT)
  @ApiResponse({ status: 404, description: "APPAREIL_INCONNU" })
  @ApiResponse({ status: 409, description: "APPAREIL_NON_BLOQUE" })
  debloquerAppareil(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.appareils.debloquer(corps, u);
  }

  /* ------------------------------------------------------------------ le PIN */

  @Roles("superviseur")
  @Post("superviseur/pin")
  @HttpCode(200)
  @ApiOperation({
    summary: "Mettre son PIN : obtenir la preuve qui valide un événement",
    description:
      "Corps : `{ pin, evenement }` où `evenement` est l'événement exactement tel qu'il sera envoyé, " +
      '`donnees.validePar` valant `{ superviseurId, methode: "pin" }` (sans signature). La réponse ' +
      "donne la `signature` à placer dans `validePar.signature`. Elle ne vaut que pour cet événement " +
      "et dure dix minutes. 3 PIN faux : blocage de 15 minutes et alerte au patron. Le PIN n'est " +
      "conservé nulle part.",
  })
  @ApiResponse({ status: 401, description: "PIN incorrect (essaisRestants dans les détails)" })
  @ApiResponse({ status: 423, description: "PIN bloqué (reessayerApres dans les détails)" })
  async preuve(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    const demande = lireDemandePreuve(corps, u);
    await this.pin.verifier(u, demande.pin);
    const { signature, expireA } = this.preuves.emettre(u.id, demande.evenement);
    return { methode: "pin" as const, superviseurId: u.id, signature, expireA };
  }

  /* ------------------------------------------------------------------ annulations */

  @Roles("guichetier", "convoyeur", "vendeur")
  @Post("annulations")
  @HttpCode(200)
  @ApiOperation({
    summary: "Demander l'annulation d'un billet : elle attend le PIN d'un superviseur",
    description: "Événement `annulation.demandee`. Un agent ne peut pas annuler seul.",
  })
  @ApiBody(CORPS_EVENEMENT)
  demanderAnnulation(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.supervision.demanderAnnulation(corps, u);
  }

  @Roles("superviseur")
  @Post("superviseur/annulations")
  @HttpCode(200)
  @ApiOperation({
    summary: "Décider une annulation : rembourser, reporter, avoir ou refuser",
    description:
      "Événement `annulation.decidee`, avec la preuve du PIN. Le billet garde son numéro et le siège " +
      "est libéré tout de suite.",
  })
  @ApiBody(CORPS_EVENEMENT)
  deciderAnnulation(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.supervision.deciderAnnulation(corps, u);
  }

  /* ------------------------------------------------------------------ clôtures */

  @Roles("superviseur")
  @Post("superviseur/validations")
  @HttpCode(200)
  @ApiOperation({
    summary: "Valider une clôture : « Valider · écart signé »",
    description:
      "Événement `caisse.validee`, avec la preuve du PIN. L'écart signé doit être celui de la clôture.",
  })
  @ApiBody(CORPS_EVENEMENT)
  validerCaisse(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.supervision.validerCaisse(corps, u);
  }

  @Roles("superviseur")
  @Post("superviseur/refus")
  @HttpCode(200)
  @ApiOperation({
    summary: "Refuser une clôture : « Refuser · recompter », la caisse redevient ouverte",
    description: "Événement `caisse.refusee`, avec la preuve du PIN.",
  })
  @ApiBody(CORPS_EVENEMENT)
  refuserCaisse(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.supervision.refuserCaisse(corps, u);
  }

  /* ------------------------------------------------------------------ équipe */

  @Roles("superviseur")
  @Post("superviseur/equipe/pin")
  @HttpCode(200)
  @ApiOperation({
    summary: "Renouveler le PIN d'une personne : un PIN provisoire part par SMS (valable 1 h)",
    description: "Événement `equipe.pin_renouvele`. Le PIN n'est jamais renvoyé.",
  })
  @ApiBody(CORPS_EVENEMENT)
  renouvelerPin(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.equipe.renouvelerPin(corps, u);
  }

  @Roles("superviseur")
  @Post("superviseur/equipe/affectation")
  @HttpCode(200)
  @ApiOperation({ summary: "Changer une personne de guichet ou de rôle" })
  @ApiBody(CORPS_EVENEMENT)
  changerAffectation(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.equipe.changerAffectation(corps, u);
  }

  @Roles("superviseur")
  @Post("superviseur/equipe/desactivation")
  @HttpCode(200)
  @ApiOperation({ summary: "Désactiver un compte : immédiat, le patron est prévenu" })
  @ApiBody(CORPS_EVENEMENT)
  desactiver(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.equipe.desactiver(corps, u);
  }

  @Roles("superviseur")
  @Post("superviseur/equipe/deblocage")
  @HttpCode(200)
  @ApiOperation({ summary: "Débloquer une personne dont le compte est bloqué après 3 PIN faux" })
  @ApiBody(CORPS_EVENEMENT)
  debloquer(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.equipe.debloquer(corps, u);
  }
}
