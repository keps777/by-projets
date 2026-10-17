import { Inject, Injectable, Logger } from "@nestjs/common";
import { Refus } from "../billetterie/erreurs";
import { Serialiseur } from "../billetterie/serialiser";
import { operateurProbable } from "../paiements/regles";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { normaliserTelephone } from "../socle/comptes/telephone";
import { Horloge } from "../socle/horloge";
import {
  AchatWhatsAppService,
  DepartCompletAchat,
  PrixInattenduAchat,
  SiegeIndisponibleAchat,
  type ReservationAchat,
  type Trajet,
} from "./achat.service";
import {
  choisirParIndice,
  estAnnulation,
  lireDemande,
  lireReponse,
  lireRang,
  lireSiege,
  type Lecture,
} from "./comprehension";
import { CONFIG_ACHAT_WHATSAPP, type ConfigAchatWhatsApp } from "./config";
import { JournalisationAchat } from "./journalisation.service";
import { choixDeLangue, detecterLangue, type Langue } from "./langues";
import type { EntrantAchat, EtatConversation, EvenementJournalAchat } from "./modeles";
import {
  CompteAchatInactif,
  ComptesAchat,
  ConversationsAchat,
  MessagerieAchat,
  TranscriptionVocale,
} from "./ports";
import { LONGUEUR_MESSAGE_MAX, textes, type Textes } from "./textes";

const CONTEXTE_CLE = "whatsapp-achat.conversation";
const contexteEtat = (cle: string): string => `${CONTEXTE_CLE}:${cle}`;

/** Résultat d'un message : « traité » (une réponse est partie) ou « ignoré » (ce n'est pas pour nous). */
export type ResultatEntrant = "traite" | "ignore";

/** Ce que l'on répond, et l'état à garder (`null` : la conversation est terminée). */
interface Suite {
  texte: string;
  etat: EtatConversation | null;
}

const fin = (texte: string): Suite => ({ texte, etat: null });

interface Contexte {
  entrant: EntrantAchat;
  cle: string;
  msisdn: string;
  texte: string;
  source: "texte" | "vocal";
  /** Ce qu'a donné la transcription d'un vocal, renvoyé au voyageur pour qu'il vérifie. */
  echo: string | null;
  langue: Langue;
  etat: EtatConversation | null;
  lecture: Lecture;
  t: Textes;
}

type LectureMessage =
  | {
      type: "message";
      texte: string;
      source: "texte" | "vocal";
      echo: string | null;
      indice: Langue | null;
    }
  | { type: "refus"; source: "vocal" | "texte"; code: string; reponse: (t: Textes) => string };

const ECHO_MAX = 200;

/**
 * La conversation d'achat : une machine à états dont l'état vit dans le stockage des conversations
 * (chiffré, clé = index aveugle du numéro). Chaque message du voyageur fait avancer l'état d'un
 * écran, et reçoit une réponse :
 *
 *   (rien) ──« Billet Douala Yaoundé demain matin »──► départs ──« 2 »──► confirmation ──« Oui »──► paiement
 *                                                                  │                  │
 *                                                                  │                  └─« Changer de siège »──► choix_siege ──« 4 »──► confirmation
 *                                                                  └─ numéro MoMo demandé si le numéro WhatsApp n'est ni MTN ni Orange
 *
 * Le paiement est asynchrone : la conversation passe à « paiement » dès que la demande MoMo est
 * partie, la confirmation arrive sur le téléphone puis, par webhook, aux paiements ; le billet est
 * envoyé par `SuiviAchatsWhatsAppService` une fois la commande payée.
 *
 * Elle ne lève jamais : une panne se dit au voyageur en une phrase, le code court va au journal.
 */
@Injectable()
export class ConversationAchatService {
  private readonly serie = new Serialiseur();
  private readonly logger = new Logger("WhatsAppAchat");

  constructor(
    private readonly conversations: ConversationsAchat,
    private readonly comptes: ComptesAchat,
    private readonly achat: AchatWhatsAppService,
    private readonly messagerie: MessagerieAchat,
    private readonly transcription: TranscriptionVocale,
    private readonly chiffrement: ChiffrementService,
    private readonly journal: JournalisationAchat,
    private readonly horloge: Horloge,
    @Inject(CONFIG_ACHAT_WHATSAPP) private readonly config: ConfigAchatWhatsApp,
  ) {}

