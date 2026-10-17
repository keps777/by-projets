import { Inject, Injectable, Logger } from "@nestjs/common";
import { DiffusionTempsReel } from "../billetterie/ports";
import { AuditService } from "../socle/audit/audit.service";
import { Horloge } from "../socle/horloge";
import {
  AgregateurPaiement,
  type NotificationAgregateur,
  type RequeteNotification,
} from "./agregateur";
import { CONFIG_PAIEMENTS, type ConfigPaiements } from "./config";
import { GardeAgregateur } from "./garde-agregateur";
import type { CauseRemboursement, OperateurMobile, Paiement } from "./modeles";
import { CommandesAPayer, NotificationsTraitees, Paiements } from "./ports";
import { RemboursementsService } from "./remboursements.service";
import { Verrous } from "./verrous";
import { canalStatutPaiement, messageStatut } from "./vues";

/** Ce que l'agrégateur dit d'un encaissement, qu'il l'annonce (webhook) ou qu'on le lui demande. */
export interface IssueEncaissement {
  etat: "reussi" | "echoue";
  idFournisseur: string;
  montantFcfa: number | null;
  referenceOperateur: string | null;
  operateur: OperateurMobile | null;
  code: string | null;
  at: Date;
}

export type ResultatIssue = "applique" | "ignore" | "anomalie";

export interface ResumeNotifications {
  recus: number;
  appliques: number;
  /** Doublons, événements sans effet (déjà traités, retour en arrière), anomalies de montant. */
  ignores: number;
  /** Événements dont le paiement est inconnu. */
  inconnus: number;
}

export class FournisseurInconnu extends Error {
  constructor() {
    super("Agrégateur de paiement inconnu");
    this.name = "FournisseurInconnu";
  }
}

const codeDe = (e: unknown): string | undefined => (e as { code?: unknown } | null)?.code as string;

/** Pourquoi une commande payée n'a pas donné de billet → cause du remboursement. */
const CAUSE_REMBOURSEMENT = {
  sieges_perdus: "sieges_perdus",
  commande_annulee: "commande_annulee",
  doublon: "doublon_paiement",
} as const satisfies Record<string, CauseRemboursement>;

/**
 * Cœur des encaissements : applique l'issue d'un paiement (annoncée par webhook, trouvée en
 * interrogeant l'agrégateur, ou donnée dès l'initiation) et honore la commande.
 *
 * Garanties :
 *  - un événement rejoué est ignoré (identifiant mémorisé) et, même sous un autre identifiant, un
 *    paiement déjà reçu ne refait rien (`transitionner` compare le statut) ;
 *  - une commande n'est confirmée qu'une fois : un second paiement de la même commande est
 *    remboursé (« doublon ») ; le port refuse un second `confirmer` (index unique) ;
 *  - un paiement arrivé après l'expiration est accepté ; si les sièges sont repris, il est remboursé ;
 *  - un montant différent de celui demandé n'émet aucun billet (anomalie journalisée) ;
 *  - tout est rejouable : un échec transitoire laisse l'état tel quel et l'agrégateur (ou le
 *    balayage) recommence.
 */
@Injectable()
export class EncaissementsService {
  private readonly journal = new Logger("Encaissements");

  constructor(
    private readonly paiements: Paiements,
    private readonly traitees: NotificationsTraitees,
    private readonly commandes: CommandesAPayer,
    private readonly remboursements: RemboursementsService,
    private readonly garde: GardeAgregateur,
    private readonly agregateur: AgregateurPaiement,
    private readonly audit: AuditService,
    private readonly diffusion: DiffusionTempsReel,
    private readonly horloge: Horloge,
    private readonly verrous: Verrous,
    @Inject(CONFIG_PAIEMENTS) private readonly config: ConfigPaiements,
  ) {}

  /** Verrou d'un paiement : tous les paiements d'une même commande partagent le même. */
  cleVerrou(p: Pick<Paiement, "id" | "commandeId">): string {
    return p.commandeId ? `commande:${p.commandeId}` : `paiement:${p.id}`;
  }

  /* ------------------------------------------------------------------ webhook */

