import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { SYSTEME, ColisService } from "../colis/colis.service";
import { ErreurColis } from "../colis/erreurs";
import type { ColisStocke } from "../colis/modele";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AnnuairePersonnes } from "../relais/annuaire";
import { Lieux, Portefeuille } from "../relais/ports";
import { distanceM } from "../relais/regles";
import { RelaisService } from "../relais/relais.service";
import { ajouterMinutes, ajouterSecondes, debutDeJour, enMs, versIsoDouala } from "../relais/temps";
import { vueColisPartenaire } from "../relais/vues";
import type { LivreurStocke, MissionLivraison } from "./modele";
import { ETATS_MISSION_OUVERTS } from "./modele";
import { ColisALivrer, DiffusionLivraison, LivreursRepository, MissionsRepository } from "./ports";
import {
  ATTENTE_ABSENCE_MINUTES,
  ATTENTE_MAX_SANS_LIVREUR_MINUTES,
  DELAI_ACCEPTATION_SECONDES,
  DISTANCE_PAR_DEFAUT_M,
  PAUSE_ENTRE_TOURS_SECONDES,
  TARIFS,
  TOURS_MAX,
  dureeDeTrajet,
  gainLivreur,
  livreurConvient,
} from "./regles";
import { vueMission } from "./vues";

const MAX_TENTATIVES = 10;

const SYSTEME_ACTEUR = { id: SYSTEME, role: "afrimove", compagnieId: null, gareId: null } as const;

const missionIntrouvable = (): ErreurColis =>
  new ErreurColis(404, "mission_introuvable", "Mission introuvable");

const missionExpiree = (): ErreurColis =>
  new ErreurColis(410, "mission_expiree", "La mission est passée au livreur suivant");

const dejaTraitee = (): ErreurColis =>
  new ErreurColis(409, "mission_deja_traitee", "Mission déjà traitée");

/** L'instant estimé d'arrivée : l'acceptation plus la durée du trajet. */
export function arriveeEstimee(mission: MissionLivraison): string {
  return ajouterMinutes(mission.accepteeA ?? mission.creeA, mission.dureeMinutes);
}

/** Minutes avant l'arrivée estimée, arrondies au-dessus, jamais négatives. */
export function minutesRestantes(mission: MissionLivraison, maintenant: string): number {
  return Math.max(0, Math.ceil((enMs(arriveeEstimee(mission)) - enMs(maintenant)) / 60_000));
}

/**
 * Le cœur de la livraison moto : une mission est proposée à un livreur à la fois, selon sa zone, ses
 * heures et sa charge, avec 30 secondes pour accepter ; sans réponse, elle passe au suivant. La
 * remise se fait contre le code du client (vérifié par `ColisService.executer`, jamais ici).
 *
 * Toute écriture d'une mission est une comparaison-écriture sur sa version : de deux requêtes qui se
 * croisent (acceptation et expiration, deux tâches), une seule réussit.
 */
@Injectable()
export class MissionsService {
  private readonly logger = new Logger("MissionsService");
  /** Dernière position publiée par mission, pour ne diffuser que les changements. */
  private readonly dernieresMinutes = new Map<string, number>();

  constructor(
    readonly missions: MissionsRepository,
    private readonly livreurs: LivreursRepository,
    private readonly colisALivrer: ColisALivrer,
    readonly colis: ColisService,
    readonly relais: RelaisService,
    private readonly lieux: Lieux,
    private readonly portefeuille: Portefeuille,
    private readonly diffusion: DiffusionLivraison,
    private readonly annuaire: AnnuairePersonnes,
    private readonly horloge: Horloge,
    private readonly audit: AuditService,
  ) {}

  maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /* -------------------------------------------------------------- écriture concurrente */

