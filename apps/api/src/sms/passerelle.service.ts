import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { normaliserTelephone } from "../socle/comptes/telephone";
import { Horloge } from "../socle/horloge";
import { CONFIG_SMS, type ConfigSms } from "./config";
import { Disjoncteur, type EtatDisjoncteur } from "./disjoncteur";
import {
  AnnulationImpossible,
  FileIndisponible,
  MessageSmsIntrouvable,
  QuotaSmsDepasse,
} from "./erreurs";
import { ErreurNonRelancable, FileEnvoiSms, type ComptesFile, type TravailSms } from "./file";
import {
  ErreurFournisseurDefinitive,
  ErreurFournisseurTemporaire,
  type FournisseurSms,
  type ReponseFournisseur,
} from "./fournisseur";
import { rendreSms, VariablesInvalides, type VariablesParType } from "./gabarits";
import { masquerTelephone } from "./gsm";
import { JournalSms } from "./journal";
import { RegistreFournisseurs } from "./registre";
import {
  STATUTS_EN_ATTENTE,
  vueMessage,
  type MessageSms,
  type ReferenceMetier,
  type ResultatEssai,
  type TypeSms,
  type VueMessageSms,
} from "./types";

const HEURE_MS = 60 * 60_000;
const CONTEXTE_TELEPHONE = "sms.destinataire";
const NOM_TRAVAIL = "envoi-sms";

/** Types dont l'utilisateur attend le message tout de suite : ils passent devant les alertes. */
const TYPES_URGENTS: readonly TypeSms[] = [
  "billet",
  "code_retrait",
  "pin_provisoire",
  "code_connexion",
  "systeme",
];

export interface DemandeEnvoi<T extends TypeSms = TypeSms> {
  type: T;
  variables: VariablesParType[T];
  /** N'importe quel format reconnu par `normaliserTelephone` ; 9 chiffres = Cameroun (+237). */
  destinataire: string;
  /** Idempotence : la même clé ne produit jamais deux SMS. Absente : un SMS à chaque appel. */
  cle?: string;
  reference?: ReferenceMetier;
  compagnieId?: string | null;
  /** Le compte qui demande (limite par compte) ; absent pour un envoi du système. */
  demandeurId?: string | null;
  /** Envoi différé (alerte 15 min avant l'arrivée…). */
  envoyerA?: Date;
  /** Passé cet instant le message n'est plus envoyé. Par défaut, selon le gabarit. */
  expireA?: Date;
  urgent?: boolean;
}

export interface ResultatEnvoi {
  message: VueMessageSms;
  /** `false` : la clé d'idempotence existait, c'est le message d'origine. */
  nouveau: boolean;
}

export interface DemandeBilletGuichet {
  /** Billet concerné : sert à l'idempotence et à compter les renvois. */
  billetId: string;
  destinataire: string;
  variables: VariablesParType["billet"];
  /** Le client dit ne pas avoir reçu le SMS : on en envoie un autre (facturé). */
  renvoi?: boolean;
  compagnieId: string | null;
  demandeurId: string;
}

export interface EtatPasserelle {
  /** `normal` ; `secours` si le principal est coupé ; `indisponible` si plus aucun fournisseur. */
  mode: "normal" | "secours" | "indisponible";
  fournisseurs: Array<EtatDisjoncteur & { role: "principal" | "secours"; reel: boolean }>;
  file: ComptesFile;
}

/**
 * Cœur de la passerelle : valide et met en file les SMS, les envoie par le fournisseur (avec
 * secours, disjoncteur et reprises) et tient le journal. Les autres modules n'appellent que
 * `envoyer` ; le texte n'est jamais conservé en clair (chiffré dans la file, absent du journal).
 */
@Injectable()
export class PasserelleSmsService {
  private readonly logger = new Logger("PasserelleSms");
  private mode: EtatPasserelle["mode"] = "normal";

