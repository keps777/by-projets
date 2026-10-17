import { Inject, Injectable, Logger } from "@nestjs/common";
import { Refus } from "../billetterie/erreurs";
import { Serialiseur } from "../billetterie/serialiser";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Horloge } from "../socle/horloge";
import { AchatUssdService, DepartCompletUssd, PrixInattenduUssd } from "./achat.service";
import { CONFIG_USSD, type ConfigUssd } from "./config";
import { RequeteUssdIllisible, msisdnInternational } from "./connecteurs";
import { JournalisationUssd } from "./journalisation.service";
import type { EntreeUssd, EtatSessionUssd, SortieUssd } from "./modeles";
import { CompteUssdInactif, ComptesUssd, SessionsUssd, SuiviColisUssd } from "./ports";
import { TEXTES, ajusterEcran, ecranConfirmation, ecranDeparts, ecranMenu } from "./textes";

const contexteSession = (cle: string): string => `ussd.session:${cle}`;

/** Résultat d'une étape : ce que l'on répond, et l'état à garder (`null` : la session est terminée). */
interface Suite extends SortieUssd {
  etat: EtatSessionUssd | null;
}

const continuer = (texte: string, etat: EtatSessionUssd): Suite => ({
  texte,
  fin: false,
  etat: { ...etat, ecran: texte },
});
const terminer = (texte: string): Suite => ({ texte, fin: true, etat: null });

/**
 * Le dialogue USSD : une machine à états dont l'état vit dans le stockage de sessions (chiffré).
 * Chaque réponse du voyageur fait avancer l'état d'un écran :
 *
 *   menu ──1──► départs ──n──► confirmation ──1──► paiement MoMo demandé (fin)
 *        ──2──► mon billet (fin)         ──5──► numéro du proche ──► départs…
 *        ──3──► numéro du colis ──► suivi (fin)
 *        ──4──► suivre bus (fin)         ──0──► aide (fin)
 *
 * Le paiement est asynchrone : la session se termine dès que la demande MoMo est partie, la
 * confirmation arrive sur le téléphone puis, par webhook, aux paiements ; le SMS du billet est envoyé
 * par `SuiviAchatsUssdService` une fois la commande payée.
 */
@Injectable()
export class DialogueUssdService {
  private readonly serie = new Serialiseur();
  private readonly logger = new Logger("Ussd");

  constructor(
    private readonly sessions: SessionsUssd,
    private readonly comptes: ComptesUssd,
    private readonly achat: AchatUssdService,
    private readonly colis: SuiviColisUssd,
    private readonly chiffrement: ChiffrementService,
    private readonly journal: JournalisationUssd,
    private readonly horloge: Horloge,
    @Inject(CONFIG_USSD) private readonly config: ConfigUssd,
  ) {}

  /** Traite une requête de l'opérateur. Ne lève jamais : une panne se dit au voyageur en une phrase. */
  async traiter(entree: EntreeUssd): Promise<SortieUssd> {
    const cle = `${entree.operateur}:${entree.sessionId}`;
    // Deux requêtes d'une même session (double envoi de l'opérateur) passent l'une après l'autre.
    return this.serie.executer(cle, async () => {
      const debut = this.horloge.maintenant().getTime();
      let etatAvant: EtatSessionUssd | null = null;
      try {
        const lue = entree.nouvelle || entree.fermeture ? null : await this.lireEtat(cle);
        etatAvant = lue;
        const suite = await this.avancer(entree, cle, lue);
        if (suite.etat) await this.ecrireEtat(cle, suite.etat);
        else await this.sessions.supprimer(cle);
        await this.journal.noter({
          operateur: entree.operateur,
          evenement: entree.nouvelle ? "ouverte" : "reponse",
          msisdn: entree.msisdn,
          sessionCle: cle,
          etape: suite.etat?.etape ?? etatAvant?.etape ?? null,
          dureeMs: this.horloge.maintenant().getTime() - debut,
        });
        return { texte: suite.texte, fin: suite.fin };
      } catch (e) {
        await this.sessions.supprimer(cle).catch(() => undefined);
        const { texte, code } = this.ecranPourErreur(e);
        await this.journal.noter({
          operateur: entree.operateur,
          evenement: "erreur",
          msisdn: entree.msisdn,
          sessionCle: cle,
          etape: etatAvant?.etape ?? null,
          code,
          dureeMs: this.horloge.maintenant().getTime() - debut,
        });
        return { texte, fin: true };
      }
    });
  }