  /**
   * Relit la mission, applique `transformer` (qui renvoie la mission inchangée pour ne rien écrire),
   * puis écrit si personne ne l'a modifiée entre-temps ; sinon recommence.
   */
  async modifier(
    id: string,
    transformer: (mission: MissionLivraison) => MissionLivraison,
  ): Promise<{ mission: MissionLivraison; ecrit: boolean }> {
    for (let tentative = 0; tentative < MAX_TENTATIVES; tentative++) {
      const lue = await this.missions.trouver(id);
      if (!lue) throw missionIntrouvable();
      const suivante = transformer(lue);
      if (suivante === lue) return { mission: lue, ecrit: false };
      if (await this.missions.remplacer(suivante, lue.version)) {
        return { mission: { ...suivante, version: lue.version + 1 }, ecrit: true };
      }
    }
    throw new ErreurColis(
      409,
      "CONFLIT_ECRITURE",
      "La mission est modifiée en même temps, réessayez",
    );
  }

  private async livreurDe(utilisateur: Pick<Utilisateur, "id">): Promise<LivreurStocke> {
    const livreur = await this.livreurs.parPersonne(utilisateur.id);
    if (!livreur) throw new ErreurColis(404, "livreur_introuvable", "Livreur introuvable");
    if (!livreur.actif)
      throw new ErreurColis(403, "livreur_suspendu", "Votre compte livreur est suspendu");
    return livreur;
  }

  private acteurLivreur(utilisateur: Utilisateur) {
    return { id: utilisateur.id, role: "livreur", compagnieId: null, gareId: null };
  }

  /** Une mission est « à lui » s'elle lui est proposée, qu'il l'a prise, ou qu'elle lui a été proposée avant. */
  private estLaSienne(mission: MissionLivraison, livreurId: string): boolean {
    return mission.livreurId === livreurId || mission.essais.some((e) => e.livreurId === livreurId);
  }

  /* -------------------------------------------------------------- ouvrir et proposer */

  /** La distance et la durée du trajet de la gare à l'adresse (3 km par défaut si les lieux sont inconnus). */
  async trajet(colis: ColisStocke): Promise<{ distanceM: number; dureeMinutes: number }> {
    const depart = await this.lieux.pointDeLaGare(colis.gareDestination.id);
    const arrivee = colis.adresseLivraison
      ? await this.lieux.pointDeLAdresse(colis.adresseLivraison, colis.gareDestination.ville)
      : null;
    const distance =
      depart && arrivee ? Math.max(1, distanceM(depart, arrivee)) : DISTANCE_PAR_DEFAUT_M;
    return { distanceM: distance, dureeMinutes: dureeDeTrajet(distance) };
  }

  /**
   * Ouvre la mission d'un colis « moto » qui vient d'arriver à la gare (état « disponible », payé) et la
   * propose au premier livreur qui convient. Sans effet si le colis a déjà une mission ouverte.
   */
  async ouvrirPourColis(colis: ColisStocke): Promise<MissionLivraison | null> {
    if (colis.mode !== "moto" || colis.etat !== "disponible") return null;
    if (colis.paiement?.etat !== "paye") return null;
    const derniere = await this.missions.derniereDuColis(colis.id);
    if (derniere && ETATS_MISSION_OUVERTS.includes(derniere.etat)) return null;

    const prix =
      colis.devis.find((l) => l.code === "livraison")?.montant ?? TARIFS.livraison.minimum;
    const trajet = await this.trajet(colis);
    const maintenant = this.maintenant();
    const mission: MissionLivraison = {
      id: randomUUID(),
      version: 1,
      colisId: colis.id,
      colisNumero: colis.numero,
      etat: "en_attente",
      livreurId: null,
      proposeeA: null,
      expireA: null,
      essais: [],
      tour: 0,
      prochaineA: null,
      creeA: maintenant,
      accepteeA: null,
      livreeA: null,
      trajet: {
        depart: `Gare ${colis.gareDestination.nom}`,
        arrivee: colis.adresseLivraison ?? colis.gareDestination.ville,
        destinataire: colis.destinataire.nom,
      },
      distanceM: trajet.distanceM,
      dureeMinutes: trajet.dureeMinutes,
      prixLivraison: prix,
      gain: gainLivreur(prix),
      absence: null,
      repliA: null,
    };
    if ((await this.missions.ajouter(mission)) === "colis_deja_servi") return null;
    await this.proposerSuivant(mission.id);
    return this.missions.trouver(mission.id);
  }

