import { Injectable, Logger } from "@nestjs/common";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { lireCloture, lireComptage, lireOuverture, type DonneesOuverture } from "./evenements";
import { conflit, interdit, introuvable, invalide, requeteInvalide } from "./erreurs";
import { francs, uuidDeterministe } from "./format";
import { IdempotenceService } from "./journal/idempotence.service";
import { AUTEUR_SYSTEME, JournalSigneService } from "./journal/journal.service";
import {
  AlertesPatron,
  GuichetsAgence,
  MouvementsCaisse,
  ReglesAgence,
  SessionsCaisse,
  type Decompte,
  type SessionStockee,
} from "./ports";
import {
  cashAttendu,
  coupuresCompletes,
  doitCloturerAuto,
  evaluerEcart,
  heureClotureAuto,
  totalCoupures,
  type Coupure,
  type StatutEcart,
} from "./regles";
import { aammjjDouala, debutJourDoualaMs, joursEntre, MS_PAR_JOUR, versIsoDouala } from "./temps";
import type { EvenementLu } from "./validation";

/** La session de caisse telle que la lit l'écran « Caisse » (`SchemaCaisseSession`). */
export interface CaisseSessionVue {
  sessionId: string;
  numero: string;
  agent: { id: string; nom: string };
  guichetRang: number;
  etat: SessionStockee["etat"];
  ouverteA: string;
  fondDeCaisse: number;
  periode: { debut: string; fin: string };
  decompte: Decompte;
  cashAttendu: number;
  comptage: { coupures: Coupure[]; pieces: number; total: number };
  ecart: { montant: number; statut: StatutEcart; tolerance: number; hier: number; semaine: number };
}

export interface ResultatCaisse {
  session: CaisseSessionVue;
}

const FORMAT_NUMERO_SESSION = /^K-([A-Z0-9]{2,8})-(\d{6})-(\d+)-(\d+)$/;

/** Message du journal pour une clôture : ce qu'il manque ou ce qu'il y a en trop. */
function texteEcart(ecart: number): string {
  return ecart === 0 ? "écart nul" : `écart ${francs(ecart)}`;
}

/**
 * Sessions de caisse : ouverture, comptage, clôture (y compris la clôture automatique de minuit) et
 * lecture. Tout passe par des événements (`caisse.ouverte`, `caisse.comptee`, `caisse.cloturee`) dont
 * l'UUID, créé sur l'appareil, rend chaque écriture idempotente.
 *
 * Le cash attendu est toujours calculé ici, à partir des mouvements enregistrés (fond de caisse + billets
 * cash + colis cash − annulations validées ; le MoMo n'entre pas dans la caisse). Ce que l'appareil
 * annonce n'est qu'un témoin : un désaccord est tracé (`divergenceAppareil`) mais c'est le calcul du
 * serveur qui fait foi, au franc près.
 */
@Injectable()
export class CaisseService {
  private readonly logger = new Logger("CaisseService");

