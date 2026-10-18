import { Injectable, Logger } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { DepartsService } from "../billetterie/departs.service";
import { Refus, conflit, invalide } from "../billetterie/erreurs";
import type { Billet, DepartComplet } from "../billetterie/modeles";
import { Passagers } from "../billetterie/passagers";
import { Billets, Catalogue, ColisDuDepart } from "../billetterie/ports";
import { MS_PAR_JOUR, ajouterMinutes, enMs, jourDouala, versIsoDouala } from "../billetterie/temps";
import { EtatsSuivi } from "../gps/ports";
import { DepartsBord, EvenementsBord, exigerUuid } from "./commun.service";
import { partiA } from "./convoyeur.service";
import type { DepenseBord } from "./modeles";
import { DepensesBord, IncidentsBord, MessagesBord, PassagesRoute, RetardsDepart } from "./ports";
import {
  ETATS_DEPART_ANNONCE,
  ETATS_DEPART_DEPENSE,
  JOUR_DE_PAIE,
  LIBELLE_INCIDENT,
  LIMITE_VITESSE_KMH,
  RETARD_PAR_DEFAUT_MINUTES,
  SIGNAL_GPS_PERDU_SECONDES,
  arretNomme,
  arretsTries,
  debutDeSemaine,
  descriptionIncident,
  estBilletAbord,
  heureDePassage,
  kmDeLaLigne,
  prochainArret,
} from "./regles";
import type {
  EvenementArrivee,
  EvenementDepense,
  EvenementIncident,
  EvenementRetard,
} from "./schemas";

const MS_PAR_SECONDE = 1000;

const ligneDepense = (d: DepenseBord) => ({
  depenseId: d.id,
  categorie: d.categorie,
  libelle: d.libelle,
  montant: d.montant,
  justificatif: d.justificatifRef !== null,
});

/**
 * Le chauffeur : sa feuille de route (trajet, dépenses, incidents, semaine) et ses quatre gestes en route :
 * ajouter une dépense avec son justificatif, signaler un incident, annoncer un retard, noter l'arrivée à un
 * arrêt. Les dépenses, incidents et retards s'écrivent là où les lit l'analyse des départs (lot C).
 */
@Injectable()
export class ChauffeurService {
  private readonly journal = new Logger("ChauffeurService");

  constructor(
    private readonly evenements: EvenementsBord,
    private readonly departs: DepartsBord,
    private readonly departsService: DepartsService,
    private readonly catalogue: Catalogue,
    private readonly billets: Billets,
    private readonly colis: ColisDuDepart,
    private readonly suivi: EtatsSuivi,
    private readonly depenses: DepensesBord,
    private readonly incidents: IncidentsBord,
    private readonly retards: RetardsDepart,
    private readonly passages: PassagesRoute,
    private readonly messages: MessagesBord,
    private readonly passagers: Passagers,
    private readonly horloge: Horloge,
  ) {}

  /* -------------------------------------------------------------- lecture */

  /** `GET /agence/bus/chauffeur` : la feuille de route du chauffeur (planche « Chauffeur »). */
  async feuille(u: Utilisateur, departId: string | undefined) {
    const dc = await this.departs.deLEquipage(u, "chauffeur", departId);
    if (!dc.bus || !dc.depart.chauffeur) {
      throw conflit("EQUIPAGE_INCOMPLET", "Le bus ou le chauffeur de ce départ n'est pas affecté");
    }
    const maintenant = this.horloge.maintenant().getTime();
    const [billets, passages, colis, lignes, etat, retard, semaine] = await Promise.all([
      this.billets.duDepart(dc.depart.id),
      this.passages.duDepart(dc.depart.id),
      this.colis.etat(dc.depart.id),
      this.depenses.duDepart(dc.depart.id),
      this.suivi.lire(dc.depart.id),
      this.retards.lire(dc.depart.id),
      this.semaine(u, dc, maintenant),
    ]);
    const position = etat?.derniere ?? null;
    const enDirect =
      position !== null &&
      maintenant - enMs(position.instant) <= SIGNAL_GPS_PERDU_SECONDES * MS_PAR_SECONDE;
    const prochain = prochainArret(dc, passages);
    return {
      chauffeur: { id: dc.depart.chauffeur.id, nom: dc.depart.chauffeur.nom },
      bus: { id: dc.bus.id, immatriculation: dc.bus.immatriculation },
      jour: jourDouala(dc.depart.heureDepart),
      gps: enDirect,
      trajet: {
        departId: dc.depart.id,
        origine: dc.origine.ville,
        destination: dc.destination.ville,
        partiA: partiA(dc),
        aBord: billets.filter(estBilletAbord).length,
        colis: colis.charges,
        prochainArret: {
          nom: prochain.nom,
          heure: heureDePassage(dc, prochain, retard?.minutes ?? 0),
        },
        vitesseKmh: enDirect && position ? Math.max(0, Math.round(position.vitesseKmh)) : 0,
        limiteKmh: LIMITE_VITESSE_KMH,
      },
      depenses: {
        lignes: lignes.map(ligneDepense),
        total: lignes.reduce((s, d) => s + d.montant, 0),
        categories: ["carburant", "peage", "autre"] as ("carburant" | "peage" | "autre")[],
      },
      incidents: { retardParDefautMinutes: RETARD_PAR_DEFAUT_MINUTES },
      semaine,
    };
  }

