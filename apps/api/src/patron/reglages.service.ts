import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { HttpException, Injectable, Logger } from "@nestjs/common";
import type { patron as c } from "@afrimove/contrats";
import {
  conflit,
  interdit,
  introuvable,
  invalide,
  serviceIndisponible,
  verrouille,
} from "../caisse/erreurs";
import { minuitSuivantDoualaMs } from "../caisse/temps";
import { PIN_PROVISOIRE_MINUTES } from "../caisse/regles";
import { erreurApi, lireSignature, type SignaturePin } from "../modules/commande";
import { VerificateurSignature } from "../modules/signature";
import { jourDouala, MS_PAR_MINUTE, versIsoDouala } from "../rapport/temps";
import { genererPinProvisoire } from "../supervision/pin.service";
import { PinsEquipe } from "../supervision/ports";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { HachageService } from "../socle/auth/hachage.service";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONTEXTE_TELEPHONE, ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository, TelephoneDejaUtilise } from "../socle/comptes/personnes.repository";
import { normaliserTelephone } from "../socle/comptes/telephone";
import { LignesService } from "../administration/lignes.service";
import { Horloge } from "../socle/horloge";
import { SmsGateway } from "../socle/sms/sms.gateway";
import { REGLES_PAR_DEFAUT, masquerNumero } from "./calculs";
import { LecturesPatronService } from "./lectures.service";
import {
  type ChangementMembre,
  type MembrePatron,
  type OperateurMomo,
  type ReglesLues,
} from "./modele";
import { EquipePatron, ExploitationPatron, ReferentielPatron, ReglesPatron } from "./ports";
import {
  lireChangerMomo,
  lireConfirmationMomo,
  lireCreerPersonne,
  lireEnregistrerRegles,
  lireModifierPersonne,
  lirePersonneVisee,
  type ChampsPersonne,
} from "./validation";

/** Contexte de chiffrement du numéro des comptes marchands de l'agence. */
export const CONTEXTE_MOMO_AGENCE = "patron.momo.telephone";

/** Durée de validité du code reçu par SMS pour changer un compte marchand. */
export const CODE_MOMO_MINUTES = 10;
/** Essais permis sur un code avant d'en redemander un (le CHECK de la base borne aussi à 3). */
export const CODE_MOMO_ESSAIS = 3;
/** Délai minimum entre deux demandes de code pour le même compte. */
export const CODE_MOMO_DELAI_SECONDES = 60;
const APERCU_EQUIPE = 5;

const estHttp = (e: unknown): e is HttpException => e instanceof HttpException;

/**
 * Les écritures du patron sur ses réglages : équipe, règles de l'agence, comptes mobile money. Les lignes
 * (création, horaires, plan, programmation « dès lundi ») sont réglées par le module administration
 * (`/patron/reglages/lignes`) ; ici on ne fait que les lire pour l'accueil des réglages.
 *
 * Chaque écriture suit le même chemin : le corps est lu strictement (422 `COMMANDE_INVALIDE`), la signature
 * PIN est vérifiée (comme pour les modules : 401 `PIN_REQUIS`, 403 `PIN_INCORRECT`, 423 `PIN_BLOQUE`…), la
 * commande est appliquée à la compagnie du jeton et seulement à elle, et le résultat — accepté ou refusé —
 * entre au journal d'audit (le PIN n'y figure jamais). Les écritures qui touchent plusieurs tables sont des
 * transactions de l'adaptateur.
 */
@Injectable()
export class ReglagesPatronService {
  private readonly journal = new Logger("PatronReglages");

