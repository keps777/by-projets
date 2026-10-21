import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { normaliserTelephone } from "../socle/comptes/telephone";
import { Horloge } from "../socle/horloge";
import { CONFIG_WHATSAPP, type ConfigWhatsApp } from "./config";
import { DisjoncteurWhatsApp, type EtatDisjoncteur } from "./disjoncteur";
import {
  AnnulationImpossible,
  FenetreFermee,
  FileWhatsAppIndisponible,
  MessageWhatsAppIntrouvable,
  QuotaWhatsAppDepasse,
} from "./erreurs";
import {
  ErreurNonRelancable,
  FileEnvoiWhatsApp,
  type ComptesFile,
  type TravailWhatsApp,
} from "./file";
import {
  ErreurFournisseurDefinitive,
  ErreurFournisseurTemporaire,
  FournisseurWhatsApp,
  type ContenuFournisseur,
  type ReponseFournisseur,
} from "./fournisseur";
import { rendreWhatsApp, type TypeGabarit, type VariablesParType } from "./gabarits";
import { JournalWhatsApp } from "./journal";
import { masquerNumero } from "./numero";
import { SecoursWhatsAppService, CONTEXTE_DESTINATAIRE, CONTEXTE_SECOURS } from "./secours.service";
import {
  STATUTS_EN_ATTENTE,
  vueMessage,
  type MessageWhatsApp,
  type ReferenceMetier,
  type ResultatEssai,
  type TypeWhatsApp,
  type VueMessageWhatsApp,
} from "./types";

const HEURE_MS = 60 * 60_000;
/** WhatsApp n'autorise le texte libre que dans les 24 heures qui suivent un message de la personne. */
export const FENETRE_SERVICE_MS = 24 * HEURE_MS;
const CONTEXTE_CONTENU = "whatsapp.contenu";
const NOM_TRAVAIL = "envoi-whatsapp";
const TEXTE_LIBRE_MAX = 1000;

/** Types dont la personne attend le message tout de suite : ils passent devant les alertes. */
const TYPES_URGENTS: readonly TypeWhatsApp[] = ["rapport_soir", "billet", "colis", "reponse"];
/** Types exemptés de la limite par numéro : ils partent à heure fixe ou répondent à la personne. */
const TYPES_SANS_LIMITE_NUMERO: readonly TypeWhatsApp[] = ["rapport_soir", "reponse"];

export interface DemandeEnvoi<T extends TypeGabarit = TypeGabarit> {
  type: T;
  variables: VariablesParType[T];
  /** N'importe quel format reconnu par `normaliserTelephone` ; 9 chiffres = Cameroun (+237). */
  destinataire: string;
  /** Idempotence : la même clé ne produit jamais deux messages. Absente : un message à chaque appel. */
  cle?: string;
  reference?: ReferenceMetier;
  compagnieId?: string | null;
  /** Le compte qui demande (limite par compte) ; absent pour un envoi du système. */
  demandeurId?: string | null;
  /** Envoi différé. */
  envoyerA?: Date;
  /** Passé cet instant le message n'est plus envoyé. Par défaut, selon le gabarit. */
  expireA?: Date;
  urgent?: boolean;
  /** `false` : pas de repli par SMS pour ce message. */
  secours?: boolean;
}

export interface DemandeReponse {
  destinataire: string;
  /** Texte libre (1 000 caractères au plus). */
  texte: string;
  cle?: string;
  compagnieId?: string | null;
  demandeurId?: string | null;
}

export interface ResultatEnvoi {
  message: VueMessageWhatsApp;
  /** `false` : la clé d'idempotence existait, c'est le message d'origine. */
  nouveau: boolean;
}

export interface EtatPasserelle {
  /** `normal` ; `secours_sms` si WhatsApp est coupé et que le SMS prend le relais ; `indisponible` sinon. */
  mode: "normal" | "secours_sms" | "indisponible";
  fournisseur: { nom: string; reel: boolean };
  circuit: EtatDisjoncteur;
  secoursSms: { voulu: boolean; branche: boolean };
  file: ComptesFile;
}

/**
 * Cœur de la passerelle : valide et met en file les messages WhatsApp, les envoie (avec disjoncteur,
 * reprises et repli par SMS) et tient le journal. Les autres modules n'appellent que `envoyer` (et
 * `repondre` pour un texte libre) ; le contenu n'est jamais conservé en clair (chiffré dans la
 * file, absent du journal).
 */
