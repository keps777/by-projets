import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import type { voyageur } from "@afrimove/contrats";
import { AuditService } from "../socle/audit/audit.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { TelephoneInvalide, normaliserTelephone } from "../socle/comptes/telephone";
import { Horloge } from "../socle/horloge";
import { CONFIG_AUTH_VOYAGEUR, LONGUEUR_CODE, type ConfigAuthVoyageur } from "./config";
import { CanalIndisponible, ReessayerPlusTard, Refus } from "./erreurs";
import {
  ComptesVoyageur,
  EmetteurSession,
  EnvoiCodeSms,
  EnvoiCodeWhatsApp,
  FichesVoyageur,
  StockageConnexion,
  type CodeEmis,
  type CompteVoyageur,
  type DemandeEnvoiCode,
} from "./ports";
import {
  codeCorrespond,
  estBloque,
  genererCode,
  hacherCode,
  indexTelephone,
  texteSms,
  type EtatLimite,
} from "./regles";
import { versIsoDouala } from "./temps";
import type { DemandeCodeRecue, VerificationRecue } from "./validation";

const MESSAGE_CODE_EXPIRE = "Ce code a expiré. Demande-en un nouveau.";
const MESSAGE_CODE_FAUX = "Ce code n'est pas bon.";

/** « 4 min 20 s », « 15 min », « 2 h » : l'attente annoncée à la personne. */
function dureeLisible(secondes: number): string {
  if (secondes >= 3600) return `${Math.ceil(secondes / 3600)} h`;
  if (secondes >= 60) return `${Math.ceil(secondes / 60)} min`;
  return `${secondes} s`;
}

/**
 * Connexion du voyageur par numéro et code à usage unique : « ton numéro, c'est ton compte ».
 *
 *  1. `demanderCode` : valide le numéro, applique les limites (1 envoi par 40 s, 5 par heure, blocage
 *     après 5 mauvais codes), fabrique un code de 4 chiffres, range son empreinte et l'envoie par
 *     SMS (ou WhatsApp, avec repli sur le SMS). La réponse est la même que le numéro ait un compte
 *     ou non (pas de moyen de savoir qui est inscrit).
 *  2. `verifierCode` : compare au dernier code émis (usage unique, 5 min), crée le compte au premier
 *     code valide, ouvre la session.
 *
 * Le code n'est ni journalisé, ni audité, ni rangé en clair : seul son HMAC l'est, et il ne sort que
 * dans le message envoyé.
 */
@Injectable()
export class ConnexionVoyageurService {
  private readonly logger = new Logger("ConnexionVoyageur");
  private readonly poivre: Buffer;

  constructor(
    @Inject(CONFIG) appConfig: AppConfig,
    @Inject(CONFIG_AUTH_VOYAGEUR) private readonly config: ConfigAuthVoyageur,
    private readonly horloge: Horloge,
    private readonly stockage: StockageConnexion,
    private readonly sms: EnvoiCodeSms,
    private readonly whatsapp: EnvoiCodeWhatsApp,
    private readonly comptes: ComptesVoyageur,
    private readonly fiches: FichesVoyageur,
    private readonly sessions: EmetteurSession,
    private readonly audit: AuditService,
  ) {
    this.poivre = appConfig.poivre;
  }

  /* ------------------------------------------------------------------ demande du code */