  /** La semaine du chauffeur : trajets faits, kilomètres, jour de la paie. */
  private async semaine(u: Utilisateur, dc: DepartComplet, maintenant: number) {
    const debut = debutDeSemaine(maintenant);
    const faits = (
      await this.catalogue.departs({
        compagnieId: dc.compagnie.id,
        etats: ["parti", "arrive"],
        de: versIsoDouala(debut),
        avant: versIsoDouala(debut + 7 * MS_PAR_JOUR),
      })
    ).filter((c) => c.depart.chauffeur?.id === u.id);
    return {
      trajets: faits.length,
      km: faits.reduce((s, c) => s + Math.round(kmDeLaLigne(c)), 0),
      // Provisoire : le serveur ne mesure pas encore la vitesse par trajet et ne calcule pas la paie.
      excesVitesse: 0,
      aRecevoir: 0,
      paieLe: JOUR_DE_PAIE,
    };
  }

  /* -------------------------------------------------------------- dépense */

  /** `chauffeur.depense` : une dépense du trajet avec son justificatif, remboursée au rapport. */
  depense(u: Utilisateur, evt: EvenementDepense) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      exigerUuid(d.depenseId, "depenseId");
      const dc = await this.departs.deLAgence(u, d.departId);
      this.departs.exigerEquipage(dc, "chauffeur", u);
      this.departs.exigerEtat(dc, ETATS_DEPART_DEPENSE, "Ce départ n'accepte plus de dépense");
      const ligne: DepenseBord = {
        id: d.depenseId,
        departId: dc.depart.id,
        categorie: d.categorie,
        libelle: d.libelle,
        montant: d.montant,
        justificatifRef: d.justificatifRef,
        auteurId: u.id,
        saisieA: evt.at,
      };
      if (!(await this.depenses.ajouter(ligne))) {
        // Cet identifiant existe : c'est la même dépense (événement rejoué) ou un conflit.
        const existante = (await this.depenses.duDepart(dc.depart.id)).find(
          (x) => x.id === ligne.id,
        );
        if (
          !existante ||
          existante.montant !== ligne.montant ||
          existante.categorie !== ligne.categorie
        ) {
          throw conflit("DEPENSE_EXISTANTE", "Cette dépense existe déjà avec un autre contenu");
        }
      }
      const lignes = await this.depenses.duDepart(dc.depart.id);
      return {
        depense: ligneDepense(ligne),
        totalDepenses: lignes.reduce((s, x) => s + x.montant, 0),
      };
    });
  }

  /* -------------------------------------------------------------- incident et retard */

  /** Les voyageurs à bord qu'un SMS peut joindre : un message par numéro. */
  private async voyageursJoignables(billets: readonly Billet[]) {
    const vus = new Set<string>();
    const sortie: { billetId: string; telephone: string }[] = [];
    for (const b of billets.filter(estBilletAbord)) {
      const telephone = this.passagers.dechiffrer(b.passagerChiffre).telephone;
      if (telephone && !vus.has(telephone)) {
        vus.add(telephone);
        sortie.push({ billetId: b.id, telephone });
      }
    }
    return sortie;
  }

  /** `chauffeur.incident` : en une touche, la gare et les voyageurs à bord sont prévenus. */
  incident(u: Utilisateur, evt: EvenementIncident) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      exigerUuid(d.incidentId, "incidentId");
      const dc = await this.departs.deLAgence(u, d.departId);
      this.departs.exigerEquipage(dc, "chauffeur", u);
      this.departs.exigerEtat(dc, ETATS_DEPART_ANNONCE, "Ce départ est terminé ou annulé");
      const ecrit = await this.incidents.ajouter({
        id: d.incidentId,
        departId: dc.depart.id,
        nature: d.nature,
        description: descriptionIncident(d.nature, d.note),
        note: d.note,
        position: d.gps,
        auteurId: u.id,
        signaleA: evt.at,
      });
      if (!ecrit) {
        const existant = (await this.incidents.duDepart(dc.depart.id)).find(
          (i) => i.id === d.incidentId,
        );
        if (!existant) throw conflit("INCIDENT_EXISTANT", "Cet incident existe déjà");
      }
      const voyageurs = await this.voyageursJoignables(await this.billets.duDepart(dc.depart.id));
      const prevenus = await this.messages.prevenirIncident({
        evenementId: evt.id,
        compagnieId: dc.compagnie.id,
        gareId: dc.origine.id,
        compagnie: dc.compagnie.nom,
        origine: dc.origine.ville,
        destination: dc.destination.ville,
        departA: dc.depart.heureDepart,
        immatriculation: dc.bus?.immatriculation ?? "",
        libelleNature: LIBELLE_INCIDENT[d.nature],
        voyageurs,
      });
      return { voyageursPrevenus: prevenus.voyageurs, garePrevenue: prevenus.gare };
    });
  }

  /** `chauffeur.retard` : un SMS automatique part à tous les voyageurs à bord. */
  retard(u: Utilisateur, evt: EvenementRetard) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      const dc = await this.departs.deLAgence(u, d.departId);
      this.departs.exigerEquipage(dc, "chauffeur", u);
      this.departs.exigerEtat(dc, ETATS_DEPART_ANNONCE, "Ce départ est terminé ou annulé");
      await this.retards.noter(dc.depart.id, d.minutes, evt.at);
      const voyageurs = await this.voyageursJoignables(await this.billets.duDepart(dc.depart.id));
      const prevenus = await this.messages.prevenirRetard({
        evenementId: evt.id,
        compagnieId: dc.compagnie.id,
        gareId: dc.origine.id,
        compagnie: dc.compagnie.nom,
        immatriculation: dc.bus?.immatriculation ?? "",
        origine: dc.origine.ville,
        destination: dc.destination.ville,
        departA: dc.depart.heureDepart,
        arriveeEstimeeA: ajouterMinutes(dc.depart.heureDepart, dc.ligne.dureeMinutes + d.minutes),
        minutes: d.minutes,
        voyageurs,
      });
      return { voyageursPrevenus: prevenus.voyageurs, garePrevenue: prevenus.gare };
    });
  }

  /* -------------------------------------------------------------- arrivée à un arrêt */

  /**
   * `chauffeur.arrivee_arret` : le bus est arrivé à un arrêt, les portes s'ouvrent, le convoyeur scanne.
   * L'arrivée à la destination fait passer le départ à « arrivé ».
   */
  arrivee(u: Utilisateur, evt: EvenementArrivee) {
    return this.evenements.executer(u, evt, async () => {
      const d = evt.donnees;
      const dc = await this.departs.deLAgence(u, d.departId);
      this.departs.exigerEquipage(dc, "chauffeur", u);
      this.departs.exigerEtat(dc, ["parti"], "Ce bus n'est pas en route");
      const arret = arretNomme(dc, d.arret);
      if (!arret || arret.ordre === 0) {
        throw invalide(
          "ARRET_INCONNU",
          "Cet arrêt n'est pas sur la ligne de ce départ, après le départ",
        );
      }
      await this.passages.ajouter({
        id: evt.id,
        genre: "arrivee",
        departId: dc.depart.id,
        auteurId: u.id,
        arret: arret.nom,
        billetId: null,
        resultat: null,
        position: d.gps,
        at: evt.at,
      });
      const derniere = arretsTries(dc).at(-1);
      if (derniere && arret.id === derniere.id) {
        try {
          await this.departsService.appliquer(dc, u.id, { action: "arriver" });
        } catch (e) {
          // Le départ a changé d'état entre-temps : l'arrivée est notée, le reste n'est pas bloquant.
          if (!(e instanceof Refus)) throw e;
          this.journal.warn(`Départ ${dc.depart.id} non passé à « arrivé » (${e.code})`);
        }
      }
      return {};
    });
  }
}