  /* ------------------------------------------------------------------ session */

  private async lireEtat(cle: string): Promise<EtatSessionUssd | null> {
    const stockee = await this.sessions.lire(cle, this.horloge.maintenant());
    if (!stockee) return null;
    return this.chiffrement.dechiffrerJson<EtatSessionUssd>(stockee.charge, contexteSession(cle));
  }

  private async ecrireEtat(cle: string, etat: EtatSessionUssd): Promise<void> {
    await this.sessions.ecrire({
      cle,
      expireA: new Date(this.horloge.maintenant().getTime() + this.config.sessionTtlMs),
      charge: this.chiffrement.chiffrerJson(etat, contexteSession(cle)),
    });
  }

  /* ------------------------------------------------------------------ dialogue */

  private async avancer(
    entree: EntreeUssd,
    cle: string,
    etat: EtatSessionUssd | null,
  ): Promise<Suite> {
    if (entree.fermeture) return this.fermer(entree, cle);
    if (entree.nouvelle) return this.ouvrir(entree);
    if (!etat) {
      await this.journal.noter({
        operateur: entree.operateur,
        evenement: "session_expiree",
        msisdn: entree.msisdn,
        sessionCle: cle,
      });
      return terminer(TEXTES.sessionExpiree(this.config.codeService));
    }
    if (etat.msisdn !== entree.msisdn) {
      // L'identifiant de session ne correspond pas au numéro qui l'a ouverte : on ne répond à personne.
      await this.journal.noter({
        operateur: entree.operateur,
        evenement: "numero_incoherent",
        msisdn: entree.msisdn,
        sessionCle: cle,
      });
      return terminer(TEXTES.indisponible);
    }
    const voyageur: Utilisateur = {
      id: etat.voyageurId,
      role: "voyageur",
      compagnieId: null,
      gareId: null,
    };
    switch (etat.etape) {
      case "menu":
        return this.menu(etat, voyageur, entree.saisie);
      case "numero_proche":
        return this.numeroProche(etat, voyageur, entree.saisie);
      case "numero_colis":
        return this.numeroColis(etat, entree.saisie);
      case "departs":
        return this.choixDepart(etat, voyageur, entree.saisie);
      case "confirmation":
        return this.confirmation(etat, voyageur, cle, entree.saisie);
    }
  }

  /** Le voyageur compose le code. Une session déjà ouverte sous cet identifiant est remplacée. */
  private async ouvrir(entree: EntreeUssd): Promise<Suite> {
    let voyageur: Utilisateur;
    try {
      voyageur = await this.comptes.voyageurDe(entree.msisdn);
    } catch (e) {
      if (e instanceof CompteUssdInactif) return terminer(TEXTES.compteIndisponible);
      throw e;
    }
    return continuer(ecranMenu(), {
      etape: "menu",
      operateur: entree.operateur,
      msisdn: entree.msisdn,
      voyageurId: voyageur.id,
      erreurs: 0,
      proche: null,
      departs: [],
      commandeId: null,
      ecran: "",
    });
  }

  /** Le voyageur quitte la session : une place retenue et non payée est rendue tout de suite. */
  private async fermer(entree: EntreeUssd, cle: string): Promise<Suite> {
    const etat = await this.lireEtat(cle);
    if (etat?.etape === "confirmation" && etat.commandeId !== null) {
      await this.achat.abandonner(etat.commandeId);
      await this.journal.noter({
        operateur: entree.operateur,
        evenement: "achat_abandonne",
        msisdn: entree.msisdn,
        sessionCle: cle,
        etape: "confirmation",
      });
    }
    await this.journal.noter({
      operateur: entree.operateur,
      evenement: "fermee_par_voyageur",
      msisdn: entree.msisdn,
      sessionCle: cle,
      etape: etat?.etape ?? null,
    });
    return terminer("");
  }