@Injectable()
export class PasserelleWhatsAppService {
  private readonly logger = new Logger("PasserelleWhatsApp");
  private mode: EtatPasserelle["mode"] = "normal";

  constructor(
    private readonly journal: JournalWhatsApp,
    private readonly file: FileEnvoiWhatsApp,
    private readonly fournisseur: FournisseurWhatsApp,
    private readonly disjoncteur: DisjoncteurWhatsApp,
    private readonly chiffrement: ChiffrementService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    private readonly secours: SecoursWhatsAppService,
    @Inject(CONFIG_WHATSAPP) private readonly config: ConfigWhatsApp,
  ) {}

  /* --------------------------------------------------------------------------------- demande */

  /**
   * Valide, met en file et rend tout de suite (le message part en quelques secondes). Lève
   * `TelephoneInvalide`, `VariablesInvalides`, `QuotaWhatsAppDepasse` ou `FileWhatsAppIndisponible`.
   */
  async envoyer<T extends TypeGabarit>(demande: DemandeEnvoi<T>): Promise<ResultatEnvoi> {
    const telephone = normaliserTelephone(demande.destinataire);
    const rendu = rendreWhatsApp(demande.type, demande.variables);

    const cle = demande.cle ?? randomUUID();
    const existant = await this.journal.trouverParCle(cle);
    if (existant) return { message: vueMessage(existant), nouveau: false };

    const index = this.chiffrement.indexAveugle(telephone, CONTEXTE_DESTINATAIRE);
    await this.verifierLimites(demande.type, demande.demandeurId ?? null, index);

    const maintenant = this.horloge.maintenant();
    const debut = demande.envoyerA && demande.envoyerA > maintenant ? demande.envoyerA : maintenant;
    const validiteMs =
      demande.type === "rapport_soir" ? this.config.rapport.validiteMs : rendu.validiteMs;
    const validite = validiteMs === null ? null : new Date(debut.getTime() + validiteMs);
    const expireA =
      [demande.expireA ?? null, validite]
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    const id = randomUUID();
    const contenu: ContenuFournisseur = {
      type: "gabarit",
      nom: rendu.nom,
      langue: this.config.langue,
      parametres: rendu.parametres,
      boutonUrl: rendu.boutonUrl,
    };
    const avecSecours =
      this.config.secoursSms && demande.secours !== false && rendu.texteSecours !== null;
    return this.mettreEnFile({
      id,
      type: demande.type,
      cle,
      gabarit: rendu.nom,
      reference: demande.reference ?? null,
      compagnieId: demande.compagnieId ?? null,
      demandeurId: demande.demandeurId ?? null,
      telephone,
      index,
      contenu,
      secoursChiffre: avecSecours
        ? this.chiffrement.chiffrerJson(
            { variables: rendu.variablesSecours, texte: rendu.texteSecours },
            `${CONTEXTE_SECOURS}:${id}`,
          )
        : null,
      maintenant,
      debut,
      expireA,
      urgent: demande.urgent ?? TYPES_URGENTS.includes(demande.type),
    });
  }

  /**
   * Texte libre, permis seulement dans les 24 heures qui suivent un message de cette personne (règle
   * de WhatsApp). Lève `FenetreFermee` sinon : il faut alors passer par un gabarit. C'est cette
   * réponse qui fait « répond en 2 min » : le délai se mesure du message reçu à la réponse acceptée.
   */
  async repondre(demande: DemandeReponse): Promise<ResultatEnvoi> {
    const telephone = normaliserTelephone(demande.destinataire);
    const texte = demande.texte.replace(/\r\n/g, "\n").trim();
    if (texte === "" || texte.length > TEXTE_LIBRE_MAX) {
      throw new RangeError(`Le texte doit faire de 1 à ${TEXTE_LIBRE_MAX} caractères`);
    }
    const cle = demande.cle ?? randomUUID();
    const existant = await this.journal.trouverParCle(cle);
    if (existant) return { message: vueMessage(existant), nouveau: false };

    const index = this.chiffrement.indexAveugle(telephone, CONTEXTE_DESTINATAIRE);
    const maintenant = this.horloge.maintenant();
    const entrant = await this.journal.dernierEntrant(index);
    if (!entrant || maintenant.getTime() - entrant.recuA.getTime() >= FENETRE_SERVICE_MS) {
      throw new FenetreFermee();
    }
    await this.verifierLimites("reponse", demande.demandeurId ?? null, index);

    return this.mettreEnFile({
      id: randomUUID(),
      type: "reponse",
      cle,
      gabarit: null,
      reference: null,
      compagnieId: demande.compagnieId ?? null,
      demandeurId: demande.demandeurId ?? null,
      telephone,
      index,
      contenu: { type: "texte", texte },
      secoursChiffre: null,
      maintenant,
      debut: maintenant,
      expireA: new Date(entrant.recuA.getTime() + FENETRE_SERVICE_MS),
      urgent: true,
    });
  }

