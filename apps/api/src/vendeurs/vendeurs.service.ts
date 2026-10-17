import { Injectable } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { ajouterJours, enMs, versIsoDouala } from "../relais/temps";
import {
  DETAIL_PAIEMENT,
  LIBELLE_COMMISSION_DEFAUT,
  REGLE_VENDEUR,
  TITRE_CLIENTS,
} from "./contenu";
import { aucunAgrement, vendeurIntrouvable, vendeurSuspendu } from "./erreurs";
import type { Agrement, Vendeur } from "./modele";
import {
  AgrementsRepository,
  CommissionsVendeurs,
  OffreBillets,
  VendeursRepository,
  VentesRepository,
  type DepartOffert,
} from "./ports";
import {
  CLIENTS_AFFICHES,
  COMMISSION_CLASSIQUE_DEFAUT,
  FENETRE_CLIENTS_MOIS,
  LIBELLE_VERSEMENT,
  commissionPour,
  debutDeMois,
  debutDuJourDouala,
  debutDuMoisSuivant,
  departHabituel,
  estClientRegulier,
  habitudeDe,
  jourDouala,
  jourDuVoyage,
  libelleHabitude,
  libelleProposition,
  masquerTelephone,
  normaliser,
  regrouperClients,
} from "./regles";
import type { ParamsDeparts } from "./validation";

/** Ce que le vendeur connecté voit de son compte : sa fiche et les agences qui l'ont agréé. */
export interface MoiVendeur {
  vendeur: Vendeur;
  agrements: Agrement[];
}

/**
 * Le côté « lecture » de l'écran du vendeur : son espace (bilan du mois), les départs qu'il peut
 * vendre demain et ses clients à qui revendre en une touche. Les routes sont celles de
 * `@afrimove/api-client` (`vendeur.espace`, `vendeur.departs`, `vendeur.clients`).
 */