  constructor(
    private readonly sessions: SessionsCaisse,
    private readonly mouvements: MouvementsCaisse,
    private readonly guichets: GuichetsAgence,
    private readonly regles: ReglesAgence,
    private readonly alertes: AlertesPatron,
    private readonly personnes: PersonnesRepository,
    private readonly journal: JournalSigneService,
    private readonly idem: IdempotenceService,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ écritures */

  async ouvrir(corps: unknown, u: Utilisateur) {
    const e = lireOuverture(corps);
    this.verifierAuteur(e, u);
    return this.idem.executer(e.id, async (): Promise<ResultatCaisse> => {
      const d = e.donnees;
      const guichet = await this.guichets.trouver(d.guichetId);
      if (!guichet) throw introuvable("GUICHET_INCONNU", "Guichet inconnu");
      if (u.gareId !== guichet.gareId) {
        throw interdit("GUICHET_AUTRE_GARE", "Ce guichet n'est pas celui de votre gare");
      }
      this.verifierNumero(d, e.at, guichet.rang, guichet.gareCode);

      const session: SessionStockee = {
        id: d.sessionId,
        numero: d.numero,
        guichetId: guichet.id,
        guichetRang: guichet.rang,
        gareId: guichet.gareId,
        compagnieId: guichet.compagnieId,
        agentId: u.id,
        fondDeCaisse: d.fondDeCaisse,
        tolerance: await this.regles.tolerance(guichet.compagnieId),
        ouverteA: e.at,
        reouverteA: null,
        etat: "ouverte",
        comptage: null,
        cloture: null,
        validation: null,
        refus: [],
        evenementOuvertureId: e.id,
      };
      const resultat = await this.sessions.creer(session);
      let courante = session;
      if (resultat !== "ok") {
        const existante = await this.sessions.trouver(d.sessionId);
        if (resultat === "identifiant_pris" && existante?.evenementOuvertureId === e.id) {
          // Le même événement, rejoué après une coupure : l'effet est déjà là.
          courante = existante;
        } else if (resultat === "agent_occupe") {
          const ouverte = await this.sessions.ouverteDeAgent(u.id);
          throw conflit("SESSION_DEJA_OUVERTE", "Vous avez déjà une caisse ouverte", {
            sessionId: ouverte?.id,
          });
        } else if (resultat === "guichet_occupe") {
          throw conflit("GUICHET_OCCUPE", "La caisse de ce guichet est déjà ouverte");
        } else if (resultat === "numero_pris") {
          throw conflit("NUMERO_SESSION_PRIS", "Ce numéro de session existe déjà");
        } else {
          throw conflit("SESSION_EXISTANTE", "Cet identifiant de session existe déjà");
        }
      }
      await this.journal.ecrire({
        evenement: { ...e, appareilId: e.appareilId, numeroPlage: null },
        auteurId: u.id,
        resume: `Ouverture de la caisse du guichet ${guichet.rang} · fond de caisse ${francs(d.fondDeCaisse)}`,
        gareId: courante.gareId,
        compagnieId: courante.compagnieId,
      });
      return { session: await this.vue(courante) };
    });
  }

  async compter(corps: unknown, u: Utilisateur) {
    const e = lireComptage(corps);
    this.verifierAuteur(e, u);
    return this.idem.executer(e.id, async (): Promise<ResultatCaisse> => {
      const d = e.donnees;
      const session = await this.sessionDeAgent(d.sessionId, u);
      if (session.etat !== "ouverte") {
        throw conflit(
          "SESSION_NON_OUVERTE",
          "La caisse n'est plus ouverte : le comptage est figé",
          {
            etat: session.etat,
          },
        );
      }
      let total: number;
      try {
        total = totalCoupures(d.coupures, d.pieces);
      } catch (err) {
        throw invalide("COMPTAGE", err instanceof Error ? err.message : "Comptage invalide");
      }
      if (total !== d.total) {
        throw invalide("COMPTAGE", "Le total ne correspond pas aux coupures et aux pièces", {
          totalCalcule: total,
          totalRecu: d.total,
        });
      }
      const comptage = { coupures: coupuresCompletes(d.coupures), pieces: d.pieces, total };
      const suivante = await this.sessions.transiter(session.id, "ouverte", { comptage });
      if (!suivante) {
        throw conflit("SESSION_NON_OUVERTE", "La caisse n'est plus ouverte : le comptage est figé");
      }
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume: `Comptage de la caisse du guichet ${session.guichetRang} · ${francs(total)} comptés`,
        gareId: session.gareId,
        compagnieId: session.compagnieId,
      });
      return { session: await this.vue(suivante) };
    });
  }

  async cloturer(corps: unknown, u: Utilisateur) {
    const e = lireCloture(corps);
    this.verifierAuteur(e, u);
    if (e.donnees.auto) {
      throw invalide(
        "CLOTURE_AUTO_RESERVEE",
        "La clôture automatique de minuit est faite par le système, pas par un appareil",
      );
    }
    return this.idem.executer(e.id, async (): Promise<ResultatCaisse> => {
      const d = e.donnees;
      const session = await this.sessionDeAgent(d.sessionId, u);
      if (d.ecart !== d.cashCompte - d.cashAttendu) {
        throw invalide("ECART_INCOHERENT", "L'écart annoncé n'est pas compté − attendu", {
          attendu: d.cashCompte - d.cashAttendu,
          recu: d.ecart,
        });
      }
      if (session.etat === "cloturee" && session.cloture?.evenementId === e.id) {
        return { session: await this.vue(session) };
      }
      if (session.etat !== "ouverte") {
        throw conflit("SESSION_NON_OUVERTE", "Cette caisse est déjà clôturée", {
          etat: session.etat,
        });
      }
      if (session.comptage && session.comptage.total !== d.cashCompte) {
        throw invalide(
          "COMPTAGE_DIFFERENT",
          "Le cash compté ne correspond pas au dernier comptage enregistré : recomptez avant de clôturer",
          { comptage: session.comptage.total, recu: d.cashCompte },
        );
      }
      const cloturee = await this.appliquerCloture(session, {
        at: e.at,
        cashCompte: d.cashCompte,
        cashAttenduAppareil: d.cashAttendu,
        auto: false,
        comptageAbsent: false,
        evenementId: e.id,
      });
      await this.journal.ecrire({
        evenement: { ...e, numeroPlage: null },
        auteurId: u.id,
        resume:
          `Clôture de la caisse du guichet ${session.guichetRang} · compté ${francs(cloturee.cloture!.cashCompte)}` +
          ` pour ${francs(cloturee.cloture!.cashAttendu)} attendus · ${texteEcart(cloturee.cloture!.ecart)}`,
        gareId: session.gareId,
        compagnieId: session.compagnieId,
      });
      return { session: await this.vue(cloturee) };
    });
  }

  /**
   * Clôture automatique de minuit : les sessions encore ouvertes à minuit (Douala) sont clôturées
   * par le système, avec le dernier comptage s'il y en a un, et le patron est alerté. Rejouable à
   * volonté : l'identifiant de l'événement est déduit de la session.
   */
  async cloturerLesSessionsDeMinuit(): Promise<number> {
    const maintenant = this.horloge.maintenant();
    let nombre = 0;
    for (const session of await this.sessions.ouvertes()) {
      const reference = session.reouverteA ?? session.ouverteA;
      if (!doitCloturerAuto(reference, maintenant)) continue;
      try {
        nombre += (await this.cloturerAutomatiquement(session, reference)) ? 1 : 0;
      } catch (err) {
        // Une session en défaut ne doit pas empêcher les autres de se fermer.
        this.logger.error(
          `Clôture automatique de la session ${session.id} impossible : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return nombre;
  }

  private async cloturerAutomatiquement(session: SessionStockee, reference: string) {
    const at = heureClotureAuto(reference);
    const evenementId = uuidDeterministe(`caisse.cloturee.auto:${session.id}:${reference}`);
    const resultat = await this.idem.executer(evenementId, async (): Promise<ResultatCaisse> => {
      const comptageAbsent = session.comptage === null;
      const cloturee = await this.appliquerCloture(session, {
        at,
        cashCompte: session.comptage?.total ?? 0,
        cashAttenduAppareil: null,
        auto: true,
        comptageAbsent,
        evenementId,
      });
      const c = cloturee.cloture!;
      await this.journal.ecrire({
        evenement: {
          id: evenementId,
          type: "caisse.cloturee",
          at,
          appareilId: null,
          cible: { type: "session", id: session.id },
          numeroPlage: null,
        },
        auteurId: AUTEUR_SYSTEME.id,
        resume:
          `Clôture automatique de minuit de la caisse du guichet ${session.guichetRang}` +
          (comptageAbsent ? " · caisse non comptée" : ` · compté ${francs(c.cashCompte)}`) +
          ` pour ${francs(c.cashAttendu)} attendus · ${texteEcart(c.ecart)}`,
        gareId: session.gareId,
        compagnieId: session.compagnieId,
      });
      const agent = await this.personnes.trouverParId(session.agentId);
      await this.alertes.alerter({
        type: "cloture_automatique",
        compagnieId: session.compagnieId,
        gareId: session.gareId,
        message:
          `La caisse du guichet ${session.guichetRang} (${agent?.nom ?? "agent inconnu"}) n'a pas été clôturée : ` +
          `fermée automatiquement à minuit, ${texteEcart(c.ecart)}.`,
        details: {
          sessionId: session.id,
          numero: session.numero,
          agentId: session.agentId,
          ecart: c.ecart,
          comptageAbsent,
        },
      });
      return { session: await this.vue(cloturee) };
    });
    return resultat.accuse.statut === "accepte";
  }

  /** Fige la clôture : calcule le cash attendu côté serveur et passe la session à « clôturée ». */
  private async appliquerCloture(
    session: SessionStockee,
    p: {
      at: string;
      cashCompte: number;
      cashAttenduAppareil: number | null;
      auto: boolean;
      comptageAbsent: boolean;
      evenementId: string;
    },
  ): Promise<SessionStockee> {
    const decompte = await this.mouvements.decompte(session, p.at);
    const attendu = cashAttendu({
      fondDeCaisse: session.fondDeCaisse,
      billetsCash: decompte.billetsCash.montant,
      colisCash: decompte.colisCash.montant,
      annulationsValidees: decompte.annulationsValidees.montant,
    });
    const suivante = await this.sessions.transiter(session.id, "ouverte", {
      etat: "cloturee",
      cloture: {
        at: p.at,
        auto: p.auto,
        cashCompte: p.cashCompte,
        cashAttendu: attendu,
        ecart: p.cashCompte - attendu,
        divergenceAppareil: p.cashAttenduAppareil === null ? 0 : p.cashAttenduAppareil - attendu,
        comptageAbsent: p.comptageAbsent,
        decompte,
        evenementId: p.evenementId,
      },
    });
    if (!suivante) {
      const actuelle = await this.sessions.trouver(session.id);
      if (actuelle?.cloture?.evenementId === p.evenementId) return actuelle;
      throw conflit("SESSION_NON_OUVERTE", "Cette caisse est déjà clôturée");
    }
    return suivante;
  }

  /* ------------------------------------------------------------------ lecture */

  /**
   * `agence.caisse.session`. Un guichetier lit sa session (celle qui est ouverte, sinon la dernière) ;
   * un superviseur lit celle qu'il nomme, dans sa gare.
   */
  async lire(sessionId: string | undefined, u: Utilisateur): Promise<CaisseSessionVue> {
    if (u.role === "superviseur") {
      if (!sessionId) {
        throw requeteInvalide("SESSION_REQUISE", "Précisez la session de caisse à lire");
      }
      const session = await this.sessions.trouver(sessionId);
      if (!session || session.gareId !== u.gareId) {
        throw introuvable("SESSION_INCONNUE", "Session de caisse inconnue");
      }
      return this.vue(session);
    }
    const session = sessionId
      ? await this.sessions.trouver(sessionId)
      : ((await this.sessions.ouverteDeAgent(u.id)) ??
        (await this.sessions.deAgent(u.id))[0] ??
        null);
    // Une session d'un autre agent est « inconnue » : on ne révèle pas qu'elle existe.
    if (!session || session.agentId !== u.id) {
      throw introuvable("SESSION_INCONNUE", "Aucune session de caisse");
    }
    return this.vue(session);
  }

  /** La session mise en forme pour l'écran, avec tout ce qui se calcule à la lecture. */
  async vue(s: SessionStockee): Promise<CaisseSessionVue> {
    const maintenant = this.horloge.maintenant();
    const fin = s.cloture?.at ?? versIsoDouala(maintenant);
    const decompte = s.cloture?.decompte ?? (await this.mouvements.decompte(s, fin));
    const attendu =
      s.cloture?.cashAttendu ??
      cashAttendu({
        fondDeCaisse: s.fondDeCaisse,
        billetsCash: decompte.billetsCash.montant,
        colisCash: decompte.colisCash.montant,
        annulationsValidees: decompte.annulationsValidees.montant,
      });
    const comptage = s.comptage ?? { coupures: [], pieces: 0, total: 0 };
    const compte = s.cloture?.cashCompte ?? comptage.total;
    const evaluation = evaluerEcart(attendu, compte, s.tolerance);
    const agent = await this.personnes.trouverParId(s.agentId);
    const { hier, semaine } = await this.historiqueEcarts(s);
    return {
      sessionId: s.id,
      numero: s.numero,
      agent: { id: s.agentId, nom: agent?.nom || "Inconnu" },
      guichetRang: s.guichetRang,
      etat: s.etat,
      ouverteA: s.ouverteA,
      fondDeCaisse: s.fondDeCaisse,
      periode: { debut: s.ouverteA, fin },
      decompte,
      cashAttendu: attendu,
      comptage: {
        coupures: coupuresCompletes(comptage.coupures),
        pieces: comptage.pieces,
        total: comptage.total,
      },
      ecart: {
        montant: evaluation.ecart,
        statut: evaluation.statut,
        tolerance: s.tolerance,
        hier,
        semaine,
      },
    };
  }

  /**
   * Écart de la caisse d'hier de cet agent, et somme des écarts des 7 derniers jours (aujourd'hui
   * compris, cette session exclue) : seules les caisses clôturées comptent.
   */
  async historiqueEcarts(s: SessionStockee): Promise<{ hier: number; semaine: number }> {
    const depuis = versIsoDouala(debutJourDoualaMs(s.ouverteA) - 6 * MS_PAR_JOUR);
    const autres = (await this.sessions.deAgent(s.agentId, depuis)).filter(
      (x) => x.id !== s.id && x.cloture !== null,
    );
    let hier = 0;
    let semaine = 0;
    for (const x of autres) {
      const jours = joursEntre(x.ouverteA, s.ouverteA);
      if (jours < 0 || jours > 6) continue;
      semaine += x.cloture!.ecart;
      if (jours === 1) hier += x.cloture!.ecart;
    }
    return { hier, semaine };
  }

  /* ------------------------------------------------------------------ gardes */

  /** L'auteur d'un événement est toujours la personne connectée : on n'écrit pas au nom d'un autre. */
  private verifierAuteur(e: EvenementLu<unknown>, u: Utilisateur): void {
    if (e.auteurId !== u.id) {
      throw interdit("AUTEUR_INCOHERENT", "L'auteur de l'événement n'est pas le compte connecté");
    }
  }

  private async sessionDeAgent(sessionId: string, u: Utilisateur): Promise<SessionStockee> {
    const session = await this.sessions.trouver(sessionId);
    if (!session) throw introuvable("SESSION_INCONNUE", "Session de caisse inconnue");
    if (session.agentId !== u.id) {
      throw interdit("SESSION_D_UN_AUTRE", "Cette caisse est celle d'un autre agent");
    }
    return session;
  }

  /** K-GARE-AAMMJJ-GUICHET-N : la gare, le jour et le rang du guichet doivent être les bons. */
  private verifierNumero(d: DonneesOuverture, at: string, rang: number, gareCode: string): void {
    const m = FORMAT_NUMERO_SESSION.exec(d.numero);
    const jour = aammjjDouala(at);
    if (!m || m[1] !== gareCode || m[2] !== jour || Number(m[3]) !== rang || Number(m[4]) < 1) {
      throw invalide(
        "NUMERO_SESSION_INCOHERENT",
        `Le numéro de session doit être de la forme K-${gareCode}-${jour}-${rang}-N`,
        { recu: d.numero },
      );
    }
  }
}
