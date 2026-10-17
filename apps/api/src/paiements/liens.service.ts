import { createHash, randomBytes, randomUUID } from "node:crypto";
import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { Refus, conflit, inconnu, invalide } from "../billetterie/erreurs";
import { ProchesVoyageur } from "../billetterie/ports";
import { versIsoDouala } from "../billetterie/temps";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { TelephoneInvalide, normaliserTelephone } from "../socle/comptes/telephone";
import { Horloge } from "../socle/horloge";
import { CONFIG_PAIEMENTS, type ConfigPaiements } from "./config";
import { ModeDegradeService } from "./mode-degrade.service";
import type { LienPaiement, Paiement } from "./modeles";
import { PaiementsService, type DemandePaiement } from "./paiements.service";
import {
  AnnuaireVoyageurs,
  CommandesAPayer,
  ComptesReversement,
  LiensPaiement,
  NotifieurPaiements,
  type CommandeAPayer,
} from "./ports";
import { TEXTES, lienSansSchema, masquerTelephone, prenomPourSms } from "./regles";

export const empreinteDuJeton = (jeton: string): string =>
  createHash("sha256").update(jeton).digest("hex");

/** Le jeton du lien : 256 bits d'aléa, sans caractère à échapper dans une adresse. */
const genererJeton = (): string => randomBytes(32).toString("base64url");

const JETON = /^[A-Za-z0-9_-]{43}$/;

export interface DemandeLien {
  procheId?: string | undefined;
  telephone?: string | undefined;
}

export interface LienCree {
  commandeId: string;
  url: string;
  expireA: string;
  envoyeA?: string;
}

/**
 * « Demander à un proche de payer » : le voyageur crée un lien pour sa commande, l'envoie par SMS à
 * son proche (numéro d'un proche enregistré ou saisi), le proche règle sans compte, le voyageur
 * reçoit son billet.
 *
 * Sécurité : le lien contient un jeton de 256 bits dont seule l'empreinte est gardée ; il expire avec
 * la commande (15 minutes) ; en créer un nouveau révoque le précédent ; il ne donne accès qu'à
 * l'aperçu de la commande (trajet, prix, prénom du voyageur) et au paiement de cette commande.
 */
@Injectable()
export class LiensService {
  private readonly journal = new Logger("LiensPaiement");