@Injectable()
export class VendeursService {
  constructor(
    readonly vendeurs: VendeursRepository,
    readonly agrements: AgrementsRepository,
    private readonly ventes: VentesRepository,
    private readonly commissions: CommissionsVendeurs,
    private readonly offre: OffreBillets,
    private readonly horloge: Horloge,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /** La fiche du compte connecté et ses agréments en vigueur. 404 sans fiche, 403 si suspendu. */
  async moi(utilisateur: Pick<Utilisateur, "id">): Promise<MoiVendeur> {
    const vendeur = await this.vendeurs.trouver(utilisateur.id);
    if (!vendeur) throw vendeurIntrouvable();
    if (!vendeur.actif) throw vendeurSuspendu();
    const agrements = (await this.agrements.deVendeur(vendeur.id)).filter(
      (a) => a.etat === "actif",
    );
    return { vendeur, agrements };
  }

  /** `SchemaEspaceVendeur` : le vendeur, son bilan du mois et la règle d'or. */
  async espace(utilisateur: Utilisateur) {
    const { vendeur, agrements } = await this.moi(utilisateur);
    const maintenant = this.maintenant();
    const debut = debutDeMois(maintenant);
    const fin = debutDuMoisSuivant(maintenant);
    const [duMois, credits, clients] = await Promise.all([
      this.ventes.duVendeur(vendeur.id, { etats: ["terminee"], depuis: debut, avant: fin }),
      this.commissions.credits(vendeur.id, debut, fin),
      this.clientsDuVendeur(vendeur.id, maintenant),
    ]);
    return {
      vendeur: {
        id: vendeur.id,
        nom: vendeur.nom,
        numero: vendeur.numero,
        quartier: vendeur.quartier,
        compagnies: agrements.map((a) => a.compagnieNom),
      },
      commissionParDefaut: COMMISSION_CLASSIQUE_DEFAUT,
      bilan: {
        billetsDuMois: duMois.length,
        gainDuMois: credits.reduce((somme, c) => somme + c.montant, 0),
        versement: LIBELLE_VERSEMENT,
        clients: clients.length,
        clientsReguliers: clients.filter(estClientRegulier).length,
      },
      regle: REGLE_VENDEUR,
    };
  }

  private async clientsDuVendeur(vendeurId: string, maintenant: string) {
    const fenetre = versIsoDouala(enMs(maintenant) - FENETRE_CLIENTS_MOIS * 30 * 24 * 3_600_000);
    return regrouperClients(
      await this.ventes.duVendeur(vendeurId, { etats: ["terminee"], depuis: fenetre }),
    );
  }

  /* -------------------------------------------------------------- départs à vendre */

  /**
   * `SchemaDepartsVendeur` : les départs des agences qui ont agréé le vendeur, un jour donné (demain
   * par défaut), du plus tôt au plus tard, avec les places libres, le prix et la commission. Sans
   * trajet demandé : de sa ville vers la destination qu'il vend le plus, sinon vers la plus desservie.
   */
  async departs(utilisateur: Utilisateur, params: ParamsDeparts) {
    const { vendeur, agrements } = await this.moi(utilisateur);
    if (agrements.length === 0) throw aucunAgrement();
    const maintenant = this.maintenant();
    const jour = params.jour ?? jourDouala(ajouterJours(maintenant, 1));
    const debutDuJour = debutDuJourDouala(jour);
    // Aujourd'hui : seulement ce qui n'est pas encore parti.
    const de = enMs(debutDuJour) < enMs(maintenant) ? maintenant : debutDuJour;
    const origine = params.origine ?? vendeur.ville;

    let departs = await this.offre.departs({
      compagnieIds: agrements.map((a) => a.compagnieId),
      de,
      avant: ajouterJours(debutDuJour, 1),
      origine,
      ...(params.destination !== undefined ? { destination: params.destination } : {}),
    });
    let destination = params.destination;
    if (destination === undefined && departs.length > 0) {
      destination = await this.destinationHabituelle(vendeur.id, departs);
      const retenue = normaliser(destination);
      departs = departs.filter((d) => normaliser(d.destination.ville) === retenue);
    }

    const parCompagnie = new Map(agrements.map((a) => [a.compagnieId, a]));
    const premier = departs[0];
    return {
      trajet: premier
        ? `${premier.origine.ville} → ${premier.destination.ville}`
        : destination !== undefined
          ? `${origine} → ${destination}`
          : origine,
      jour,
      commissionLibelle: LIBELLE_COMMISSION_DEFAUT,
      departs: departs.map((d) => ({
        departId: d.departId,
        compagnie: d.compagnieNom,
        classe: d.classe,
        heureDepart: d.heureDepart,
        placesLibres: d.placesLibres,
        prix: d.prix,
        commission: commissionPour(d.classe, parCompagnie.get(d.compagnieId) as Agrement),
      })),
      detailPaiement: DETAIL_PAIEMENT,
    };
  }

  /**
   * La destination que le vendeur vend le plus depuis cette ville ; sans historique, la plus
   * desservie ce jour-là (la ligne principale), puis la première par l'heure.
   */
  private async destinationHabituelle(
    vendeurId: string,
    departs: readonly DepartOffert[],
  ): Promise<string> {
    const origines = new Set(departs.map((d) => d.origine.code));
    const nomDe = new Map<string, string>();
    const desservies = new Map<string, number>();
    for (const d of departs) {
      const cle = normaliser(d.destination.ville);
      if (!nomDe.has(cle)) nomDe.set(cle, d.destination.ville);
      desservies.set(cle, (desservies.get(cle) ?? 0) + 1);
    }
    const vendues = new Map<string, number>();
    for (const v of await this.ventes.duVendeur(vendeurId, { etats: ["terminee"] })) {
      if (!origines.has(v.origine.code)) continue;
      const cle = normaliser(v.destination.ville);
      if (desservies.has(cle)) vendues.set(cle, (vendues.get(cle) ?? 0) + 1);
    }
    const meilleure = (comptes: Map<string, number>): string | null => {
      let retenue: string | null = null;
      let max = 0;
      // Égalité : la destination qui part en premier (les départs sont triés par l'heure).
      for (const d of departs) {
        const cle = normaliser(d.destination.ville);
        const n = comptes.get(cle) ?? 0;
        if (n > max) {
          retenue = cle;
          max = n;
        }
      }
      return retenue;
    };
    const cle = meilleure(vendues) ?? meilleure(desservies);
    return nomDe.get(cle as string) as string;
  }

  /* -------------------------------------------------------------- clients */

  /**
   * `SchemaClientsVendeur` : les voisins à qui le vendeur a déjà vendu, les plus récents d'abord.
   * Un client qui voyage à jour fixe (3 voyages au moins, deux tiers le même jour) reçoit une
   * proposition de revente en une touche (« vendredi 08:30 ») s'il existe un départ à ce jour et à
   * cette heure dans la semaine à venir, sur le même trajet, avec des places. Sans proposition, la
   * date de son dernier voyage.
   */
  async clients(utilisateur: Utilisateur) {
    const { vendeur, agrements } = await this.moi(utilisateur);
    const maintenant = this.maintenant();
    const clients = (await this.clientsDuVendeur(vendeur.id, maintenant)).slice(
      0,
      CLIENTS_AFFICHES,
    );
    const prochains =
      agrements.length === 0
        ? []
        : await this.offre.departs({
            compagnieIds: agrements.map((a) => a.compagnieId),
            de: maintenant,
            avant: ajouterJours(maintenant, 8),
          });
    return {
      titre: TITRE_CLIENTS,
      clients: clients.map((c) => {
        const habitude = habitudeDe(c.ventes.map((v) => v.departA));
        const proposable = habitude
          ? departHabituel(
              habitude,
              prochains.filter(
                (d) =>
                  d.placesLibres > 0 &&
                  d.origine.code === c.derniere.origine.code &&
                  d.destination.code === c.derniere.destination.code,
              ),
              maintenant,
            )
          : null;
        return {
          nom: c.nom,
          destination: c.derniere.destination.ville,
          habitude: habitude ? libelleHabitude(habitude) : null,
          telephoneMasque: masquerTelephone(c.telephone),
          proposition: habitude && proposable ? libelleProposition(habitude) : null,
          dernierVoyage: proposable ? null : jourDuVoyage(c.derniere.departA),
        };
      }),
    };
  }
}