  /** Les livreurs à qui proposer la mission, du premier au dernier. */
  async candidats(mission: MissionLivraison, colis: ColisStocke): Promise<LivreurStocke[]> {
    const maintenant = this.maintenant();
    const cible = {
      ville: colis.gareDestination.ville,
      adresse: colis.adresseLivraison,
      poidsKg: colis.poidsKg,
    };
    const dejaEssayes = new Set(
      mission.essais.filter((e) => e.tour === mission.tour).map((e) => e.livreurId),
    );
    const convenables = (await this.livreurs.lister({ actif: true, disponible: true })).filter(
      (l) => !dejaEssayes.has(l.id) && livreurConvient(l, cible, maintenant),
    );
    const debut = debutDeJour(maintenant);
    const libres: { livreur: LivreurStocke; livraisonsDuJour: number }[] = [];
    for (const livreur of convenables) {
      // Un livreur déjà sur une mission (proposée ou en cours) n'en reçoit pas une autre.
      const occupe = await this.missions.deLivreur(livreur.id, ["proposee", "acceptee"]);
      if (occupe.length > 0) continue;
      libres.push({
        livreur,
        livraisonsDuJour: (await this.missions.terminees(livreur.id, debut)).length,
      });
    }
    // Celui qui a le moins livré aujourd'hui d'abord, puis la meilleure note, puis le plus ancien badge.
    return libres
      .sort(
        (a, b) =>
          a.livraisonsDuJour - b.livraisonsDuJour ||
          b.livreur.note - a.livreur.note ||
          a.livreur.numero - b.livreur.numero,
      )
      .map((x) => x.livreur);
  }

  /** Propose la mission au livreur suivant : 30 secondes pour accepter. */
  async proposerSuivant(missionId: string): Promise<void> {
    const mission = await this.missions.trouver(missionId);
    if (mission?.etat !== "en_attente") return;
    const maintenant = this.maintenant();
    if (mission.prochaineA !== null && enMs(maintenant) < enMs(mission.prochaineA)) return;

    const colis = await this.colis.repo.trouver(mission.colisId);
    if (!colis || colis.mode !== "moto" || colis.etat !== "disponible") {
      await this.annuler(mission.id);
      return;
    }
    const [premier] = await this.candidats(mission, colis);
    if (!premier) {
      await this.aucunCandidat(mission);
      return;
    }
    const expireA = ajouterSecondes(maintenant, DELAI_ACCEPTATION_SECONDES);
    const { mission: proposee, ecrit } = await this.modifier(mission.id, (x) =>
      x.etat !== "en_attente"
        ? x
        : {
            ...x,
            etat: "proposee",
            livreurId: premier.id,
            proposeeA: maintenant,
            expireA,
            prochaineA: null,
          },
    );
    if (!ecrit) return;
    this.diffusion.publierMission(premier.id, {
      type: "proposee",
      mission: vueMission(proposee, colis),
    });
  }

