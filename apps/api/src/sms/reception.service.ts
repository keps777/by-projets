import { Injectable, Logger } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import { type RecuLivraison, type RequeteRecu } from "./fournisseur";
import { JournalSms } from "./journal";
import { RegistreFournisseurs } from "./registre";
import { STATUTS_EN_ATTENTE, type MessageSms, type StatutSms } from "./types";

export class FournisseurInconnu extends Error {
  constructor() {
    super("Fournisseur SMS inconnu");
    this.name = "FournisseurInconnu";
  }
}

export interface ResumeRecus {
  recus: number;
  appliques: number;
  /** Doublons, retours en arrière (un « envoyé » après un « livré »), messages déjà terminés. */
  ignores: number;
  /** Accusés d'un message que le journal ne connaît pas. */
  inconnus: number;
}

/** Statuts qu'un accusé de livraison peut encore faire évoluer. */
const AVANT_LIVRAISON: readonly StatutSms[] = [
  ...STATUTS_EN_ATTENTE,
  "envoye",
  // Un message vu en échec, annulé ou périmé a peut-être été accepté malgré tout (réponse perdue) :
  // l'accusé de l'opérateur fait foi.
  "echec",
  "expire",
  "annule",
];
const AVANT_ENVOI: readonly StatutSms[] = [...STATUTS_EN_ATTENTE, "echec", "expire", "annule"];

/**
 * Reçoit les accusés de livraison du fournisseur (webhook) et fait avancer le statut des
 * messages. Les accusés peuvent arriver en double, dans le désordre, ou avant que l'envoi soit
 * enregistré : seul compte le sens `envoyé → livré | non livré`, jamais un retour en arrière.
 */
@Injectable()
export class ReceptionRecusService {
  private readonly logger = new Logger("SmsRecus");

  constructor(
    private readonly journal: JournalSms,
    private readonly registre: RegistreFournisseurs,
    private readonly horloge: Horloge,
  ) {}

  /** Lève `FournisseurInconnu` ou `RecuInvalide` (signature, horodatage, format). */
  async traiter(
    nomFournisseur: string,
    requete: Pick<RequeteRecu, "entetes" | "corpsBrut">,
  ): Promise<ResumeRecus> {
    const fournisseur = this.registre.parNom(nomFournisseur);
    if (!fournisseur) throw new FournisseurInconnu();
    const recus = fournisseur.lireRecus({ ...requete, maintenant: this.horloge.maintenant() });

    const resume: ResumeRecus = { recus: recus.length, appliques: 0, ignores: 0, inconnus: 0 };
    for (const recu of recus) {
      const resultat = await this.appliquer(nomFournisseur, recu);
      if (resultat === "applique") resume.appliques += 1;
      else if (resultat === "ignore") resume.ignores += 1;
      else resume.inconnus += 1;
    }
    return resume;
  }

  private async retrouver(fournisseur: string, recu: RecuLivraison): Promise<MessageSms | null> {
    const parId = await this.journal.trouverParFournisseur(fournisseur, recu.idFournisseur);
    if (parId) return parId;
    if (!recu.reference) return null;
    // L'accusé a doublé la réponse d'envoi : on le retrouve par notre référence.
    const parReference = await this.journal.trouver(recu.reference);
    return parReference &&
      (parReference.fournisseur === null || parReference.fournisseur === fournisseur)
      ? parReference
      : null;
  }

  private async appliquer(
    fournisseur: string,
    recu: RecuLivraison,
  ): Promise<"applique" | "ignore" | "inconnu"> {
    const message = await this.retrouver(fournisseur, recu);
    if (!message) {
      this.logger.warn(`Accusé ${recu.etat} pour un message inconnu (${recu.idFournisseur})`);
      return "inconnu";
    }

    const identite = { fournisseur, idFournisseur: recu.idFournisseur };
    const facture = message.coutFcfa === 0 ? { coutFcfa: message.coutEstimeFcfa } : {};
    const envoyeA = message.envoyeA ?? recu.at;

    let maj: MessageSms | null;
    if (recu.etat === "envoye") {
      maj = await this.journal.modifier(
        message.id,
        { statut: "envoye", ...identite, envoyeA, ...facture },
        AVANT_ENVOI,
      );
    } else if (recu.etat === "livre") {
      maj = await this.journal.modifier(
        message.id,
        {
          statut: "livre",
          ...identite,
          envoyeA,
          livreA: recu.at,
          derniereErreur: null,
          ...facture,
        },
        AVANT_LIVRAISON,
      );
    } else {
      maj = await this.journal.modifier(
        message.id,
        {
          statut: "non_livre",
          ...identite,
          envoyeA,
          derniereErreur: recu.code ?? "non_livre",
          ...facture,
        },
        AVANT_LIVRAISON,
      );
    }
    if (!maj) return "ignore";
    this.logger.log(
      `SMS ${message.id} (${message.type}) : ${recu.etat} (accusé de ${fournisseur})`,
    );
    return "applique";
  }
}
