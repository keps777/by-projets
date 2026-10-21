import type { EtatLimite, ReglesEnvoi, ReglesEssais } from "./regles";

/**
 * Les ports de la connexion du voyageur (AM-023) : classes abstraites que `AuthVoyageurModule` fournit
 * avec des adaptateurs en mémoire (tests, développement) et que le coordinateur remplace par les
 * versions durables (PostgreSQL, passerelles SMS et WhatsApp). Les tables attendues sont décrites
 * dans le README du dossier.
 */

/* ------------------------------------------------------------------------------------ codes */

/** Un code émis. Le code lui-même n'est jamais rangé, seulement son empreinte. */
export interface CodeEmis {
  id: string;
  /** Index aveugle du numéro (`indexTelephone`). */
  telephoneIndex: string;
  codeHache: string;
  canal: "sms" | "whatsapp";
  creeA: Date;
  expireA: Date;
  consommeA: Date | null;
}

export type ReservationEnvoi =
  | { ok: true }
  | { ok: false; raison: "trop_tot" | "quota"; reessayerA: Date };

/**
 * Stockage des codes et des essais. Chaque méthode est **atomique** : deux requêtes simultanées pour
 * le même numéro ne peuvent ni dépasser le quota d'envois, ni compter un mauvais code une seule fois,
 * ni consommer deux fois le même code (PostgreSQL : verrou consultatif par numéro ou UPDATE
 * conditionnel, voir le README).
 */
export abstract class StockageConnexion {
  /** `false` : les données disparaissent au redémarrage (le module refuse alors de démarrer en production). */
  abstract readonly durable: boolean;

  /**
   * Range le code si les règles d'envoi le permettent (`decider` sur les codes déjà émis pour ce
   * numéro, tous sorts confondus), sinon dit pourquoi et à partir de quand.
   */
  abstract reserverEnvoi(code: CodeEmis, regles: ReglesEnvoi): Promise<ReservationEnvoi>;

  /** Retire un code dont l'envoi a échoué (le numéro peut réessayer tout de suite). */
  abstract annulerEnvoi(codeId: string): Promise<void>;

  /** Le code émis le plus récemment pour ce numéro (consommé ou non, expiré ou non), ou `null`. */
  abstract dernierCode(telephoneIndex: string): Promise<CodeEmis | null>;

  /** Usage unique : `false` si le code était déjà consommé (même en cas de concurrence). */
  abstract consommer(codeId: string, at: Date): Promise<boolean>;

  abstract etat(telephoneIndex: string): Promise<EtatLimite>;

  /** Compte un mauvais code (`appliquerEchec`) et renvoie l'état qui en résulte. */
  abstract noterEchec(telephoneIndex: string, at: Date, regles: ReglesEssais): Promise<EtatLimite>;

  /** Connexion réussie : efface les erreurs et les blocages du numéro. */
  abstract effacerEchecs(telephoneIndex: string): Promise<void>;
}

/* ------------------------------------------------------------------------------------ envoi */

export interface DemandeEnvoiCode {
  /** Numéro international normalisé (`+237691221008`). */
  telephone: string;
  code: string;
  /** Texte prêt à partir par SMS : il se termine par `@<domaine> #<code>` (WebOTP). */
  texte: string;
  domaine: string;
  ttlMinutes: number;
  /** Idempotence : le même identifiant ne produit jamais deux messages (`otp:<codeId>`). */
  cle: string;
  expireA: Date;
}

/**
 * Envoi du code par SMS. L'implémentation de production confie `texte` TEL QUEL à la passerelle SMS
 * (`PasserelleSmsService`), sans en changer une ligne : WebOTP lit la dernière.
 */
export abstract class EnvoiCodeSms {
  /** `true` : un vrai fournisseur ; `false` : simulateur ou boîte en mémoire. */
  abstract readonly reel: boolean;
  /** Lève `CanalIndisponible` si le message n'a pas pu être pris en charge. */
  abstract envoyer(demande: DemandeEnvoiCode): Promise<void>;
}

/**
 * Envoi du code par WhatsApp (gabarit d'authentification approuvé par Meta, bouton « copier le
 * code »). Quand le canal n'est pas branché (`branche === false`) ou refuse, la connexion se replie
 * sur le SMS et la réponse le dit (`canal: "sms"`).
 */
export abstract class EnvoiCodeWhatsApp {
  abstract readonly reel: boolean;
  /** `false` : aucun gabarit ni fournisseur derrière (la demande WhatsApp part par SMS). */
  abstract readonly branche: boolean;
  abstract envoyer(demande: DemandeEnvoiCode): Promise<void>;
}

/* ------------------------------------------------------------------------------------ compte */

export interface CompteVoyageur {
  id: string;
  /** Nom complet tel que rangé (« Aïcha Ngo »), vide à la création du compte. */
  nom: string;
  /** Actif et porteur du rôle « voyageur » : seul un compte éligible reçoit un code et une session. */
  eligible: boolean;
}

/**
 * Le compte voyageur, c'est le numéro de téléphone : il naît à la première vérification réussie.
 * L'adaptateur de production s'appuie sur la table des personnes du socle (`ComptesVoyageurSocle`).
 */
export abstract class ComptesVoyageur {
  /** Le compte de ce numéro, éligible ou non, ou `null`. */
  abstract trouver(telephone: string): Promise<CompteVoyageur | null>;
  /**
   * Crée le compte du numéro. Deux créations simultanées donnent le même compte (`cree` est vrai
   * pour une seule d'entre elles).
   */
  abstract creer(telephone: string): Promise<{ compte: CompteVoyageur; cree: boolean }>;
}

export interface FicheVoyageur {
  personneId: string;
  /** Première connexion (« inscrit depuis »). */
  inscritA: Date;
  langue: "fr" | "en";
  /** Pièce d'identité vérifiée (écran « Moi »). */
  pieceVerifiee: boolean;
  /** 4 derniers chiffres de la pièce, imprimés sur le billet. */
  pieceQuatreDerniers: string | null;
}

/** Ce que le profil affiche en plus du nom et du numéro. */
export abstract class FichesVoyageur {
  abstract readonly durable: boolean;
  /** La fiche du compte, créée à `at` si elle n'existait pas (sans effet sinon). */
  abstract ouvrir(personneId: string, at: Date): Promise<FicheVoyageur>;
}

/* ------------------------------------------------------------------------------------ session */

export interface SessionEmise {
  jeton: string;
  expireA: Date;
}

/** Émet le jeton de session du voyageur (JWT du socle en production). */
export abstract class EmetteurSession {
  abstract emettre(compte: CompteVoyageur): Promise<SessionEmise>;
}