  /** Personne à qui proposer : on attend, ou on abandonne après plusieurs tours. */
  private async aucunCandidat(mission: MissionLivraison): Promise<void> {
    const maintenant = this.maintenant();
    const tourFait = mission.essais.some((e) => e.tour === mission.tour);
    const { mission: apres, ecrit } = await this.modifier(mission.id, (x) => {
      if (x.etat !== "en_attente") return x;
      const pause = ajouterSecondes(maintenant, PAUSE_ENTRE_TOURS_SECONDES);
      if (tourFait) {
        return x.tour + 1 >= TOURS_MAX
          ? { ...x, etat: "sans_livreur", prochaineA: null }
          : { ...x, tour: x.tour + 1, prochaineA: pause };
      }
      // Personne ne convient (la nuit, hors zone) : on réessaie, jusqu'à une heure.
      return enMs(maintenant) - enMs(x.creeA) >= ATTENTE_MAX_SANS_LIVREUR_MINUTES * 60_000
        ? { ...x, etat: "sans_livreur", prochaineA: null }
        : { ...x, prochaineA: pause };
    });
    if (ecrit && apres.etat === "sans_livreur") {
      await this.audit.enregistrer({
        action: "livraison.sans_livreur",
        resultat: "echec",
        cible: { type: "colis", id: apres.colisId },
        details: { colis: apres.colisNumero, mission: apres.id, tours: apres.tour + 1 },
      });
      // Le client n'attend pas un livreur qui ne viendra pas : le colis l'attend à la gare.
      const colis = await this.colis.repo.trouver(apres.colisId);
      if (colis) {
        await this.annuaire.prevenir(
          colis.destinataire.telephone,
          `AfriMove : aucun livreur n'a pu prendre le colis ${colis.numero}. Il vous attend à la gare ` +
            `${colis.gareDestination.nom}. Munissez-vous de votre code et de votre pièce d'identité.`,
        );
      }
    }
  }

  private async annuler(missionId: string): Promise<void> {
    await this.modifier(missionId, (x) =>
      x.etat === "livree" || x.etat === "repli" || x.etat === "annulee"
        ? x
        : { ...x, etat: "annulee", livreurId: null, proposeeA: null, expireA: null },
    );
  }

  /**
   * La proposition passe au livreur suivant : il l'a refusée (`passee`) ou 30 secondes se sont écoulées
   * (`expiree`). Rien ne se passe si la mission n'est plus à lui ou si son délai n'est pas écoulé.
   */
  async passerAuSuivant(
    missionId: string,
    issue: "passee" | "expiree",
    livreurId?: string,
  ): Promise<boolean> {
    const maintenant = this.maintenant();
    const { mission, ecrit } = await this.modifier(missionId, (x) => {
      if (x.etat !== "proposee" || x.livreurId === null) return x;
      if (livreurId !== undefined && x.livreurId !== livreurId) return x;
      if (issue === "expiree" && (x.expireA === null || enMs(maintenant) < enMs(x.expireA)))
        return x;
      return {
        ...x,
        etat: "en_attente",
        livreurId: null,
        proposeeA: null,
        expireA: null,
        prochaineA: null,
        essais: [...x.essais, { livreurId: x.livreurId, issue, at: maintenant, tour: x.tour }],
      };
    });
    if (!ecrit) return false;
    const dernier = mission.essais[mission.essais.length - 1];
    if (dernier && issue === "expiree") {
      this.diffusion.publierMission(dernier.livreurId, { type: "expiree", missionId });
    }
    await this.proposerSuivant(missionId);
    return true;
  }

  /* -------------------------------------------------------------- le livreur répond */

  /** Ce que le livreur voit : la proposition en cours, s'il en a une et qu'elle n'est pas expirée. */
  async propositionDe(livreurId: string) {
    const maintenant = this.maintenant();
    // L'écran du livreur est lu souvent : une proposition échue est passée au suivant avant de répondre.
    await this.avancerPropositions();
    const [proposee] = (await this.missions.deLivreur(livreurId, ["proposee"])).filter(
      (m) => m.expireA !== null && enMs(m.expireA) > enMs(maintenant),
    );
    if (!proposee) return null;
    const colis = await this.colis.repo.trouver(proposee.colisId);
    return colis ? vueMission(proposee, colis) : null;
  }

