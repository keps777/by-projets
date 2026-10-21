import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { DemandesService } from "./demandes.service";
import {
  corps,
  lireCreerTrajetRegulier,
  lireDefinirTrajetRegulier,
  lireDemande,
  lireNote,
  lireRechercheCovoit,
  lireRechercheVille,
  lireReserver,
  ou400,
  type Requete,
} from "./requetes";
import { RechercheService } from "./recherche.service";
import { ReservationsService } from "./reservations.service";
import { ReputationService } from "./reputation.service";
import { TrajetRegulierService } from "./trajet-regulier.service";

/**
 * Covoiturage côté passager. Les chemins sont ceux du client d'API
 * (`packages/api-client/src/voyageur/operationsServices.ts` et `operations.ts` : recherche,
 * réservation, trajet régulier, offres en ville) ; chaque réponse suit un schéma de
 * `@afrimove/contrats` (`voyageur`). Les routes sans contrat (mes réservations, arrivée, annulation,
 * notes, demandes) sont décrites dans le README.
 */
@ApiTags("Covoiturage : passager")
@Controller("voyageur")
export class CovoiturageVoyageurController {
  constructor(
    private readonly recherche: RechercheService,
    private readonly reservations: ReservationsService,
    private readonly demandes: DemandesService,
    private readonly regulier: TrajetRegulierService,
    private readonly reputation: ReputationService,
  ) {}

  /* ------------------------------------------------------------------ rechercher et réserver */

  @Roles("voyageur")
  @Get("covoit")
  @ApiOperation({
    summary: "Covoiturages entre deux villes",
    description:
      "Paramètres : `depart`, `arrivee` (noms ou codes de ville), `apartirDe` (ISO Douala), `filtres` " +
      "(`clim`, `femmes`, `grand_bagage`, `prix_max`, séparés par des virgules), `prixMax`. Seuls les " +
      "trajets de conducteurs vérifiés, avec une place libre, sont rendus.",
  })
  rechercher(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.recherche.rechercher(
      u,
      ou400(() => lireRechercheCovoit(requete)),
    );
  }

  @Roles("voyageur")
  @Get("ville/offres")
  @ApiOperation({
    summary: "Covoiturages dans une ville",
    description:
      "Paramètres : `ville`, `depart`, `arrivee`, `quand` (`maintenant`, `dans_1h`, `chaque_matin`), " +
      "`types`. Ce module ne sert que le type `covoiturage` ; la distance de l'itinéraire n'est pas calculée.",
  })
  enVille(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.recherche.enVille(
      u,
      ou400(() => lireRechercheVille(requete)),
    );
  }

  @Roles("voyageur")
  @Post("covoit/:offreId/reservations")
  @HttpCode(201)
  @ApiOperation({
    summary: "Réserver des places : rend la commande à payer",
    description:
      "Retient les places 15 minutes. La commande se paie avec `POST /voyageur/commandes/{id}/paiements` " +
      "comme un billet. Rejouer la demande rend la même commande. 409 `PLUS_ASSEZ_DE_PLACES`, " +
      "`DEJA_RESERVE`, `TRAJET_PROPRE`, `RESERVATION_FERMEE`.",
  })
  @ApiBody({
    schema: { type: "object", required: ["places"], properties: { places: { type: "integer" } } },
  })
  reserver(
    @Param("offreId") offreId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const { places } = corps(lireReserver, brut);
    return this.reservations.reserver(u, offreId, places);
  }

  /* ------------------------------------------------------------------ mes réservations */

  @Roles("voyageur")
  @Get("covoit/reservations")
  @ApiOperation({ summary: "Mes réservations de covoiturage" })
  mesReservations(@UtilisateurCourant() u: Utilisateur) {
    return this.reservations.mesReservations(u);
  }

  @Roles("voyageur")
  @Get("covoit/reservations/:reservationId")
  @ApiOperation({ summary: "Une de mes réservations" })
  reservation(@Param("reservationId") id: string, @UtilisateurCourant() u: Utilisateur) {
    return this.reservations.reservation(u, id);
  }