  /** Lève `FournisseurInconnu` ou `NotificationInvalide` (signature, horodatage, format). */
  async traiterNotifications(
    nomAgregateur: string,
    requete: Pick<RequeteNotification, "entetes" | "corpsBrut">,
  ): Promise<ResumeNotifications> {
    if (nomAgregateur !== this.agregateur.nom) throw new FournisseurInconnu();
    const evenements = this.agregateur.lireNotifications({
      ...requete,
      maintenant: this.horloge.maintenant(),
    });
    const resume: ResumeNotifications = {
      recus: evenements.length,
      appliques: 0,
      ignores: 0,
      inconnus: 0,
    };
    // Une erreur (base indisponible…) remonte : l'agrégateur renverra le lot, rien n'est perdu
    // puisque chaque étape est rejouable et que l'événement n'est mémorisé qu'après son traitement.
    for (const evenement of evenements) {
      const resultat = await this.appliquerNotification(evenement);
      if (resultat === "applique") resume.appliques += 1;
      else if (resultat === "inconnu") resume.inconnus += 1;
      else resume.ignores += 1;
    }
    return resume;
  }

  private async appliquerNotification(
    n: NotificationAgregateur,
  ): Promise<"applique" | "ignore" | "inconnu"> {
    const nom = this.agregateur.nom;
    if (await this.traitees.connue(nom, n.evenementId)) return "ignore";

    let resultat: "applique" | "ignore" | "inconnu";
    if (n.type === "remboursement") {
      resultat = await this.remboursements.appliquerNotification(n);
    } else {
      const paiement =
        (await this.paiements.parIdFournisseur(nom, n.idFournisseur)) ??
        (n.reference ? await this.paiements.trouver(n.reference) : null);
      if (!paiement) {
        resultat = "inconnu";
        this.journal.warn(`Événement ${n.evenementId} (${n.etat}) pour un paiement inconnu`);
        await this.audit.enregistrer({
          action: "paiement.notification_inconnue",
          resultat: "echec",
          details: {
            evenementId: n.evenementId,
            idFournisseur: n.idFournisseur,
            etat: n.etat,
            montant: n.montantFcfa,
          },
          at: this.horloge.maintenant(),
        });
      } else if (paiement.idFournisseur !== null && paiement.idFournisseur !== n.idFournisseur) {
        resultat = "ignore";
        await this.audit.enregistrer({
          action: "paiement.notification_incoherente",
          resultat: "echec",
          cible: { type: "paiement", id: paiement.id },
          details: { evenementId: n.evenementId, idFournisseur: n.idFournisseur },
          at: this.horloge.maintenant(),
        });
      } else {
        const r = await this.appliquerIssue(paiement.id, {
          etat: n.etat,
          idFournisseur: n.idFournisseur,
          montantFcfa: n.montantFcfa,
          referenceOperateur: n.referenceOperateur,
          operateur: n.operateur,
          code: n.code,
          at: n.at,
        });
        resultat = r === "applique" ? "applique" : "ignore";
      }
    }
    await this.traitees.memoriser(nom, n.evenementId, this.horloge.maintenant());
    return resultat;
  }

  /* ------------------------------------------------------------------ issue d'un encaissement */