  /** Le livreur accepte : le colis passe « en livraison » (le livreur en a la charge). */
  async accepter(utilisateur: Utilisateur, missionId: string) {
    const livreur = await this.livreurDe(utilisateur);
    const maintenant = this.maintenant();
    const mission = await this.missions.trouver(missionId);
    if (!mission || !this.estLaSienne(mission, livreur.id)) throw missionIntrouvable();

    if (mission.livreurId === livreur.id && mission.etat === "acceptee") {
      return this.reponseAcceptation(mission); // la requête est rejouée : même réponse
    }
    if (mission.etat !== "proposee" || mission.livreurId !== livreur.id) {
      // Elle lui avait été proposée, elle est partie au suivant.
      throw mission.livreurId !== livreur.id &&
        mission.essais.some((e) => e.livreurId === livreur.id)
        ? missionExpiree()
        : dejaTraitee();
    }
    if (mission.expireA === null || enMs(maintenant) >= enMs(mission.expireA)) {
      await this.passerAuSuivant(mission.id, "expiree");
      throw missionExpiree();
    }
    const lu = await this.colis.repo.trouver(mission.colisId);
    if (!lu || lu.mode !== "moto" || lu.etat !== "disponible") {
      await this.annuler(mission.id);
      throw new ErreurColis(409, "mission_annulee", "Cette livraison n'a plus lieu");
    }

    const { mission: acceptee, ecrit } = await this.modifier(mission.id, (x) =>
      x.etat !== "proposee" ||
      x.livreurId !== livreur.id ||
      x.expireA === null ||
      enMs(maintenant) >= enMs(x.expireA)
        ? x
        : { ...x, etat: "acceptee", accepteeA: maintenant },
    );
    if (!ecrit) {
      if (acceptee.etat === "acceptee" && acceptee.livreurId === livreur.id) {
        return this.reponseAcceptation(acceptee);
      }
      if (acceptee.etat === "proposee") await this.passerAuSuivant(acceptee.id, "expiree");
      throw missionExpiree();
    }

    let colis: ColisStocke;
    try {
      colis = await this.colis.executer({
        acteur: this.acteurLivreur(utilisateur),
        colis: { id: acceptee.colisId },
        action: "mettre_en_livraison",
      });
    } catch (e) {
      await this.modifier(acceptee.id, (x) =>
        x.etat === "acceptee" ? { ...x, etat: "annulee" } : x,
      );
      throw e;
    }
    this.publierPosition(acceptee, maintenant);
    return {
      missionId: acceptee.id,
      acceptee: true as const,
      accepteeLe: acceptee.accepteeA ?? maintenant,
      colis: vueColisPartenaire(colis),
    };
  }

  private async reponseAcceptation(mission: MissionLivraison) {
    const colis = await this.colis.repo.trouver(mission.colisId);
    if (!colis) throw missionIntrouvable();
    return {
      missionId: mission.id,
      acceptee: true as const,
      accepteeLe: mission.accepteeA ?? mission.creeA,
      colis: vueColisPartenaire(colis),
    };
  }

  /** Le livreur passe : la mission va au suivant tout de suite. */
  async passer(utilisateur: Utilisateur, missionId: string) {
    const livreur = await this.livreurDe(utilisateur);
    const mission = await this.missions.trouver(missionId);
    if (!mission || !this.estLaSienne(mission, livreur.id)) throw missionIntrouvable();
    if (mission.etat === "proposee" && mission.livreurId === livreur.id) {
      await this.passerAuSuivant(missionId, "passee", livreur.id);
      return { missionId, passee: true as const };
    }
    // Déjà passée (ou partie au suivant faute de réponse) : le refus est sans effet.
    if (
      mission.livreurId !== livreur.id &&
      mission.essais.some((e) => e.livreurId === livreur.id)
    ) {
      return { missionId, passee: true as const };
    }
    throw dejaTraitee();
  }