  @Roles("voyageur")
  @Post("covoit/reservations/:reservationId/arrivee")
  @HttpCode(200)
  @ApiOperation({
    summary: "Je suis bien arrivé : le conducteur est payé",
    description:
      "Libère l'argent vers le conducteur. Possible une fois l'heure du départ passée (409 " +
      "`TRAJET_PAS_COMMENCE` avant). Sans confirmation, il est payé 2 h après l'arrivée prévue.",
  })
  arrivee(@Param("reservationId") id: string, @UtilisateurCourant() u: Utilisateur) {
    return this.reservations.confirmerArrivee(u, id);
  }

  @Roles("voyageur")
  @Delete("covoit/reservations/:reservationId")
  @ApiOperation({
    summary: "Annuler ma réservation",
    description:
      "Avant le paiement : rien n'est dû. Après : le prix est rendu en entier jusqu'à 2 h avant le " +
      "départ, puis la moitié est gardée par le conducteur ; les frais d'AfriMove ne sont pas rendus. " +
      "409 `TRAJET_COMMENCE` une fois le trajet commencé.",
  })
  @ApiResponse({ status: 409, description: "Trajet commencé ou terminé" })
  annuler(@Param("reservationId") id: string, @UtilisateurCourant() u: Utilisateur) {
    return this.reservations.annulerReservation(u, id);
  }

  @Roles("voyageur")
  @Post("covoit/reservations/:reservationId/note")
  @HttpCode(201)
  @ApiOperation({
    summary: "Noter le conducteur",
    description: "Une note de 1 à 5, une seule fois, une fois le trajet terminé (argent libéré).",
  })
  noter(
    @Param("reservationId") id: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const { note, commentaire } = corps(lireNote, brut);
    return this.reputation.noter(u, id, note, commentaire);
  }

  /* ------------------------------------------------------------------ demandes */

  @Roles("voyageur")
  @Get("covoit/demandes")
  @ApiOperation({ summary: "Mes demandes de voiture, avec les propositions reçues" })
  mesDemandes(@UtilisateurCourant() u: Utilisateur) {
    return this.demandes.duPassager(u);
  }

  @Roles("voyageur")
  @Post("covoit/demandes")
  @HttpCode(201)
  @ApiOperation({
    summary: "Chercher une voiture : publier une demande",
    description:
      "Les conducteurs dont un trajet convient voient la demande et proposent leur trajet. Trois " +
      "demandes ouvertes au plus.",
  })
  demander(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.demandes.creer(u, corps(lireDemande, brut));
  }

  @Roles("voyageur")
  @Delete("covoit/demandes/:demandeId")
  @ApiOperation({ summary: "Retirer ma demande" })
  retirerDemande(@Param("demandeId") id: string, @UtilisateurCourant() u: Utilisateur) {
    return this.demandes.annuler(u, id);
  }

  /* ------------------------------------------------------------------ trajet régulier en ville */

  @Roles("voyageur")
  @Get("covoit/ville/trajet-regulier")
  @ApiOperation({
    summary: "Mon trajet régulier en ville (404 `TRAJET_REGULIER_INCONNU` s'il n'y en a pas)",
  })
  trajetRegulier(@UtilisateurCourant() u: Utilisateur) {
    return this.regulier.obtenir(u);
  }

  @Roles("voyageur")
  @Put("covoit/ville/trajet-regulier")
  @ApiOperation({ summary: "Activer ou couper mon trajet régulier" })
  @ApiBody({
    schema: { type: "object", required: ["actif"], properties: { actif: { type: "boolean" } } },
  })
  definirTrajetRegulier(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.regulier.definir(u, corps(lireDefinirTrajetRegulier, brut).actif);
  }

  @Roles("voyageur")
  @Post("covoit/ville/trajet-regulier")
  @HttpCode(201)
  @ApiOperation({
    summary: "Enregistrer mon trajet régulier (ville, départ, arrivée, heure)",
    description: "Remplace le trajet régulier existant ; il est actif à la création.",
  })
  creerTrajetRegulier(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.regulier.creer(u, corps(lireCreerTrajetRegulier, brut));
  }
}