  /* ------------------------------------------------------------------ entrée */

  /**
   * Traite un message reçu. `ignore` : ce n'est ni une conversation en cours, ni une demande de
   * billet, ni une salutation (le message est laissé à un autre gestionnaire).
   */
  async traiter(entrant: EntrantAchat): Promise<ResultatEntrant> {
    let msisdn: string;
    try {
      msisdn = normaliserTelephone(entrant.de);
    } catch {
      return "ignore";
    }
    const cle = this.chiffrement.indexAveugle(msisdn, CONTEXTE_CLE);
    // Deux messages d'un même voyageur (double envoi, réponses rapides) passent l'un après l'autre.
    return this.serie.executer(cle, () => this.traiterEnSerie(entrant, msisdn, cle));
  }

  /**
   * Le paiement de cette commande est réglé (billet envoyé, échec annoncé) : la conversation qui
   * l'attendait se termine, pour que le prochain message soit une nouvelle demande.
   */
  async terminerPour(msisdn: string, commandeId: string): Promise<void> {
    const cle = this.chiffrement.indexAveugle(msisdn, CONTEXTE_CLE);
    await this.serie.executer(cle, async () => {
      const etat = await this.lireEtat(cle);
      if (etat?.commandeId === commandeId) await this.conversations.supprimer(cle);
    });
  }

  /** Une réponse de politesse à un message que personne d'autre n'a pris. */
  async repondreHorsSujet(entrant: EntrantAchat): Promise<void> {
    const langue = detecterLangue(entrant.texte ?? "") ?? this.config.langueDefaut;
    await this.envoyer(entrant, entrant.de, textes(langue).sansDemande, null);
  }

  private async traiterEnSerie(
    entrant: EntrantAchat,
    msisdn: string,
    cle: string,
  ): Promise<ResultatEntrant> {
    const debut = this.horloge.maintenant().getTime();
    let etat: EtatConversation | null = null;
    let langue = this.config.langueDefaut;
    let source: "texte" | "vocal" | null = null;
    let echo: string | null = null;
    try {
      etat = await this.lireEtat(cle);
      langue = etat?.langue ?? this.config.langueDefaut;
      const lu = await this.lireMessage(entrant, msisdn, cle, langue, etat);
      source = lu.source;
      if (lu.type === "refus") {
        await this.envoyer(entrant, msisdn, lu.reponse(textes(langue)), null);
        await this.noter(msisdn, cle, etat, langue, lu.source, "message", lu.code, debut);
        return "traite";
      }
      echo = lu.echo;
      langue = this.choisirLangue(lu.texte, lu.indice, etat);
      const ctx: Contexte = {
        entrant,
        cle,
        msisdn,
        texte: lu.texte,
        source: lu.source,
        echo: lu.echo,
        langue,
        etat,
        lecture: lireDemande(lu.texte, this.config.villes),
        t: textes(langue),
      };

      const nouvelle = choixDeLangue(lu.texte);
      const suite: Suite | "ignore" =
        nouvelle !== null
          ? { texte: textes(nouvelle).aide, etat: etat ? { ...etat, langue: nouvelle } : null }
          : await this.router(ctx);
      if (suite === "ignore") return "ignore";

      const langueFinale = nouvelle ?? langue;
      if (suite.etat) await this.ecrireEtat(cle, { ...suite.etat, langue: langueFinale });
      else await this.conversations.supprimer(cle);
      await this.envoyer(entrant, msisdn, suite.texte, lu.echo, langueFinale);
      await this.noter(
        msisdn,
        cle,
        suite.etat ?? etat,
        langueFinale,
        lu.source,
        "message",
        null,
        debut,
      );
      return "traite";
    } catch (e) {
      await this.conversations.supprimer(cle).catch(() => undefined);
      const { texte, code } = this.texteErreur(e, textes(langue));
      await this.noter(msisdn, cle, etat, langue, source, "erreur", code, debut);
      await this.envoyer(entrant, msisdn, texte, echo, langue);
      return "traite";
    }
  }