  constructor(
    private readonly lignes: LignesService,
    private readonly exploitation: ExploitationPatron,
    private readonly equipe: EquipePatron,
    private readonly regles: ReglesPatron,
    private readonly referentiel: ReferentielPatron,
    private readonly lectures: LecturesPatronService,
    private readonly pins: PinsEquipe,
    private readonly personnes: PersonnesRepository,
    private readonly comptes: ComptesService,
    private readonly hachage: HachageService,
    private readonly chiffrement: ChiffrementService,
    private readonly sms: SmsGateway,
    private readonly signature: VerificateurSignature,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  /* ------------------------------------------------------------------ outils */

  private compagnieDe(u: Utilisateur): string {
    if (u.compagnieId === null) {
      throw erreurApi(403, "HORS_PERIMETRE", "Ce compte n'est rattaché à aucune compagnie");
    }
    return u.compagnieId;
  }

  private acteur(u: Utilisateur) {
    return { id: u.id, role: u.role, compagnieId: u.compagnieId };
  }

  /**
   * Le chemin commun d'une écriture signée. `lire` valide le corps ; `appliquer` agit et dit ce qu'il faut
   * garder au journal ; le PIN est vérifié entre les deux, et un refus quelconque est tracé.
   */
  private async ecrire<Cmd, R>(
    u: Utilisateur,
    corps: unknown,
    action: string,
    lire: (corps: unknown, signature: SignaturePin) => Cmd,
    cible: (cmd: Cmd) => { type: string; id: string },
    appliquer: (
      cmd: Cmd,
      compagnieId: string,
    ) => Promise<{ details: Record<string, unknown>; reponse: (accuse: c.AccuseSigne) => R }>,
  ): Promise<R> {
    const signature = lireSignature(corps);
    const cmd = lire(corps, signature);
    const compagnieId = this.compagnieDe(u);
    const tracerRefus = async (e: unknown): Promise<void> => {
      const reponse = estHttp(e) ? e.getResponse() : null;
      const cause =
        typeof reponse === "object" && reponse !== null && "code" in reponse
          ? String((reponse as { code: unknown }).code)
          : "erreur";
      await this.audit.enregistrer({
        acteur: this.acteur(u),
        action,
        resultat: "refus",
        cible: cible(cmd),
        details: { cause, methode: signature.methode, signeA: signature.signeA },
      });
    };
    try {
      await this.signature.verifier(u, signature);
    } catch (e) {
      await tracerRefus(e);
      throw e;
    }
    let fait;
    try {
      fait = await appliquer(cmd, compagnieId);
    } catch (e) {
      if (estHttp(e)) await tracerRefus(e);
      throw e;
    }
    const ligne = await this.audit.enregistrer({
      acteur: this.acteur(u),
      action,
      resultat: "succes",
      cible: cible(cmd),
      details: { ...fait.details, methode: signature.methode, signeA: signature.signeA },
    });
    return fait.reponse({
      journalId: ligne.id,
      signeA: versIsoDouala(this.horloge.maintenant()),
      signePar: u.id,
    });
  }

  private async protegerPiste<T>(lire: () => Promise<T>): Promise<T> {
    try {
      return await lire();
    } catch (e) {
      if (estHttp(e)) throw e;
      this.journal.error(`Source indisponible : ${e instanceof Error ? e.message : "erreur"}`);
      throw erreurApi(503, "SOURCE_INDISPONIBLE", "Une source de données ne répond pas");
    }
  }

  /* ------------------------------------------------------------------ accueil */

  /**
   * `GET /patron/reglages` : les lignes, un aperçu de l'équipe et les règles de l'agence. Les lignes viennent du
   * module administration (`LignesService.resumes`), seul propriétaire de leurs horaires et de leurs réglages ;
   * seule la proposition de l'assistant est lue ici.
   */
  async accueil(u: Utilisateur): Promise<c.Reglages> {
    return this.protegerPiste(async () => {
      const compagnieId = this.compagnieDe(u);
      const maintenant = this.horloge.maintenant();
      const [lignes, equipe, regles, decalages] = await Promise.all([
        this.lignes.resumes(compagnieId),
        this.lectures.apercuEquipe(compagnieId, APERCU_EQUIPE),
        this.reglesAgence(compagnieId),
        this.exploitation.decalagesProposes(compagnieId, maintenant),
      ]);
      return {
        lignes: lignes.map((l) => ({
          id: l.id,
          nom: l.nom,
          nbDeparts: l.nbDeparts,
          tarifs: l.tarifs,
          arrets: l.arrets,
          propositionAssistant: decalages[l.id] ?? null,
        })),
        equipe: { total: equipe.total, effectifs: equipe.effectifs, apercu: equipe.apercu },
        regles,
      };
    });
  }

  /* ------------------------------------------------------------------ personnes */

  private vuePersonne(m: MembrePatron): c.PersonneEditable {
    return {
      id: m.id,
      nom: m.nom,
      telephone: this.comptes.telephoneEnClair(m),
      operateur: m.operateur,
      role: m.role,
      gareId: m.gareId,
      guichet: m.guichetRang === null ? null : String(m.guichetRang),
      salaire: m.salaire,
      depuis: jourDouala(m.creeA),
      actif: m.actif,
      droits: m.droits,
    };
  }

  /** `GET /patron/reglages/personnes/:personneId` */
  async personne(u: Utilisateur, personneId: string): Promise<c.PersonneEditable> {
    return this.protegerPiste(async () => {
      const m = await this.equipe.trouver(
        this.compagnieDe(u),
        personneId,
        this.horloge.maintenant(),
      );
      if (!m) throw introuvable("PERSONNE_INCONNUE", "Personne inconnue");
      return this.vuePersonne(m);
    });
  }

  /** La gare (de la compagnie) et le guichet nommés, ou une erreur claire. */
  private async resoudreAffectation(
    compagnieId: string,
    role: ChampsPersonne["role"],
    gareId: string | null,
    guichet: string | null,
  ): Promise<{ gareId: string | null; guichetId: string | null }> {
    if ((role === "guichetier" || role === "superviseur") && gareId === null) {
      throw invalide("GARE_REQUISE", "Un guichetier et un superviseur travaillent dans une gare");
    }
    if (guichet !== null && role !== "guichetier") {
      throw invalide("GUICHET_REFUSE", "Seul un guichetier est affecté à un guichet");
    }
    if (gareId === null) return { gareId: null, guichetId: null };
    const gares = await this.referentiel.gares(compagnieId, this.horloge.maintenant());
    const gare = gares.find((g) => g.id === gareId);
    if (!gare) throw introuvable("GARE_INCONNUE", "Gare inconnue");
    if (guichet === null) return { gareId, guichetId: null };
    const rang = /^[1-9]$/.test(guichet) ? Number(guichet) : null;
    const guichetId = rang === null ? null : await this.equipe.guichetDeGare(gareId, rang);
    if (guichetId === null) throw introuvable("GUICHET_INCONNU", "Guichet inconnu dans cette gare");
    return { gareId, guichetId };
  }

  private numeroNormalise(telephone: string): string {
    try {
      return normaliserTelephone(telephone);
    } catch {
      throw invalide("TELEPHONE_INVALIDE", "Numéro de téléphone invalide");
    }
  }

  /** `POST /patron/reglages/personnes` : un compte et ses réglages, puis le PIN provisoire par SMS. */
  async creerPersonne(u: Utilisateur, corps: unknown): Promise<c.PersonneEnregistree> {
    return this.ecrire(
      u,
      corps,
      "reglages.personne_creee",
      (b) => lireCreerPersonne(b),
      (cmd) => ({ type: "personne", id: cmd.role }),
      async (cmd, compagnieId) => {
        const telephone = this.numeroNormalise(cmd.telephone);
        const lieu = await this.resoudreAffectation(compagnieId, cmd.role, cmd.gareId, cmd.guichet);
        const maintenant = this.horloge.maintenant();
        const pin = genererPinProvisoire();
        const jusqua = new Date(maintenant.getTime() + PIN_PROVISOIRE_MINUTES * MS_PAR_MINUTE);
        const id = randomUUID();
        try {
          await this.equipe.creer({
            id,
            nom: cmd.nom,
            telephoneChiffre: this.chiffrement.chiffrer(telephone, CONTEXTE_TELEPHONE),
            telephoneIndex: this.comptes.indexTelephone(telephone),
            role: cmd.role,
            compagnieId,
            gareId: lieu.gareId,
            guichetId: lieu.guichetId,
            pinHache: await this.hachage.hacher(pin),
            // Le premier mot de passe d'un superviseur ou d'un comptable se pose à sa première connexion.
            motDePasseHache: null,
            pinProvisoireJusqua: jusqua,
            operateur: cmd.operateur,
            salaire: cmd.salaire,
            jourDePaie: 30,
            droits: cmd.droits,
          });
        } catch (e) {
          if (e instanceof TelephoneDejaUtilise) {
            throw conflit("TELEPHONE_DEJA_UTILISE", "Ce numéro est déjà associé à un compte");
          }
          throw e;
        }
        const envoye = await this.envoyerPin(telephone, pin);
        const m = await this.equipe.trouver(compagnieId, id, maintenant);
        if (!m) throw new Error("Personne créée introuvable");
        return {
          details: { personneId: id, role: cmd.role, gareId: lieu.gareId, smsEnvoye: envoye },
          reponse: (accuse) => ({
            ...accuse,
            personne: this.vuePersonne(m),
            pinProvisoireEnvoye: envoye,
          }),
        };
      },
    );
  }

  /** Vrai si le SMS est parti. Un SMS qui échoue n'annule pas le compte : le patron renvoie un PIN. */
  private async envoyerPin(telephone: string, pin: string): Promise<boolean> {
    try {
      await this.sms.envoyer(
        telephone,
        `AfriMove : votre PIN provisoire est ${pin}. Il est valable ${PIN_PROVISOIRE_MINUTES / 60} h. ` +
          "Changez-le à votre prochaine connexion. Ne le donnez à personne.",
      );
      return true;
    } catch {
      this.journal.warn("Le SMS du PIN provisoire n'a pas pu partir");
      return false;
    }
  }

  /** `PUT /patron/reglages/personnes/:personneId` */
  async modifierPersonne(
    u: Utilisateur,
    personneIdUrl: string,
    corps: unknown,
  ): Promise<c.PersonneEnregistree> {
    return this.ecrire(
      u,
      corps,
      "reglages.personne_modifiee",
      (b) => {
        const lu = lireModifierPersonne(b);
        if (lu.personneId !== personneIdUrl) {
          throw invalide("COMMANDE_INVALIDE", "La personne du corps diffère de celle de l'URL");
        }
        return lu;
      },
      (cmd) => ({ type: "personne", id: cmd.personneId }),
      async (cmd, compagnieId) => {
        const maintenant = this.horloge.maintenant();
        const actuelle = await this.equipe.trouver(compagnieId, cmd.personneId, maintenant);
        if (!actuelle) throw introuvable("PERSONNE_INCONNUE", "Personne inconnue");
        if (!actuelle.actif) {
          throw conflit("PERSONNE_DESACTIVEE", "Ce compte est désactivé : il ne se modifie plus");
        }
        const ch = cmd.champs;
        const role = ch.role ?? actuelle.role;
        const gareId = ch.gareId !== undefined ? ch.gareId : actuelle.gareId;
        const guichetActuel = actuelle.guichetRang === null ? null : String(actuelle.guichetRang);
        const gareChange = ch.gareId !== undefined && ch.gareId !== actuelle.gareId;
        const roleChange = ch.role !== undefined && ch.role !== actuelle.role;
        const guichet =
          ch.guichet !== undefined ? ch.guichet : gareChange || roleChange ? null : guichetActuel;
        const lieu = await this.resoudreAffectation(compagnieId, role, gareId, guichet);

        // Une caisse ouverte ne change pas de mains en cours de journée.
        const affectationChange =
          gareChange || roleChange || (ch.guichet !== undefined && ch.guichet !== guichetActuel);
        if (
          affectationChange &&
          actuelle.role === "guichetier" &&
          actuelle.situation === "en_service"
        ) {
          throw conflit(
            "PERSONNE_EN_SERVICE",
            "Sa caisse est ouverte : changez son affectation après la clôture",
          );
        }

        const changement: ChangementMembre = {};
        if (ch.nom !== undefined && ch.nom !== actuelle.nom) changement.nom = ch.nom;
        if (ch.telephone !== undefined) {
          const telephone = this.numeroNormalise(ch.telephone);
          const actuel = this.comptes.telephoneEnClair(actuelle);
          if (telephone !== actuel) {
            changement.telephoneChiffre = this.chiffrement.chiffrer(telephone, CONTEXTE_TELEPHONE);
            changement.telephoneIndex = this.comptes.indexTelephone(telephone);
          }
        }
        if (roleChange) changement.role = role;
        if (gareChange) changement.gareId = lieu.gareId;
        if (affectationChange || gareChange) changement.guichetId = lieu.guichetId;
        if (ch.operateur !== undefined && ch.operateur !== actuelle.operateur) {
          changement.operateur = ch.operateur;
        }
        if (ch.salaire !== undefined && ch.salaire !== actuelle.salaire)
          changement.salaire = ch.salaire;
        if (ch.droits !== undefined) changement.droits = ch.droits;

        if (Object.keys(changement).length > 0) {
          try {
            await this.equipe.modifier(cmd.personneId, changement);
          } catch (e) {
            if (e instanceof TelephoneDejaUtilise) {
              throw conflit("TELEPHONE_DEJA_UTILISE", "Ce numéro est déjà associé à un compte");
            }
            throw e;
          }
        }
        const m = await this.equipe.trouver(compagnieId, cmd.personneId, maintenant);
        if (!m) throw introuvable("PERSONNE_INCONNUE", "Personne inconnue");
        return {
          details: {
            personneId: cmd.personneId,
            champs: Object.keys(ch),
            ...(roleChange ? { roleAvant: actuelle.role, roleApres: role } : {}),
            ...(ch.salaire !== undefined
              ? { salaireAvant: actuelle.salaire, salaireApres: ch.salaire }
              : {}),
          },
          reponse: (accuse) => ({
            ...accuse,
            personne: this.vuePersonne(m),
            pinProvisoireEnvoye: false,
          }),
        };
      },
    );
  }

  /** `POST /patron/reglages/personnes/:personneId/desactivation` : immédiat, le compte ne passe plus. */
  async desactiver(
    u: Utilisateur,
    personneIdUrl: string,
    corps: unknown,
  ): Promise<c.PersonneDesactivee> {
    return this.ecrire(
      u,
      corps,
      "reglages.personne_desactivee",
      (b) => this.personneDuCorps(b, personneIdUrl),
      (id) => ({ type: "personne", id }),
      async (personneId, compagnieId) => {
        if (personneId === u.id) {
          throw interdit("AUTO_DESACTIVATION", "Vous ne pouvez pas désactiver votre propre compte");
        }
        const maintenant = this.horloge.maintenant();
        const m = await this.equipe.trouver(compagnieId, personneId, maintenant);
        if (!m) throw introuvable("PERSONNE_INCONNUE", "Personne inconnue");
        if (!m.actif) throw conflit("DEJA_DESACTIVEE", "Ce compte est déjà désactivé");
        await this.equipe.desactiver(personneId);
        return {
          details: { personneId, role: m.role },
          reponse: (accuse) => ({ ...accuse, personneId, desactiveeA: versIsoDouala(maintenant) }),
        };
      },
    );
  }

  private personneDuCorps(corps: unknown, personneIdUrl: string): string {
    const personneId = lirePersonneVisee(corps);
    if (personneId !== personneIdUrl) {
      throw invalide("COMMANDE_INVALIDE", "La personne du corps diffère de celle de l'URL");
    }
    return personneId;
  }

  /** `POST /patron/reglages/personnes/:personneId/pin-provisoire` : un PIN valable 1 h, envoyé par SMS. */
  async pinProvisoire(
    u: Utilisateur,
    personneIdUrl: string,
    corps: unknown,
  ): Promise<c.PinProvisoireEnvoye> {
    return this.ecrire(
      u,
      corps,
      "reglages.pin_provisoire",
      (b) => this.personneDuCorps(b, personneIdUrl),
      (id) => ({ type: "personne", id }),
      async (personneId, compagnieId) => {
        const maintenant = this.horloge.maintenant();
        const m = await this.equipe.trouver(compagnieId, personneId, maintenant);
        if (!m) throw introuvable("PERSONNE_INCONNUE", "Personne inconnue");
        if (!m.actif) throw conflit("PERSONNE_DESACTIVEE", "Ce compte est désactivé");
        const compte = await this.personnes.trouverParId(personneId);
        if (!compte) throw introuvable("PERSONNE_INCONNUE", "Personne inconnue");
        const pin = genererPinProvisoire();
        const jusqua = new Date(maintenant.getTime() + PIN_PROVISOIRE_MINUTES * MS_PAR_MINUTE);
        await this.pins.definirProvisoire(personneId, await this.hachage.hacher(pin), jusqua);
        // Un nouveau PIN lève aussi un blocage : la personne n'a plus l'ancien en tête.
        await this.personnes.enregistrerEchec(personneId, 0, null);
        if (!(await this.envoyerPin(this.comptes.telephoneEnClair(compte), pin))) {
          throw serviceIndisponible(
            "SMS_ECHEC",
            "Le SMS du PIN provisoire n'a pas pu partir : renouvelez le PIN pour réessayer",
          );
        }
        return {
          details: { personneId, valableJusqua: versIsoDouala(jusqua) },
          reponse: (accuse) => ({ ...accuse, personneId, valableJusqua: versIsoDouala(jusqua) }),
        };
      },
    );
  }

  /* ------------------------------------------------------------------ règles */

  private async reglesAgence(compagnieId: string): Promise<c.ReglesAgence> {
    const [lues, chiffres] = await Promise.all([
      this.regles.lire(compagnieId),
      this.regles.comptes(compagnieId),
    ]);
    const r: ReglesLues = lues ?? REGLES_PAR_DEFAUT;
    const masque = (chiffre: string | null): string => {
      if (chiffre === null) return "";
      try {
        return masquerNumero(this.chiffrement.dechiffrer(chiffre, CONTEXTE_MOMO_AGENCE));
      } catch {
        return "";
      }
    };
    return {
      annulation: r.annulation,
      caisse: {
        toleranceEcart: r.caisse.toleranceEcart ?? REGLES_PAR_DEFAUT.caisse.toleranceEcart!,
        auDela: r.caisse.auDela,
      },
      cadence: r.cadence,
      fraisService: r.fraisService,
      comptesMomo: {
        mtn: { numeroMasque: masque(chiffres.mtn) },
        orange: { numeroMasque: masque(chiffres.orange) },
      },
    };
  }

  /** `GET /patron/reglages/regles` */
  async reglesDeLAgence(u: Utilisateur): Promise<c.ReglesAgence> {
    return this.protegerPiste(() => this.reglesAgence(this.compagnieDe(u)));
  }

  /** `PUT /patron/reglages/regles` : la tolérance de caisse s'applique aux clôtures qui suivent. */
  async enregistrerRegles(u: Utilisateur, corps: unknown): Promise<c.ReglesEnregistrees> {
    return this.ecrire(
      u,
      corps,
      "reglages.regles_modifiees",
      (b) => lireEnregistrerRegles(b),
      () => ({ type: "regles", id: "agence" }),
      async (regles, compagnieId) => {
        if (regles.caisse.toleranceEcart > TOLERANCE_MAX) {
          throw invalide(
            "TOLERANCE_HORS_LIMITES",
            `La tolérance d'écart ne dépasse pas ${TOLERANCE_MAX} F`,
          );
        }
        if (regles.fraisService.montant > FRAIS_SERVICE_MAX) {
          throw invalide(
            "FRAIS_HORS_LIMITES",
            `Les frais de service ne dépassent pas ${FRAIS_SERVICE_MAX} F`,
          );
        }
        const avant = await this.reglesAgence(compagnieId);
        await this.regles.ecrire(compagnieId, regles, "", this.horloge.maintenant());
        const apres = await this.reglesAgence(compagnieId);
        return {
          details: { avant: sansComptes(avant), apres: sansComptes(apres) },
          reponse: (accuse) => ({ ...accuse, regles: apres }),
        };
      },
    );
  }

  /* ------------------------------------------------------------------ comptes mobile money */

  private empreinteCode(
    code: string,
    compagnieId: string,
    operateur: OperateurMomo,
    numero: string,
  ): string {
    return this.chiffrement.indexAveugle(
      `${code}|${compagnieId}|${operateur}|${numero}`,
      "patron.momo.confirmation",
    );
  }

  private libelleOperateur = (o: OperateurMomo): string =>
    o === "mtn" ? "MTN MoMo" : "Orange Money";

  /** `POST /patron/reglages/comptes-momo/confirmation` : un code à 6 chiffres part par SMS sur l'ancien numéro. */
  async demanderConfirmationMomo(
    u: Utilisateur,
    corps: unknown,
  ): Promise<c.ConfirmationCompteMomoEnvoyee> {
    return this.ecrire(
      u,
      corps,
      "reglages.compte_momo_confirmation",
      (b) => lireConfirmationMomo(b),
      (cmd) => ({ type: "compte_momo", id: cmd.operateur }),
      async (cmd, compagnieId) => {
        const nouveau = this.numeroNormalise(
          cmd.nouveauNumero.startsWith("+") ? cmd.nouveauNumero : `+${cmd.nouveauNumero}`,
        );
        const maintenant = this.horloge.maintenant();
        const chiffres = await this.regles.comptes(compagnieId);
        const ancienChiffre = chiffres[cmd.operateur];
        const ancien =
          ancienChiffre === null
            ? null
            : this.chiffrement.dechiffrer(ancienChiffre, CONTEXTE_MOMO_AGENCE);
        if (ancien !== null && ancien === nouveau) {
          throw conflit("NUMERO_IDENTIQUE", "C'est déjà le numéro de ce compte");
        }
        const derniere = await this.regles.confirmation(compagnieId, cmd.operateur);
        if (
          derniere &&
          maintenant.getTime() - derniere.creeA.getTime() < CODE_MOMO_DELAI_SECONDES * 1000
        ) {
          throw erreurApi(
            429,
            "CONFIRMATION_TROP_RAPPROCHEE",
            "Un code vient d'être envoyé : patientez une minute",
          );
        }
        // Sans compte déjà réglé, le code part sur le téléphone du patron lui-même.
        let destinataire = ancien;
        if (destinataire === null) {
          const patron = await this.personnes.trouverParId(u.id);
          if (!patron) throw erreurApi(401, "COMPTE_INACTIF", "Compte inactif");
          destinataire = this.comptes.telephoneEnClair(patron);
        }
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const expireA = new Date(maintenant.getTime() + CODE_MOMO_MINUTES * MS_PAR_MINUTE);
        await this.regles.demanderConfirmation(compagnieId, cmd.operateur, {
          empreinte: this.empreinteCode(code, compagnieId, cmd.operateur, nouveau),
          creeA: maintenant,
          expireA,
        });
        try {
          await this.sms.envoyer(
            destinataire,
            `AfriMove : code ${code} pour changer le compte ${this.libelleOperateur(cmd.operateur)} ` +
              `de votre agence. Valable ${CODE_MOMO_MINUTES} minutes. Ne le donnez à personne.`,
          );
        } catch {
          throw serviceIndisponible(
            "SMS_ECHEC",
            "Le SMS n'a pas pu partir : réessayez dans un instant",
          );
        }
        return {
          details: {
            operateur: cmd.operateur,
            premierCompte: ancien === null,
            expireA: versIsoDouala(expireA),
          },
          reponse: () => ({
            envoyeA: masquerNumero(destinataire),
            expireA: versIsoDouala(expireA),
          }),
        };
      },
    );
  }

  /** `PUT /patron/reglages/comptes-momo` : le nouveau compte, avec le code reçu ; l'ancien tient jusqu'à minuit. */
  async changerCompteMomo(u: Utilisateur, corps: unknown): Promise<c.CompteMomoChange> {
    return this.ecrire(
      u,
      corps,
      "reglages.compte_momo_change",
      (b) => lireChangerMomo(b),
      (cmd) => ({ type: "compte_momo", id: cmd.operateur }),
      async (cmd, compagnieId) => {
        const nouveau = this.numeroNormalise(
          cmd.nouveauNumero.startsWith("+") ? cmd.nouveauNumero : `+${cmd.nouveauNumero}`,
        );
        const maintenant = this.horloge.maintenant();
        const demande = await this.regles.confirmation(compagnieId, cmd.operateur);
        if (!demande)
          throw conflit("CONFIRMATION_ABSENTE", "Demandez d'abord un code de confirmation");
        if (demande.expireA.getTime() <= maintenant.getTime()) {
          throw conflit("CONFIRMATION_EXPIREE", "Le code a expiré : demandez-en un nouveau");
        }
        if (demande.essais >= CODE_MOMO_ESSAIS) {
          throw verrouille("CONFIRMATION_BLOQUEE", "Trop d'essais : demandez un nouveau code");
        }
        const attendu = Buffer.from(demande.empreinte, "hex");
        const recu = Buffer.from(
          this.empreinteCode(cmd.codeSms, compagnieId, cmd.operateur, nouveau),
          "hex",
        );
        if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) {
          await this.regles.compterEssai(compagnieId, cmd.operateur);
          throw interdit("CODE_SMS_INCORRECT", "Code incorrect");
        }
        const effet = new Date(minuitSuivantDoualaMs(maintenant));
        await this.regles.changerCompte(
          compagnieId,
          cmd.operateur,
          this.chiffrement.chiffrer(nouveau, CONTEXTE_MOMO_AGENCE),
          effet,
          u.id,
          maintenant,
        );
        return {
          details: { operateur: cmd.operateur, ancienValableJusqua: versIsoDouala(effet) },
          reponse: (accuse) => ({
            ...accuse,
            operateur: cmd.operateur,
            numeroMasque: masquerNumero(nouveau),
            effetA: versIsoDouala(effet),
          }),
        };
      },
    );
  }
}

/** Tolérance d'écart de caisse au plus égale à 50 000 F. Provisoire (à confirmer). */
export const TOLERANCE_MAX = 50_000;
/** Frais de service au plus égaux à 5 000 F. Provisoire (à confirmer). */
export const FRAIS_SERVICE_MAX = 5_000;

const sansComptes = (r: c.ReglesAgence): Omit<c.ReglesAgence, "comptesMomo"> => {
  const { comptesMomo: _c, ...reste } = r;
  return reste;
};