  async appliquerIssue(paiementId: string, issue: IssueEncaissement): Promise<ResultatIssue> {
    const initial = await this.paiements.trouver(paiementId);
    if (!initial) return "ignore";
    return this.verrous.executer(this.cleVerrou(initial), async () => {
      const p = await this.paiements.trouver(paiementId);
      if (!p) return "ignore";
      const maintenant = this.horloge.maintenant();

      if (issue.etat === "echoue") {
        const apres = await this.paiements.transitionner(p.id, ["en_attente"], {
          statut: "echoue",
          cause: issue.code ?? "refuse",
          idFournisseur: p.idFournisseur ?? issue.idFournisseur,
          termineA: maintenant,
        });
        if (!apres) return "ignore";
        await this.audit.enregistrer({
          action: "paiement.echoue",
          resultat: "echec",
          cible: { type: "paiement", id: p.id },
          details: { moyen: p.moyen, raison: apres.cause },
          at: maintenant,
        });
        this.publier(apres);
        return "applique";
      }

      if (issue.montantFcfa !== null && issue.montantFcfa !== p.montant) {
        // Jamais de billet pour un montant inattendu : l'argent reste chez l'agrégateur, à rapprocher.
        this.journal.error(`Paiement ${p.id} : montant reçu différent du montant demandé`);
        await this.audit.enregistrer({
          action: "paiement.montant_inattendu",
          resultat: "echec",
          cible: { type: "paiement", id: p.id },
          details: { attendu: p.montant, recu: issue.montantFcfa },
          at: maintenant,
        });
        await this.paiements.modifier(p.id, { cause: "montant_inattendu" });
        return "anomalie";
      }

      if (p.statut === "reussi") {
        // Rejeu sous un autre identifiant : rien à refaire, sauf une confirmation restée en suspens.
        if (p.confirmation === "a_faire") await this.confirmerCommande(p);
        return "ignore";
      }

      const apres = await this.paiements.transitionner(p.id, ["en_attente", "expire", "echoue"], {
        statut: "reussi",
        idFournisseur: p.idFournisseur ?? issue.idFournisseur,
        referenceOperateur: issue.referenceOperateur ?? p.referenceOperateur,
        operateur: issue.operateur ?? p.operateur,
        cause: p.statut === "en_attente" ? null : "paiement_tardif",
        termineA: maintenant,
      });
      if (!apres) return "ignore";
      await this.audit.enregistrer({
        action: "paiement.reussi",
        resultat: "succes",
        cible: { type: "paiement", id: p.id },
        details: {
          moyen: p.moyen,
          montant: p.montant,
          tardif: p.statut !== "en_attente",
          operateur: apres.operateur,
        },
        at: maintenant,
      });
      if (apres.confirmation === "a_faire") await this.confirmerCommande(apres);
      else this.publier(apres);
      return "applique";
    });
  }

  /**
   * Honore la commande d'un paiement reçu. À appeler sous le verrou de la commande. Reprend là où
   * l'appel précédent s'est arrêté : rien n'est fait deux fois.
   */
  async confirmerCommande(p: Paiement): Promise<void> {
    if (p.commandeId === null) return;
    const maintenant = this.horloge.maintenant();
    const autres = await this.paiements.duCommande(p.commandeId);
    if (autres.some((x) => x.id !== p.id && x.confirmation === "faite")) {
      return this.cloturerSansBillets(p, "doublon");
    }

    let billetIds: string[];
    try {
      billetIds = await this.commandes.confirmer(
        p.commandeId,
        p.origine === "proche" ? "proche" : p.moyen,
      );
    } catch (e) {
      const code = codeDe(e);
      if (code === "SIEGES_PERDUS") return this.cloturerSansBillets(p, "sieges_perdus");
      if (code === "COMMANDE_ANNULEE") return this.cloturerSansBillets(p, "commande_annulee");
      throw e;
    }
    if (!(await this.paiements.confirmer(p.id, billetIds))) {
      return this.cloturerSansBillets(p, "doublon");
    }
    const apres = (await this.paiements.trouver(p.id)) ?? p;
    await this.audit.enregistrer({
      action: "paiement.commande_confirmee",
      resultat: "succes",
      cible: { type: "paiement", id: p.id },
      details: { commandeId: p.commandeId, billets: billetIds.length },
      at: maintenant,
    });
    this.publier(apres);
  }

  private async cloturerSansBillets(
    p: Paiement,
    cause: "sieges_perdus" | "commande_annulee" | "doublon",
  ): Promise<void> {
    const apres = await this.paiements.modifier(p.id, { confirmation: cause, cause });
    await this.audit.enregistrer({
      action: "paiement.sans_billet",
      resultat: "echec",
      cible: { type: "paiement", id: p.id },
      details: { commandeId: p.commandeId, raison: cause },
      at: this.horloge.maintenant(),
    });
    if (p.fournisseur === null) {
      // Encaissé à la gare : pas d'agrégateur, c'est l'agence qui rend l'argent.
      this.journal.warn(
        `Paiement ${p.id} encaissé en agence sans billet (${cause}) : à rembourser`,
      );
    } else {
      await this.remboursements.rembourserSolde(
        p,
        CAUSE_REMBOURSEMENT[cause],
        `${CAUSE_REMBOURSEMENT[cause]}:${p.id}`,
      );
    }
    if (apres) this.publier(apres);
  }