  private async mettreEnFile(p: {
    id: string;
    type: TypeWhatsApp;
    cle: string;
    gabarit: string | null;
    reference: ReferenceMetier | null;
    compagnieId: string | null;
    demandeurId: string | null;
    telephone: string;
    index: string;
    contenu: ContenuFournisseur;
    secoursChiffre: string | null;
    maintenant: Date;
    debut: Date;
    expireA: Date | null;
    urgent: boolean;
  }): Promise<ResultatEnvoi> {
    const destinataireChiffre = this.chiffrement.chiffrer(
      p.telephone,
      `${CONTEXTE_DESTINATAIRE}:${p.id}`,
    );
    const message: MessageWhatsApp = {
      id: p.id,
      type: p.type,
      cle: p.cle,
      gabarit: p.gabarit,
      reference: p.reference,
      compagnieId: p.compagnieId,
      demandeurId: p.demandeurId,
      destinataireChiffre,
      destinataireIndex: p.index,
      destinataireMasque: masquerNumero(p.telephone),
      statut: "en_file",
      tentatives: 0,
      idFournisseur: null,
      derniereErreur: null,
      secours: "aucun",
      secoursSmsId: null,
      secoursChiffre: p.secoursChiffre,
      creeA: p.maintenant,
      planifieA: p.debut > p.maintenant ? p.debut : null,
      expireA: p.expireA,
      envoyeA: null,
      remisA: null,
      luA: null,
      delaiEnvoiMs: null,
    };
    const { cree, message: enregistre } = await this.journal.creer(message);
    if (!cree) return { message: vueMessage(enregistre), nouveau: false };

    try {
      await this.file.ajouter(
        NOM_TRAVAIL,
        {
          messageId: p.id,
          destinataireChiffre,
          contenuChiffre: this.chiffrement.chiffrerJson(p.contenu, `${CONTEXTE_CONTENU}:${p.id}`),
        },
        {
          jobId: p.id,
          delay: p.debut.getTime() - p.maintenant.getTime(),
          attempts: this.config.tentativesMax,
          backoff: { type: "exponential", delay: this.config.reprisePremiereMs },
          priority: p.urgent ? 1 : 10,
        },
      );
    } catch {
      await this.journal.modifier(p.id, {
        statut: "echec",
        derniereErreur: "file_indisponible",
        secoursChiffre: null,
      });
      this.logger.error(`WhatsApp ${p.id} (${p.type}) : la file n'a pas accepté le message`);
      throw new FileWhatsAppIndisponible();
    }
    this.logger.log(
      `WhatsApp ${p.id} (${p.type}) en file` +
        (message.planifieA ? `, prévu à ${message.planifieA.toISOString()}` : ""),
    );
    return { message: vueMessage(message), nouveau: true };
  }

  private async verifierLimites(
    type: TypeWhatsApp,
    demandeurId: string | null,
    index: string,
  ): Promise<void> {
    const depuis = new Date(this.horloge.maintenant().getTime() - HEURE_MS);
    if (demandeurId) {
      const n = await this.journal.compter({ depuis, demandeurId });
      if (n >= this.config.limites.parDemandeurParHeure)
        throw new QuotaWhatsAppDepasse("demandeur");
    }
    if (!TYPES_SANS_LIMITE_NUMERO.includes(type)) {
      const n = await this.journal.compter({
        depuis,
        destinataireIndex: index,
        types: ["billet", "colis", "alerte_proche", "alerte_retard"],
      });
      if (n >= this.config.limites.parDestinataireParHeure) {
        throw new QuotaWhatsAppDepasse("destinataire");
      }
    }
  }

  /* ------------------------------------------------------------------------------- traitement */

