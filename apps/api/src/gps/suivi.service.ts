import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { conflit, inconnu, interdit } from "./erreurs";
import type {
  AlerteArret,
  BilletSuivi,
  EtatSuivi,
  MessageBusInterne,
  PrevenirProche,
  TrajetBus,
} from "./modeles";
import {
  AlertesArret,
  AvisSuivi,
  BilletsSuivis,
  DiffusionGps,
  EtatsSuivi,
  Positions,
  PrevenirProches,
  ProchesASuivre,
  ReseauTransport,
  canalBus,
  canalControle,
  sujetBus,
} from "./ports";
import {
  REGLES_GPS,
  doitPrevenir,
  estimer,
  etatInitial,
  faireAvancer,
  nouvelleAlerte,
  trierLot,
  type Echantillon,
  type EntreePosition,
  type Estimation,
  type MotifRejet,
} from "./regles";
import { versIsoDouala } from "./temps";
import {
  aTraiterVue,
  busEnRouteVue,
  messageBus,
  messagePositionBus,
  prevenirVue,
  suiviBusVue,
} from "./vues";

export interface ResultatPositions {
  /** Positions nouvelles, gardées. */
  acceptees: number;
  /** Positions déjà reçues (lot renvoyé). */
  doublons: number;
  /** Positions refusées une à une ; les autres du lot sont gardées. */
  rejetees: { rang: number; motif: MotifRejet }[];
  serveurA: string;
}

type Effet = { type: "ouvrir"; alerte: AlerteArret } | { type: "fermer"; id: string };

const ESSAIS_MAX = 6;

/**
 * Suivi des bus : réception des positions du chauffeur et du convoyeur (toutes les 30 s), état du
 * trajet (avancée sur la ligne, passages, immobilité), alerte d'arrêt anormal, arrivée estimée,
 * SMS au proche. Les lectures (écran « Mon bus en direct », canal temps réel) s'appuient sur le
 * même état.
 */
@Injectable()
export class SuiviBusService {
  private readonly journal = new Logger("SuiviBusService");

