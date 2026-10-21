import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { CommandesService } from "../billetterie/commandes.service";
import { Billets, Catalogue, Commandes } from "../billetterie/ports";
import { Paiements } from "../paiements/ports";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Horloge } from "../socle/horloge";
import { CONTEXTE_DESTINATAIRE } from "./achat.service";
import { CONFIG_ACHAT_WHATSAPP, type ConfigAchatWhatsApp } from "./config";
import { ConversationAchatService } from "./conversation.service";
import { JournalisationAchat } from "./journalisation.service";
import type { AchatWhatsApp } from "./modeles";
import {
  AchatsWhatsApp,
  ComptesAchat,
  ConversationsAchat,
  EnvoiAchatImpossible,
  MessagerieAchat,
  type MessageAchat,
} from "./ports";
import { textes } from "./textes";

const JOUR_MS = 24 * 60 * 60_000;

export interface ResumeSuiviAchat {
  billetsEnvoyes: number;
  billetsEnEchec: number;
  echecsAnnonces: number;
  placesLiberees: number;
  conversationsPurgees: number;
}

/**
 * Ce qui se passe après « Oui », quand le voyageur valide sur son téléphone :
 *
 *  - **le billet** : une fois la commande payée (confirmation MoMo, webhook ou balayage des
 *    paiements, sur n'importe quelle instance), le billet part dans la conversation
 *    (« ✓ Payé. Billet …, code … »). L'envoi est idempotent (clé par billet) : un passage répété ou
 *    une deuxième instance n'envoie rien de plus ;
 *  - **le paiement qui échoue** (refusé sur le téléphone, délai dépassé) ou **la place reprise**
 *    (paiement tardif, places revendues, remboursement) : le voyageur en est prévenu, une fois ;
 *  - **les places abandonnées** : une réservation dont le voyageur n'a jamais demandé le paiement est
 *    libérée dès que sa conversation est échue, sans attendre les 15 minutes de la commande ;
 *  - **les conversations échues** sont purgées du stockage.
 *
 * Un achat dont la commande n'est jamais payée est clos après 24 h (un paiement tardif accepté par
 * les paiements est ainsi encore rattrapé pendant ce délai).
 */