  async demanderCode(demande: DemandeCodeRecue): Promise<voyageur.ReponseDemandeCode> {
    const canalVoulu = demande.canal ?? "sms";
    if (canalVoulu === "ussd") {
      throw new Refus(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "CANAL_INDISPONIBLE",
        "Le code par USSD ne se demande pas depuis l'application.",
      );
    }
    const telephone = this.normaliser(demande.telephone);
    if (!this.config.indicatifsAutorises.some((i) => telephone.startsWith(i))) {
      throw new Refus(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "NUMERO_NON_AUTORISE",
        "Ce numéro n'est pas pris en charge pour l'instant.",
      );
    }
    const index = indexTelephone(this.poivre, telephone);
    const maintenant = this.horloge.maintenant();
    await this.refuserSiBloque(index, maintenant, "connexion.voyageur.code_demande");

    // Même réponse que le numéro soit connu ou non : on n'envoie le code qu'aux comptes éligibles.
    const compte = await this.comptes.trouver(telephone);
    const eligible = compte === null || compte.eligible;

    const id = randomUUID();
    const code = genererCode();
    const canal: "sms" | "whatsapp" =
      canalVoulu === "whatsapp" && this.whatsapp.branche ? "whatsapp" : "sms";
    const expireA = new Date(maintenant.getTime() + this.config.ttlCodeMs);
    const emis: CodeEmis = {
      id,
      telephoneIndex: index,
      codeHache: hacherCode(this.poivre, id, code),
      canal,
      creeA: maintenant,
      expireA,
      consommeA: null,
    };
    const reservation = await this.stockage.reserverEnvoi(emis, {
      intervalleMs: this.config.intervalleEnvoiMs,
      maxParFenetre: this.config.envoisParFenetre,
      fenetreMs: this.config.fenetreEnvoisMs,
    });
    if (!reservation.ok) {
      const attente = (reservation.reessayerA.getTime() - maintenant.getTime()) / 1000;
      await this.audit.enregistrer({
        action: "connexion.voyageur.code_limite",
        resultat: "refus",
        details: { empreinteTelephone: index.slice(0, 12), raison: reservation.raison },
      });
      if (reservation.raison === "trop_tot") {
        throw new ReessayerPlusTard(
          "ENVOI_TROP_RAPPROCHE",
          `Un code vient d'être envoyé. Réessaie dans ${dureeLisible(Math.ceil(attente))}.`,
          attente,
          { renvoiDansSecondes: Math.max(1, Math.ceil(attente)) },
        );
      }
      throw new ReessayerPlusTard(
        "TROP_DE_DEMANDES",
        `Trop de codes demandés pour ce numéro. Réessaie dans ${dureeLisible(Math.ceil(attente))}.`,
        attente,
      );
    }

    let canalEnvoye: "sms" | "whatsapp" = canal;
    if (eligible) {
      canalEnvoye = await this.envoyer(
        canal,
        {
          telephone,
          code,
          texte: texteSms(
            code,
            Math.round(this.config.ttlCodeMs / 60_000),
            this.config.domaineWebOtp,
          ),
          domaine: this.config.domaineWebOtp,
          ttlMinutes: Math.round(this.config.ttlCodeMs / 60_000),
          cle: `otp:${id}`,
          expireA,
        },
        id,
      );
    }
    await this.audit.enregistrer({
      action: "connexion.voyageur.code_demande",
      resultat: "succes",
      acteur: compte && eligible ? { id: compte.id, role: "voyageur", compagnieId: null } : null,
      details: {
        empreinteTelephone: index.slice(0, 12),
        canal: canalEnvoye,
        canalDemande: canalVoulu,
        envoye: eligible,
      },
    });
    return {
      telephone,
      canal: canalEnvoye,
      longueurCode: LONGUEUR_CODE,
      renvoiDansSecondes: Math.ceil(this.config.intervalleEnvoiMs / 1000),
      expireA: versIsoDouala(expireA),
    };
  }

  /** Envoie par le canal choisi ; WhatsApp qui échoue se replie sur le SMS. Renvoie le canal utilisé. */
  private async envoyer(
    canal: "sms" | "whatsapp",
    demande: DemandeEnvoiCode,
    codeId: string,
  ): Promise<"sms" | "whatsapp"> {
    if (canal === "whatsapp") {
      try {
        await this.whatsapp.envoyer(demande);
        return "whatsapp";
      } catch (e) {
        this.logger.warn(
          `Code ${codeId} : WhatsApp indisponible (${e instanceof Error ? e.name : "erreur"}), repli sur le SMS`,
        );
      }
    }
    try {
      await this.sms.envoyer(demande);
      return "sms";
    } catch (e) {
      await this.stockage.annulerEnvoi(codeId);
      this.logger.error(
        `Code ${codeId} : envoi impossible par SMS (${e instanceof Error ? e.name : "erreur"})`,
      );
      await this.audit.enregistrer({
        action: "connexion.voyageur.code_demande",
        resultat: "echec",
        details: { cause: e instanceof CanalIndisponible ? "canal_indisponible" : "erreur_envoi" },
      });
      throw new Refus(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ENVOI_IMPOSSIBLE",
        "Le code n'a pas pu être envoyé. Réessaie dans un instant.",
      );
    }
  }

  /* ------------------------------------------------------------------ vérification du code */