  /** Réponse invalide : le même écran, précédé de la raison ; au bout de N erreurs, la session se ferme. */
  private invalide(etat: EtatSessionUssd, prefixe: string = TEXTES.invalide): Suite {
    const erreurs = etat.erreurs + 1;
    if (erreurs >= this.config.erreursMax) {
      return terminer(TEXTES.tropDErreurs(this.config.codeService));
    }
    return {
      texte: ajusterEcran([prefixe, ...etat.ecran.split("\n")]),
      fin: false,
      etat: { ...etat, erreurs },
    };
  }

  private async menu(etat: EtatSessionUssd, voyageur: Utilisateur, saisie: string): Promise<Suite> {
    switch (saisie) {
      case "1":
        return this.afficherDeparts(etat, voyageur, null);
      case "2": {
        const billet = await this.achat.monBillet(voyageur.id);
        return terminer(billet ? TEXTES.billet(billet) : TEXTES.aucunBillet);
      }
      case "3":
        return continuer(TEXTES.numeroColis, { ...etat, etape: "numero_colis", erreurs: 0 });
      case "4":
        return terminer(await this.achat.suivreBus(voyageur.id));
      case "5":
        return continuer(TEXTES.numeroProche, { ...etat, etape: "numero_proche", erreurs: 0 });
      case "0":
        return terminer(TEXTES.aide);
      default:
        return this.invalide(etat);
    }
  }

  private async numeroColis(etat: EtatSessionUssd, saisie: string): Promise<Suite> {
    if (!/^[A-Za-z0-9-]{3,30}$/.test(saisie)) return this.invalide(etat);
    const suivi = await this.colis.etat(etat.msisdn, saisie);
    return terminer(suivi ? TEXTES.colis(suivi.numero, suivi.etat) : TEXTES.colisIntrouvable);
  }

  private async numeroProche(
    etat: EtatSessionUssd,
    voyageur: Utilisateur,
    saisie: string,
  ): Promise<Suite> {
    let proche: string;
    try {
      proche = msisdnInternational(saisie);
    } catch (e) {
      if (e instanceof RequeteUssdIllisible)
        return this.invalide(etat, TEXTES.numeroProcheInvalide);
      throw e;
    }
    return this.afficherDeparts(etat, voyageur, proche);
  }

  /** « 1 Billet » ou, avec un proche, « 5 Proche » : la liste des départs du trajet. */
  private async afficherDeparts(
    etat: EtatSessionUssd,
    voyageur: Utilisateur,
    proche: string | null,
  ): Promise<Suite> {
    if (!(await this.achat.paiementDisponible())) {
      await this.journal.noter({
        operateur: etat.operateur,
        evenement: "mode_degrade",
        msisdn: etat.msisdn,
        etape: etat.etape,
      });
      return terminer(TEXTES.modeDegrade);
    }
    const trajet = await this.achat.trajetDe(voyageur.id);
    const liste = await this.achat.proposerDeparts(voyageur.id, trajet);
    if (!liste) return terminer(TEXTES.aucunDepart);
    const ecran = ecranDeparts(
      liste.depart,
      liste.arrivee,
      liste.departs.map((d) => d.ligne),
      liste.demain ? TEXTES.demain : "",
    );
    return continuer(ecran, {
      ...etat,
      etape: "departs",
      proche,
      departs: liste.departs.map((d) => d.id),
      erreurs: 0,
    });
  }

  /** Le voyageur choisit un départ : le siège est retenu (15 minutes) et le paiement proposé. */
  private async choixDepart(
    etat: EtatSessionUssd,
    voyageur: Utilisateur,
    saisie: string,
  ): Promise<Suite> {
    const rang = /^[1-9]$/.test(saisie) ? Number(saisie) : 0;
    const departId = etat.departs[rang - 1];
    if (departId === undefined) return this.invalide(etat);
    const reservation = await this.achat.reserver(voyageur, departId, etat.operateur, {
      proche: etat.proche,
      msisdn: etat.msisdn,
    });
    await this.journal.noter({
      operateur: etat.operateur,
      evenement: "achat_reserve",
      msisdn: etat.msisdn,
      etape: "departs",
    });
    return continuer(ecranConfirmation(reservation.siege), {
      ...etat,
      etape: "confirmation",
      commandeId: reservation.commandeId,
      erreurs: 0,
    });
  }