  /** Traite un travail de la file : un essai d'envoi. */
  async traiter(travail: TravailWhatsApp): Promise<void> {
    const message = await this.journal.trouver(travail.data.messageId);
    if (!message) throw new ErreurNonRelancable("message_introuvable");
    // Déjà envoyé, annulé ou périmé (travail en double, reprise après un arrêt) : rien à refaire.
    if (!STATUTS_EN_ATTENTE.includes(message.statut)) return;

    const debut = this.horloge.maintenant();
    if (message.expireA && debut >= message.expireA) {
      await this.journal.modifier(
        message.id,
        { statut: "expire", secoursChiffre: null },
        STATUTS_EN_ATTENTE,
      );
      this.logger.warn(`WhatsApp ${message.id} (${message.type}) expiré avant l'envoi`);
      return;
    }

    const numero = travail.attemptsMade + 1;
    let destinataire: string;
    let contenu: ContenuFournisseur;
    try {
      destinataire = this.chiffrement.dechiffrer(
        travail.data.destinataireChiffre,
        `${CONTEXTE_DESTINATAIRE}:${message.id}`,
      );
      contenu = this.chiffrement.dechiffrerJson<ContenuFournisseur>(
        travail.data.contenuChiffre,
        `${CONTEXTE_CONTENU}:${message.id}`,
      );
    } catch {
      // Charge utile altérée ou clé retirée : réessayer n'y changera rien.
      await this.journal.modifier(
        message.id,
        { statut: "echec", tentatives: numero, derniereErreur: "charge_illisible" },
        STATUTS_EN_ATTENTE,
      );
      this.logger.error(`WhatsApp ${message.id} (${message.type}) : charge utile illisible`);
      await this.secours.declencher(message.id, "charge_illisible");
      throw new ErreurNonRelancable("charge_illisible");
    }

    try {
      const reponse = await this.appeler(message, numero, destinataire, contenu);
      await this.enregistrerAcceptation(message, numero, reponse);
      this.actualiserMode();
    } catch (e) {
      this.actualiserMode();
      await this.enregistrerEchec(message, numero, travail.opts.attempts, e);
      throw e instanceof ErreurFournisseurDefinitive ? new ErreurNonRelancable(e.code) : e;
    }
  }

  private async appeler(
    message: MessageWhatsApp,
    numero: number,
    destinataire: string,
    contenu: ContenuFournisseur,
  ): Promise<ReponseFournisseur> {
    if (!this.disjoncteur.autoriser()) {
      // Circuit ouvert : on n'appelle pas WhatsApp, l'essai est compté comme échoué.
      await this.noterEssai(
        message.id,
        numero,
        this.horloge.maintenant(),
        "temporaire",
        "circuit_ouvert",
      );
      throw new ErreurFournisseurTemporaire("circuit_ouvert");
    }
    const debut = this.horloge.maintenant();
    try {
      const reponse = await this.fournisseur.envoyer({
        reference: message.id,
        destinataire,
        contenu,
      });
      this.disjoncteur.succes();
      await this.noterEssai(message.id, numero, debut, "accepte", null);
      return reponse;
    } catch (e) {
      if (e instanceof ErreurFournisseurDefinitive) {
        // WhatsApp a répondu : il fonctionne, c'est ce message qu'il refuse.
        this.disjoncteur.succes();
        await this.noterEssai(message.id, numero, debut, "definitif", e.code);
        throw e;
      }
      const code = e instanceof ErreurFournisseurTemporaire ? e.code : "erreur_inconnue";
      this.disjoncteur.echec();
      await this.noterEssai(message.id, numero, debut, "temporaire", code);
      throw e instanceof ErreurFournisseurTemporaire ? e : new ErreurFournisseurTemporaire(code);
    }
  }

  private async noterEssai(
    messageId: string,
    numero: number,
    debut: Date,
    resultat: ResultatEssai,
    code: string | null,
  ): Promise<void> {
    const fin = this.horloge.maintenant();
    await this.journal.ajouterEssai({
      messageId,
      numero,
      fournisseur: this.fournisseur.nom,
      at: fin,
      dureeMs: Math.max(0, fin.getTime() - debut.getTime()),
      resultat,
      code,
    });
  }