  /** Diffuse le statut au client qui attend (écran de paiement) : la perte d'un message est sans conséquence. */
  publier(p: Paiement): void {
    if (p.commandeId === null) return;
    try {
      this.diffusion.publier(
        canalStatutPaiement(p.id),
        messageStatut(p, this.horloge.maintenant()),
      );
    } catch (e) {
      this.journal.warn(`Diffusion du statut impossible : ${e instanceof Error ? e.message : "?"}`);
    }
  }

  /* ------------------------------------------------------------------ interroger l'agrégateur */

  /**
   * Webhook perdu ou en retard : demande l'état à l'agrégateur et l'applique. Un paiement dont le
   * délai est passé sans réponse devient `expire`. Ne lève pas : un agrégateur injoignable se
   * réessaie au prochain passage.
   */
  async synchroniser(paiementId: string): Promise<void> {
    const p = await this.paiements.trouver(paiementId);
    if (!p || p.statut !== "en_attente" || p.fournisseur === null) return;
    const maintenant = this.horloge.maintenant();
    try {
      const statut = await this.garde.consulter(p.id);
      if (statut && statut.etat !== "en_attente") {
        await this.appliquerIssue(p.id, {
          etat: statut.etat,
          idFournisseur: statut.idFournisseur,
          montantFcfa: statut.montantFcfa,
          referenceOperateur: statut.referenceOperateur,
          operateur: statut.operateur,
          code: statut.code,
          at: statut.at,
        });
        return;
      }
      if (statut && p.idFournisseur === null) {
        await this.paiements.modifier(p.id, { idFournisseur: statut.idFournisseur });
      }
    } catch {
      return;
    }
    if (p.expireA.getTime() <= maintenant.getTime()) await this.expirer(p.id);
  }

  private async expirer(paiementId: string): Promise<void> {
    const initial = await this.paiements.trouver(paiementId);
    if (!initial) return;
    await this.verrous.executer(this.cleVerrou(initial), async () => {
      const apres = await this.paiements.transitionner(paiementId, ["en_attente"], {
        statut: "expire",
        cause: "delai_depasse",
        termineA: this.horloge.maintenant(),
      });
      if (!apres) return;
      await this.audit.enregistrer({
        action: "paiement.expire",
        resultat: "echec",
        cible: { type: "paiement", id: apres.id },
        details: { moyen: apres.moyen },
        at: this.horloge.maintenant(),
      });
      this.publier(apres);
    });
  }

  /** Reprend la confirmation d'une commande restée en suspens (billetterie momentanément en échec). */
  private async reprendreConfirmation(paiementId: string): Promise<boolean> {
    const initial = await this.paiements.trouver(paiementId);
    if (!initial) return false;
    return this.verrous.executer(this.cleVerrou(initial), async () => {
      const p = await this.paiements.trouver(paiementId);
      if (!p || p.statut !== "reussi" || p.confirmation !== "a_faire") return false;
      await this.confirmerCommande(p);
      return true;
    });
  }

  /**
   * Balayage périodique : interroge les paiements sans nouvelle, expire ceux dont le délai est
   * passé, reprend les commandes à confirmer et les remboursements en attente.
   */
  async balayer(): Promise<{
    consultes: number;
    confirmations: number;
    remboursements: number;
  }> {
    const maintenant = this.horloge.maintenant();
    const attente = await this.paiements.enAttenteDepuis(
      new Date(maintenant.getTime() - this.config.consultationApresMs),
      100,
    );
    for (const p of attente) await this.synchroniser(p.id);

    let confirmations = 0;
    for (const p of await this.paiements.aConfirmer(100)) {
      try {
        if (await this.reprendreConfirmation(p.id)) confirmations += 1;
      } catch (e) {
        this.journal.error(
          `Confirmation de la commande ${p.commandeId ?? "?"} impossible : ${e instanceof Error ? e.message : "?"}`,
        );
      }
    }
    const remboursements = await this.remboursements.reprendre();
    return { consultes: attente.length, confirmations, remboursements };
  }
}