  /** « Payer MoMo? 1=oui » : 1 demande le paiement, toute autre réponse libère la place. */
  private async confirmation(
    etat: EtatSessionUssd,
    voyageur: Utilisateur,
    cle: string,
    saisie: string,
  ): Promise<Suite> {
    const commandeId = etat.commandeId;
    if (commandeId === null) return terminer(TEXTES.indisponible);
    if (saisie !== "1") {
      await this.achat.abandonner(commandeId);
      await this.journal.noter({
        operateur: etat.operateur,
        evenement: "achat_abandonne",
        msisdn: etat.msisdn,
        sessionCle: cle,
        etape: "confirmation",
      });
      return terminer(TEXTES.annule);
    }
    try {
      const paiement = await this.achat.payer(voyageur, commandeId, etat.operateur, etat.msisdn);
      if (paiement.statut === "echoue") {
        await this.achat.abandonner(commandeId);
        await this.journal.noter({
          operateur: etat.operateur,
          evenement: "paiement_refuse",
          msisdn: etat.msisdn,
          sessionCle: cle,
          etape: "confirmation",
          code: paiement.cause,
        });
        return terminer(TEXTES.paiementRefuse);
      }
    } catch (e) {
      if (e instanceof Refus && ["MODE_DEGRADE", "COMPAGNIE_SANS_COMPTE"].includes(e.code)) {
        await this.achat.abandonner(commandeId);
        await this.journal.noter({
          operateur: etat.operateur,
          evenement: "mode_degrade",
          msisdn: etat.msisdn,
          sessionCle: cle,
          etape: "confirmation",
          code: e.code,
        });
        return terminer(TEXTES.modeDegrade);
      }
      throw e;
    }
    await this.journal.noter({
      operateur: etat.operateur,
      evenement: "paiement_demande",
      msisdn: etat.msisdn,
      sessionCle: cle,
      etape: "confirmation",
    });
    return terminer(TEXTES.paiementDemande);
  }

  /* ------------------------------------------------------------------ erreurs */

  /** Ce que l'on dit au voyageur quand quelque chose a refusé ; le code court va au journal. */
  private ecranPourErreur(e: unknown): { texte: string; code: string } {
    const code = this.config.codeService;
    if (e instanceof DepartCompletUssd) return { texte: TEXTES.complet, code: "DEPART_COMPLET" };
    if (e instanceof PrixInattenduUssd) {
      this.logger.error(
        `${e.message} : le code « ${this.config.codeSansFrais} » doit exister dans les promotions ` +
          "(type frais_offerts) pour que le prix payé soit le prix affiché",
      );
      return { texte: TEXTES.indisponible, code: "PRIX_INATTENDU" };
    }
    if (e instanceof Refus) {
      if (["MODE_DEGRADE", "COMPAGNIE_SANS_COMPTE"].includes(e.code)) {
        return { texte: TEXTES.modeDegrade, code: e.code };
      }
      if (["COMMANDE_EXPIREE", "COMMANDE_ANNULEE", "COMMANDE_DEJA_PAYEE"].includes(e.code)) {
        return { texte: TEXTES.delaiDepasse(code), code: e.code };
      }
      if (e.code === "PAIEMENT_EN_COURS") return { texte: TEXTES.paiementEnCours, code: e.code };
      if (e.code === "CODE_PROMO_INVALIDE") {
        this.logger.error(
          `Le code « ${this.config.codeSansFrais} » n'existe pas dans les promotions : ` +
            "aucun achat USSD n'est possible (USSD_CODE_SANS_FRAIS)",
        );
        return { texte: TEXTES.indisponible, code: e.code };
      }
      if ([404, 409, 422].includes(e.getStatus())) {
        return { texte: TEXTES.departIndisponible(code), code: e.code };
      }
      return { texte: TEXTES.indisponible, code: e.code };
    }
    this.logger.error(`Session USSD en erreur : ${e instanceof Error ? e.message : String(e)}`);
    return { texte: TEXTES.indisponible, code: "ERREUR_INATTENDUE" };
  }
}
