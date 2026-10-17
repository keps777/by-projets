import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { CommandesService } from "../billetterie/commandes.service";
import { Billets, Catalogue, Commandes } from "../billetterie/ports";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Horloge } from "../socle/horloge";
import { CONTEXTE_DESTINATAIRE } from "./achat.service";
import { CONFIG_USSD, type ConfigUssd } from "./config";
import { JournalisationUssd } from "./journalisation.service";
import type { AchatUssd } from "./modeles";
import { AchatsUssd, NotifieurBilletUssd, SessionsUssd } from "./ports";

const JOUR_MS = 24 * 60 * 60_000;

export interface ResumeSuiviUssd {
  smsEnvoyes: number;
  smsEnEchec: number;
  placesLiberees: number;
  sessionsPurgees: number;
}

/**
 * Ce qui se passe après la fin de la session USSD :
 *
 *  - **le SMS du billet** : une fois la commande payée (confirmation MoMo, webhook ou balayage des
 *    paiements, sur n'importe quelle instance), le billet part par SMS avec son code à 4 chiffres et
 *    son lien. L'envoi est idempotent (même clé que le billet du guichet) : un passage répété ou une
 *    deuxième instance n'envoie rien de plus ;
 *  - **les places abandonnées** : une réservation dont le voyageur n'a jamais demandé le paiement est
 *    libérée dès que sa session est échue, sans attendre les 15 minutes de la commande ;
 *  - **les sessions échues** sont purgées du stockage.
 *
 * Un achat dont la commande n'est jamais payée est clos après 24 h (un paiement tardif accepté par
 * les paiements est ainsi encore rattrapé pendant ce délai).
 */
@Injectable()
export class SuiviAchatsUssdService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journalLogs = new Logger("SuiviAchatsUssd");
  private minuterie: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly achats: AchatsUssd,
    private readonly commandes: Commandes,
    private readonly commandesService: CommandesService,
    private readonly billets: Billets,
    private readonly catalogue: Catalogue,
    private readonly sessions: SessionsUssd,
    private readonly notifieur: NotifieurBilletUssd,
    private readonly chiffrement: ChiffrementService,
    private readonly journal: JournalisationUssd,
    private readonly horloge: Horloge,
    @Inject(CONFIG_USSD) private readonly config: ConfigUssd,
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
  async balayer(): Promise<ResumeSuiviUssd> {
    const resume: ResumeSuiviUssd = {
      smsEnvoyes: 0,
      smsEnEchec: 0,
      placesLiberees: 0,
      sessionsPurgees: 0,
    };
    if (this.enCours) return resume;
    this.enCours = true;
    try {
      resume.sessionsPurgees = await this.sessions.purger(this.horloge.maintenant());
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

  private async suivre(achat: AchatUssd, resume: ResumeSuiviUssd): Promise<void> {
    const maintenant = this.horloge.maintenant().getTime();
    const age = maintenant - achat.creeA.getTime();
    const commande = await this.commandes.trouver(achat.commandeId);

    if (commande?.statut === "payee") {
      await this.envoyerBillets(achat, commande.billetIds, resume);
      return;
    }
    if (achat.etat === "reservee") {
      const remplacee = commande?.statut === "annulee" || commande?.statut === "expiree";
      if (remplacee || age > this.config.abandonApresMs) {
        if (!remplacee) {
          await this.commandesService.annuler(achat.commandeId, "ussd_abandon");
          resume.placesLiberees += 1;
        }
        await this.achats.transitionner(achat.commandeId, ["reservee"], "abandonnee");
        await this.journal.noter({
          operateur: achat.operateur,
          evenement: "achat_abandonne",
          code: "SESSION_ECHUE",
        });
      }
      return;
    }
    // Paiement demandé mais pas (encore) reçu : on attend, sans limite autre que ce délai.
    if (age > JOUR_MS) {
      await this.achats.transitionner(achat.commandeId, ["paiement_demande"], "terminee");
    }
  }

  private async envoyerBillets(
    achat: AchatUssd,
    billetIds: readonly string[],
    resume: ResumeSuiviUssd,
  ): Promise<void> {
    const destinataire = this.chiffrement.dechiffrer(
      achat.destinataireChiffre,
      CONTEXTE_DESTINATAIRE(achat.commandeId),
    );
    let tousEnvoyes = billetIds.length > 0;
    for (const billetId of billetIds) {
      const billet = await this.billets.trouver(billetId);
      const dc = billet ? await this.catalogue.depart(billet.departId) : null;
      if (!billet || !dc) {
        tousEnvoyes = false;
        continue;
      }
      try {
        await this.notifieur.envoyer({
          billetId,
          destinataire,
          compagnieId: dc.compagnie.id,
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
        });
        resume.smsEnvoyes += 1;
        await this.journal.noter({ operateur: achat.operateur, evenement: "sms_billet" });
      } catch (e) {
        tousEnvoyes = false;
        resume.smsEnEchec += 1;
        await this.journal.noter({
          operateur: achat.operateur,
          evenement: "sms_billet_echec",
          code: e instanceof Error ? e.name : "ERREUR",
        });
        this.journalLogs.error(
          `SMS du billet ${billetId} non envoyé (nouvel essai au prochain passage) : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    // Les billets d'une commande payée sont tous là ou rien n'est clos : le prochain passage reprend.
    if (tousEnvoyes) {
      await this.achats.transitionner(
        achat.commandeId,
        ["reservee", "paiement_demande"],
        "terminee",
      );
    }
  }
}
