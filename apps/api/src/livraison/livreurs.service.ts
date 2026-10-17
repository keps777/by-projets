import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ErreurColis } from "../colis/erreurs";
import { masquerTelephone } from "../colis/vues";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AnnuairePersonnes } from "../relais/annuaire";
import { Portefeuille } from "../relais/ports";
import { initiales, libelleMoyen } from "../relais/regles";
import { debutDeJour, debutDeSemaine, versIsoDouala } from "../relais/temps";
import { VersementsService } from "../relais/versements.service";
import { LIBELLES_PIECES, REGLES_LIVREUR } from "./contenu";
import type { LivreurStocke } from "./modele";
import { DiffusionLivraison, Invitations, LivreursRepository, MissionsRepository } from "./ports";
import {
  INVITATIONS_PAR_JOUR_MAX,
  MINUTE_VERSEMENT_LIVREUR,
  SEUIL_RETRAIT,
  libelleAssurance,
  libellePermis,
  piecesAJour,
} from "./regles";
import { MissionsService } from "./missions.service";
import { vueMission } from "./vues";

const MAX_TENTATIVES = 10;

/**
 * L'app du livreur : son espace (mission proposée, bilan du jour et de la semaine, pièces, solde),
 * sa disponibilité, le retrait de ses gains et les invitations à d'autres livreurs.
 */
@Injectable()
export class LivreursService {
  constructor(
    readonly repo: LivreursRepository,
    private readonly missions: MissionsService,
    private readonly missionsRepo: MissionsRepository,
    private readonly portefeuille: Portefeuille,
    private readonly versements: VersementsService,
    private readonly invitations: Invitations,
    private readonly diffusion: DiffusionLivraison,
    private readonly annuaire: AnnuairePersonnes,
    private readonly horloge: Horloge,
    private readonly audit: AuditService,
  ) {}

  private maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /** Le livreur du compte connecté (actif). */
  async moi(utilisateur: Pick<Utilisateur, "id">): Promise<LivreurStocke> {
    const livreur = await this.repo.parPersonne(utilisateur.id);
    if (!livreur) throw new ErreurColis(404, "livreur_introuvable", "Livreur introuvable");
    if (!livreur.actif) {
      throw new ErreurColis(403, "livreur_suspendu", "Votre compte livreur est suspendu");
    }
    return livreur;
  }

  /** `SchemaEspaceLivreur` : l'écran d'accueil du livreur. */
  async espace(utilisateur: Utilisateur) {
    const livreur = await this.moi(utilisateur);
    const maintenant = this.maintenant();
    const mission = await this.missions.propositionDe(livreur.id);

    const duJour = await this.portefeuille.credits("livreur", livreur.id, debutDeJour(maintenant));
    const deLaSemaine = await this.portefeuille.credits(
      "livreur",
      livreur.id,
      debutDeSemaine(maintenant),
    );
    const somme = (credits: { montant: number }[]): number =>
      credits.reduce((total, c) => total + c.montant, 0);

    const liste: { type: string; libelle: string; valeur: string }[] = [];
    const { permisValideJusqua, assuranceExpireLe } = livreur.pieces;
    if (permisValideJusqua !== null) {
      liste.push({ ...LIBELLES_PIECES.permis, valeur: libellePermis(permisValideJusqua) });
    }
    if (assuranceExpireLe !== null) {
      liste.push({ ...LIBELLES_PIECES.assurance, valeur: libelleAssurance(assuranceExpireLe) });
    }
    liste.push({ ...LIBELLES_PIECES.gilet, valeur: `badge n° ${livreur.numero}` });

    return {
      livreur: {
        id: livreur.id,
        initiales: initiales(livreur.nom),
        nom: livreur.nom,
        numero: livreur.numero,
        ville: livreur.ville,
        note: livreur.note,
        disponible: livreur.disponible,
      },
      mission,
      regles: { ...REGLES_LIVREUR },
      bilan: {
        aujourdhui: { livraisons: duJour.length, gain: somme(duJour) },
        versement: `ce soir à ${MINUTE_VERSEMENT_LIVREUR / 60} h · ${libelleMoyen(livreur.momo.operateur)}`,
        semaine: { livraisons: deLaSemaine.length, gain: somme(deLaSemaine) },
      },
      pieces: { aJour: piecesAJour(livreur, maintenant), liste },
      retrait: {
        solde: Math.max(0, await this.portefeuille.solde("livreur", livreur.id)),
        seuil: SEUIL_RETRAIT,
      },
    };
  }

