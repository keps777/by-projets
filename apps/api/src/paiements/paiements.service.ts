import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Refus, conflit, inconnu, interdit, invalide } from "../billetterie/erreurs";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { TelephoneInvalide, normaliserTelephone } from "../socle/comptes/telephone";
import { Horloge } from "../socle/horloge";
import {
  ErreurAgregateurDefinitive,
  ErreurAgregateurTemporaire,
  type DemandeEncaissement,
  type StatutTransaction,
} from "./agregateur";
import { CODE_AGREGATEUR_ABSENT } from "./agregateur-absent";
import { CONFIG_PAIEMENTS, type ConfigPaiements } from "./config";
import { EncaissementsService, type IssueEncaissement } from "./encaissements.service";
import { CODE_CIRCUIT_OUVERT, GardeAgregateur } from "./garde-agregateur";
import { ModeDegradeService } from "./mode-degrade.service";
import type {
  MoyenAgence,
  MoyenEnLigne,
  OperateurMobile,
  Paiement,
  StatutPaiement,
} from "./modeles";
import {
  AnnuaireVoyageurs,
  CommandesAPayer,
  ComptesReversement,
  Paiements,
  Remboursements,
  type CommandeAPayer,
} from "./ports";
import {
  RepartitionImpossible,
  afficherTelephone,
  delaiConfirmationMs,
  estMobile,
  masquerTelephone,
  operateurProbable,
  repartir,
  TEXTES,
  verdictJetonCarte,
} from "./regles";
import { Verrous } from "./verrous";

export interface DemandePaiement {
  /** `proche` n'est pas un moyen de paiement : il passe par un lien (voir `LiensService`). */
  moyen: MoyenEnLigne | "proche";
  /** Mobile : numéro qui reçoit la demande de confirmation (celui du compte par défaut). */
  telephone?: string | undefined;
  /** Carte : jeton produit par le prestataire. Jamais le numéro de carte. */
  jetonCarte?: string | undefined;
}

export interface DemandeGuichet {
  moyen: "mtn_momo" | "orange_money";
  telephone: string;
  montant: number;
  /** Identifiant de la vente côté appareil (idempotence : un double envoi ne débite qu'une fois). */
  cle: string;
}

export interface FiltreReferences {
  du?: Date | undefined;
  au?: Date | undefined;
  compagnieId?: string | undefined;
  statut?: StatutPaiement | undefined;
  limite: number;
}

export const MONTANT_GUICHET_MIN = 100;
export const MONTANT_GUICHET_MAX = 1_000_000;

const OPERATEUR: Record<MoyenEnLigne, OperateurMobile | null> = {
  mtn_momo: "mtn",
  orange_money: "orange",
  carte: null,
};

/**
 * Initiation des paiements : validation, répartition prix/frais, appel à l'agrégateur, lecture du
 * statut. Les issues (webhook, interrogation) sont traitées par `EncaissementsService`.
 *
 * Règles :
 *  - une commande n'a jamais deux paiements en attente : rejouer la même demande rend le paiement
 *    en cours, un autre moyen est refusé (409) tant qu'il n'a pas abouti ou expiré ;
 *  - le prix du billet est crédité à la compagnie par l'agrégateur, les frais à AfriMove : deux
 *    lignes distinctes dès la demande ; une compagnie sans compte ne peut pas être payée en ligne ;
 *  - un numéro de carte est refusé, seul le jeton du prestataire est accepté, jamais conservé ;
 *  - le numéro de téléphone est chiffré, les journaux n'en portent aucune trace.
 */
@Injectable()
export class PaiementsService {
  private readonly journal = new Logger("Paiements");

  constructor(
    private readonly paiements: Paiements,
    private readonly remboursements: Remboursements,
    private readonly commandes: CommandesAPayer,
    private readonly comptes: ComptesReversement,
    private readonly annuaire: AnnuaireVoyageurs,
    private readonly garde: GardeAgregateur,
    private readonly mode: ModeDegradeService,
    private readonly encaissements: EncaissementsService,
    private readonly chiffrement: ChiffrementService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    private readonly verrous: Verrous,
    @Inject(CONFIG_PAIEMENTS) private readonly config: ConfigPaiements,
  ) {}