  /* ------------------------------------------------------------------ lecture du message */

  private async lireMessage(
    entrant: EntrantAchat,
    msisdn: string,
    cle: string,
    langue: Langue,
    etat: EtatConversation | null,
  ): Promise<LectureMessage> {
    const texte = entrant.texte?.trim() ?? "";
    if (texte !== "") {
      return {
        type: "message",
        texte: texte.slice(0, 1000),
        source: "texte",
        echo: null,
        indice: null,
      };
    }
    const vocal =
      entrant.typeMessage === "audio" ||
      entrant.typeMessage === "voice" ||
      (entrant.idMedia ?? null) !== null;
    if (!vocal) {
      return {
        type: "refus",
        source: "texte",
        code: "MESSAGE_NON_TEXTE",
        reponse: (t) => t.nonTexte,
      };
    }
    const idMedia = entrant.idMedia ?? null;
    if (!this.config.vocal || !this.transcription.branchee || idMedia === null) {
      await this.noter(
        msisdn,
        cle,
        etat,
        langue,
        "vocal",
        "vocal_echec",
        "VOCAL_INDISPONIBLE",
        null,
      );
      return {
        type: "refus",
        source: "vocal",
        code: "VOCAL_INDISPONIBLE",
        reponse: (t) => t.vocalIllisible,
      };
    }
    let transcription;
    try {
      transcription = await this.avecDelai(
        this.transcription.transcrire({ idMedia, expediteur: msisdn }),
        this.config.delaiVocalMs,
      );
    } catch (e) {
      this.logger.error(
        `Transcription d'un vocal en échec : ${e instanceof Error ? e.name : "erreur"}`,
      );
      await this.noter(msisdn, cle, etat, langue, "vocal", "vocal_echec", "VOCAL_PANNE", null);
      return {
        type: "refus",
        source: "vocal",
        code: "VOCAL_PANNE",
        reponse: (t) => t.vocalIllisible,
      };
    }
    const lu = transcription?.texte.trim() ?? "";
    if (lu === "") {
      await this.noter(msisdn, cle, etat, langue, "vocal", "vocal_echec", "VOCAL_ILLISIBLE", null);
      return {
        type: "refus",
        source: "vocal",
        code: "VOCAL_ILLISIBLE",
        reponse: (t) => t.vocalIllisible,
      };
    }
    await this.noter(msisdn, cle, etat, langue, "vocal", "vocal_transcrit", null, null);
    return {
      type: "message",
      texte: lu.slice(0, 1000),
      source: "vocal",
      echo: lu.slice(0, ECHO_MAX),
      indice: transcription?.langue ?? null,
    };
  }