  /**
   * Remise au destinataire : le code du client, sa pièce, la photo du colis remis. Le code est vérifié par
   * `ColisService.executer` (trois essais faux bloquent le colis, 423) ; sans code valide, le colis ne
   * change pas d'état et le livreur ne gagne rien.
   */
  async remettre(
    utilisateur: Utilisateur,
    demande: { missionId: string; code: string; photoRef: string },
  ) {
    const livreur = await this.livreurDe(utilisateur);
    const mission = await this.missions.trouver(demande.missionId);
    if (!mission || mission.livreurId !== livreur.id) throw missionIntrouvable();
    if (mission.etat === "livree" || mission.etat === "repli") throw dejaTraitee();
    if (mission.etat !== "acceptee") {
      throw new ErreurColis(409, "mission_non_acceptee", "Acceptez la mission avant la remise");
    }

    const colis = await this.colis.executer({
      acteur: this.acteurLivreur(utilisateur),
      colis: { id: mission.colisId },
      action: "livrer",
      code: demande.code,
      pieceVerifiee: true,
      photoRef: demande.photoRef,
    });
    const livreLe = colis.remise?.a ?? this.maintenant();
    const { mission: livree } = await this.modifier(mission.id, (x) =>
      x.etat === "acceptee" ? { ...x, etat: "livree", livreeA: livreLe } : x,
    );
    await this.crediter(livree, livreLe);
    this.dernieresMinutes.delete(livree.id);
    const photoTransmise = await this.transmettrePreuve(colis);
    return {
      missionId: livree.id,
      colis: vueColisPartenaire(colis),
      livreLe,
      gain: livree.gain,
      photoTransmise,
    };
  }

  /** Le gain du livreur : crédité une seule fois par mission. Un échec est noté, jamais silencieux. */
  private async crediter(mission: MissionLivraison, at: string): Promise<void> {
    if (mission.livreurId === null) return;
    try {
      await this.portefeuille.crediter({
        cle: `mission:${mission.id}`,
        type: "livreur",
        partenaireId: mission.livreurId,
        montant: mission.gain,
        motif: "livraison",
        reference: mission.id,
        at,
      });
    } catch (e) {
      this.logger.error(`Gain de la mission ${mission.id} non crédité (${(e as Error).name})`);
      await this.audit.enregistrer({
        action: "livraison.gain_non_credite",
        resultat: "echec",
        cible: { type: "colis", id: mission.colisId },
        details: { mission: mission.id, montant: mission.gain },
      });
    }
  }

  /** La preuve photo part à l'expéditeur et au destinataire ; `true` si les deux messages sont partis. */
  private async transmettrePreuve(colis: ColisStocke): Promise<boolean> {
    const message = (nom: string): string =>
      `AfriMove : le colis ${colis.numero} a été remis à ${nom}. ` +
      "La photo de la remise est dans l'app, rubrique Colis.";
    const aLExpediteur = await this.annuaire.prevenir(
      colis.expediteur.telephone,
      message(colis.destinataire.nom),
    );
    const auDestinataire = await this.annuaire.prevenir(
      colis.destinataire.telephone,
      message(colis.destinataire.nom),
    );
    return aLExpediteur && auDestinataire;
  }

  /** Le destinataire est absent : le livreur attend 10 minutes, puis dépose au relais le plus proche. */
  async signalerAbsence(utilisateur: Utilisateur, missionId: string) {
    const livreur = await this.livreurDe(utilisateur);
    const mission = await this.missions.trouver(missionId);
    if (!mission || mission.livreurId !== livreur.id) throw missionIntrouvable();
    if (mission.etat !== "acceptee") {
      throw new ErreurColis(409, "mission_non_acceptee", "Aucune livraison en cours");
    }
    const colis = await this.colis.repo.trouver(mission.colisId);
    if (!colis) throw missionIntrouvable();

    let absence = mission.absence;
    if (absence === null) {
      const repli = await this.relais.relaisDeRepli(colis);
      if (!repli) {
        throw new ErreurColis(
          409,
          "aucun_relais_de_repli",
          "Aucun point relais ne peut recevoir ce colis, contactez le support",
        );
      }
      const debutA = this.maintenant();
      const { mission: maj } = await this.modifier(mission.id, (x) =>
        x.etat !== "acceptee" || x.absence !== null
          ? x
          : {
              ...x,
              absence: {
                debutA,
                jusqua: ajouterMinutes(debutA, ATTENTE_ABSENCE_MINUTES),
                relaisId: repli.id,
              },
            },
      );
      absence = maj.absence;
      if (absence !== null && absence.debutA === debutA) {
        await this.annuaire.prevenir(
          colis.destinataire.telephone,
          `AfriMove : votre livreur est devant chez vous avec le colis ${colis.numero}. ` +
            `Il attend ${ATTENTE_ABSENCE_MINUTES} minutes, puis le dépose chez ${repli.nom}.`,
        );
      }
    }
    if (absence === null) throw dejaTraitee();
    const repli = await this.relais.repo.trouver(absence.relaisId);
    return {
      missionId: mission.id,
      attenteMinutes: ATTENTE_ABSENCE_MINUTES,
      attenteJusqua: absence.jusqua,
      relaisDeRepli: { id: absence.relaisId, nom: repli?.nom ?? "Point relais" },
    };
  }