  /* ------------------------------------------------------------------ voyageur */

  /** Les moyens proposés à l'écran de paiement (vide en mode dégradé). */
  async moyens(voyageur: Utilisateur) {
    const etat = await this.mode.etat();
    if (etat.degrade) return [];
    const telephone = await this.annuaire.telephone(voyageur.id);
    const probable = telephone ? operateurProbable(telephone) : null;
    const t = TEXTES.moyens;
    const numero = telephone ? `${afficherTelephone(telephone)} · ` : "";
    return [
      {
        code: "mtn_momo" as const,
        nom: t.mtn_momo.nom,
        sigle: t.mtn_momo.sigle,
        detail: `${numero}${t.mtn_momo.detail}`,
        choisi: probable !== "orange",
      },
      {
        code: "orange_money" as const,
        nom: t.orange_money.nom,
        sigle: t.orange_money.sigle,
        detail: t.orange_money.detail,
        choisi: probable === "orange",
      },
      { code: "carte" as const, nom: t.carte.nom, detail: t.carte.detail, choisi: false },
      { code: "proche" as const, nom: t.proche.nom, detail: t.proche.detail, choisi: false },
    ];
  }

  /** Le voyageur règle sa commande. Lève 503 `MODE_DEGRADE` si le paiement en ligne est coupé. */
  async payerCommande(
    voyageur: Utilisateur,
    commandeId: string,
    demande: DemandePaiement,
  ): Promise<Paiement> {
    await this.mode.exigerEnLigne();
    const commande = await this.commandes.trouver(commandeId);
    if (!commande || commande.voyageurId !== voyageur.id) {
      throw inconnu("COMMANDE_INCONNUE", "Commande introuvable");
    }
    return this.payer(commande, "voyageur", demande, voyageur);
  }

  /** Un proche règle la commande par le lien reçu (la commande a été vérifiée par `LiensService`). */
  async payerCommandeParProche(
    commande: CommandeAPayer,
    demande: DemandePaiement,
  ): Promise<Paiement> {
    await this.mode.exigerEnLigne();
    return this.payer(commande, "proche", demande, null);
  }

  /** Statut d'un paiement du voyageur. Si l'agrégateur tarde à répondre, on l'interroge. */
  async statut(voyageur: Utilisateur, paiementId: string): Promise<Paiement> {
    const p = await this.paiements.trouver(paiementId);
    if (!p || p.voyageurId !== voyageur.id || !["voyageur", "proche"].includes(p.origine)) {
      throw inconnu("PAIEMENT_INCONNU", "Paiement introuvable");
    }
    return this.rafraichir(p);
  }

  /** Statut d'un paiement de la commande d'un lien (le proche suit son propre paiement). */
  async statutDeLaCommande(commandeId: string, paiementId: string): Promise<Paiement> {
    const p = await this.paiements.trouver(paiementId);
    if (!p || p.commandeId !== commandeId || p.origine === "guichet") {
      throw inconnu("PAIEMENT_INCONNU", "Paiement introuvable");
    }
    return this.rafraichir(p);
  }

  private async rafraichir(p: Paiement): Promise<Paiement> {
    const age = this.horloge.maintenant().getTime() - p.creeA.getTime();
    if (p.statut === "en_attente" && age >= this.config.consultationApresMs) {
      await this.encaissements.synchroniser(p.id);
      return (await this.paiements.trouver(p.id)) ?? p;
    }
    return p;
  }

  /* ------------------------------------------------------------------ encaisser */

  private verifierCommandePayable(commande: CommandeAPayer): void {
    if (commande.statut === "payee") {
      throw conflit("COMMANDE_DEJA_PAYEE", "Cette commande est déjà payée");
    }
    if (
      commande.statut !== "en_attente_paiement" ||
      commande.expireA.getTime() <= this.horloge.maintenant().getTime()
    ) {
      throw conflit("COMMANDE_EXPIREE", "Cette commande a expiré : choisis de nouveau ta place");
    }
  }

