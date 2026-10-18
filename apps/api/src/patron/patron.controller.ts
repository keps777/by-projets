import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { patron as c } from "@afrimove/contrats";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { LecturesPatronService } from "./lectures.service";
import { ReglagesPatronService } from "./reglages.service";

/**
 * Les lectures de l'espace patron : tableau du jour, alertes, gares, équipe, fiche d'une personne, salle de
 * contrôle. Noms d'opérations de `packages/api-client/src/patron/operations.ts`. Une compagnie ne lit que
 * ses propres données : l'identifiant de la compagnie vient du jeton.
 */
@ApiTags("Patron")
@Controller("patron")
export class PatronController {
  constructor(private readonly lectures: LecturesPatronService) {}

  @Roles("patron")
  @Get("aujourdhui")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.aujourdhui.tableau",
    summary:
      "Aujourd'hui : recette, billets, colis, remplissage et écart du jour, assistant, alertes",
    description:
      "Réponse conforme au contrat `TableauDuJour`. Les chiffres du jour sont calculés avec les mêmes " +
      "définitions que le rapport de 21 h.",
  })
  @ApiResponse({
    status: 503,
    description: "Une source de chiffres ne répond pas (`SOURCE_INDISPONIBLE`)",
  })
  tableau(@UtilisateurCourant() u: Utilisateur): Promise<c.TableauDuJour> {
    return this.lectures.tableau(u);
  }

  @Roles("patron")
  @Get("alertes")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.aujourdhui.alertes",
    summary: "Les alertes des dernières 48 heures, la plus récente d'abord",
    description: "Réponse conforme au contrat `ListeAlertes`.",
  })
  @ApiResponse({ status: 503, description: "Une source ne répond pas (`SOURCE_INDISPONIBLE`)" })
  alertes(@UtilisateurCourant() u: Utilisateur): Promise<c.ListeAlertes> {
    return this.lectures.alertes(u);
  }

  @Roles("patron")
  @Get("gares")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.gares.lister",
    summary: "Mes gares, mes gens : gares, effectifs, personnes à suivre, paie du mois",
    description: "Réponse conforme au contrat `VueGares`.",
  })
  @ApiResponse({ status: 503, description: "Une source ne répond pas (`SOURCE_INDISPONIBLE`)" })
  gares(@UtilisateurCourant() u: Utilisateur): Promise<c.VueGares> {
    return this.lectures.gares(u);
  }

  @Roles("patron")
  @Get("gares/:gareId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.gares.detail",
    summary: "Une gare : guichets, quais, caisses et journal du jour",
    description: "Réponse conforme au contrat `DetailGare`.",
  })
  @ApiResponse({ status: 404, description: "Gare inconnue (`GARE_INCONNUE`)" })
  @ApiResponse({ status: 503, description: "Une source ne répond pas (`SOURCE_INDISPONIBLE`)" })
  gare(
    @Param("gareId") gareId: string,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.DetailGare> {
    return this.lectures.gare(u, gareId);
  }

  @Roles("patron")
  @Get("equipe")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.equipe.lister",
    summary: "L'équipe, filtrable par rôle, par nom ou lieu, par gare",
    description:
      "Paramètres `role`, `recherche`, `gareId` (rien d'autre). Réponse conforme à `ListeEquipe`.",
  })
  @ApiResponse({ status: 400, description: "Paramètre inconnu ou invalide (`REQUETE_INVALIDE`)" })
  @ApiResponse({ status: 404, description: "Gare inconnue (`GARE_INCONNUE`)" })
  equipe(
    @Query() requete: Record<string, unknown>,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.ListeEquipe> {
    return this.lectures.equipeListe(u, requete);
  }

  @Roles("patron")
  @Get("personnes/:personneId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.personnes.fiche",
    summary: "La fiche d'une personne : activité, écarts de caisse, journal",
    description: "Réponse conforme au contrat `FichePersonne`.",
  })
  @ApiResponse({
    status: 404,
    description: "Personne inconnue de la compagnie (`PERSONNE_INCONNUE`)",
  })
  fiche(
    @Param("personneId") personneId: string,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.FichePersonne> {
    return this.lectures.personne(u, personneId);
  }

  @Roles("patron")
  @Get("controle")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.controle.salle",
    summary: "La salle de contrôle : toutes les gares, les bus en route, les éléments à traiter",
    description: "Réponse conforme au contrat `SalleDeControle`.",
  })
  @ApiResponse({ status: 503, description: "Une source ne répond pas (`SOURCE_INDISPONIBLE`)" })
  controle(@UtilisateurCourant() u: Utilisateur): Promise<c.SalleDeControle> {
    return this.lectures.controle(u);
  }
}

