import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ColisService } from "../colis/colis.service";
import { ErreurColis } from "../colis/erreurs";
import type { ColisStocke } from "../colis/modele";
import { masquerTelephone } from "../colis/vues";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import { AnnuairePersonnes } from "../relais/annuaire";
import { initiales } from "../relais/regles";
import { RelaisService } from "../relais/relais.service";
import { ajouterHeures, enMs, versIsoDouala } from "../relais/temps";
import { DEVENIR_LIVREUR } from "./contenu";
import type { MissionLivraison } from "./modele";
import { DiffusionLivraison, LivreursRepository, MissionsRepository, PartagesSuivi } from "./ports";
import { ATTENTE_ABSENCE_MINUTES, DUREE_LIEN_SUIVI_HEURES, PARTAGES_PAR_COLIS_MAX } from "./regles";
import { MissionsService, arriveeEstimee, minutesRestantes } from "./missions.service";

/** Base des liens de suivi partagés par SMS. */
export const LIEN_SUIVI = "https://afrimove.app/suivi/";

const DEBUT_DES_TEMPS = versIsoDouala(0);

const hacher = (jeton: string): string => createHash("sha256").update(jeton).digest("hex");

const aucuneLivraison = (): ErreurColis =>
  new ErreurColis(409, "pas_en_livraison", "Aucune livraison moto en cours pour ce colis");

/**
 * La livraison moto vue par l'expéditeur et le destinataire : l'écran « Livraison en cours » (avec le
 * code à donner au livreur), le partage du suivi par un lien public sans code, le changement d'adresse
 * et le suivi en direct.
 */
@Injectable()
export class LivraisonService {
  constructor(
    private readonly colis: ColisService,
    private readonly missions: MissionsService,
    private readonly missionsRepo: MissionsRepository,
    private readonly livreurs: LivreursRepository,
    private readonly partages: PartagesSuivi,
    private readonly relais: RelaisService,
    private readonly diffusion: DiffusionLivraison,
    private readonly annuaire: AnnuairePersonnes,
    private readonly horloge: Horloge,
    private readonly audit: AuditService,
  ) {}

  private maintenant(): string {
    return versIsoDouala(this.horloge.maintenant());
  }

  /** La mission acceptée d'un colis en cours de livraison, avec son colis. */
  private async enCours(
    utilisateurId: string,
    colisId: string,
  ): Promise<{
    colis: ColisStocke;
    mission: MissionLivraison;
    role: "expediteur" | "destinataire";
  }> {
    const { colis, role } = await this.colis.colisDuVoyageur(utilisateurId, colisId);
    if (colis.etat !== "en_livraison") throw aucuneLivraison();
    const mission = await this.missionsRepo.derniereDuColis(colis.id);
    if (mission?.etat !== "acceptee" || mission.livreurId === null) throw aucuneLivraison();
    return { colis, mission, role };
  }

  /** `SchemaLivraisonColis` : la carte, le livreur, le code à donner, le prix. */
  async livraison(utilisateur: Utilisateur, colisId: string) {
    const { colis, mission } = await this.enCours(utilisateur.id, colisId);
    const livreur = mission.livreurId ? await this.livreurs.trouver(mission.livreurId) : null;
    if (!livreur) throw aucuneLivraison();
    const maintenant = this.maintenant();
    const vue = await this.colis.lire(utilisateur.id, colisId);
    const livrees = await this.missionsRepo.terminees(livreur.id, DEBUT_DES_TEMPS);

    const repli = mission.absence
      ? await this.relais.repo.trouver(mission.absence.relaisId)
      : await this.relais.relaisDeRepli(colis);

    return {
      colisId: colis.id,
      numero: colis.numero,
      statut: "en_livraison" as const,
      carte: {
        depart: { libelle: mission.trajet.depart, retireLe: mission.accepteeA ?? mission.creeA },
        livreurMinutes: minutesRestantes(mission, maintenant),
        arrivee: mission.trajet.arrivee,
      },
      arrivee: {
        libelle: mission.trajet.arrivee,
        estimee: arriveeEstimee(mission),
        poidsKg: colis.poidsKg,
        assure: colis.assure,
      },
      livreur: {
        id: livreur.id,
        initiales: initiales(livreur.nom),
        nom: livreur.nom,
        verifie: true,
        note: livreur.note,
        livraisons: livrees.length,
        moto:
          livreur.moto ??
          { moto: "Moto", velo: "Vélo", pied: "À pied", tricycle: "Tricycle" }[livreur.deplacement],
        gilet: livreur.numero,
      },
      remise: {
        destinataireALeCode: colis.code.smsDestinataire === "envoye",
        code: vue.retrait.code,
        attenteAbsenceMinutes: ATTENTE_ABSENCE_MINUTES,
        relaisDeRepli: repli?.nom ?? "le point relais le plus proche",
      },
      prix: {
        livraison: mission.prixLivraison,
        payee: colis.paiement?.etat === "paye",
        partLivreur: mission.gain,
      },
      devenir: { titre: DEVENIR_LIVREUR.titre, detail: DEVENIR_LIVREUR.detail(mission.gain) },
    };
  }