  private telephoneNormalise(brut: string): string {
    let tel: string;
    try {
      tel = normaliserTelephone(brut);
    } catch (e) {
      if (e instanceof TelephoneInvalide) {
        throw invalide("TELEPHONE_INVALIDE", "Numéro de téléphone invalide");
      }
      throw e;
    }
    if (!tel.startsWith("+237")) {
      throw invalide(
        "TELEPHONE_NON_CAMEROUNAIS",
        "MTN MoMo et Orange Money demandent un numéro camerounais (+237)",
      );
    }
    return tel;
  }

  private async compteDeLaCompagnie(compagnieId: string): Promise<string> {
    const compte = await this.comptes.compte(compagnieId);
    if (compte === null) {
      throw new Refus(
        422,
        "COMPAGNIE_SANS_COMPTE",
        "Cette compagnie ne peut pas encore être payée en ligne",
      );
    }
    return compte;
  }

  private async payer(
    commande: CommandeAPayer,
    origine: "voyageur" | "proche",
    demande: DemandePaiement,
    acteur: Utilisateur | null,
  ): Promise<Paiement> {
    const moyen = demande.moyen;
    if (moyen === "proche") {
      throw invalide(
        "MOYEN_INVALIDE",
        "Pour faire payer un proche, demande-lui un lien de paiement",
      );
    }
    this.verifierCommandePayable(commande);
    if (commande.conversion && moyen !== "carte") {
      throw invalide(
        "DEVISE_NON_SUPPORTEE",
        `Cette commande est réglée en ${commande.conversion.devise} : seule la carte est possible`,
      );
    }

    let telephone: string | null = null;
    if (estMobile(moyen)) {
      const brut =
        demande.telephone ?? (acteur ? await this.annuaire.telephone(acteur.id) : null) ?? null;
      if (brut === null) throw invalide("TELEPHONE_REQUIS", "Indique le numéro à débiter");
      telephone = this.telephoneNormalise(brut);
    } else {
      const jeton = demande.jetonCarte;
      if (jeton === undefined || jeton === "") {
        throw invalide("JETON_CARTE_REQUIS", "Le jeton de la carte est obligatoire");
      }
      const verdict = verdictJetonCarte(jeton);
      if (verdict === "numero_de_carte") {
        throw invalide(
          "NUMERO_DE_CARTE_REFUSE",
          "Ne saisis jamais le numéro de carte ici : il est géré par le prestataire de paiement",
        );
      }
      if (verdict === "format") throw invalide("JETON_CARTE_INVALIDE", "Jeton de carte invalide");
    }

    const compteCompagnie = await this.compteDeLaCompagnie(commande.compagnieId);
    let repartition;
    try {
      repartition = repartir(
        commande.lignes,
        { compagnie: compteCompagnie, afrimove: this.config.compteAfrimove },
        commande.total,
      );
    } catch (e) {
      if (e instanceof RepartitionImpossible) {
        throw conflit("COMMANDE_INCOHERENTE", "Le total de la commande est incohérent");
      }
      throw e;
    }

    // Un paiement resté en attente au-delà de son délai est tranché avant d'en ouvrir un autre.
    const maintenant = this.horloge.maintenant();
    for (const ouvert of await this.paiements.duCommande(commande.id)) {
      if (ouvert.statut === "en_attente" && ouvert.expireA.getTime() <= maintenant.getTime()) {
        await this.encaissements.synchroniser(ouvert.id);
      }
    }

    const id = randomUUID();
    const paiement: Paiement = {
      id,
      cle: null,
      origine,
      commandeId: commande.id,
      voyageurId: commande.voyageurId,
      compagnieId: commande.compagnieId,
      moyen,
      operateur: OPERATEUR[moyen],
      montant: commande.total,
      devise: commande.conversion
        ? { code: commande.conversion.devise, montantMineur: commande.conversion.montantMineur }
        : null,
      repartition,
      statut: "en_attente",
      confirmation: "a_faire",
      telephoneChiffre: telephone
        ? this.chiffrement.chiffrer(telephone, `paiement.telephone:${id}`)
        : null,
      telephoneMasque: telephone ? masquerTelephone(telephone) : null,
      fournisseur: this.garde.agregateur.nom,
      idFournisseur: null,
      referenceOperateur: null,
      urlAuthentification: null,
      cause: null,
      billetIds: [],
      creeA: maintenant,
      expireA: new Date(maintenant.getTime() + delaiConfirmationMs(moyen, this.config)),
      termineA: null,
    };
    const encaissement: DemandeEncaissement = {
      reference: id,
      moyen,
      montantFcfa: commande.total,
      devise: paiement.devise,
      telephone,
      jetonCarte: moyen === "carte" ? (demande.jetonCarte ?? null) : null,
      libelle: commande.libelle,
      repartition: repartition.map((l) => ({
        beneficiaire: l.beneficiaire,
        compteId: l.compteId,
        montantFcfa: l.montant,
      })),
    };

    const { resultat, issue } = await this.verrous.executer(
      `commande:${commande.id}`,
      async (): Promise<{ resultat: Paiement; issue: IssueEncaissement | null }> => {
        const ouverture = await this.paiements.ouvrir(paiement);
        if (!ouverture.cree) {
          const existant = ouverture.existant;
          const memeTelephone =
            existant.telephoneChiffre === null ||
            this.chiffrement.dechiffrer(
              existant.telephoneChiffre,
              `paiement.telephone:${existant.id}`,
            ) === telephone;
          if (existant.moyen === moyen && memeTelephone) return { resultat: existant, issue: null };
          throw conflit(
            "PAIEMENT_EN_COURS",
            "Un paiement est déjà en cours pour cette commande : attends sa confirmation",
          );
        }
        await this.audit.enregistrer({
          acteur: acteur
            ? { id: acteur.id, role: acteur.role, compagnieId: acteur.compagnieId }
            : null,
          action: "paiement.initie",
          resultat: "succes",
          cible: { type: "paiement", id },
          details: { commandeId: commande.id, moyen, montant: commande.total, origine },
          at: maintenant,
        });
        return this.appelerAgregateur(paiement, encaissement);
      },
    );

    if (issue) await this.encaissements.appliquerIssue(resultat.id, issue);
    return (await this.paiements.trouver(resultat.id)) ?? resultat;
  }