  async verifierCode(verification: VerificationRecue): Promise<voyageur.SessionVoyageur> {
    const telephone = this.normaliser(verification.telephone);
    const index = indexTelephone(this.poivre, telephone);
    const maintenant = this.horloge.maintenant();
    await this.refuserSiBloque(index, maintenant, "connexion.voyageur");

    const emis = await this.stockage.dernierCode(index);
    if (!emis || emis.consommeA !== null || emis.expireA.getTime() <= maintenant.getTime()) {
      await this.audit.enregistrer({
        action: "connexion.voyageur.code",
        resultat: "echec",
        details: { empreinteTelephone: index.slice(0, 12), cause: "aucun_code_valide" },
      });
      throw new Refus(HttpStatus.UNAUTHORIZED, "CODE_EXPIRE", MESSAGE_CODE_EXPIRE);
    }

    if (!codeCorrespond(this.poivre, emis.codeHache, emis.id, verification.code)) {
      const etat = await this.stockage.noterEchec(index, maintenant, {
        essaisMax: this.config.essaisMax,
        fenetreEchecsMs: this.config.fenetreEchecsMs,
        blocageBaseMs: this.config.blocageBaseMs,
        blocageMaxMs: this.config.blocageMaxMs,
      });
      const bloque = estBloque(etat, maintenant);
      await this.audit.enregistrer({
        action: "connexion.voyageur.code",
        resultat: "echec",
        cible: { type: "code_connexion", id: emis.id },
        details: { empreinteTelephone: index.slice(0, 12), echecs: etat.echecs, bloque },
      });
      if (bloque) throw this.trop(etat, maintenant);
      throw new Refus(HttpStatus.UNAUTHORIZED, "CODE_INVALIDE", MESSAGE_CODE_FAUX, {
        essaisRestants: this.config.essaisMax - etat.echecs,
      });
    }

    // Bon code : usage unique, même si deux requêtes arrivent ensemble.
    if (!(await this.stockage.consommer(emis.id, maintenant))) {
      throw new Refus(HttpStatus.UNAUTHORIZED, "CODE_EXPIRE", MESSAGE_CODE_EXPIRE);
    }

    // Le compte naît ici, à la première vérification réussie (« ton numéro, c'est ton compte »).
    let compte = await this.comptes.trouver(telephone);
    let nouveauCompte = false;
    if (compte === null) {
      const creation = await this.comptes.creer(telephone);
      compte = creation.compte;
      nouveauCompte = creation.cree;
    }
    if (!compte.eligible) {
      await this.audit.enregistrer({
        action: "connexion.voyageur",
        resultat: "refus",
        acteur: { id: compte.id, role: "voyageur", compagnieId: null },
        details: { cause: "compte_non_eligible" },
      });
      throw new Refus(HttpStatus.UNAUTHORIZED, "CODE_INVALIDE", MESSAGE_CODE_FAUX);
    }

    await this.stockage.effacerEchecs(index);
    const fiche = await this.fiches.ouvrir(compte.id, maintenant);
    const session = await this.sessions.emettre(compte);
    await this.audit.enregistrer({
      action: "connexion.voyageur",
      resultat: "succes",
      acteur: { id: compte.id, role: "voyageur", compagnieId: null },
      details: { nouveauCompte },
    });
    return {
      jeton: session.jeton,
      expireA: versIsoDouala(session.expireA),
      nouveauCompte,
      profil: profil(compte, telephone, fiche),
    };
  }

  /* ------------------------------------------------------------------ internes */

  private normaliser(brut: string): string {
    try {
      return normaliserTelephone(brut);
    } catch (e) {
      if (e instanceof TelephoneInvalide) {
        throw new Refus(HttpStatus.BAD_REQUEST, "REQUETE_INVALIDE", "Numéro de téléphone invalide");
      }
      throw e;
    }
  }

  private async refuserSiBloque(index: string, at: Date, action: string): Promise<void> {
    const etat = await this.stockage.etat(index);
    if (!estBloque(etat, at)) return;
    await this.audit.enregistrer({
      action: `${action}.bloque`,
      resultat: "refus",
      details: { empreinteTelephone: index.slice(0, 12) },
    });
    throw this.trop(etat, at);
  }

  private trop(etat: EtatLimite, at: Date): ReessayerPlusTard {
    const attente = ((etat.bloqueJusqua?.getTime() ?? at.getTime()) - at.getTime()) / 1000;
    return new ReessayerPlusTard(
      "TROP_ESSAIS",
      `Trop d'essais. Réessaie dans ${dureeLisible(Math.ceil(attente))}.`,
      attente,
    );
  }
}

/** Le profil de la session : prénom et nom viennent du nom rangé (« Aïcha Ngo »), vide à la création. */
function profil(
  compte: CompteVoyageur,
  telephone: string,
  fiche: Awaited<ReturnType<FichesVoyageur["ouvrir"]>>,
): voyageur.Profil {
  const mots = compte.nom.split(/\s+/).filter(Boolean);
  const prenom = mots[0] ?? "";
  const nom = mots.slice(1).join(" ");
  const initiale = (m: string | undefined): string =>
    m ? (Array.from(m)[0] ?? "").toUpperCase() : "";
  return {
    id: compte.id,
    prenom,
    nom,
    initiales: initiale(mots[0]) + (mots.length > 1 ? initiale(mots[mots.length - 1]) : ""),
    telephone,
    pieceVerifiee: fiche.pieceVerifiee,
    ...(fiche.pieceQuatreDerniers ? { pieceQuatreDerniers: fiche.pieceQuatreDerniers } : {}),
    inscritDepuis: versIsoDouala(fiche.inscritA),
    langue: fiche.langue,
  };
}