@Injectable()
export class SuiviAchatsWhatsAppService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journalLogs = new Logger("SuiviAchatsWhatsApp");
  private minuterie: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly achats: AchatsWhatsApp,
    private readonly commandes: Commandes,
    private readonly commandesService: CommandesService,
    private readonly billets: Billets,
    private readonly catalogue: Catalogue,
    private readonly paiements: Paiements,
    private readonly conversationsStockage: ConversationsAchat,
    private readonly conversation: ConversationAchatService,
    private readonly messagerie: MessagerieAchat,
    private readonly comptes: ComptesAchat,
    private readonly chiffrement: ChiffrementService,
    private readonly journal: JournalisationAchat,
    private readonly horloge: Horloge,
    @Inject(CONFIG_ACHAT_WHATSAPP) private readonly config: ConfigAchatWhatsApp,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.balayageMs <= 0) return;
    this.minuterie = setInterval(() => void this.balayer(), this.config.balayageMs);
    this.minuterie.unref();
  }

  onApplicationShutdown(): void {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
  }

  /** Un passage ; deux passages ne se chevauchent jamais dans le processus. */
  async balayer(): Promise<ResumeSuiviAchat> {
    const resume: ResumeSuiviAchat = {
      billetsEnvoyes: 0,
      billetsEnEchec: 0,
      echecsAnnonces: 0,
      placesLiberees: 0,
      conversationsPurgees: 0,
    };
    if (this.enCours) return resume;
    this.enCours = true;
    try {
      resume.conversationsPurgees = await this.conversationsStockage.purger(
        this.horloge.maintenant(),
      );
      for (const achat of await this.achats.enEtat(["reservee", "paiement_demande"], 200)) {
        try {
          await this.suivre(achat, resume);
        } catch (e) {
          this.journalLogs.error(
            `Suivi de l'achat ${achat.commandeId} interrompu : ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    } catch (e) {
      this.journalLogs.error(`Balayage interrompu : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.enCours = false;
    }
    return resume;
  }

  private numeroDe(achat: AchatWhatsApp): string {
    return this.chiffrement.dechiffrer(
      achat.destinataireChiffre,
      CONTEXTE_DESTINATAIRE(achat.commandeId),
    );
  }

  private async suivre(achat: AchatWhatsApp, resume: ResumeSuiviAchat): Promise<void> {
    const age = this.horloge.maintenant().getTime() - achat.creeA.getTime();
    const commande = await this.commandes.trouver(achat.commandeId);

    if (commande?.statut === "payee") {
      await this.envoyerBillets(achat, commande.billetIds, age, resume);
      return;
    }
    if (achat.etat === "reservee") {
      const remplacee = commande?.statut === "annulee" || commande?.statut === "expiree";
      if (remplacee || age > this.config.abandonApresMs) {
        if (!remplacee) {
          await this.commandesService.annuler(achat.commandeId, "whatsapp_abandon");
          resume.placesLiberees += 1;
        }
        await this.achats.transitionner(achat.commandeId, ["reservee"], "abandonnee");
        await this.journal.noter({ evenement: "achat_abandonne", code: "SESSION_ECHUE" });
      }
      return;
    }
    // Paiement demandé mais pas (encore) confirmé : on attend, ou on annonce l'échec.
    await this.surveillerPaiement(achat, age, resume);
  }

  private async surveillerPaiement(
    achat: AchatWhatsApp,
    age: number,
    resume: ResumeSuiviAchat,
  ): Promise<void> {
    const paiements = (await this.paiements.duCommande(achat.commandeId)).sort(
      (a, b) => b.creeA.getTime() - a.creeA.getTime(),
    );
    const reussi = paiements.find((p) => p.statut === "reussi");
    if (reussi) {
      // Encaissé mais pas de billet : les places ont été reprises, la commande annulée, ou un
      // doublon a été remboursé. Si les billets sont seulement « à émettre », les paiements finissent.
      if (["sieges_perdus", "commande_annulee", "doublon"].includes(reussi.confirmation)) {
        await this.annoncer(achat, "place_reprise", reussi.confirmation, resume);
      }
    } else {
      const dernier = paiements[0];
      if (dernier && (dernier.statut === "echoue" || dernier.statut === "expire")) {
        await this.commandesService.annuler(achat.commandeId, "whatsapp_paiement_echoue");
        resume.placesLiberees += 1;
        await this.annoncer(achat, "paiement_echoue", dernier.cause ?? dernier.statut, resume);
      }
    }
    if (age > JOUR_MS) {
      await this.achats.transitionner(achat.commandeId, ["paiement_demande"], "terminee");
    }
  }

  /** Prévient le voyageur (une fois) que le paiement n'a pas abouti ou que sa place est reprise. */
  private async annoncer(
    achat: AchatWhatsApp,
    evenement: "paiement_echoue" | "place_reprise",
    code: string,
    resume: ResumeSuiviAchat,
  ): Promise<void> {
    const numero = this.numeroDe(achat);
    const t = textes(achat.langue);
    try {
      await this.messagerie.envoyer({
        destinataire: numero,
        texte: evenement === "paiement_echoue" ? t.paiementEchoue : t.placeReprise,
        cle: `achat-wa:${evenement}:${achat.commandeId}`,
      });
    } catch (e) {
      if (!(e instanceof EnvoiAchatImpossible)) throw e; // passager : nouvel essai au prochain passage
    }
    await this.achats.transitionner(achat.commandeId, ["reservee", "paiement_demande"], "echouee");
    await this.conversation.terminerPour(numero, achat.commandeId);
    await this.journal.noter({ evenement, numero, code });
    resume.echecsAnnonces += 1;
  }

  private async envoyerBillets(
    achat: AchatWhatsApp,
    billetIds: readonly string[],
    age: number,
    resume: ResumeSuiviAchat,
  ): Promise<void> {
    const numero = this.numeroDe(achat);
    const prenom = await this.comptes.prenomDe(achat.voyageurId);
    const t = textes(achat.langue);
    let tousEnvoyes = billetIds.length > 0;
    for (const billetId of billetIds) {
      const billet = await this.billets.trouver(billetId);
      const dc = billet ? await this.catalogue.depart(billet.departId) : null;
      if (!billet || !dc) {
        tousEnvoyes = false;
        continue;
      }
      const message: MessageAchat = {
        destinataire: numero,
        texte: t.billetPaye({ numero: billet.numero, code: billet.codeBillet, prenom }),
        cle: `achat-wa:billet:${billetId}`,
        compagnieId: dc.compagnie.id,
        billet: {
          billetId,
          demandeurId: achat.voyageurId,
          variables: {
            compagnie: dc.compagnie.nom,
            origine: dc.origine.ville,
            destination: dc.destination.ville,
            departA: new Date(dc.depart.heureDepart),
            siege: billet.siege !== null ? String(billet.siege) : "-",
            code: billet.codeBillet,
            lien: `${this.config.baseLienBillet}${billet.id}`,
          },
        },
      };
      try {
        await this.messagerie.envoyer(message);
        resume.billetsEnvoyes += 1;
        await this.journal.noter({ evenement: "billet_envoye", numero });
      } catch (e) {
        resume.billetsEnEchec += 1;
        const definitif = e instanceof EnvoiAchatImpossible;
        if (!definitif) tousEnvoyes = false;
        await this.journal.noter({
          evenement: "billet_envoi_echec",
          numero,
          code: e instanceof EnvoiAchatImpossible ? e.code : e instanceof Error ? e.name : "ERREUR",
        });
        this.journalLogs.error(
          `Billet ${billetId} non envoyé par WhatsApp (${definitif ? "définitif" : "nouvel essai au prochain passage"}) : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    // Les billets d'une commande payée sont tous partis ou rien n'est clos : le prochain passage
    // reprend. Passé 24 h, on renonce (le voyageur retrouve son billet dans l'application).
    if (tousEnvoyes || age > JOUR_MS) {
      await this.achats.transitionner(
        achat.commandeId,
        ["reservee", "paiement_demande"],
        tousEnvoyes ? "terminee" : "echouee",
      );
      await this.conversation.terminerPour(numero, achat.commandeId);
    }
  }
}