  /**
   * Premier appel à l'agrégateur, sous le verrou de la commande. Un échec temporaire ne veut pas
   * dire « rien n'est parti » (la réponse a pu se perdre) : on demande à l'agrégateur ce qu'il a
   * enregistré sous notre référence avant de conclure.
   */
  private async appelerAgregateur(
    paiement: Paiement,
    encaissement: DemandeEncaissement,
  ): Promise<{ resultat: Paiement; issue: IssueEncaissement | null }> {
    const echouer = async (cause: string): Promise<Paiement> => {
      const apres = await this.paiements.transitionner(paiement.id, ["en_attente"], {
        statut: "echoue",
        cause,
        termineA: this.horloge.maintenant(),
      });
      await this.audit.enregistrer({
        action: "paiement.echoue",
        resultat: "echec",
        cible: { type: "paiement", id: paiement.id },
        details: { moyen: paiement.moyen, raison: cause },
        at: this.horloge.maintenant(),
      });
      return apres ?? paiement;
    };

    try {
      const reponse = await this.garde.initier(encaissement);
      const apres =
        (await this.paiements.modifier(paiement.id, {
          idFournisseur: reponse.idFournisseur,
          urlAuthentification: reponse.urlAuthentification,
          operateur: reponse.operateur ?? paiement.operateur,
        })) ?? paiement;
      return {
        resultat: apres,
        issue:
          reponse.etat === "en_attente"
            ? null
            : {
                etat: reponse.etat,
                idFournisseur: reponse.idFournisseur,
                montantFcfa: null,
                referenceOperateur: reponse.referenceOperateur,
                operateur: reponse.operateur,
                code: reponse.code,
                at: this.horloge.maintenant(),
              },
      };
    } catch (e) {
      if (e instanceof ErreurAgregateurDefinitive) {
        return { resultat: await echouer(e.code), issue: null };
      }
      const code = e instanceof ErreurAgregateurTemporaire ? e.code : "erreur_inattendue";
      if (code === CODE_CIRCUIT_OUVERT || code === CODE_AGREGATEUR_ABSENT) {
        // Rien n'est parti.
        await echouer("agregateur_indisponible");
        throw this.mode.refus(
          code === CODE_AGREGATEUR_ABSENT ? "agregateur_absent" : "agregateur_indisponible",
        );
      }
      let connu: StatutTransaction | null | undefined;
      try {
        connu = await this.garde.consulter(paiement.id);
      } catch {
        connu = undefined;
      }
      if (connu === null) {
        await echouer("agregateur_indisponible");
        throw this.mode.refus("agregateur_indisponible");
      }
      if (connu === undefined) {
        // Peut-être parti : le webhook ou le balayage tranchera.
        this.journal.warn(`Paiement ${paiement.id} : initiation incertaine (${code})`);
        const apres =
          (await this.paiements.modifier(paiement.id, { cause: "initiation_incertaine" })) ??
          paiement;
        return { resultat: apres, issue: null };
      }
      const apres =
        (await this.paiements.modifier(paiement.id, { idFournisseur: connu.idFournisseur })) ??
        paiement;
      return {
        resultat: apres,
        issue:
          connu.etat === "en_attente"
            ? null
            : {
                etat: connu.etat,
                idFournisseur: connu.idFournisseur,
                montantFcfa: connu.montantFcfa,
                referenceOperateur: connu.referenceOperateur,
                operateur: connu.operateur,
                code: connu.code,
                at: connu.at,
              },
      };
    }
  }