/**
 * Les réglages du patron. Toute écriture porte la signature PIN du patron dans son corps (`commandeSignee`
 * des contrats) ; sans elle : 401 `PIN_REQUIS`. Chaque écriture, acceptée ou refusée, entre au journal d'audit.
 */
@ApiTags("Patron · réglages")
@Controller("patron/reglages")
export class ReglagesPatronController {
  constructor(private readonly reglages: ReglagesPatronService) {}

  @Roles("patron")
  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.reglages.accueil",
    summary: "Réglages : les lignes, un aperçu de l'équipe, les règles de l'agence",
    description: "Réponse conforme au contrat `Reglages`.",
  })
  accueil(@UtilisateurCourant() u: Utilisateur): Promise<c.Reglages> {
    return this.reglages.accueil(u);
  }

  @Roles("patron")
  @Get("lignes/:ligneId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.reglages.ligne",
    summary: "Une ligne à modifier : départs, tarifs, arrêts, plan de sièges, options",
    description: "Réponse conforme au contrat `LigneEditable`.",
  })
  @ApiResponse({ status: 404, description: "Ligne inconnue (`LIGNE_INCONNUE`)" })
  ligne(
    @Param("ligneId") ligneId: string,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.LigneEditable> {
    return this.reglages.ligne(u, ligneId);
  }

  @Roles("patron")
  @Put("lignes/:ligneId")
  @HttpCode(200)
  @ApiOperation({
    operationId: "patron.reglages.ligne.modifier",
    summary: "Publier les modifications d'une ligne, tout de suite ou à la date d'effet",
    description:
      "Corps `ModifierLigne`, signé par le PIN. Avec `effetDu` dans le futur (90 jours au plus), la " +
      "modification attend son jour et la ligne garde son état actuel d'ici là.",
  })
  @ApiResponse({ status: 200, description: "`LignePubliee`" })
  modifierLigne(
    @Param("ligneId") ligneId: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.LignePubliee> {
    return this.reglages.modifierLigne(u, ligneId, corps);
  }

  @Roles("patron")
  @Post("lignes")
  @HttpCode(201)
  @ApiOperation({
    operationId: "patron.reglages.ligne.creer",
    summary: "Ajouter une ligne entre deux gares de la compagnie",
    description:
      "Corps `CreerLigne`, signé par le PIN. 409 `LIGNE_EXISTANTE` si le couple de gares a déjà sa ligne.",
  })
  @ApiResponse({ status: 201, description: "`LignePubliee`" })
  creerLigne(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.LignePubliee> {
    return this.reglages.creerLigne(u, corps);
  }

  @Roles("patron")
  @Get("personnes/:personneId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.reglages.personne",
    summary: "Une personne à modifier : numéro complet, rôle, affectation, salaire, droits",
    description: "Réponse conforme au contrat `PersonneEditable`.",
  })
  @ApiResponse({ status: 404, description: "Personne inconnue (`PERSONNE_INCONNUE`)" })
  personne(
    @Param("personneId") personneId: string,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.PersonneEditable> {
    return this.reglages.personne(u, personneId);
  }

  @Roles("patron")
  @Put("personnes/:personneId")
  @HttpCode(200)
  @ApiOperation({
    operationId: "patron.reglages.personne.modifier",
    summary: "Modifier une personne de l'équipe",
    description:
      "Corps `ModifierPersonne`, signé par le PIN. Une caisse ouverte ne change pas d'affectation.",
  })
  @ApiResponse({ status: 200, description: "`PersonneEnregistree`" })
  modifierPersonne(
    @Param("personneId") personneId: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.PersonneEnregistree> {
    return this.reglages.modifierPersonne(u, personneId, corps);
  }

  @Roles("patron")
  @Post("personnes")
  @HttpCode(201)
  @ApiOperation({
    operationId: "patron.reglages.personne.creer",
    summary: "Ajouter une personne : son compte est créé et son PIN provisoire part par SMS",
    description:
      "Corps `CreerPersonne`, signé par le PIN. `pinProvisoireEnvoye` vaut faux si le SMS n'a pas pu partir.",
  })
  @ApiResponse({ status: 201, description: "`PersonneEnregistree`" })
  creerPersonne(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.PersonneEnregistree> {
    return this.reglages.creerPersonne(u, corps);
  }

  @Roles("patron")
  @Post("personnes/:personneId/desactivation")
  @HttpCode(200)
  @ApiOperation({
    operationId: "patron.reglages.personne.desactiver",
    summary: "Désactiver le compte d'une personne : effet immédiat",
    description:
      "Corps `DesactiverPersonne`, signé par le PIN. Un jeton déjà émis cesse de fonctionner.",
  })
  @ApiResponse({ status: 200, description: "`PersonneDesactivee`" })
  desactiver(
    @Param("personneId") personneId: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.PersonneDesactivee> {
    return this.reglages.desactiver(u, personneId, corps);
  }

  @Roles("patron")
  @Post("personnes/:personneId/pin-provisoire")
  @HttpCode(200)
  @ApiOperation({
    operationId: "patron.reglages.personne.pinProvisoire",
    summary: "Envoyer un PIN provisoire (1 h) par SMS à une personne",
    description:
      "Corps `NouveauPinProvisoire`, signé par le PIN. Le PIN n'apparaît ni dans la réponse ni au journal.",
  })
  @ApiResponse({ status: 200, description: "`PinProvisoireEnvoye`" })
  @ApiResponse({ status: 502, description: "Le SMS n'a pas pu partir (`SMS_ECHEC`)" })
  pinProvisoire(
    @Param("personneId") personneId: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.PinProvisoireEnvoye> {
    return this.reglages.pinProvisoire(u, personneId, corps);
  }

  @Roles("patron")
  @Get("regles")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.reglages.regles",
    summary:
      "Les règles de l'agence : annulation, caisse, cadence, frais, comptes mobile money (masqués)",
    description: "Réponse conforme au contrat `ReglesAgence`.",
  })
  regles(@UtilisateurCourant() u: Utilisateur): Promise<c.ReglesAgence> {
    return this.reglages.reglesDeLAgence(u);
  }

  @Roles("patron")
  @Put("regles")
  @HttpCode(200)
  @ApiOperation({
    operationId: "patron.reglages.regles.enregistrer",
    summary: "Enregistrer les règles de l'agence",
    description:
      "Corps `EnregistrerRegles`, signé par le PIN. La tolérance d'écart de caisse s'applique aux " +
      "clôtures qui suivent.",
  })
  @ApiResponse({ status: 200, description: "`ReglesEnregistrees`" })
  enregistrerRegles(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.ReglesEnregistrees> {
    return this.reglages.enregistrerRegles(u, corps);
  }

  @Roles("patron")
  @Post("comptes-momo/confirmation")
  @HttpCode(200)
  @ApiOperation({
    operationId: "patron.reglages.compteMomo.confirmer",
    summary: "Changer un compte mobile money (1/2) : un code part par SMS sur l'ancien numéro",
    description:
      "Corps `DemanderConfirmationCompteMomo`, signé par le PIN. Le code (6 chiffres) vaut 10 minutes, " +
      "3 essais ; une nouvelle demande est possible une minute après la précédente.",
  })
  @ApiResponse({ status: 200, description: "`ConfirmationCompteMomoEnvoyee`" })
  @ApiResponse({
    status: 429,
    description: "Un code vient d'être envoyé (`CONFIRMATION_TROP_RAPPROCHEE`)",
  })
  @ApiResponse({ status: 502, description: "Le SMS n'a pas pu partir (`SMS_ECHEC`)" })
  confirmerCompteMomo(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.ConfirmationCompteMomoEnvoyee> {
    return this.reglages.demanderConfirmationMomo(u, corps);
  }

  @Roles("patron")
  @Put("comptes-momo")
  @HttpCode(200)
  @ApiOperation({
    operationId: "patron.reglages.compteMomo.changer",
    summary:
      "Changer un compte mobile money (2/2) : PIN et code reçu ; l'ancien compte tient jusqu'à minuit",
    description:
      "Corps `ChangerCompteMomo`, signé par le PIN. 409 `CONFIRMATION_ABSENTE` / `CONFIRMATION_EXPIREE`, " +
      "403 `CODE_SMS_INCORRECT`, 423 `CONFIRMATION_BLOQUEE` après 3 essais.",
  })
  @ApiResponse({ status: 200, description: "`CompteMomoChange`" })
  changerCompteMomo(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<c.CompteMomoChange> {
    return this.reglages.changerCompteMomo(u, corps);
  }
}