  /* -------------------------------------------------------------- tâches */

  /** Passe au suivant les propositions de plus de 30 secondes. */
  async avancerPropositions(): Promise<number> {
    const maintenant = this.maintenant();
    let passees = 0;
    for (const m of await this.missions.parEtats(["proposee"])) {
      if (m.expireA !== null && enMs(maintenant) >= enMs(m.expireA)) {
        if (await this.passerAuSuivant(m.id, "expiree")) passees += 1;
      }
    }
    return passees;
  }

  /** Ouvre les missions des colis « moto » arrivés, et relance celles qui attendent un livreur. */
  async ouvrirMissions(): Promise<number> {
    let ouvertes = 0;
    for (const colis of await this.colisALivrer.disponibles()) {
      if (await this.ouvrirPourColis(colis)) ouvertes += 1;
    }
    const maintenant = this.maintenant();
    for (const m of await this.missions.parEtats(["en_attente"])) {
      if (m.prochaineA === null || enMs(maintenant) >= enMs(m.prochaineA)) {
        await this.proposerSuivant(m.id);
      }
    }
    return ouvertes;
  }

  /** Après 10 minutes d'attente, le colis est déposé au relais de repli. */
  async traiterAbsences(): Promise<number> {
    const maintenant = this.maintenant();
    let deposes = 0;
    for (const m of await this.missions.parEtats(["acceptee"])) {
      if (m.absence === null || enMs(maintenant) < enMs(m.absence.jusqua)) continue;
      try {
        await this.colis.executer({
          acteur: SYSTEME_ACTEUR,
          colis: { id: m.colisId },
          action: "envoyer_en_relais",
          relaisId: m.absence.relaisId,
          motif: "destinataire absent",
        });
      } catch (e) {
        this.logger.warn(`Colis ${m.colisNumero} non déposé au relais (${(e as Error).name})`);
        continue;
      }
      const { mission: repli, ecrit } = await this.modifier(m.id, (x) =>
        x.etat === "acceptee" ? { ...x, etat: "repli", repliA: maintenant } : x,
      );
      if (ecrit) {
        await this.crediter(repli, maintenant);
        this.dernieresMinutes.delete(repli.id);
        deposes += 1;
      }
    }
    return deposes;
  }

  private publierPosition(mission: MissionLivraison, maintenant: string): void {
    const minutes = minutesRestantes(mission, maintenant);
    this.dernieresMinutes.set(mission.id, minutes);
    this.diffusion.publierPosition({
      colisId: mission.colisId,
      minutesRestantes: minutes,
      arriveeEstimee: arriveeEstimee(mission),
    });
  }

  /** Diffuse aux clients le temps restant des livraisons en cours, quand il change. */
  async diffuserPositions(): Promise<number> {
    const maintenant = this.maintenant();
    let publiees = 0;
    for (const m of await this.missions.parEtats(["acceptee"])) {
      if (this.dernieresMinutes.get(m.id) === minutesRestantes(m, maintenant)) continue;
      this.publierPosition(m, maintenant);
      publiees += 1;
    }
    return publiees;
  }

  async avancer() {
    return {
      propositionsPassees: await this.avancerPropositions(),
      missionsOuvertes: await this.ouvrirMissions(),
      colisDeposesAuRelais: await this.traiterAbsences(),
      positionsDiffusees: await this.diffuserPositions(),
    };
  }
}