  /* ------------------------------------------------------------------ guichet : push MoMo */

  /**
   * Push MoMo ou Orange Money demandé au guichet pour une vente. Pas de commande : tout le montant
   * va à la compagnie, AfriMove n'y prend rien. La vente se conclut avec la référence de l'opérateur
   * (`referenceOperateur`) quand le statut passe à `reussi`.
   */
  async payerAuGuichet(u: Utilisateur, demande: DemandeGuichet): Promise<Paiement> {
    if (u.compagnieId === null) throw interdit("HORS_PERIMETRE", "Compte sans compagnie");
    await this.mode.exigerEnLigne();
    if (
      !Number.isInteger(demande.montant) ||
      demande.montant < MONTANT_GUICHET_MIN ||
      demande.montant > MONTANT_GUICHET_MAX
    ) {
      throw invalide(
        "MONTANT_INVALIDE",
        `Le montant doit être compris entre ${MONTANT_GUICHET_MIN} et ${MONTANT_GUICHET_MAX} F`,
      );
    }
    const telephone = this.telephoneNormalise(demande.telephone);
    const compte = await this.compteDeLaCompagnie(u.compagnieId);
    const id = randomUUID();
    const maintenant = this.horloge.maintenant();
    const paiement: Paiement = {
      id,
      cle: `guichet:${u.compagnieId}:${demande.cle}`,
      origine: "guichet",
      commandeId: null,
      voyageurId: null,
      compagnieId: u.compagnieId,
      moyen: demande.moyen,
      operateur: OPERATEUR[demande.moyen],
      montant: demande.montant,
      devise: null,
      repartition: [{ beneficiaire: "compagnie", compteId: compte, montant: demande.montant }],
      statut: "en_attente",
      confirmation: "sans_objet",
      telephoneChiffre: this.chiffrement.chiffrer(telephone, `paiement.telephone:${id}`),
      telephoneMasque: masquerTelephone(telephone),
      fournisseur: this.garde.agregateur.nom,
      idFournisseur: null,
      referenceOperateur: null,
      urlAuthentification: null,
      cause: null,
      billetIds: [],
      creeA: maintenant,
      expireA: new Date(maintenant.getTime() + this.config.delaiMobileMs),
      termineA: null,
    };
    const encaissement: DemandeEncaissement = {
      reference: id,
      moyen: demande.moyen,
      montantFcfa: demande.montant,
      devise: null,
      telephone,
      jetonCarte: null,
      libelle: "Vente au guichet",
      repartition: [{ beneficiaire: "compagnie", compteId: compte, montantFcfa: demande.montant }],
    };
    const { resultat, issue } = await this.verrous.executer(
      `paiement:${id}`,
      async (): Promise<{ resultat: Paiement; issue: IssueEncaissement | null }> => {
        const ouverture = await this.paiements.ouvrir(paiement);
        if (!ouverture.cree) {
          if (ouverture.existant.compagnieId !== u.compagnieId) {
            throw conflit("CLE_DEJA_UTILISEE", "Cette vente a déjà été utilisée");
          }
          return { resultat: ouverture.existant, issue: null };
        }
        await this.audit.enregistrer({
          acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
          action: "paiement.guichet_initie",
          resultat: "succes",
          cible: { type: "paiement", id },
          details: { moyen: demande.moyen, montant: demande.montant },
          at: maintenant,
        });
        return this.appelerAgregateur(paiement, encaissement);
      },
    );
    if (issue) await this.encaissements.appliquerIssue(resultat.id, issue);
    return (await this.paiements.trouver(resultat.id)) ?? resultat;
  }