  private async enregistrerAcceptation(
    message: MessageWhatsApp,
    numero: number,
    reponse: ReponseFournisseur,
  ): Promise<void> {
    const fin = this.horloge.maintenant();
    const champs = {
      idFournisseur: reponse.idFournisseur,
      envoyeA: fin,
      delaiEnvoiMs: Math.max(0, fin.getTime() - (message.planifieA ?? message.creeA).getTime()),
      tentatives: numero,
      derniereErreur: null,
    };
    // WhatsApp a accepté : même si le message a été annulé ou a expiré entre-temps, il est parti et
    // le journal doit le dire.
    const enregistre =
      (await this.journal.modifier(message.id, { ...champs, statut: "envoye" }, [
        ...STATUTS_EN_ATTENTE,
        "annule",
        "expire",
        "echec",
      ])) ?? (await this.journal.modifier(message.id, champs)); // un accusé est passé devant
    if (enregistre) {
      this.logger.log(
        `WhatsApp ${message.id} (${message.type}) accepté en ${champs.delaiEnvoiMs} ms`,
      );
    }
    if (message.type === "reponse") {
      const entrant = await this.journal.marquerReponse(
        message.destinataireIndex,
        fin,
        FENETRE_SERVICE_MS,
      );
      if (entrant?.delaiReponseMs != null) {
        this.logger.log(
          `Réponse envoyée ${Math.round(entrant.delaiReponseMs / 1000)} s après le message`,
        );
      }
    }
  }

  private async enregistrerEchec(
    message: MessageWhatsApp,
    numero: number,
    essaisMax: number,
    erreur: unknown,
  ): Promise<void> {
    const definitive = erreur instanceof ErreurFournisseurDefinitive;
    const code =
      erreur instanceof ErreurFournisseurTemporaire || definitive
        ? (erreur as { code: string }).code
        : "erreur_inconnue";
    if (!definitive && numero < essaisMax) {
      await this.journal.modifier(
        message.id,
        { statut: "en_reprise", tentatives: numero, derniereErreur: code },
        STATUTS_EN_ATTENTE,
      );
      this.logger.warn(
        `WhatsApp ${message.id} (${message.type}) : essai ${numero}/${essaisMax} échoué (${code}), nouvel essai programmé`,
      );
      return;
    }
    const maj = await this.journal.modifier(
      message.id,
      { statut: "echec", tentatives: numero, derniereErreur: code },
      STATUTS_EN_ATTENTE,
    );
    this.logger.error(
      `WhatsApp ${message.id} (${message.type}) : échec définitif après ${numero} essai(s) (${code})`,
    );
    const etatSecours = maj ? await this.secours.declencher(message.id, code) : null;
    try {
      await this.audit.enregistrer({
        action: "whatsapp.echec",
        resultat: "echec",
        cible: { type: "whatsapp", id: message.id },
        details: {
          typeWhatsApp: message.type,
          erreur: code,
          essais: numero,
          compagnieId: message.compagnieId,
          reference: message.reference,
          secours: etatSecours ?? "aucun",
        },
      });
    } catch {
      this.logger.error(`WhatsApp ${message.id} : échec non porté au journal d'audit`);
    }
  }

  /** Journalise les bascules de mode (normal, secours SMS, indisponible). */
  private actualiserMode(): void {
    const mode = this.modeCourant();
    if (mode === this.mode) return;
    const avant = this.mode;
    this.mode = mode;
    const texte = `Passerelle WhatsApp : mode ${avant} → ${mode}`;
    if (mode === "normal") this.logger.log(texte);
    else this.logger.warn(texte);
  }

  private modeCourant(): EtatPasserelle["mode"] {
    if (this.disjoncteur.etat() !== "ouvert") return "normal";
    return this.secours.disponible() ? "secours_sms" : "indisponible";
  }

  /* --------------------------------------------------------------------------- lecture, état */

  async obtenir(id: string): Promise<MessageWhatsApp> {
    const m = await this.journal.trouver(id);
    if (!m) throw new MessageWhatsAppIntrouvable();
    return m;
  }

  /** Annule un message qui n'est pas encore parti. */
  async annuler(id: string): Promise<VueMessageWhatsApp> {
    const message = await this.obtenir(id);
    if (!STATUTS_EN_ATTENTE.includes(message.statut))
      throw new AnnulationImpossible(message.statut);
    await this.file.retirer(id);
    const maj = await this.journal.modifier(
      id,
      { statut: "annule", secoursChiffre: null },
      STATUTS_EN_ATTENTE,
    );
    if (!maj) throw new AnnulationImpossible((await this.obtenir(id)).statut);
    return vueMessage(maj);
  }

  async etat(): Promise<EtatPasserelle> {
    return {
      mode: this.modeCourant(),
      fournisseur: { nom: this.fournisseur.nom, reel: this.fournisseur.reel },
      circuit: this.disjoncteur.instantane(),
      secoursSms: { voulu: this.config.secoursSms, branche: this.secours.brancheSms },
      file: await this.file.compter(),
    };
  }
}
