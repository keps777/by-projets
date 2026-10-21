import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { conflit, inconnu, invalide } from "../billetterie/erreurs";
import { hhmmDouala, jourDouala, versIsoDouala } from "../billetterie/temps";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { CONFIG_COVOITURAGE, type ConfigCovoiturage } from "./config";
import type { DemandeCovoit, MomentJournee, StatutDemande, Trajet } from "./modeles";
import {
  AnnuaireCovoiturage,
  Demandes,
  NotifieurCovoiturage,
  ReferentielCovoiturage,
  Reservations,
  Trajets,
} from "./ports";
import {
  TEXTES,
  ajouterJours,
  normaliser,
  prenomDe,
  quandDemande,
  quandTexte,
  trajetRepondALaDemande,
} from "./regles";
import { ReputationService } from "./reputation.service";
import { ProfilsService } from "./profils.service";

export interface CreationDemande {
  depart: string;
  arrivee: string;
  jour: string;
  moment?: MomentJournee | undefined;
  places: number;
}

/** Au plus ce nombre de demandes ouvertes par passager : une demande n'est pas une annonce. */
const DEMANDES_OUVERTES_MAX = 3;

export interface DemandePassagerVue {
  id: string;
  passager: string;
  note?: number;
  depart: string;
  arrivee: string;
  quand: string;
  places: number;
  trajetPropose: string;
  heurePropose: string;
}

export interface MaDemandeVue {
  id: string;
  depart: string;
  arrivee: string;
  jour: string;
  moment: MomentJournee | null;
  quand: string;
  places: number;
  statut: StatutDemande;
  propositions: {
    trajetId: string;
    conducteur: string;
    departA: string;
    prixParPlace: number;
    placesLibres: number;
  }[];
}

/**
 * Demandes de passagers : un voyageur qui ne trouve pas de voiture dit où et quand il veut aller ; les
 * conducteurs dont un trajet publié convient voient la demande et proposent ce trajet en un geste
 * (SMS au passager, qui réserve ensuite comme pour n'importe quelle offre).
 */