  /** Statut d'un push de guichet (même compagnie seulement). */
  async statutGuichet(u: Utilisateur, paiementId: string): Promise<Paiement> {
    const p = await this.paiements.trouver(paiementId);
    if (!p || p.origine !== "guichet" || p.compagnieId !== u.compagnieId) {
      throw inconnu("PAIEMENT_INCONNU", "Paiement introuvable");
    }
    return this.rafraichir(p);
  }

  /* ------------------------------------------------------------------ mode dégradé : à la gare */

  /**
   * Mode dégradé : le voyageur a réservé en ligne, il paie à la gare (espèces) ou en MoMo marchand
   * de l'agence, et le guichetier confirme. La commande passe à « payée » et les billets sont émis
   * comme pour un paiement en ligne. Le prix reste à l'agence : AfriMove n'en reçoit rien (les frais
   * de service, eux, sont consignés dans la répartition et à reverser par l'agence).
   */
  async encaisserEnAgence(
    u: Utilisateur,
    commandeId: string,
    demande: { mode: "especes" | "momo_marchand"; reference?: string | undefined },
  ): Promise<Paiement> {
    await this.mode.exigerDegrade();
    const commande = await this.commandes.trouver(commandeId);
    if (!commande || u.compagnieId === null || commande.compagnieId !== u.compagnieId) {
      throw inconnu("COMMANDE_INCONNUE", "Commande introuvable");
    }
    if (demande.mode === "momo_marchand" && (demande.reference ?? "").trim().length < 3) {
      throw invalide("REFERENCE_REQUISE", "Note la référence de la transaction MoMo");
    }
    const moyen: MoyenAgence = demande.mode === "especes" ? "especes_agence" : "momo_marchand";
    const maintenant = this.horloge.maintenant();
    const id = randomUUID();
    let repartition;
    try {
      repartition = repartir(
        commande.lignes,
        { compagnie: "agence", afrimove: this.config.compteAfrimove },
        commande.total,
      );
    } catch {
      throw conflit("COMMANDE_INCOHERENTE", "Le total de la commande est incohérent");
    }
    const paiement: Paiement = {
      id,
      cle: `agence:${commande.id}`,
      origine: "agence",
      commandeId: commande.id,
      voyageurId: commande.voyageurId,
      compagnieId: commande.compagnieId,
      moyen,
      operateur: null,
      montant: commande.total,
      devise: null,
      repartition,
      statut: "reussi",
      confirmation: "a_faire",
      telephoneChiffre: null,
      telephoneMasque: null,
      fournisseur: null,
      idFournisseur: null,
      referenceOperateur: demande.reference?.trim() || null,
      urlAuthentification: null,
      cause: null,
      billetIds: [],
      creeA: maintenant,
      expireA: maintenant,
      termineA: maintenant,
    };

    const final = await this.verrous.executer(`commande:${commande.id}`, async () => {
      const dejaSaisi = await this.paiements.parCle(`agence:${commande.id}`);
      if (dejaSaisi) return dejaSaisi;
      this.verifierCommandePayable((await this.commandes.trouver(commande.id)) ?? commande);
      const ouverture = await this.paiements.ouvrir(paiement);
      if (!ouverture.cree) {
        if (ouverture.raison === "cle_connue") return ouverture.existant;
        throw conflit(
          "PAIEMENT_EN_COURS",
          "Un paiement en ligne est en cours pour cette commande : attends sa confirmation",
        );
      }
      await this.audit.enregistrer({
        acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
        action: "paiement.encaissement_agence",
        resultat: "succes",
        cible: { type: "paiement", id },
        details: { commandeId: commande.id, moyen, montant: commande.total },
        at: maintenant,
      });
      await this.encaissements.confirmerCommande(paiement);
      return (await this.paiements.trouver(id)) ?? paiement;
    });

    if (final.confirmation === "sieges_perdus") {
      throw conflit("SIEGES_PERDUS", "Les places ont été reprises : rends l'argent au client");
    }
    if (final.confirmation === "commande_annulee") {
      throw conflit("COMMANDE_ANNULEE", "Cette commande a été annulée : rends l'argent au client");
    }
    if (final.confirmation === "doublon") {
      throw conflit("COMMANDE_DEJA_PAYEE", "Cette commande est déjà payée");
    }
    return final;
  }