  /**
   * La mission acceptée en cours, pour que le livreur la retrouve s'il referme l'app (le contrat ne
   * montre sur l'espace que la proposition).
   */
  async missionEnCours(utilisateur: Utilisateur) {
    const livreur = await this.moi(utilisateur);
    const [mission] = (await this.missionsRepo.deLivreur(livreur.id, ["acceptee"])).sort((a, b) =>
      b.creeA.localeCompare(a.creeA),
    );
    if (!mission) return { mission: null, absence: null };
    const colis = await this.missions.colis.repo.trouver(mission.colisId);
    if (!colis) return { mission: null, absence: null };
    return {
      mission: vueMission(mission, colis),
      absence: mission.absence
        ? { attenteJusqua: mission.absence.jusqua, relaisId: mission.absence.relaisId }
        : null,
    };
  }

  /** `SchemaDisponibiliteLivreur` : se mettre en ligne ou hors ligne. */
  async disponibilite(utilisateur: Utilisateur, disponible: boolean) {
    for (let essai = 0; essai < MAX_TENTATIVES; essai++) {
      const livreur = await this.moi(utilisateur);
      if (livreur.disponible === disponible) return { disponible };
      if (await this.repo.remplacer({ ...livreur, disponible }, livreur.version)) {
        return { disponible };
      }
    }
    throw new ErreurColis(
      409,
      "CONFLIT_ECRITURE",
      "Votre profil est modifié en même temps, réessayez",
    );
  }

  /**
   * `SchemaRetraitGains` : le livreur retire ses gains vers son MoMo dès 5 000 F. Le montant est réservé
   * sur son solde avant l'appel à l'opérateur ; si l'opérateur ne répond pas, le versement part dès
   * qu'il revient (même clé, jamais deux fois).
   */
  async retirer(utilisateur: Utilisateur, montant: number | undefined) {
    const livreur = await this.moi(utilisateur);
    if (montant !== undefined && montant <= 0) {
      throw new ErreurColis(422, "montant_invalide", "Le montant doit être positif");
    }
    const { issue, montant: verse } = await this.versements.payer({
      type: "livreur",
      partenaireId: livreur.id,
      cle: `retrait:${randomUUID()}`,
      motif: "retrait",
      ...(montant === undefined ? {} : { montant }),
      soldeMinimum: SEUIL_RETRAIT,
      momo: livreur.momo,
      libelle: "AfriMove : retrait de vos gains de livreur",
    });
    if (issue === "rien" || issue === "deja") {
      throw new ErreurColis(
        409,
        "solde_insuffisant",
        `Retrait possible dès ${SEUIL_RETRAIT} F de solde, et jamais au-delà du solde`,
      );
    }
    if (issue === "refuse") {
      throw new ErreurColis(
        502,
        "versement_refuse",
        "L'opérateur a refusé le versement, votre solde est intact",
      );
    }
    return {
      montant: verse,
      moyen: `${libelleMoyen(livreur.momo.operateur)} · ${masquerTelephone(livreur.momo.telephone)}`,
      demandeLe: this.maintenant(),
    };
  }

  /** `SchemaInvitationEnvoyee` : un SMS pour inviter un proche à devenir livreur, 5 par jour au plus. */
  async inviter(utilisateur: Utilisateur, telephone: string) {
    const livreur = await this.moi(utilisateur);
    const maintenant = this.maintenant();
    const dejaEnvoyees = await this.invitations.compterDepuis(livreur.id, debutDeJour(maintenant));
    if (dejaEnvoyees >= INVITATIONS_PAR_JOUR_MAX) {
      throw new ErreurColis(
        429,
        "invitations_epuisees",
        `${INVITATIONS_PAR_JOUR_MAX} invitations par jour au plus`,
      );
    }
    const parti = await this.annuaire.prevenir(
      telephone,
      `AfriMove : ${livreur.nom} vous invite à devenir livreur. ` +
        "Ouvrez l'app AfriMove, rubrique « Deviens livreur » : inscription en 3 minutes.",
    );
    if (!parti) {
      throw new ErreurColis(503, "envoi_impossible", "Le message n'a pas pu partir, réessayez");
    }
    await this.invitations.ajouter({ livreurId: livreur.id, at: maintenant });
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: "livreur", compagnieId: null },
      action: "livreur.invitation",
      resultat: "succes",
      cible: { type: "livreur", id: livreur.id },
      details: { vers: masquerTelephone(telephone) },
    });
    return { envoyeA: masquerTelephone(telephone), envoyeLe: maintenant };
  }

  /** Les propositions de mission en direct (la passerelle WebSocket de `/livreurs/moi/missions/direct` s'y abonne). */
  async suivreMissions(
    utilisateur: Utilisateur,
    ecouteur: Parameters<DiffusionLivraison["souscrireMissions"]>[1],
  ): Promise<() => void> {
    const livreur = await this.moi(utilisateur);
    return this.diffusion.souscrireMissions(livreur.id, ecouteur);
  }
}