@Injectable()
export class DemandesService {
  constructor(
    private readonly demandes: Demandes,
    private readonly trajets: Trajets,
    private readonly reservations: Reservations,
    private readonly referentiel: ReferentielCovoiturage,
    private readonly annuaire: AnnuaireCovoiturage,
    private readonly notifieur: NotifieurCovoiturage,
    private readonly reputation: ReputationService,
    private readonly profils: ProfilsService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_COVOITURAGE) private readonly config: ConfigCovoiturage,
  ) {}

  private async placesLibres(t: Trajet): Promise<number> {
    return Math.max(
      0,
      t.places - (await this.reservations.placesPrises(t.id, this.horloge.maintenant())),
    );
  }

  /* ------------------------------------------------------------------ côté passager */

  async creer(passager: Utilisateur, d: CreationDemande): Promise<MaDemandeVue> {
    const maintenant = this.horloge.maintenant();
    const aujourdhui = jourDouala(maintenant);
    if (d.jour < aujourdhui) throw invalide("JOUR_PASSE", "Ce jour est passé");
    if (d.jour > ajouterJours(aujourdhui, this.config.horizonJours)) {
      throw invalide(
        "JOUR_TROP_LOIN",
        `On cherche au plus ${this.config.horizonJours} jours à l'avance`,
      );
    }
    const departVille = (await this.referentiel.ville(d.depart)) ?? d.depart.trim();
    const arriveeVille = (await this.referentiel.ville(d.arrivee)) ?? d.arrivee.trim();
    if (normaliser(departVille) === normaliser(arriveeVille)) {
      throw invalide(
        "VILLES_IDENTIQUES",
        "Le départ et l'arrivée doivent être deux villes différentes",
      );
    }
    const ouvertes = (await this.demandes.duPassager(passager.id)).filter(
      (x) => x.statut === "ouverte",
    );
    if (ouvertes.length >= DEMANDES_OUVERTES_MAX) {
      throw conflit(
        "TROP_DE_DEMANDES",
        `Tu as déjà ${DEMANDES_OUVERTES_MAX} demandes ouvertes : annule-en une avant d'en faire une autre`,
      );
    }
    const demande: DemandeCovoit = {
      id: randomUUID(),
      passagerId: passager.id,
      departVille,
      arriveeVille,
      jour: d.jour,
      moment: d.moment ?? null,
      places: d.places,
      statut: "ouverte",
      creeA: maintenant,
    };
    await this.demandes.creer(demande);
    return this.vuePassager(demande);
  }

  async annuler(passager: Utilisateur, id: string): Promise<MaDemandeVue> {
    const d = await this.demandes.trouver(id);
    if (!d || d.passagerId !== passager.id)
      throw inconnu("DEMANDE_INCONNUE", "Demande introuvable");
    if (d.statut === "annulee") return this.vuePassager(d);
    const apres = await this.demandes.transitionner(id, ["ouverte"], { statut: "annulee" });
    if (!apres) throw conflit("DEMANDE_CLOSE", "Cette demande est déjà close");
    return this.vuePassager(apres);
  }

  async duPassager(passager: Utilisateur): Promise<MaDemandeVue[]> {
    const toutes = await this.demandes.duPassager(passager.id);
    return Promise.all(
      toutes.filter((d) => d.statut !== "annulee").map((d) => this.vuePassager(d)),
    );
  }

  private async vuePassager(d: DemandeCovoit): Promise<MaDemandeVue> {
    const propositions = await this.demandes.propositionsDeLaDemande(d.id);
    const vues: MaDemandeVue["propositions"] = [];
    for (const p of propositions) {
      const t = await this.trajets.trouver(p.trajetId);
      if (!t || t.statut !== "publie") continue;
      const { vue } = await this.profils.conducteur(t.conducteurId);
      vues.push({
        trajetId: t.id,
        conducteur: vue.nom,
        departA: versIsoDouala(t.departA),
        prixParPlace: t.prixParPlace,
        placesLibres: await this.placesLibres(t),
      });
    }
    return {
      id: d.id,
      depart: d.departVille,
      arrivee: d.arriveeVille,
      jour: d.jour,
      moment: d.moment,
      quand: quandDemande(d),
      places: d.places,
      statut: d.statut,
      propositions: vues,
    };
  }

  /** Le passager a réservé un trajet qu'on lui avait proposé : sa demande est satisfaite. */
  async satisfaire(passagerId: string, trajetId: string): Promise<void> {
    for (const d of await this.demandes.duPassager(passagerId)) {
      if (d.statut !== "ouverte") continue;
      const propositions = await this.demandes.propositionsDeLaDemande(d.id);
      if (propositions.some((p) => p.trajetId === trajetId)) {
        await this.demandes.transitionner(d.id, ["ouverte"], { statut: "satisfaite" });
      }
    }
  }

  /* ------------------------------------------------------------------ côté conducteur */

  /**
   * Les demandes auxquelles un trajet publié du conducteur répond, avec le trajet à proposer. Une
   * demande à laquelle il a déjà répondu, ou qui est la sienne, n'est pas montrée.
   */
  async pourConducteur(conducteurId: string): Promise<DemandePassagerVue[]> {
    const maintenant = this.horloge.maintenant();
    const aujourdhui = jourDouala(maintenant);
    const [ouvertes, mesTrajets, dejaProposees] = await Promise.all([
      this.demandes.ouvertes({
        du: aujourdhui,
        au: ajouterJours(aujourdhui, this.config.horizonJours),
        limite: 200,
      }),
      this.trajets.duConducteur(conducteurId, { statuts: ["publie"], depuis: maintenant }),
      this.demandes.propositionsDuConducteur(conducteurId),
    ]);
    const traitees = new Set(dejaProposees.map((p) => p.demandeId));
    const libres = new Map<string, number>();
    for (const t of mesTrajets) libres.set(t.id, await this.placesLibres(t));

    const sortie: DemandePassagerVue[] = [];
    for (const d of ouvertes) {
      if (d.passagerId === conducteurId || traitees.has(d.id)) continue;
      const trajet = mesTrajets.find((t) => trajetRepondALaDemande(t, libres.get(t.id) ?? 0, d));
      if (!trajet) continue;
      const note = await this.reputation.notePassager(d.passagerId);
      sortie.push({
        id: d.id,
        passager: await this.profils.nomAbrege(d.passagerId),
        ...(note !== null ? { note } : {}),
        depart: d.departVille,
        arrivee: d.arriveeVille,
        quand: quandDemande(d),
        places: d.places,
        trajetPropose: trajet.id,
        heurePropose: hhmmDouala(trajet.departA),
      });
    }
    return sortie;
  }

  /** Propose un trajet à une demande. Rejouer la même proposition n'envoie pas un second SMS. */
  async proposer(
    conducteur: Utilisateur,
    demandeId: string,
    trajetId: string,
  ): Promise<{ demandeId: string; trajetId: string; envoyee: boolean }> {
    const demande = await this.demandes.trouver(demandeId);
    if (!demande || demande.statut !== "ouverte" || demande.passagerId === conducteur.id) {
      throw inconnu("DEMANDE_INCONNUE", "Demande introuvable");
    }
    const trajet = await this.trajets.trouver(trajetId);
    if (!trajet || trajet.conducteurId !== conducteur.id) {
      throw inconnu("TRAJET_INCONNU", "Trajet introuvable");
    }
    if (!trajetRepondALaDemande(trajet, await this.placesLibres(trajet), demande)) {
      throw conflit("TRAJET_INCOMPATIBLE", "Ce trajet ne correspond pas à la demande");
    }
    const nouvelle = await this.demandes.ajouterProposition({
      demandeId,
      conducteurId: conducteur.id,
      trajetId,
      envoyeeA: this.horloge.maintenant(),
    });
    if (nouvelle) {
      const identite = await this.annuaire.identite(conducteur.id);
      await this.notifieur.notifier({
        personneId: demande.passagerId,
        texte: TEXTES.sms.proposition(
          prenomDe(identite?.nom ?? ""),
          `${trajet.departVille} - ${trajet.arriveeVille}`,
          quandTexte(trajet.departA),
          trajet.prixParPlace,
        ),
        cle: `covoiturage:proposition:${demandeId}:${trajetId}`,
        reference: { type: "demande", id: demandeId },
      });
    }
    return { demandeId, trajetId, envoyee: true };
  }

  /** Clôt les demandes dont le jour est passé. */
  async expirer(limite = 200): Promise<number> {
    const aExpirer = await this.demandes.aExpirer(jourDouala(this.horloge.maintenant()), limite);
    let n = 0;
    for (const d of aExpirer) {
      if (await this.demandes.transitionner(d.id, ["ouverte"], { statut: "expiree" })) n += 1;
    }
    return n;
  }
}
