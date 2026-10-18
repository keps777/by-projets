import { Injectable } from "@nestjs/common";
import { Billets, Catalogue } from "../billetterie/ports";
import { SiegesService } from "../billetterie/sieges.service";
import { aammjjDouala, enMs, versIsoDouala } from "../billetterie/temps";
import { departResume } from "../billetterie/vues";
import { CaisseService } from "../caisse/caisse.service";
import { SessionsCaisse } from "../caisse/ports";
import { debutJourDoualaMs } from "../caisse/temps";
import { ColisRepository } from "../colis/ports";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { PosteGuichetService } from "./poste.service";

/** Un billet embarqué est « scanné » au quai. */
const ETATS_SCANNES = ["embarque", "voyage"];

/**
 * `GET /agence/guichet/accueil` (planche « Guichet », `SchemaGuichetAccueil`) : tout à une touche. Les compteurs
 * sont ceux de la session de caisse en cours ; sans caisse ouverte, ceux de la journée et une caisse à zéro.
 *
 * Règles provisoires, à confirmer avec les guichetiers (listées dans le README du module) :
 * - **Billets** : ceux que l'agent a vendus à son guichet depuis l'ouverture de sa caisse, sans les annulés.
 * - **Colis** : ceux qu'il a déposés (enregistrés) depuis l'ouverture de sa caisse ; « à charger » : ceux de ce
 *   nombre qui sont encore à l'état « enregistré ».
 * - **En caisse** : le cash attendu de la session (fond de caisse + billets et colis cash − annulations validées).
 *   **Écart** : compté − attendu, 0 tant que la caisse n'a pas été comptée.
 * - **Quai** : le départ dont l'embarquement est ouvert, sinon le prochain de la gare qui a un bus ; « scannés » :
 *   les voyageurs embarqués, « capacité » : les places du bus.
 * - **File de cadence** : les billets de cadence de ce guichet, aujourd'hui, encore sans nom (à compléter au quai).
 * - **Prochain départ** : le premier départ en vente, en embarquement ou retardé, parti depuis moins de 30 minutes.
 *   **Prochaine ouverture** : le premier départ « programmé » de la gare, qui ouvre ensuite à la vente.
 * - **SYNC** : le serveur ne connaît pas la file de l'appareil ; il répond « sync, 0 en attente » à l'instant de la
 *   réponse (l'application affiche son propre état de réseau, voir `etat-synchro.ts` côté web).
 */
@Injectable()
export class AccueilService {
  constructor(
    private readonly poste: PosteGuichetService,
    private readonly catalogue: Catalogue,
    private readonly billets: Billets,
    private readonly colis: ColisRepository,
    private readonly sessions: SessionsCaisse,
    private readonly caisse: CaisseService,
    private readonly personnes: PersonnesRepository,
    private readonly sieges: SiegesService,
  ) {}

  async lire(u: Utilisateur) {
    const { guichet, gare, compagnie } = await this.poste.de(u);
    const maintenant = this.poste.maintenant();
    const session = await this.sessions.ouverteDeAgent(u.id);
    const depuis = session?.ouverteA ?? versIsoDouala(debutJourDoualaMs(maintenant));

    const duGuichet = await this.billets.duGuichetEtJour(guichet.id, aammjjDouala(maintenant));
    const mesBillets = duGuichet.filter(
      (b) => b.auteurId === u.id && enMs(b.creeA) >= enMs(depuis) && b.etat !== "annule",
    );
    const mesColis = await this.colis.lister({
      gareOrigineId: gare.id,
      deposePar: u.id,
      deposeApres: depuis,
    });

    let enCaisse = 0;
    let ecart = 0;
    if (session) {
      const vue = await this.caisse.vue(session);
      enCaisse = vue.cashAttendu;
      ecart = session.comptage ? vue.ecart.montant : 0;
    }

    const agent = await this.personnes.trouverParId(u.id);
    const aVenir = await this.poste.departsAVenir(gare.id);
    const prochain = aVenir[0] ?? null;
    const programmes = await this.catalogue.departs({
      gareOrigineId: gare.id,
      etats: ["programme"],
      de: maintenant,
    });
    const ouverture = programmes.sort(
      (a, b) => enMs(a.depart.heureDepart) - enMs(b.depart.heureDepart),
    )[0];

    const duQuai =
      aVenir.find((c) => c.depart.etat === "embarquement" && c.bus !== null) ??
      aVenir.find((c) => c.bus !== null && c.depart.etat !== "retarde") ??
      null;
    let quai = null;
    if (duQuai?.bus) {
      const billetsDuQuai = await this.billets.duDepart(duQuai.depart.id);
      quai = {
        departId: duQuai.depart.id,
        heureDepart: duQuai.depart.heureDepart,
        destination: duQuai.destination.ville,
        scannes: billetsDuQuai.filter((b) => ETATS_SCANNES.includes(b.etat)).length,
        capacite: duQuai.bus.capacite,
      };
    }

    return {
      agence: { compagnie: compagnie.nom, gare: gare.nom },
      guichet: {
        id: guichet.id,
        rang: guichet.rang,
        agent: { id: u.id, nom: agent?.nom || "Inconnu" },
        caisseOuverteA: session?.ouverteA ?? null,
      },
      synchro: { etat: "sync" as const, derniereSyncA: maintenant, evenementsEnAttente: 0 },
      compteurs: {
        billets: mesBillets.length,
        colis: mesColis.length,
        colisACharger: mesColis.filter((c) => c.etat === "enregistre").length,
        enCaisse,
        ecart,
      },
      quai,
      cadence: {
        fileAttente: duGuichet.filter((b) => b.etat === "paye" && b.aCompleterAuQuai).length,
      },
      prochainDepart: prochain
        ? {
            ...departResume(prochain, await this.sieges.placesLibres(prochain)),
            dansMinutes: Math.max(
              0,
              Math.ceil((enMs(prochain.depart.heureDepart) - enMs(maintenant)) / 60_000),
            ),
          }
        : null,
      prochaineOuverture: ouverture
        ? {
            departId: ouverture.depart.id,
            heureDepart: ouverture.depart.heureDepart,
            destination: ouverture.destination.ville,
          }
        : null,
    };
  }
}