  constructor(
    private readonly liens: LiensPaiement,
    private readonly commandes: CommandesAPayer,
    private readonly proches: ProchesVoyageur,
    private readonly annuaire: AnnuaireVoyageurs,
    private readonly comptes: ComptesReversement,
    private readonly notifieur: NotifieurPaiements,
    private readonly mode: ModeDegradeService,
    private readonly paiements: PaiementsService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_PAIEMENTS) private readonly config: ConfigPaiements,
  ) {}

  /* ------------------------------------------------------------------ côté voyageur */

  async creer(voyageur: Utilisateur, commandeId: string, demande: DemandeLien): Promise<LienCree> {
    await this.mode.exigerEnLigne();
    const commande = await this.commandes.trouver(commandeId);
    if (!commande || commande.voyageurId !== voyageur.id) {
      throw inconnu("COMMANDE_INCONNUE", "Commande introuvable");
    }
    const maintenant = this.horloge.maintenant();
    if (commande.statut === "payee") {
      throw conflit("COMMANDE_DEJA_PAYEE", "Cette commande est déjà payée");
    }
    if (commande.statut !== "en_attente_paiement" || commande.expireA <= maintenant) {
      throw conflit("COMMANDE_EXPIREE", "Cette commande a expiré : choisis de nouveau ta place");
    }
    if ((await this.comptes.compte(commande.compagnieId)) === null) {
      throw new Refus(
        422,
        "COMPAGNIE_SANS_COMPTE",
        "Cette compagnie ne peut pas encore être payée en ligne",
      );
    }

    // Le numéro du proche : celui d'un proche enregistré, sinon celui qui est saisi, sinon aucun
    // (le voyageur copie le lien lui-même).
    let destinataire: string | null = null;
    if (demande.procheId !== undefined) {
      const proche = await this.proches.trouver(voyageur.id, demande.procheId);
      if (!proche) throw inconnu("PROCHE_INCONNU", "Proche introuvable");
      if (proche.telephone === null) {
        throw invalide("PROCHE_SANS_TELEPHONE", "Ce proche n'a pas de numéro de téléphone");
      }
      destinataire = this.normaliser(proche.telephone);
    } else if (demande.telephone !== undefined) {
      destinataire = this.normaliser(demande.telephone);
    }

    const jeton = genererJeton();
    const lien: LienPaiement = {
      id: randomUUID(),
      commandeId: commande.id,
      empreinte: empreinteDuJeton(jeton),
      creePar: voyageur.id,
      creeA: maintenant,
      expireA: commande.expireA,
      envoyeA: destinataire ? masquerTelephone(destinataire) : null,
      revoqueA: null,
    };
    await this.liens.remplacer(lien);
    const url = `${this.config.urlLienProche}/${jeton}`;

    await this.audit.enregistrer({
      acteur: { id: voyageur.id, role: voyageur.role, compagnieId: voyageur.compagnieId },
      action: "paiement.lien_proche_cree",
      resultat: "succes",
      cible: { type: "commande", id: commande.id },
      details: { lienId: lien.id, envoye: destinataire !== null },
      at: maintenant,
    });

    const sortie: LienCree = {
      commandeId: commande.id,
      url,
      expireA: versIsoDouala(commande.expireA),
    };
    if (destinataire !== null) {
      const envoye = await this.envoyer(voyageur, commande, destinataire, url, lien.id);
      if (envoye) sortie.envoyeA = destinataire;
    }
    return sortie;
  }

  private normaliser(brut: string): string {
    try {
      return normaliserTelephone(brut);
    } catch (e) {
      if (e instanceof TelephoneInvalide) {
        throw invalide("TELEPHONE_INVALIDE", "Numéro de téléphone invalide");
      }
      throw e;
    }
  }

  /**
   * L'échec de l'envoi ne fait pas échouer la création : le lien existe et le voyageur peut le
   * transmettre lui-même. Seul un dépassement de quota (429) remonte, pour que l'écran le dise.
   */
  private async envoyer(
    voyageur: Utilisateur,
    commande: CommandeAPayer,
    telephone: string,
    url: string,
    lienId: string,
  ): Promise<boolean> {
    const prenom = prenomPourSms(await this.annuaire.prenom(voyageur.id)) ?? "Un proche";
    const total = `${commande.total.toLocaleString("fr-FR").replace(/[  ]/g, " ")} F`;
    try {
      await this.notifieur.envoyerLien({
        telephone,
        texte: TEXTES.lienProche(prenom, commande.libelle, total, lienSansSchema(url)),
        cle: `lien-proche:${lienId}`,
        compagnieId: commande.compagnieId,
        demandeurId: voyageur.id,
        commandeId: commande.id,
      });
      return true;
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 429) throw e;
      this.journal.warn(`SMS du lien impossible : ${e instanceof Error ? e.name : "erreur"}`);
      await this.audit.enregistrer({
        action: "paiement.lien_proche_sms_echec",
        resultat: "echec",
        cible: { type: "commande", id: commande.id },
        details: { lienId: lienId },
        at: this.horloge.maintenant(),
      });
      return false;
    }
  }

  /* ------------------------------------------------------------------ côté proche (sans compte) */

  /** Retrouve la commande d'un lien. 404 si le jeton est inconnu ou révoqué, 410 s'il est périmé. */
  private async resoudre(jeton: string): Promise<{ lien: LienPaiement; commande: CommandeAPayer }> {
    const lien = JETON.test(jeton) ? await this.liens.parEmpreinte(empreinteDuJeton(jeton)) : null;
    if (!lien || lien.revoqueA !== null) {
      throw inconnu("LIEN_INCONNU", "Ce lien de paiement n'existe pas ou a été remplacé");
    }
    const commande = await this.commandes.trouver(lien.commandeId);
    if (!commande) throw inconnu("LIEN_INCONNU", "Ce lien de paiement n'existe pas");
    return { lien, commande };
  }

  private exigerPayable(lien: LienPaiement, commande: CommandeAPayer): void {
    if (commande.statut === "payee") {
      throw conflit("COMMANDE_DEJA_PAYEE", "Cette commande est déjà payée");
    }
    if (
      commande.statut !== "en_attente_paiement" ||
      lien.expireA <= this.horloge.maintenant() ||
      commande.expireA <= this.horloge.maintenant()
    ) {
      throw new Refus(410, "LIEN_EXPIRE", "Ce lien de paiement a expiré");
    }
  }

  /** Ce que voit le proche avant de payer : le trajet, le prix, qui le demande. Rien de plus. */
  async apercu(jeton: string) {
    const { lien, commande } = await this.resoudre(jeton);
    const prenom = await this.annuaire.prenom(commande.voyageurId);
    const etat = await this.mode.etat();
    const payable =
      commande.statut === "en_attente_paiement" &&
      lien.expireA > this.horloge.maintenant() &&
      commande.expireA > this.horloge.maintenant();
    return {
      libelle: commande.libelle,
      voyageur: prenom,
      lignes: commande.lignes.map((l) => ({
        code: l.code,
        libelle: l.libelle,
        montant: l.montant,
      })),
      total: commande.total,
      ...(commande.conversion ? { conversion: commande.conversion } : {}),
      statut: commande.statut,
      expireA: versIsoDouala(lien.expireA),
      payable: payable && !etat.degrade,
      modeDegrade: etat.degrade,
    };
  }

  async payer(jeton: string, demande: DemandePaiement): Promise<Paiement> {
    const { lien, commande } = await this.resoudre(jeton);
    this.exigerPayable(lien, commande);
    return this.paiements.payerCommandeParProche(commande, demande);
  }

  async statutPaiement(jeton: string, paiementId: string): Promise<Paiement> {
    const { commande } = await this.resoudre(jeton);
    return this.paiements.statutDeLaCommande(commande.id, paiementId);
  }
}