  /** La commande d'un voyageur, vue du guichet de sa compagnie (pour l'encaisser en mode dégradé). */
  async commandeAEncaisser(u: Utilisateur, commandeId: string) {
    const commande = await this.commandes.trouver(commandeId);
    if (!commande || u.compagnieId === null || commande.compagnieId !== u.compagnieId) {
      throw inconnu("COMMANDE_INCONNUE", "Commande introuvable");
    }
    return {
      commandeId: commande.id,
      libelle: commande.libelle,
      total: commande.total,
      statut: commande.statut,
      expireA: commande.expireA,
      lignes: commande.lignes.map((l) => ({
        code: l.code,
        libelle: l.libelle,
        montant: l.montant,
      })),
    };
  }

  /* ------------------------------------------------------------------ rapprochement */

  /**
   * Paiements avec leurs références opérateur, pour le rapprochement comptable. AfriMove voit tout ;
   * le patron et le comptable, leur compagnie.
   */
  async references(u: Utilisateur, filtre: FiltreReferences) {
    let compagnieId: string | undefined;
    if (u.role === "afrimove") {
      compagnieId = filtre.compagnieId;
    } else {
      if (u.compagnieId === null) throw interdit("HORS_PERIMETRE", "Compte sans compagnie");
      if (filtre.compagnieId !== undefined && filtre.compagnieId !== u.compagnieId) {
        throw interdit("HORS_PERIMETRE", "Cette compagnie n'est pas la vôtre");
      }
      compagnieId = u.compagnieId;
    }
    const liste = await this.paiements.lister({
      ...(filtre.du ? { du: filtre.du } : {}),
      ...(filtre.au ? { au: filtre.au } : {}),
      ...(compagnieId !== undefined ? { compagnieId } : {}),
      ...(filtre.statut ? { statut: filtre.statut } : {}),
      limite: filtre.limite,
    });
    const sortie = [];
    for (const p of liste) {
      const rembourse = (await this.remboursements.dePaiement(p.id))
        .filter((r) => r.statut !== "echoue")
        .reduce((total, r) => total + r.montant, 0);
      sortie.push({ paiement: p, rembourse });
    }
    return sortie;
  }
}