  /**
   * `SchemaSuiviPartage` : un lien public qui montre la position du livreur (jamais le code), envoyé
   * par SMS. Le lien vit 24 heures, on en crée 5 par colis au plus, et seul son haché est gardé.
   */
  async partager(utilisateur: Utilisateur, colisId: string, telephone: string) {
    const { colis } = await this.enCours(utilisateur.id, colisId);
    if ((await this.partages.compter(colis.id)) >= PARTAGES_PAR_COLIS_MAX) {
      throw new ErreurColis(
        429,
        "partages_epuises",
        `${PARTAGES_PAR_COLIS_MAX} liens de suivi par colis au plus`,
      );
    }
    const maintenant = this.maintenant();
    const jeton = randomBytes(24).toString("base64url");
    const lien = `${LIEN_SUIVI}${jeton}`;
    const moi = await this.annuaire.contact(utilisateur.id);
    const parti = await this.annuaire.prevenir(
      telephone,
      `AfriMove : ${moi.nom} partage avec vous le suivi de la livraison du colis ${colis.numero} : ${lien} ` +
        `(valable ${DUREE_LIEN_SUIVI_HEURES} h).`,
    );
    if (!parti) {
      throw new ErreurColis(503, "envoi_impossible", "Le message n'a pas pu partir, réessayez");
    }
    await this.partages.ajouter({
      jetonHache: hacher(jeton),
      colisId: colis.id,
      creeA: maintenant,
      expireA: ajouterHeures(maintenant, DUREE_LIEN_SUIVI_HEURES),
    });
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: "voyageur", compagnieId: null },
      action: "livraison.suivi_partage",
      resultat: "succes",
      cible: { type: "colis", id: colis.id },
      details: { vers: masquerTelephone(telephone) },
    });
    return { colisId: colis.id, lien, envoyeA: masquerTelephone(telephone) };
  }

  /**
   * Le suivi public d'un lien partagé : où en est la livraison, sans nom, sans adresse, sans code. Un
   * lien inconnu et un lien expiré répondent pareil.
   */
  async suiviPublic(jeton: string) {
    const partage = await this.partages.trouver(hacher(jeton));
    const maintenant = this.maintenant();
    if (!partage || enMs(maintenant) >= enMs(partage.expireA)) {
      throw new ErreurColis(404, "lien_introuvable", "Ce lien de suivi n'existe pas ou a expiré");
    }
    const colis = await this.colis.repo.trouver(partage.colisId);
    const mission = colis ? await this.missionsRepo.derniereDuColis(partage.colisId) : null;
    if (!colis || !mission) {
      throw new ErreurColis(404, "lien_introuvable", "Ce lien de suivi n'existe pas ou a expiré");
    }
    const livreur = mission.livreurId ? await this.livreurs.trouver(mission.livreurId) : null;
    const statut =
      mission.etat === "acceptee"
        ? ("en_livraison" as const)
        : mission.etat === "livree"
          ? ("livre" as const)
          : mission.etat === "repli"
            ? ("depose_en_relais" as const)
            : ("en_attente" as const);
    return {
      numero: colis.numero,
      statut,
      minutesRestantes: statut === "en_livraison" ? minutesRestantes(mission, maintenant) : 0,
      arriveeEstimee: statut === "en_livraison" ? arriveeEstimee(mission) : null,
      livreur: livreur && statut === "en_livraison" ? { initiales: initiales(livreur.nom) } : null,
    };
  }

  /**
   * `SchemaAdresseChangee` : l'adresse de livraison change tant que le colis n'est pas remis ; le
   * livreur qui a la course en est prévenu par SMS.
   */
  async changerAdresse(utilisateur: Utilisateur, colisId: string, adresse: string) {
    const { colis: lu } = await this.colis.colisDuVoyageur(utilisateur.id, colisId);
    if (lu.mode !== "moto" || (lu.etat !== "disponible" && lu.etat !== "en_livraison")) {
      throw new ErreurColis(
        409,
        "adresse_non_modifiable",
        "L'adresse ne peut changer que pour une livraison moto en cours",
      );
    }
    const { colis } = await this.colis.modifier(colisId, (c) => {
      if (c.mode !== "moto" || (c.etat !== "disponible" && c.etat !== "en_livraison")) {
        throw new ErreurColis(
          409,
          "adresse_non_modifiable",
          "L'adresse ne peut changer que pour une livraison moto en cours",
        );
      }
      return c.adresseLivraison === adresse
        ? { colis: c, resultat: null }
        : { colis: { ...c, adresseLivraison: adresse }, resultat: null };
    });

    let livreurPrevenu = false;
    const mission = await this.missionsRepo.derniereDuColis(colisId);
    if (mission && ["en_attente", "proposee", "acceptee"].includes(mission.etat)) {
      const trajet = await this.missions.trajet(colis);
      await this.missions.modifier(mission.id, (m) =>
        ["en_attente", "proposee", "acceptee"].includes(m.etat)
          ? {
              ...m,
              trajet: { ...m.trajet, arrivee: adresse },
              distanceM: trajet.distanceM,
              dureeMinutes: trajet.dureeMinutes,
            }
          : m,
      );
      if (mission.etat === "acceptee" && mission.livreurId) {
        const livreur = await this.livreurs.trouver(mission.livreurId);
        if (livreur) {
          const contact = await this.annuaire.contact(livreur.personneId);
          livreurPrevenu = await this.annuaire.prevenir(
            contact.telephone,
            `AfriMove : l'adresse de livraison du colis ${colis.numero} a changé : ${adresse}.`,
          );
        }
      }
    }
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: "voyageur", compagnieId: null },
      action: "livraison.adresse_changee",
      resultat: "succes",
      cible: { type: "colis", id: colisId },
      details: { colis: colis.numero, livreurPrevenu },
    });
    return { colisId, adresse, livreurPrevenu };
  }

  /** Les messages de position du livreur (la passerelle WebSocket de `/colis/:id/livraison/direct` s'y abonne). */
  async suivreEnDirect(
    utilisateurId: string,
    colisId: string,
    ecouteur: Parameters<DiffusionLivraison["souscrirePosition"]>[1],
  ): Promise<() => void> {
    const { colis } = await this.colis.colisDuVoyageur(utilisateurId, colisId);
    return this.diffusion.souscrirePosition(colis.id, ecouteur);
  }
}