  constructor(
    private readonly journal: JournalSms,
    private readonly file: FileEnvoiSms,
    private readonly registre: RegistreFournisseurs,
    private readonly disjoncteur: Disjoncteur,
    private readonly chiffrement: ChiffrementService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG_SMS) private readonly config: ConfigSms,
  ) {}

  /* --------------------------------------------------------------------------------- demande */

  /**
   * Valide, met en file et rend tout de suite (le SMS part en quelques secondes). Lève
   * `TelephoneInvalide`, `VariablesInvalides`, `QuotaSmsDepasse` ou `FileIndisponible`.
   */
  async envoyer<T extends TypeSms>(demande: DemandeEnvoi<T>): Promise<ResultatEnvoi> {
    const telephone = normaliserTelephone(demande.destinataire);
    const rendu = rendreSms(demande.type, demande.variables);
    this.verifierLiens(demande.type, demande.variables);

    const cle = demande.cle ?? randomUUID();
    const existant = await this.journal.trouverParCle(cle);
    if (existant) return { message: vueMessage(existant), nouveau: false };

    const index = this.chiffrement.indexAveugle(telephone, CONTEXTE_TELEPHONE);
    await this.verifierLimites(demande, index);

    const maintenant = this.horloge.maintenant();
    const debut = demande.envoyerA && demande.envoyerA > maintenant ? demande.envoyerA : maintenant;
    const validite =
      rendu.validiteMs === null ? null : new Date(debut.getTime() + rendu.validiteMs);
    const expireA =
      [demande.expireA ?? null, validite]
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    const id = randomUUID();
    const destinataireChiffre = this.chiffrement.chiffrer(telephone, `${CONTEXTE_TELEPHONE}:${id}`);
    const message: MessageSms = {
      id,
      type: demande.type,
      cle,
      reference: demande.reference ?? null,
      compagnieId: demande.compagnieId ?? null,
      demandeurId: demande.demandeurId ?? null,
      destinataireChiffre,
      destinataireIndex: index,
      destinataireMasque: masquerTelephone(telephone),
      expediteur: this.config.expediteur,
      statut: "en_file",
      encodage: rendu.encodage,
      caracteres: rendu.caracteres,
      segments: rendu.segments,
      coutFcfa: 0,
      coutEstimeFcfa: rendu.segments * this.config.coutParSegmentFcfa,
      tentatives: 0,
      fournisseur: null,
      idFournisseur: null,
      derniereErreur: null,
      creeA: maintenant,
      planifieA: debut > maintenant ? debut : null,
      expireA,
      envoyeA: null,
      livreA: null,
      delaiEnvoiMs: null,
    };
    const { cree, message: enregistre } = await this.journal.creer(message);
    if (!cree) return { message: vueMessage(enregistre), nouveau: false };

    try {
      await this.file.ajouter(
        NOM_TRAVAIL,
        {
          messageId: id,
          destinataireChiffre,
          texteChiffre: this.chiffrement.chiffrer(rendu.texte, `sms.texte:${id}`),
        },
        {
          jobId: id,
          delay: debut.getTime() - maintenant.getTime(),
          attempts: this.config.tentativesMax,
          backoff: { type: "exponential", delay: this.config.reprisePremiereMs },
          priority: (demande.urgent ?? TYPES_URGENTS.includes(demande.type)) ? 1 : 10,
        },
      );
    } catch {
      await this.journal.modifier(id, { statut: "echec", derniereErreur: "file_indisponible" });
      this.logger.error(`SMS ${id} (${demande.type}) : la file n'a pas accepté le message`);
      throw new FileIndisponible();
    }
    this.logger.log(
      `SMS ${id} (${demande.type}) en file, ${rendu.segments} morceau(x) ${rendu.encodage}` +
        (message.planifieA ? `, prévu à ${message.planifieA.toISOString()}` : ""),
    );
    return { message: vueMessage(message), nouveau: true };
  }

  /**
   * Billet du guichet envoyé à la demande (« + numéro · envoyer le SMS »). Un second appel pour le
   * même billet et le même numéro ne renvoie rien (pas de double facturation) ; avec `renvoi`, un
   * nouveau SMS part, dans la limite de `renvoisBilletMax`.
   */
  async envoyerBillet(demande: DemandeBilletGuichet): Promise<ResultatEnvoi> {
    const telephone = normaliserTelephone(demande.destinataire);
    const index = this.chiffrement.indexAveugle(telephone, CONTEXTE_TELEPHONE);
    const reference = { type: "billet", id: demande.billetId };
    const base = `billet:${demande.billetId}:${index.slice(0, 16)}`;

    let cle = base;
    if (demande.renvoi) {
      const deja = (await this.journal.lister({ type: "billet", reference })).filter(
        (m) => m.destinataireIndex === index,
      ).length;
      if (deja > 0) {
        if (deja > this.config.limites.renvoisBilletMax) throw new QuotaSmsDepasse("renvois");
        cle = `${base}:r${deja}`;
      }
    }
    return this.envoyer({
      type: "billet",
      variables: demande.variables,
      destinataire: telephone,
      cle,
      reference,
      compagnieId: demande.compagnieId,
      demandeurId: demande.demandeurId,
      urgent: true,
    });
  }

  private verifierLiens(type: TypeSms, variables: unknown): void {
    const hotes = this.config.hotesLiens;
    const lien = (variables as { lien?: unknown } | null)?.lien;
    if (hotes.length === 0 || typeof lien !== "string") return;
    let hote = "";
    try {
      hote = new URL(lien).hostname.toLowerCase();
    } catch {
      /* déjà refusé par la validation du gabarit */
    }
    if (!hotes.some((h) => hote === h || hote.endsWith(`.${h}`))) {
      throw new VariablesInvalides(type, ["lien : domaine non autorisé"]);
    }
  }

  private async verifierLimites(demande: DemandeEnvoi, index: string): Promise<void> {
    const depuis = new Date(this.horloge.maintenant().getTime() - HEURE_MS);
    if (demande.demandeurId) {
      const n = await this.journal.compter({ depuis, demandeurId: demande.demandeurId });
      if (n >= this.config.limites.parDemandeurParHeure) throw new QuotaSmsDepasse("demandeur");
    }
    // Les codes de connexion ont leurs propres limites (délai entre deux envois, envois par heure).
    if (demande.type !== "systeme" && demande.type !== "code_connexion") {
      const n = await this.journal.compter({
        depuis,
        destinataireIndex: index,
        types: ["billet", "code_retrait", "alerte_proche", "retard", "pin_provisoire"],
      });
      if (n >= this.config.limites.parDestinataireParHeure) {
        throw new QuotaSmsDepasse("destinataire");
      }
    }
  }

  /* ------------------------------------------------------------------------------- traitement */

  /** Traite un travail de la file : un essai d'envoi, avec bascule sur le secours. */
  async traiter(travail: TravailSms): Promise<void> {
    const message = await this.journal.trouver(travail.data.messageId);
    if (!message) throw new ErreurNonRelancable("message_introuvable");
    // Déjà envoyé, annulé ou périmé (travail en double, reprise après un arrêt) : rien à refaire.
    if (!STATUTS_EN_ATTENTE.includes(message.statut)) return;

    const debut = this.horloge.maintenant();
    if (message.expireA && debut >= message.expireA) {
      await this.journal.modifier(message.id, { statut: "expire" }, STATUTS_EN_ATTENTE);
      this.logger.warn(`SMS ${message.id} (${message.type}) expiré avant l'envoi`);
      return;
    }

    const numero = travail.attemptsMade + 1;
    let destinataire: string;
    let texte: string;
    try {
      destinataire = this.chiffrement.dechiffrer(
        travail.data.destinataireChiffre,
        `${CONTEXTE_TELEPHONE}:${message.id}`,
      );
      texte = this.chiffrement.dechiffrer(travail.data.texteChiffre, `sms.texte:${message.id}`);
    } catch {
      // Charge utile altérée ou clé retirée : réessayer n'y changera rien.
      await this.journal.modifier(
        message.id,
        { statut: "echec", tentatives: numero, derniereErreur: "charge_illisible" },
        STATUTS_EN_ATTENTE,
      );
      this.logger.error(`SMS ${message.id} (${message.type}) : charge utile illisible`);
      throw new ErreurNonRelancable("charge_illisible");
    }

    try {
      const { fournisseur, reponse } = await this.appeler(message, numero, destinataire, texte);
      await this.enregistrerAcceptation(message, numero, fournisseur, reponse);
      this.actualiserMode();
    } catch (e) {
      this.actualiserMode();
      await this.enregistrerEchec(message, numero, travail.opts.attempts, e);
      throw e instanceof ErreurFournisseurDefinitive ? new ErreurNonRelancable(e.code) : e;
    }
  }

  private async appeler(
    message: MessageSms,
    numero: number,
    destinataire: string,
    texte: string,
  ): Promise<{ fournisseur: FournisseurSms; reponse: ReponseFournisseur }> {
    const ordre = this.registre.ordre();
    let derniere: ErreurFournisseurTemporaire | null = null;
    for (const fournisseur of ordre) {
      if (!this.disjoncteur.autoriser(fournisseur.nom)) continue;
      const debut = this.horloge.maintenant();
      try {
        const reponse = await fournisseur.envoyer({
          reference: message.id,
          expediteur: message.expediteur,
          destinataire,
          texte,
        });
        this.disjoncteur.succes(fournisseur.nom);
        await this.noterEssai(message.id, numero, fournisseur.nom, debut, "accepte", null);
        if (fournisseur !== ordre[0]) {
          this.logger.warn(
            `SMS ${message.id} : parti par le fournisseur de secours ${fournisseur.nom}`,
          );
        }
        return { fournisseur, reponse };
      } catch (e) {
        if (e instanceof ErreurFournisseurDefinitive) {
          // Le fournisseur a répondu : il fonctionne, c'est ce message qu'il refuse.
          this.disjoncteur.succes(fournisseur.nom);
          await this.noterEssai(message.id, numero, fournisseur.nom, debut, "definitif", e.code);
          throw e;
        }
        const code = e instanceof ErreurFournisseurTemporaire ? e.code : "erreur_inconnue";
        this.disjoncteur.echec(fournisseur.nom);
        await this.noterEssai(message.id, numero, fournisseur.nom, debut, "temporaire", code);
        derniere =
          e instanceof ErreurFournisseurTemporaire ? e : new ErreurFournisseurTemporaire(code);
      }
    }
    throw derniere ?? new ErreurFournisseurTemporaire("fournisseurs_indisponibles");
  }

  private async noterEssai(
    messageId: string,
    numero: number,
    fournisseur: string,
    debut: Date,
    resultat: ResultatEssai,
    code: string | null,
  ): Promise<void> {
    const fin = this.horloge.maintenant();
    await this.journal.ajouterEssai({
      messageId,
      numero,
      fournisseur,
      at: fin,
      dureeMs: Math.max(0, fin.getTime() - debut.getTime()),
      resultat,
      code,
    });
  }

  private async enregistrerAcceptation(
    message: MessageSms,
    numero: number,
    fournisseur: FournisseurSms,
    reponse: ReponseFournisseur,
  ): Promise<void> {
    const fin = this.horloge.maintenant();
    const champs = {
      fournisseur: fournisseur.nom,
      idFournisseur: reponse.idFournisseur,
      envoyeA: fin,
      delaiEnvoiMs: Math.max(0, fin.getTime() - (message.planifieA ?? message.creeA).getTime()),
      coutFcfa: message.coutEstimeFcfa,
      tentatives: numero,
      derniereErreur: null,
    };
    // Le fournisseur a accepté : même si le message a été annulé ou a expiré entre-temps, il est parti
    // et sera facturé, le journal doit le dire.
    const enregistre =
      (await this.journal.modifier(message.id, { ...champs, statut: "envoye" }, [
        ...STATUTS_EN_ATTENTE,
        "annule",
        "expire",
        "echec",
      ])) ?? (await this.journal.modifier(message.id, champs)); // un accusé de livraison est passé devant
    if (enregistre) {
      this.logger.log(
        `SMS ${message.id} (${message.type}) accepté par ${fournisseur.nom} en ${champs.delaiEnvoiMs} ms`,
      );
    }
  }

  private async enregistrerEchec(
    message: MessageSms,
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
        `SMS ${message.id} (${message.type}) : essai ${numero}/${essaisMax} échoué (${code}), nouvel essai programmé`,
      );
      return;
    }
    await this.journal.modifier(
      message.id,
      { statut: "echec", tentatives: numero, derniereErreur: code },
      STATUTS_EN_ATTENTE,
    );
    this.logger.error(
      `SMS ${message.id} (${message.type}) : échec définitif après ${numero} essai(s) (${code})`,
    );
    try {
      await this.audit.enregistrer({
        action: "sms.echec",
        resultat: "echec",
        cible: { type: "sms", id: message.id },
        details: {
          typeSms: message.type,
          code,
          essais: numero,
          compagnieId: message.compagnieId,
          reference: message.reference,
        },
      });
    } catch {
      this.logger.error(`SMS ${message.id} : échec non porté au journal d'audit`);
    }
  }

  /** Journalise les bascules de mode (normal, secours, indisponible). */
  private actualiserMode(): void {
    const etat = this.etatCircuits();
    if (etat.mode === this.mode) return;
    const avant = this.mode;
    this.mode = etat.mode;
    const texte = `Passerelle SMS : mode ${avant} → ${etat.mode}`;
    if (etat.mode === "normal") this.logger.log(texte);
    else this.logger.warn(texte);
  }

  /* --------------------------------------------------------------------------- lecture, état */

  async obtenir(id: string): Promise<MessageSms> {
    const m = await this.journal.trouver(id);
    if (!m) throw new MessageSmsIntrouvable();
    return m;
  }

  /** Annule un SMS qui n'est pas encore parti (le bus est arrivé avant l'alerte, par exemple). */
  async annuler(id: string): Promise<VueMessageSms> {
    const message = await this.obtenir(id);
    if (!STATUTS_EN_ATTENTE.includes(message.statut))
      throw new AnnulationImpossible(message.statut);
    await this.file.retirer(id);
    const maj = await this.journal.modifier(id, { statut: "annule" }, STATUTS_EN_ATTENTE);
    if (!maj) throw new AnnulationImpossible((await this.obtenir(id)).statut);
    return vueMessage(maj);
  }

  private etatCircuits(): Pick<EtatPasserelle, "mode" | "fournisseurs"> {
    const ordre = this.registre.ordre();
    const etats = this.disjoncteur.etats(ordre.map((f) => f.nom));
    const fournisseurs = etats.map((e, i) => ({
      ...e,
      role: i === 0 ? ("principal" as const) : ("secours" as const),
      reel: ordre[i]?.reel ?? false,
    }));
    const ouvert = (e: EtatDisjoncteur) => e.circuit === "ouvert";
    const mode: EtatPasserelle["mode"] = etats.every(ouvert)
      ? "indisponible"
      : ouvert(etats[0]!)
        ? "secours"
        : "normal";
    return { mode, fournisseurs };
  }

  async etat(): Promise<EtatPasserelle> {
    return { ...this.etatCircuits(), file: await this.file.compter() };
  }
}