  private async avecDelai<T>(promesse: Promise<T>, delaiMs: number): Promise<T> {
    let minuterie: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promesse,
        new Promise<never>((_, rejeter) => {
          minuterie = setTimeout(() => rejeter(new Error("Délai dépassé")), delaiMs);
        }),
      ]);
    } finally {
      if (minuterie) clearTimeout(minuterie);
    }
  }

  /**
   * La langue de la réponse : celle des mots du message ; sinon l'indice de la transcription ;
   * sinon celle de la conversation ; sinon la langue par défaut. Un message en anglais ne fait pas
   * quitter le pidgin (ses mots sont anglais aussi) : on change de langue en l'écrivant
   * (« english », « français », « pidgin »).
   */
  private choisirLangue(
    texte: string,
    indice: Langue | null,
    etat: EtatConversation | null,
  ): Langue {
    const lue = detecterLangue(texte) ?? indice;
    if (lue === null) return etat?.langue ?? this.config.langueDefaut;
    if (lue === "en" && etat?.langue === "pcm") return "pcm";
    return lue;
  }

  /* ------------------------------------------------------------------ état */

  private async lireEtat(cle: string): Promise<EtatConversation | null> {
    const stockee = await this.conversations.lire(cle, this.horloge.maintenant());
    if (!stockee) return null;
    try {
      return this.chiffrement.dechiffrerJson<EtatConversation>(stockee.charge, contexteEtat(cle));
    } catch {
      // Une conversation illisible (clé changée, donnée altérée) vaut pas de conversation.
      await this.conversations.supprimer(cle);
      return null;
    }
  }

  private async ecrireEtat(cle: string, etat: EtatConversation): Promise<void> {
    await this.conversations.ecrire({
      cle,
      expireA: new Date(this.horloge.maintenant().getTime() + this.config.sessionTtlMs),
      charge: this.chiffrement.chiffrerJson(etat, contexteEtat(cle)),
    });
  }

  /* ------------------------------------------------------------------ aiguillage */

  private async router(ctx: Contexte): Promise<Suite | "ignore"> {
    if (!ctx.etat) return this.sansConversation(ctx);
    switch (ctx.etat.etape) {
      case "departs":
        return this.surDeparts(ctx, ctx.etat);
      case "confirmation":
        return this.surConfirmation(ctx, ctx.etat);
      case "choix_siege":
        return this.surChoixSiege(ctx, ctx.etat);
      case "numero_momo":
        return this.surNumeroMomo(ctx, ctx.etat);
      case "paiement":
        return this.surPaiement(ctx, ctx.etat);
    }
  }

  /** Pas de conversation en cours : une demande de billet, une salutation, ou autre chose. */
  private async sansConversation(ctx: Contexte): Promise<Suite | "ignore"> {
    const { lecture, t } = ctx;
    switch (lecture.intention) {
      case "annulation":
        return fin(t.rienAAnnuler);
      case "achat":
        return this.nouvelleDemande(ctx, null);
      case "salutation":
        return fin(t.salutation);
      case "aide":
        return fin(t.aide);
      default:
        // « 2 » ou « Oui » sans rien à quoi répondre : la conversation a expiré.
        if (lireRang(ctx.texte) !== null || lireReponse(ctx.texte) !== null) {
          await this.noter(
            ctx.msisdn,
            ctx.cle,
            null,
            ctx.langue,
            ctx.source,
            "hors_sujet",
            "SANS_CONVERSATION",
            null,
          );
          return fin(t.sansDemande);
        }
        if (ctx.source === "vocal") return fin(t.aide);
        await this.noter(
          ctx.msisdn,
          ctx.cle,
          null,
          ctx.langue,
          ctx.source,
          "hors_sujet",
          null,
          null,
        );
        return "ignore";
    }
  }

  /* ------------------------------------------------------------------ une demande de billet */

  /**
   * « Billet Douala Yaoundé demain matin » : la liste des départs. `ancien` : la conversation
   * qu'elle remplace ; sa place retenue est rendue (sauf un paiement déjà demandé, qui suit son cours).
   */
  private async nouvelleDemande(ctx: Contexte, ancien: EtatConversation | null): Promise<Suite> {
    const { lecture, t } = ctx;
    if (ancien?.commandeId && ancien.etape !== "paiement") {
      await this.achat.abandonner(ancien.commandeId);
    }
    if (lecture.dateNonLue) return fin(t.dateNonLue);
    if (lecture.memeVille) return fin(t.memeVille);
    if (lecture.villeInconnue !== null) {
      await this.noter(
        ctx.msisdn,
        ctx.cle,
        null,
        ctx.langue,
        ctx.source,
        "ville_inconnue",
        null,
        null,
      );
      return fin(
        t.villeInconnue(
          lecture.villeInconnue,
          this.config.villes.map((v) => v.nom),
        ),
      );
    }
    let voyageur: Utilisateur;
    try {
      voyageur = await this.comptes.voyageurDe(ctx.msisdn);
    } catch (e) {
      if (e instanceof CompteAchatInactif) return fin(t.compteIndisponible);
      throw e;
    }
    if (!(await this.achat.paiementDisponible())) {
      await this.noter(
        ctx.msisdn,
        ctx.cle,
        null,
        ctx.langue,
        ctx.source,
        "mode_degrade",
        "MODE_DEGRADE",
        null,
      );
      return fin(t.modeDegrade);
    }

    const trajet = this.completerTrajet(lecture, await this.achat.trajetHabituel(voyageur.id));
    const trajetDit = lecture.origine !== null && lecture.destination !== null;
    const liste = await this.achat.proposerDeparts(voyageur.id, trajet, {
      jour: lecture.jour,
      periode: lecture.periode,
      apres: lecture.apres,
    });
    if (!liste) {
      await this.noter(
        ctx.msisdn,
        ctx.cle,
        null,
        ctx.langue,
        ctx.source,
        "aucun_depart",
        null,
        null,
      );
      return fin(
        t.aucunDepart({
          trajet: this.nomTrajet(trajet),
          jour: lecture.jour,
          periode: lecture.periode,
          apres: lecture.apres !== null ? hhmm(lecture.apres) : null,
        }),
      );
    }
    await this.noter(
      ctx.msisdn,
      ctx.cle,
      null,
      ctx.langue,
      ctx.source,
      "departs_proposes",
      null,
      null,
    );
    return {
      texte: t.listeDeparts({
        jour: liste.jour,
        trajet: trajetDit ? null : this.nomTrajet(trajet),
        lignes: liste.departs.map((d) => d.ligne),
      }),
      etat: {
        etape: "departs",
        langue: ctx.langue,
        msisdn: ctx.msisdn,
        voyageurId: voyageur.id,
        erreurs: 0,
        departs: liste.departs.map((d) => d.choix),
        departId: null,
        commandeId: null,
        siege: null,
        sieges: [],
        trajetDit,
      },
    };
  }

  /** Ce que le message ne dit pas vient du trajet habituel du voyageur. */
  private completerTrajet(lecture: Lecture, habituel: Trajet): Trajet {
    const { origine, destination } = lecture;
    if (origine !== null && destination !== null) return { depart: origine, arrivee: destination };
    if (destination !== null) {
      return {
        depart: habituel.depart !== destination ? habituel.depart : habituel.arrivee,
        arrivee: destination,
      };
    }
    if (origine !== null) {
      return {
        depart: origine,
        arrivee: habituel.arrivee !== origine ? habituel.arrivee : habituel.depart,
      };
    }
    return habituel;
  }

  private nomVille(code: string): string {
    return this.config.villes.find((v) => v.code === code)?.nom ?? code;
  }

  private nomTrajet(trajet: Trajet): string {
    return `${this.nomVille(trajet.depart)} → ${this.nomVille(trajet.arrivee)}`;
  }

  /* ------------------------------------------------------------------ étape « départs » */

  private async surDeparts(ctx: Contexte, etat: EtatConversation): Promise<Suite> {
    const { t } = ctx;
    if (estAnnulation(ctx.texte)) return fin(t.annule);
    const parIndice = choisirParIndice(ctx.texte, etat.departs);
    const rang = lireRang(ctx.texte) ?? (parIndice !== null ? parIndice + 1 : null);
    if (rang !== null && rang >= 1 && rang <= etat.departs.length) {
      return this.choisirDepart(ctx, etat, etat.departs[rang - 1]!.id);
    }
    if (ctx.lecture.intention === "achat") return this.nouvelleDemande(ctx, etat);
    return this.invalide(ctx, etat, t.choixInvalide(etat.departs.length));
  }

  /** Le voyageur choisit un départ : un siège est retenu (15 minutes) et le paiement proposé. */
  private async choisirDepart(
    ctx: Contexte,
    etat: EtatConversation,
    departId: string,
  ): Promise<Suite> {
    const reservation = await this.achat.reserver(this.voyageur(etat), departId, {
      siege: null,
      msisdn: etat.msisdn,
      langue: ctx.langue,
    });
    await this.noter(
      ctx.msisdn,
      ctx.cle,
      etat,
      ctx.langue,
      ctx.source,
      "achat_reserve",
      null,
      null,
    );
    return this.confirmation(ctx, etat, reservation);
  }

  /** « Alpha 08:30, siège 7 fenêtre. 4 000 F par MoMo ? Oui · Changer de siège » */
  private confirmation(
    ctx: Contexte,
    etat: EtatConversation,
    r: ReservationAchat,
    prefixe = "",
  ): Suite {
    return {
      texte: `${prefixe}${ctx.t.confirmation({
        compagnie: r.compagnie,
        vip: r.vip,
        heure: r.heure,
        siege: r.siege,
        emplacement: r.emplacement,
        prix: r.prix,
      })}`,
      etat: {
        ...etat,
        etape: "confirmation",
        departId: r.departId,
        commandeId: r.commandeId,
        siege: r.siege,
        sieges: [],
        erreurs: 0,
      },
    };
  }

  /* ------------------------------------------------------------------ étape « confirmation » */

  private async surConfirmation(ctx: Contexte, etat: EtatConversation): Promise<Suite> {
    const { t, lecture } = ctx;
    // Une autre ville, un autre trajet : c'est une nouvelle demande, la place retenue est rendue.
    if (
      lecture.intention === "achat" &&
      (lecture.origine !== null || lecture.destination !== null)
    ) {
      return this.nouvelleDemande(ctx, etat);
    }
    switch (lireReponse(ctx.texte)) {
      case "oui":
        return this.payer(ctx, etat);
      case "changer":
        return this.proposerSieges(ctx, etat);
      case "non":
        return this.annuler(ctx, etat);
      default:
        if (estAnnulation(ctx.texte)) return this.annuler(ctx, etat);
        return this.invalide(ctx, etat, t.reponseInvalide);
    }
  }

  private async annuler(ctx: Contexte, etat: EtatConversation): Promise<Suite> {
    if (etat.commandeId) await this.achat.abandonner(etat.commandeId);
    await this.noter(ctx.msisdn, ctx.cle, etat, ctx.langue, ctx.source, "achat_annule", null, null);
    return fin(ctx.t.annule);
  }

  /** « Oui » : MoMo est demandé sur le numéro WhatsApp, ou sur celui que le voyageur donne. */
  private async payer(ctx: Contexte, etat: EtatConversation): Promise<Suite> {
    const operateur = operateurProbable(etat.msisdn);
    if (operateur === null) {
      return {
        texte: ctx.t.numeroMomo,
        etat: { ...etat, etape: "numero_momo", erreurs: 0 },
      };
    }
    return this.demanderPaiement(ctx, etat, etat.msisdn);
  }

  private async demanderPaiement(
    ctx: Contexte,
    etat: EtatConversation,
    telephone: string,
  ): Promise<Suite> {
    const { t } = ctx;
    const commandeId = etat.commandeId;
    const operateur = operateurProbable(telephone);
    if (commandeId === null || operateur === null) return fin(t.indisponible);
    try {
      const paiement = await this.achat.payer(
        this.voyageur(etat),
        commandeId,
        operateur,
        telephone,
      );
      if (paiement.statut === "echoue") {
        await this.achat.abandonner(commandeId);
        await this.noter(
          ctx.msisdn,
          ctx.cle,
          etat,
          ctx.langue,
          ctx.source,
          "paiement_refuse",
          paiement.cause,
          null,
        );
        return fin(t.paiementRefuse);
      }
    } catch (e) {
      if (e instanceof Refus && ["MODE_DEGRADE", "COMPAGNIE_SANS_COMPTE"].includes(e.code)) {
        await this.achat.abandonner(commandeId);
        await this.noter(
          ctx.msisdn,
          ctx.cle,
          etat,
          ctx.langue,
          ctx.source,
          "mode_degrade",
          e.code,
          null,
        );
        return fin(t.modeDegrade);
      }
      throw e;
    }
    await this.noter(
      ctx.msisdn,
      ctx.cle,
      etat,
      ctx.langue,
      ctx.source,
      "paiement_demande",
      null,
      null,
    );
    return { texte: t.paiementDemande, etat: { ...etat, etape: "paiement", erreurs: 0 } };
  }

  /* ------------------------------------------------------------------ étape « numero_momo » */

  private async surNumeroMomo(ctx: Contexte, etat: EtatConversation): Promise<Suite> {
    const { t } = ctx;
    if (estAnnulation(ctx.texte)) return this.annuler(ctx, etat);
    let numero: string | null = null;
    try {
      const normalise = normaliserTelephone(ctx.texte);
      if (normalise.startsWith("+237") && operateurProbable(normalise) !== null) numero = normalise;
    } catch {
      /* pas un numéro */
    }
    if (numero === null) return this.invalide(ctx, etat, t.numeroMomoInvalide);
    return this.demanderPaiement(ctx, etat, numero);
  }

  /* ------------------------------------------------------------------ étape « choix_siege » */

  /** « Changer de siège » : les premiers sièges libres, le voyageur répond un numéro. */
  private async proposerSieges(ctx: Contexte, etat: EtatConversation): Promise<Suite> {
    if (etat.departId === null) return fin(ctx.t.indisponible);
    const libres = await this.achat.siegesLibres(etat.departId);
    if (libres.length === 0) {
      return { texte: ctx.t.aucunAutreSiege, etat: { ...etat, erreurs: 0 } };
    }
    return {
      texte: ctx.t.siegesLibres(libres),
      etat: {
        ...etat,
        etape: "choix_siege",
        sieges: libres.map((s) => s.numero),
        erreurs: 0,
      },
    };
  }

  private async surChoixSiege(ctx: Contexte, etat: EtatConversation): Promise<Suite> {
    const { t, lecture } = ctx;
    if (
      lecture.intention === "achat" &&
      (lecture.origine !== null || lecture.destination !== null)
    ) {
      return this.nouvelleDemande(ctx, etat);
    }
    if (lireReponse(ctx.texte) === "non" || estAnnulation(ctx.texte))
      return this.annuler(ctx, etat);
    const siege = lireSiege(ctx.texte);
    if (siege === null || etat.departId === null) {
      return this.invalide(ctx, etat, t.siegeInvalide);
    }
    if (siege === etat.siege)
      return this.confirmation(ctx, etat, await this.reservationActuelle(etat));
    try {
      const r = await this.achat.reserver(this.voyageur(etat), etat.departId, {
        siege,
        msisdn: etat.msisdn,
        langue: ctx.langue,
      });
      await this.noter(
        ctx.msisdn,
        ctx.cle,
        etat,
        ctx.langue,
        ctx.source,
        "siege_change",
        null,
        null,
      );
      return this.confirmation(ctx, etat, r);
    } catch (e) {
      if (!(e instanceof SiegeIndisponibleAchat)) throw e;
      if (!e.ancienneLiberee) return this.invalide(ctx, etat, t.siegeInvalide);
      // Le siège a été pris pendant la réservation et l'ancienne place est partie : on en retient une autre.
      const r = await this.achat.reserver(this.voyageur(etat), etat.departId, {
        siege: null,
        msisdn: etat.msisdn,
        langue: ctx.langue,
      });
      await this.noter(
        ctx.msisdn,
        ctx.cle,
        etat,
        ctx.langue,
        ctx.source,
        "siege_change",
        "SIEGE_PRIS",
        null,
      );
      return this.confirmation(ctx, etat, r, `${t.siegePris}\n`);
    }
  }

  /** Les détails de la place déjà retenue (le voyageur garde son siège). */
  private async reservationActuelle(etat: EtatConversation): Promise<ReservationAchat> {
    return this.achat.reservationDe(etat.commandeId!, etat.departId!, etat.siege!);
  }

  /* ------------------------------------------------------------------ étape « paiement » */

  private async surPaiement(ctx: Contexte, etat: EtatConversation): Promise<Suite> {
    const { lecture, t } = ctx;
    // Une autre demande de billet n'annule pas le paiement en cours : il suit son cours.
    if (
      lecture.intention === "achat" &&
      (lecture.origine !== null || lecture.destination !== null)
    ) {
      return this.nouvelleDemande(ctx, etat);
    }
    return { texte: t.paiementEnCours, etat: { ...etat } };
  }

  /* ------------------------------------------------------------------ réponses incomprises */

  /** Réponse qu'on ne comprend pas : on le dit ; au bout de N fois de suite, la place est rendue. */
  private async invalide(ctx: Contexte, etat: EtatConversation, message: string): Promise<Suite> {
    const erreurs = etat.erreurs + 1;
    await this.noter(
      ctx.msisdn,
      ctx.cle,
      etat,
      ctx.langue,
      ctx.source,
      "reponse_non_comprise",
      null,
      null,
    );
    if (erreurs >= this.config.erreursMax) {
      if (etat.commandeId) await this.achat.abandonner(etat.commandeId);
      return fin(ctx.t.tropDErreurs);
    }
    return { texte: message, etat: { ...etat, erreurs } };
  }

  /* ------------------------------------------------------------------ erreurs */

  /** Ce que l'on dit au voyageur quand quelque chose a refusé ; le code court va au journal. */
  private texteErreur(e: unknown, t: Textes): { texte: string; code: string } {
    if (e instanceof DepartCompletAchat) return { texte: t.complet, code: "DEPART_COMPLET" };
    if (e instanceof PrixInattenduAchat) {
      this.logger.error(
        `${e.message} : le code « ${this.config.codeSansFrais} » doit exister dans les promotions ` +
          "(type frais_offerts) pour que le prix payé soit le prix affiché",
      );
      return { texte: t.indisponible, code: "PRIX_INATTENDU" };
    }
    if (e instanceof CompteAchatInactif) {
      return { texte: t.compteIndisponible, code: "COMPTE_INACTIF" };
    }
    if (e instanceof Refus) {
      if (["MODE_DEGRADE", "COMPAGNIE_SANS_COMPTE"].includes(e.code)) {
        return { texte: t.modeDegrade, code: e.code };
      }
      if (["COMMANDE_EXPIREE", "COMMANDE_ANNULEE", "COMMANDE_DEJA_PAYEE"].includes(e.code)) {
        return { texte: t.delaiDepasse, code: e.code };
      }
      if (e.code === "PAIEMENT_EN_COURS") return { texte: t.paiementEnCours, code: e.code };
      if (e.code === "CODE_PROMO_INVALIDE") {
        this.logger.error(
          `Le code « ${this.config.codeSansFrais} » n'existe pas dans les promotions : ` +
            "aucun achat WhatsApp n'est possible (WHATSAPP_ACHAT_CODE_SANS_FRAIS)",
        );
        return { texte: t.indisponible, code: e.code };
      }
      if ([404, 409, 422].includes(e.getStatus())) {
        return { texte: t.departIndisponible, code: e.code };
      }
      return { texte: t.indisponible, code: e.code };
    }
    this.logger.error(
      `Conversation WhatsApp en erreur : ${e instanceof Error ? e.message : String(e)}`,
    );
    return { texte: t.indisponible, code: "ERREUR_INATTENDUE" };
  }

  /* ------------------------------------------------------------------ envoi et journal */

  private voyageur(etat: EtatConversation): Utilisateur {
    return { id: etat.voyageurId, role: "voyageur", compagnieId: null, gareId: null };
  }

  /** Envoie la réponse. Une panne d'envoi est journalisée, jamais renvoyée au webhook. */
  private async envoyer(
    entrant: EntrantAchat,
    msisdn: string,
    texte: string,
    echo: string | null,
    langue: Langue = this.config.langueDefaut,
  ): Promise<void> {
    const complet = echo !== null ? `${textes(langue).compris(echo)}\n${texte}` : texte;
    try {
      await this.messagerie.envoyer({
        destinataire: msisdn,
        texte: complet.slice(0, LONGUEUR_MESSAGE_MAX),
        cle: `achat-wa:${entrant.id}`,
      });
    } catch (e) {
      this.logger.error(
        `Réponse WhatsApp non envoyée (${e instanceof Error ? e.name : "erreur"}) : ${e instanceof Error ? e.message : ""}`,
      );
      await this.journal.noter({
        evenement: "reponse_non_envoyee",
        numero: msisdn,
        code: e instanceof Error ? e.name : "ERREUR",
      });
    }
  }

  private async noter(
    msisdn: string,
    cle: string,
    etat: EtatConversation | null,
    langue: Langue,
    source: "texte" | "vocal" | null,
    evenement: EvenementJournalAchat,
    code: string | null,
    debutMs: number | null,
  ): Promise<void> {
    await this.journal.noter({
      evenement,
      numero: msisdn,
      conversation: cle,
      etape: etat?.etape ?? null,
      langue,
      source,
      code,
      dureeMs: debutMs !== null ? this.horloge.maintenant().getTime() - debutMs : null,
    });
  }
}

/** 840 minutes → « 14:00 ». */
function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