  constructor(
    private readonly reseau: ReseauTransport,
    private readonly billets: BilletsSuivis,
    private readonly proches: ProchesASuivre,
    private readonly positions: Positions,
    private readonly etats: EtatsSuivi,
    private readonly alertes: AlertesArret,
    private readonly prevenirs: PrevenirProches,
    private readonly avis: AvisSuivi,
    private readonly diffusion: DiffusionGps,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ réception */

  /**
   * Reçoit un lot de positions d'un appareil de l'équipage. Rejouer un lot ne change rien : une
   * position est identifiée par (appareil, instant) et l'état n'avance que vers l'avant.
   */
  async enregistrerPositions(
    u: Utilisateur,
    departId: string,
    entrees: readonly EntreePosition[],
  ): Promise<ResultatPositions> {
    const t = await this.trajetDeLEquipage(u, departId);
    const maintenant = this.horloge.maintenant();
    const maintenantMs = maintenant.getTime();
    if (t.etat !== "embarquement" && t.etat !== "parti") {
      throw conflit("DEPART_NON_EN_ROUTE", "Ce départ n'est ni à l'embarquement ni en route", {
        etat: t.etat,
      });
    }

    const { retenues, rejetees } = trierLot(entrees, maintenantMs);

    let acceptees = 0;
    let doublons = 0;
    const echantillons: Echantillon[] = [];
    for (const e of retenues) {
      const nouvelle = await this.positions.ajouter({
        sujet: sujetBus(departId),
        auteurId: u.id,
        instant: e.instant,
        latitude: e.latitude,
        longitude: e.longitude,
        precisionM: e.precisionM ?? null,
        vitesseKmh: e.vitesseKmh ?? null,
        recuA: versIsoDouala(maintenant),
      });
      if (nouvelle) acceptees += 1;
      else doublons += 1;
      // Même un doublon passe par l'état : si le serveur est tombé entre l'écriture de la position
      // et celle de l'état, le rejeu répare. L'état ignore ce qu'il a déjà vu.
      echantillons.push({
        instant: e.instant,
        latitude: e.latitude,
        longitude: e.longitude,
        precisionM: e.precisionM ?? null,
        vitesseKmh: e.vitesseKmh ?? null,
      });
    }

    await this.appliquer(t, echantillons, maintenant);
    return { acceptees, doublons, rejetees, serveurA: versIsoDouala(maintenant) };
  }

  /** Fait avancer l'état avec les positions, en comparant la version (deux appareils à la fois). */
  private async appliquer(t: TrajetBus, echantillons: Echantillon[], maintenant: Date) {
    if (echantillons.length === 0) return;
    for (let essai = 0; essai < ESSAIS_MAX; essai++) {
      const avant = (await this.etats.lire(t.departId)) ?? etatInitial(t.departId);
      let etat = avant;
      const effets: Effet[] = [];
      let change = false;
      for (const ech of echantillons) {
        const r = faireAvancer(t, etat, ech);
        if (r.ignoree) continue;
        change = true;
        etat = r.etat;
        if (r.arretAnormal && etat.alerteId === null) {
          const id = randomUUID();
          etat = { ...etat, alerteId: id };
          effets.push({
            type: "ouvrir",
            alerte: nouvelleAlerte(id, t, etat, r.arretAnormal, maintenant),
          });
        } else if (!r.arretAnormal && etat.alerteId !== null) {
          effets.push({ type: "fermer", id: etat.alerteId });
          etat = { ...etat, alerteId: null };
        }
      }
      if (!change) {
        await this.rattraper(t, avant, maintenant);
        return;
      }
      const suivant: EtatSuivi = { ...etat, version: avant.version + 1 };
      if (!(await this.etats.ecrire(suivant))) continue;

      for (const effet of effets) await this.appliquerEffet(effet, maintenant);
      await this.rattraper(t, suivant, maintenant);
      await this.diffuser(t, suivant, maintenant);
      return;
    }
    throw conflit("SUIVI_OCCUPE", "Le suivi de ce départ est occupé, réessayer");
  }

  private async appliquerEffet(effet: Effet, maintenant: Date): Promise<void> {
    try {
      if (effet.type === "ouvrir") {
        const ouverte = await this.alertes.ouvrir(effet.alerte);
        if (!ouverte) return;
        this.diffusion.publier(canalControle(ouverte.compagnieId), {
          type: "a_traiter",
          element: aTraiterVue(ouverte, maintenant.getTime()),
        });
        await this.avis.alerteArret(ouverte);
      } else {
        const close = await this.alertes.resoudre(effet.id, versIsoDouala(maintenant));
        if (close) {
          this.diffusion.publier(canalControle(close.compagnieId), {
            type: "alerte_resolue",
            id: close.id,
          });
        }
      }
    } catch (e) {
      this.journal.error(`Alerte d'arrêt : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Répare ce qu'un arrêt brutal du serveur aurait laissé : une alerte annoncée par l'état mais
   * jamais écrite. L'ouverture est idempotente (une seule alerte ouverte par départ).
   */
  private async rattraper(t: TrajetBus, etat: EtatSuivi, maintenant: Date): Promise<void> {
    if (etat.alerteId === null || !etat.immobile) return;
    if (await this.alertes.trouver(etat.alerteId)) return;
    const alerte = nouvelleAlerte(etat.alerteId, t, etat, etat.immobile, maintenant);
    await this.appliquerEffet({ type: "ouvrir", alerte }, maintenant);
  }

  /** Diffuse la dernière position aux voyageurs et à la salle de contrôle, puis prévient les proches. */
  private async diffuser(t: TrajetBus, etat: EtatSuivi, maintenant: Date): Promise<void> {
    const e = estimer(t, etat, maintenant.getTime());
    const m = messageBus(t, etat, e);
    if (!m) return;
    this.diffusion.publier(canalBus(t.departId), m);
    const alerte = etat.alerteId ? await this.alertes.trouver(etat.alerteId) : null;
    const bus = busEnRouteVue(t, etat, e, alerte, maintenant.getTime());
    if (bus) this.diffusion.publier(canalControle(t.compagnie.id), { type: "bus", bus });
    await this.prevenirLesProches(t, e, await this.prevenirs.enAttente(t.departId), maintenant);
  }

  /* ------------------------------------------------------------------ prévenir un proche */

  private async prevenirLesProches(
    t: TrajetBus,
    e: Estimation,
    lignes: readonly PrevenirProche[],
    maintenant: Date,
  ): Promise<void> {
    // Les positions ne sont reçues que d'un départ à l'embarquement ou en route (voir plus haut),
    // et `prevenir` refuse un voyage terminé : un départ arrivé n'arrive jamais ici.
    for (const l of lignes) {
      if (!l.actif || l.envoyeA !== null) continue;
      if (!doitPrevenir(e, maintenant.getTime(), l.minutesAvantArrivee)) continue;
      try {
        const billet = await this.billets.billet(l.billetId);
        if (!billet?.valide) continue;
        const proche = await this.proches.trouver(billet.voyageurId, l.procheId);
        if (!proche) continue;
        // Le SMS d'abord, la marque ensuite : si la marque échoue, le renvoi porte la même clé
        // d'idempotence et la passerelle SMS n'envoie pas deux fois.
        await this.avis.prevenirProche({
          cle: `gps:proche:${l.billetId}:${l.procheId}`,
          billetId: l.billetId,
          compagnieId: t.compagnie.id,
          voyageurId: billet.voyageurId,
          proche,
          voyageurNom: billet.passagerNom,
          gareArrivee: t.gareArrivee,
          compagnieNom: t.compagnie.nom,
          arriveeEstimee: versIsoDouala(e.arriveeEstimeeMs),
        });
        await this.prevenirs.marquerEnvoye(l.billetId, l.procheId, versIsoDouala(maintenant));
      } catch (err) {
        // Un échec d'envoi ne doit ni perdre la position ni bloquer les autres : le SMS repart à la
        // position suivante (dans 30 s).
        this.journal.error(`SMS au proche : ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Active « prévenir mon proche » : un SMS part quand l'arrivée estimée est dans
   * `minutesAvantArrivee` minutes (15 par défaut). Un seul proche par billet ; si le bus est déjà
   * dans la fenêtre, le SMS part tout de suite.
   */
  async prevenir(u: Utilisateur, billetId: string, procheId: string, minutes: number | undefined) {
    const billet = await this.billetDuVoyageur(u, billetId);
    const t = await this.trajetDuBillet(billet);
    if (t.etat === "arrive" || t.etat === "annule") {
      throw conflit("TRAJET_TERMINE", "Ce voyage est terminé");
    }
    const proche = await this.proches.trouver(u.id, procheId);
    if (!proche) throw inconnu("PROCHE_INCONNU", "Proche introuvable");

    const existantes = await this.prevenirs.deBillet(billetId);
    for (const autre of existantes) {
      if (autre.procheId !== procheId && autre.actif && autre.envoyeA === null) {
        await this.prevenirs.desactiver(billetId, autre.procheId);
      }
    }
    const avant = existantes.find((p) => p.procheId === procheId);
    const maintenant = this.horloge.maintenant();
    const ligne = await this.prevenirs.enregistrer({
      billetId,
      procheId,
      voyageurId: u.id,
      departId: t.departId,
      minutesAvantArrivee:
        minutes ?? avant?.minutesAvantArrivee ?? REGLES_GPS.prevenirMinutesDefaut,
      actif: true,
      creeA: versIsoDouala(maintenant),
    });
    const etat = await this.etats.lire(t.departId);
    if (etat?.derniere) {
      await this.prevenirLesProches(t, estimer(t, etat, maintenant.getTime()), [ligne], maintenant);
    }
    const apres = (await this.prevenirs.deBillet(billetId)).find((p) => p.procheId === procheId);
    return resultatPrevenir(billetId, apres ?? ligne, proche.telephone);
  }

  /** Annule « prévenir mon proche » tant que le SMS n'est pas parti. */
  async nePlusPrevenir(u: Utilisateur, billetId: string, procheId: string) {
    await this.billetDuVoyageur(u, billetId);
    const proche = await this.proches.trouver(u.id, procheId);
    const ligne = (await this.prevenirs.deBillet(billetId)).find((p) => p.procheId === procheId);
    if (!proche || !ligne) throw inconnu("PREVENIR_INCONNU", "Aucun SMS prévu pour ce proche");
    const apres = (await this.prevenirs.desactiver(billetId, procheId)) ?? ligne;
    return resultatPrevenir(billetId, apres, proche.telephone);
  }

  /* ------------------------------------------------------------------ lectures */

  /** « Mon bus en direct » : arrivée estimée, étapes, prévenir un proche. */
  async suivi(u: Utilisateur, billetId: string) {
    const billet = await this.billetDuVoyageur(u, billetId);
    const t = await this.trajetDuBillet(billet);
    if (!t.bus) throw conflit("BUS_NON_AFFECTE", "Le bus n'est pas encore affecté à ce départ");
    const maintenant = this.horloge.maintenant();
    const e = estimer(t, await this.etats.lire(t.departId), maintenant.getTime());
    const ligne = (await this.prevenirs.deBillet(billetId)).find((p) => p.actif) ?? null;
    const proche = ligne
      ? await this.proches.trouver(u.id, ligne.procheId)
      : await this.proches.proposition(u.id);
    return suiviBusVue(
      billet,
      t,
      e,
      prevenirVue(t, proche ? ligne : null, proche, REGLES_GPS.prevenirMinutesDefaut),
    );
  }

  /**
   * Ouvre le canal d'un voyageur : vérifie son accès au billet puis rend le départ à suivre et
   * le dernier message connu (envoyé à la connexion).
   */
  async ouvrirFlux(u: Utilisateur, billetId: string) {
    const billet = await this.billetDuVoyageur(u, billetId);
    const t = await this.trajetDuBillet(billet);
    const dernier = await this.dernierMessage(t);
    return {
      departId: t.departId,
      initial: dernier ? messagePositionBus(billetId, dernier) : null,
    };
  }

  /** Dernière position connue d'un départ, avec l'arrivée estimée à l'instant. */
  async dernierMessage(t: TrajetBus): Promise<MessageBusInterne | null> {
    const etat = await this.etats.lire(t.departId);
    if (!etat?.derniere) return null;
    return messageBus(t, etat, estimer(t, etat, this.horloge.maintenant().getTime()));
  }

  /** État d'un bus pour son équipage, le superviseur et le patron de la compagnie. */
  async etatDuBus(u: Utilisateur, departId: string) {
    const t = await this.reseau.trajet(departId);
    if (!t || t.compagnie.id !== u.compagnieId) {
      throw inconnu("DEPART_INCONNU", "Départ introuvable");
    }
    const equipage = u.id === t.chauffeurId || u.id === t.convoyeurId;
    if (u.role !== "superviseur" && u.role !== "patron" && !equipage) {
      throw interdit("EQUIPAGE_REQUIS", "Ce bus n'est pas le vôtre");
    }
    const maintenantMs = this.horloge.maintenant().getTime();
    const etat = await this.etats.lire(departId);
    const e = estimer(t, etat, maintenantMs);
    const alerte = etat?.alerteId ? await this.alertes.trouver(etat.alerteId) : null;
    const prochain = e.etapes.find((x) => x.statut === "prochain");
    return {
      departId,
      immatriculation: t.bus?.immatriculation ?? "",
      gps: e.enDirect,
      derniereA: etat?.derniere?.instant ?? null,
      latitude: etat?.derniere?.latitude ?? null,
      longitude: etat?.derniere?.longitude ?? null,
      vitesseKmh: Math.round(e.vitesseKmh),
      retardMinutes: e.retardMinutes,
      arriveeEstimee: versIsoDouala(e.arriveeEstimeeMs),
      prochainArret: e.prochainArret
        ? {
            nom: e.prochainArret.nom,
            heure: versIsoDouala(prochain ? prochain.heureMs : e.arriveeEstimeeMs),
          }
        : null,
      alerte: alerte ? { id: alerte.id, apres: alerte.apres, depuis: alerte.arretDepuis } : null,
      periodeEnvoiSecondes: REGLES_GPS.periodeEnvoiSecondes,
    };
  }

  /* ------------------------------------------------------------------ accès */

  private async trajetDeLEquipage(u: Utilisateur, departId: string): Promise<TrajetBus> {
    const t = await this.reseau.trajet(departId);
    if (!t || t.compagnie.id !== u.compagnieId) {
      throw inconnu("DEPART_INCONNU", "Départ introuvable");
    }
    if (u.id !== t.chauffeurId && u.id !== t.convoyeurId) {
      throw interdit("EQUIPAGE_REQUIS", "Ce bus n'est pas le vôtre");
    }
    return t;
  }

  /** Un billet n'est suivi que par celui qui l'a acheté ; les autres reçoivent « introuvable ». */
  private async billetDuVoyageur(u: Utilisateur, billetId: string): Promise<BilletSuivi> {
    const billet = await this.billets.billet(billetId);
    if (!billet || billet.voyageurId !== u.id) {
      throw inconnu("BILLET_INCONNU", "Billet introuvable");
    }
    if (!billet.valide) throw conflit("BILLET_ANNULE", "Ce billet est annulé");
    return billet;
  }

  private async trajetDuBillet(billet: BilletSuivi): Promise<TrajetBus> {
    const t = await this.reseau.trajet(billet.departId);
    if (!t) throw inconnu("DEPART_INCONNU", "Départ introuvable");
    return t;
  }
}

function resultatPrevenir(billetId: string, ligne: PrevenirProche, telephone: string) {
  return {
    billetId,
    procheId: ligne.procheId,
    actif: ligne.actif,
    ...(ligne.envoyeA ? { envoyeA: telephone } : {}),
    minutesAvantArrivee: ligne.minutesAvantArrivee,
  };
}
