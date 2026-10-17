import { Injectable } from "@nestjs/common";
import type {
  AchatUssd,
  ColisSuiviUssd,
  EntreeJournalUssd,
  EtatAchatUssd,
  PositionBusUssd,
  SessionStockee,
} from "./modeles";
import {
  AchatsUssd,
  JournalUssd,
  NotifieurBilletUssd,
  SessionsUssd,
  SuiviBusUssd,
  SuiviColisUssd,
  type DemandeSmsBillet,
} from "./ports";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage ni n'est partagé entre instances : `UssdModule` refuse de démarrer en production avec
 * elles (`durable = false`).
 */

@Injectable()
export class SessionsMemoire extends SessionsUssd {
  readonly durable = false;
  private readonly sessions = new Map<string, SessionStockee>();

  async lire(cle: string, maintenant: Date) {
    const s = this.sessions.get(cle);
    if (!s) return null;
    if (s.expireA.getTime() <= maintenant.getTime()) {
      this.sessions.delete(cle);
      return null;
    }
    return { ...s };
  }

  async ecrire(session: SessionStockee) {
    this.sessions.set(session.cle, { ...session });
  }

  async supprimer(cle: string) {
    this.sessions.delete(cle);
  }

  async purger(maintenant: Date) {
    let n = 0;
    for (const [cle, s] of this.sessions) {
      if (s.expireA.getTime() <= maintenant.getTime()) {
        this.sessions.delete(cle);
        n += 1;
      }
    }
    return n;
  }

  /** Test : les sessions stockées (jamais lisibles : la charge est chiffrée). */
  get toutes(): readonly SessionStockee[] {
    return [...this.sessions.values()];
  }
}

@Injectable()
export class JournalUssdMemoire extends JournalUssd {
  readonly durable = false;
  /** Au plus ce nombre d'entrées : la mémoire ne grossit pas sans fin. */
  static readonly PLAFOND = 10_000;
  readonly entrees: EntreeJournalUssd[] = [];

  async enregistrer(entree: EntreeJournalUssd) {
    this.entrees.push({ ...entree });
    if (this.entrees.length > JournalUssdMemoire.PLAFOND) this.entrees.shift();
  }

  de(evenement: EntreeJournalUssd["evenement"]): EntreeJournalUssd[] {
    return this.entrees.filter((e) => e.evenement === evenement);
  }
}

@Injectable()
export class AchatsUssdMemoire extends AchatsUssd {
  readonly durable = false;
  private readonly achats = new Map<string, AchatUssd>();

  async ajouter(achat: AchatUssd) {
    this.achats.set(achat.commandeId, { ...achat });
  }

  async trouver(commandeId: string) {
    const a = this.achats.get(commandeId);
    return a ? { ...a } : null;
  }

  async transitionner(commandeId: string, de: readonly EtatAchatUssd[], vers: EtatAchatUssd) {
    const a = this.achats.get(commandeId);
    if (!a || !de.includes(a.etat)) return null;
    const apres = { ...a, etat: vers };
    this.achats.set(commandeId, apres);
    return { ...apres };
  }

  async enEtat(etats: readonly EtatAchatUssd[], limite: number) {
    return [...this.achats.values()]
      .filter((a) => etats.includes(a.etat))
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .slice(0, limite)
      .map((a) => ({ ...a }));
  }
}

/** SMS du billet gardés en mémoire (tests) : un seul par billet et par numéro, comme la passerelle SMS. */
@Injectable()
export class NotifieurBilletMemoire extends NotifieurBilletUssd {
  readonly reel = false;
  readonly envoyes: DemandeSmsBillet[] = [];
  /** Test : fait échouer les envois suivants. */
  panne = false;

  async envoyer(demande: DemandeSmsBillet) {
    if (this.panne) throw new Error("SMS indisponible");
    if (
      this.envoyes.some(
        (e) => e.billetId === demande.billetId && e.destinataire === demande.destinataire,
      )
    ) {
      return;
    }
    this.envoyes.push(demande);
  }
}

/** Pas encore de suivi des colis : la touche 3 répond « colis introuvable ». */
@Injectable()
export class SuiviColisAucun extends SuiviColisUssd {
  readonly branche = false;

  async etat() {
    return null;
  }
}

/** Colis connus d'avance (tests, démonstration), par numéro et par numéro de téléphone autorisé. */
@Injectable()
export class SuiviColisMemoire extends SuiviColisUssd {
  readonly branche = false;
  private readonly colis = new Map<string, { suivi: ColisSuiviUssd; msisdns: Set<string> }>();

  ajouter(suivi: ColisSuiviUssd, ...msisdns: string[]): void {
    this.colis.set(suivi.numero.toUpperCase(), { suivi, msisdns: new Set(msisdns) });
  }

  async etat(msisdn: string, numero: string) {
    const c = this.colis.get(numero.trim().toUpperCase());
    return c && c.msisdns.has(msisdn) ? c.suivi : null;
  }
}

/** Pas encore de suivi GPS branché : la touche 4 dit qu'il n'y a pas de position. */
@Injectable()
export class SuiviBusAucun extends SuiviBusUssd {
  readonly branche = false;

  async position() {
    return null;
  }
}

/** Positions connues d'avance (tests, démonstration), par départ. */
@Injectable()
export class SuiviBusMemoire extends SuiviBusUssd {
  readonly branche = false;
  private readonly positions = new Map<string, PositionBusUssd>();

  definir(departId: string, position: PositionBusUssd): void {
    this.positions.set(departId, position);
  }

  async position(a: { departId: string }) {
    return this.positions.get(a.departId) ?? null;
  }
}
