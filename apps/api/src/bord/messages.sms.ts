import { Injectable, Logger } from "@nestjs/common";
import { PasserelleSmsService } from "../sms/passerelle.service";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { SmsGateway } from "../socle/sms/sms.gateway";
import { BASE_LIEN_BILLET_DEFAUT } from "../vendeurs/options";
import { hhmmDouala } from "../billetterie/temps";
import {
  MessagesBord,
  type DemandeConstat,
  type DemandeIncident,
  type DemandeRetard,
  type DemandeSmsBilletBord,
} from "./ports";

const court = (texte: string, max: number): string => texte.trim().slice(0, max);
const heureSms = (iso: string): string => hhmmDouala(iso).replace(":", "h");

/**
 * Les messages du bord par SMS.
 *
 * - le billet vendu en route : gabarit `billet` de la passerelle (même clé d'idempotence que le billet du
 *   guichet, `billet:<id>:<index du numéro>`) ;
 * - le retard : gabarit `retard`, un SMS par voyageur à bord, clé `retard:<événement>:<billet>` ;
 * - l'incident et le constat du contrôle : texte libre par `SmsGateway`, aux voyageurs, aux superviseurs
 *   de la gare ou au patron.
 *
 * Une panne de SMS est notée, jamais propagée : l'événement du terrain est enregistré quoi qu'il arrive.
 */
@Injectable()
export class MessagesBordSms extends MessagesBord {
  private readonly journal = new Logger("MessagesBordSms");

  constructor(
    private readonly passerelle: PasserelleSmsService,
    private readonly sms: SmsGateway,
    private readonly personnes: PersonnesRepository,
    private readonly comptes: ComptesService,
  ) {
    super();
  }

  /** Même lien que les billets des vendeurs : `VENDEURS_BASE_LIEN_BILLET`, sinon l'adresse par défaut. */
  private readonly baseLienBillet =
    process.env["VENDEURS_BASE_LIEN_BILLET"] || BASE_LIEN_BILLET_DEFAUT;

  async envoyerBillet(d: DemandeSmsBilletBord): Promise<boolean> {
    try {
      await this.passerelle.envoyerBillet({
        billetId: d.billetId,
        destinataire: d.telephone,
        variables: {
          compagnie: court(d.compagnie, 30),
          origine: court(d.origine, 24),
          destination: court(d.destination, 24),
          departA: new Date(d.departA),
          siege: d.siege !== null ? String(d.siege) : "-",
          code: d.code,
          lien: `${this.baseLienBillet}${d.billetId}`,
        },
        compagnieId: d.compagnieId,
        demandeurId: d.convoyeurId,
      });
      return true;
    } catch (e) {
      this.journal.warn(`SMS du billet ${d.numero} non envoyé (${(e as Error).name})`);
      return false;
    }
  }

  async prevenirRetard(d: DemandeRetard): Promise<{ voyageurs: number; gare: boolean }> {
    let prevenus = 0;
    for (const v of d.voyageurs) {
      try {
        await this.passerelle.envoyer({
          type: "retard",
          variables: {
            compagnie: court(d.compagnie, 30),
            origine: court(d.origine, 24),
            destination: court(d.destination, 24),
            departA: new Date(d.departA),
            minutes: Math.min(720, Math.max(1, d.minutes)),
            arriveeA: new Date(d.arriveeEstimeeA),
          },
          destinataire: v.telephone,
          cle: `retard:${d.evenementId}:${v.billetId}`,
          compagnieId: d.compagnieId,
        });
        prevenus += 1;
      } catch (e) {
        this.journal.warn(`SMS de retard non envoyé (${(e as Error).name})`);
      }
    }
    const gare = await this.prevenirResponsables(
      d.compagnieId,
      ["superviseur"],
      d.gareId,
      `AfriMove : le bus ${d.immatriculation} (${court(d.origine, 24)} > ${court(d.destination, 24)}, ` +
        `${heureSms(d.departA)}) aura ${d.minutes} min de retard. ${prevenus} voyageur(s) prévenu(s).`,
    );
    return { voyageurs: prevenus, gare };
  }

  async prevenirIncident(d: DemandeIncident): Promise<{ voyageurs: number; gare: boolean }> {
    const heure = heureSms(d.departA);
    const aux = `${court(d.origine, 24)} > ${court(d.destination, 24)}`;
    let voyageurs = 0;
    for (const v of d.voyageurs) {
      try {
        await this.sms.envoyer(
          v.telephone,
          `${court(d.compagnie, 30)} : ${d.libelleNature.toLowerCase()} sur le bus ${aux} de ${heure}. ` +
            "Nous vous tenons informés.",
        );
        voyageurs += 1;
      } catch (e) {
        this.journal.warn(`SMS d'incident non envoyé (${(e as Error).name})`);
      }
    }
    const gare = await this.prevenirResponsables(
      d.compagnieId,
      ["superviseur"],
      d.gareId,
      `AfriMove : ${d.libelleNature.toLowerCase()} sur le bus ${d.immatriculation} (${aux}, ${heure}). ` +
        `${voyageurs} voyageur(s) prévenu(s).`,
    );
    return { voyageurs, gare };
  }

  prevenirPatron(d: DemandeConstat): Promise<boolean> {
    return this.prevenirResponsables(d.compagnieId, ["patron"], null, d.texte);
  }

  /** Envoie le texte aux comptes actifs de ces rôles (limités à la gare quand elle est donnée). */
  private async prevenirResponsables(
    compagnieId: string,
    roles: readonly ("patron" | "superviseur")[],
    gareId: string | null,
    texte: string,
  ): Promise<boolean> {
    let envoye = false;
    try {
      const personnes = await this.personnes.listerActifsParRoles(compagnieId, roles);
      for (const p of personnes) {
        if (gareId !== null && p.gareId !== gareId) continue;
        try {
          await this.sms.envoyer(this.comptes.telephoneEnClair(p), texte);
          envoye = true;
        } catch (e) {
          this.journal.warn(`SMS au responsable non envoyé (${(e as Error).name})`);
        }
      }
    } catch (e) {
      this.journal.warn(`Responsables introuvables (${(e as Error).name})`);
    }
    return envoye;
  }
}
