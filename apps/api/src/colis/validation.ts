import { requeteInvalide } from "./erreurs";

/**
 * Lecture des corps de requête. L'API ne peut pas importer zod (ni `@afrimove/contrats`) à
 * l'exécution : ces lecteurs reprennent à la main les règles des schémas du contrat, et
 * `validation.test.ts` les compare aux schémas zod sur des cas valides et invalides.
 * Les champs inconnus sont ignorés (comme `z.object`) et jamais recopiés.
 */

export interface ErreurChamp {
  chemin: string;
  message: string;
}

export const RE_ISO_DOUALA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/;
export const RE_TELEPHONE = /^\+\d{8,15}$/;
export const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RE_CODE_RETRAIT = /^\d{6}$/;

type Brut = Record<string, unknown>;

const estObjet = (v: unknown): v is Brut =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Un objet en cours de lecture ; les erreurs s'accumulent et sont signalées toutes ensemble. */
export class Lecteur {
  constructor(
    private readonly brut: Brut,
    private readonly chemin: string,
    private readonly erreurs: ErreurChamp[],
  ) {}

  private cle(nom: string): string {
    return this.chemin === "" ? nom : `${this.chemin}.${nom}`;
  }

  private echec(nom: string, message: string): void {
    this.erreurs.push({ chemin: this.cle(nom), message });
  }

  private valeur(nom: string): unknown {
    return this.brut[nom];
  }

  chaine(nom: string, options: { max?: number; vide?: boolean } = {}): string {
    const v = this.valeur(nom);
    if (typeof v !== "string" || (v.length < 1 && options.vide !== true)) {
      this.echec(nom, "Texte non vide attendu");
      return "";
    }
    if (options.max !== undefined && v.length > options.max) {
      this.echec(nom, `${options.max} caractères au plus`);
    }
    return v;
  }

  chaineOpt(nom: string, options: { max?: number; vide?: boolean } = {}): string | undefined {
    return this.valeur(nom) === undefined ? undefined : this.chaine(nom, options);
  }

  entier(nom: string, options: { min?: number; max?: number } = {}): number {
    const v = this.valeur(nom);
    if (typeof v !== "number" || !Number.isSafeInteger(v)) {
      this.echec(nom, "Entier attendu");
      return 0;
    }
    if (options.min !== undefined && v < options.min) this.echec(nom, `Au moins ${options.min}`);
    if (options.max !== undefined && v > options.max) this.echec(nom, `Au plus ${options.max}`);
    return v;
  }

  /** Montant en FCFA : entier, jamais négatif. */
  montant(nom: string): number {
    return this.entier(nom, { min: 0 });
  }

  positif(nom: string): number {
    const v = this.valeur(nom);
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      this.echec(nom, "Nombre strictement positif attendu");
      return 1;
    }
    return v;
  }

  booleen(nom: string): boolean {
    const v = this.valeur(nom);
    if (typeof v !== "boolean") {
      this.echec(nom, "Booléen attendu");
      return false;
    }
    return v;
  }

  /** Champ qui doit valoir `null` (événement sans numéro de plage). */
  nul(nom: string): null {
    if (this.valeur(nom) !== null) this.echec(nom, "Doit valoir null");
    return null;
  }

  vrai(nom: string): true {
    if (this.valeur(nom) !== true) this.echec(nom, "Doit valoir true");
    return true;
  }

  enumeration<T extends string>(nom: string, valeurs: readonly T[], defaut?: T): T {
    const v = this.valeur(nom);
    if (v === undefined && defaut !== undefined) return defaut;
    if (typeof v !== "string" || !(valeurs as readonly string[]).includes(v)) {
      this.echec(nom, `Valeur attendue : ${valeurs.join(", ")}`);
      return valeurs[0] as T;
    }
    return v as T;
  }

  motif(nom: string, re: RegExp, message: string): string {
    const v = this.valeur(nom);
    if (typeof v !== "string" || !re.test(v)) {
      this.echec(nom, message);
      return "";
    }
    return v;
  }

  motifOpt(nom: string, re: RegExp, message: string): string | undefined {
    return this.valeur(nom) === undefined ? undefined : this.motif(nom, re, message);
  }

  telephone(nom: string): string {
    return this.motif(nom, RE_TELEPHONE, "Format +237XXXXXXXXX attendu");
  }

  iso(nom: string): string {
    return this.motif(nom, RE_ISO_DOUALA, "Heure ISO en Africa/Douala attendue (+01:00)");
  }

  uuid(nom: string): string {
    return this.motif(nom, RE_UUID, "UUID attendu");
  }

  objet(nom: string): Lecteur {
    const v = this.valeur(nom);
    if (!estObjet(v)) {
      this.echec(nom, "Objet attendu");
      return new Lecteur({}, this.cle(nom), this.erreurs);
    }
    return new Lecteur(v, this.cle(nom), this.erreurs);
  }

  /** Tableau de chaînes non vides (au moins `min`). */
  chaines(nom: string, options: { min?: number; max?: number } = {}): string[] {
    const v = this.valeur(nom);
    if (!Array.isArray(v)) {
      this.echec(nom, "Tableau attendu");
      return [];
    }
    if (options.min !== undefined && v.length < options.min) {
      this.echec(nom, `Au moins ${options.min} élément(s)`);
    }
    if (options.max !== undefined && v.length > options.max) {
      this.echec(nom, `Au plus ${options.max} éléments`);
    }
    return v.map((x, i) => {
      if (typeof x !== "string" || x.length < 1) {
        this.echec(`${nom}[${i}]`, "Texte non vide attendu");
        return "";
      }
      return x;
    });
  }

  present(nom: string): boolean {
    return this.valeur(nom) !== undefined;
  }
}

/** Lit un corps avec `lecteur` ; toutes les erreurs sont renvoyées d'un coup (400 REQUETE_INVALIDE). */
export function lire<T>(brut: unknown, lecteur: (l: Lecteur) => T): T {
  const erreurs: ErreurChamp[] = [];
  if (!estObjet(brut)) throw requeteInvalide("Corps de requête illisible");
  const resultat = lecteur(new Lecteur(brut, "", erreurs));
  if (erreurs.length > 0) throw requeteInvalide("Requête invalide", erreurs);
  return resultat;
}

/** Les paramètres de chemin ou de requête arrivent en texte : « 25000 » devient 25000. */
export function entierDeTexte(valeur: unknown): unknown {
  if (typeof valeur === "string" && /^-?\d+$/.test(valeur)) return Number(valeur);
  return valeur;
}

/* ------------------------------------------------------------------ voyageur */

export const MODES_COLIS = ["gare", "relais", "moto"] as const;
export const MOYENS_PAIEMENT_COLIS = ["mtn_momo", "orange_money", "carte"] as const;
export const CANAUX_CODE = ["sms", "whatsapp"] as const;
export const MOTIFS = ["perdu", "abime", "retard", "autre"] as const;

export type ModeColisSaisi = (typeof MODES_COLIS)[number];

export interface DemandeCreation {
  departId: string;
  photoRef: string;
  destinataire: { nom: string; telephone: string };
  contenu: string;
  poidsKg: number;
  valeurDeclaree: number;
  assurer: boolean;
  mode: ModeColisSaisi;
  relaisId: string | undefined;
  adresseLivraison: string | undefined;
  paiement: { moyen: (typeof MOYENS_PAIEMENT_COLIS)[number]; numero: string | undefined };
}

export const lireDemandeCreation = (brut: unknown): DemandeCreation =>
  lire(brut, (l) => {
    const dest = l.objet("destinataire");
    const paiement = l.objet("paiement");
    return {
      departId: l.chaine("departId"),
      photoRef: l.chaine("photoRef"),
      destinataire: { nom: dest.chaine("nom"), telephone: dest.telephone("telephone") },
      contenu: l.chaine("contenu"),
      poidsKg: l.positif("poidsKg"),
      valeurDeclaree: l.montant("valeurDeclaree"),
      assurer: l.booleen("assurer"),
      mode: l.enumeration("mode", MODES_COLIS),
      relaisId: l.chaineOpt("relaisId"),
      adresseLivraison: l.chaineOpt("adresseLivraison", { vide: true }),
      paiement: {
        moyen: paiement.enumeration("moyen", MOYENS_PAIEMENT_COLIS),
        numero: paiement.motifOpt("numero", RE_TELEPHONE, "Format +237XXXXXXXXX attendu"),
      },
    };
  });

export const lirePhoto = (brut: unknown): { photoRef: string } =>
  lire(brut, (l) => ({ photoRef: l.chaine("photoRef") }));

export interface DemandeDevis {
  departId: string;
  mode: ModeColisSaisi;
  valeurAssuree: number;
  prixLivraison: number | undefined;
}

/** Les paramètres de requête (`?departId=…&valeurAssuree=25000`) sont lus comme du texte. */
export const lireDemandeDevis = (requete: Record<string, unknown>): DemandeDevis =>
  lire(
    {
      ...requete,
      valeurAssuree: entierDeTexte(requete["valeurAssuree"]),
      prixLivraison: entierDeTexte(requete["prixLivraison"]),
    },
    (l) => ({
      departId: l.chaine("departId"),
      mode: l.enumeration("mode", MODES_COLIS),
      valeurAssuree: l.montant("valeurAssuree"),
      prixLivraison: l.present("prixLivraison") ? l.montant("prixLivraison") : undefined,
    }),
  );

export const lireEnvoiCode = (brut: unknown): { canal: (typeof CANAUX_CODE)[number] } =>
  lire(brut ?? {}, (l) => ({ canal: l.enumeration("canal", CANAUX_CODE, "sms") }));

export const lireReclamation = (
  brut: unknown,
): { motif: (typeof MOTIFS)[number]; message: string | undefined } =>
  lire(brut, (l) => ({
    motif: l.enumeration("motif", MOTIFS),
    message: l.chaineOpt("message", { max: 1000, vide: true }),
  }));

export const lireChangementMode = (
  brut: unknown,
): { mode: "relais" | "moto"; relaisId: string | undefined; adresse: string | undefined } =>
  lire(brut, (l) => ({
    mode: l.enumeration("mode", ["relais", "moto"] as const),
    relaisId: l.chaineOpt("relaisId"),
    adresse: l.chaineOpt("adresse", { vide: true }),
  }));

/* ------------------------------------------------------------------ événements de l'agence */

export interface Enveloppe {
  id: string;
  type: string;
  at: string;
  appareilId: string;
  auteurId: string;
  cible: { type: string; id: string };
  numeroPlage: number | null;
}

const TYPES_CIBLE = [
  "billet",
  "colis",
  "depart",
  "session",
  "appareil",
  "personne",
  "demande",
  "controle",
] as const;

function lireEnveloppe(l: Lecteur, type: string, numerote: boolean): Enveloppe {
  l.motif("type", new RegExp(`^${type.replace(/\./g, "\\.")}$`), `Type « ${type} » attendu`);
  const cible = l.objet("cible");
  return {
    id: l.uuid("id"),
    type,
    at: l.iso("at"),
    appareilId: l.chaine("appareilId"),
    auteurId: l.chaine("auteurId"),
    cible: { type: cible.enumeration("type", TYPES_CIBLE), id: cible.chaine("id") },
    numeroPlage: numerote ? l.entier("numeroPlage", { min: 1, max: 9999 }) : l.nul("numeroPlage"),
  };
}

export const MODES_PAIEMENT_GUICHET = ["cash", "momo", "orange_money"] as const;

export interface EvenementColisEnregistre extends Enveloppe {
  numeroPlage: number;
  donnees: {
    colisId: string;
    departId: string;
    expediteur: { nom: string; telephone: string };
    destinataire: { nom: string; telephone: string };
    contenu: string;
    poidsKg: number;
    valeurDeclaree: number;
    assure: boolean;
    photoRef: string;
    paiement: { mode: (typeof MODES_PAIEMENT_GUICHET)[number]; montant: number };
  };
}

export const lireColisEnregistre = (brut: unknown): EvenementColisEnregistre =>
  lire(brut, (l) => {
    const enveloppe = lireEnveloppe(l, "colis.enregistre", true);
    const d = l.objet("donnees");
    const expediteur = d.objet("expediteur");
    const destinataire = d.objet("destinataire");
    const paiement = d.objet("paiement");
    return {
      ...enveloppe,
      numeroPlage: enveloppe.numeroPlage as number,
      donnees: {
        colisId: d.uuid("colisId"),
        departId: d.chaine("departId"),
        expediteur: { nom: expediteur.chaine("nom"), telephone: expediteur.telephone("telephone") },
        destinataire: {
          nom: destinataire.chaine("nom"),
          telephone: destinataire.telephone("telephone"),
        },
        contenu: d.chaine("contenu"),
        poidsKg: d.positif("poidsKg"),
        valeurDeclaree: d.montant("valeurDeclaree"),
        assure: d.booleen("assure"),
        photoRef: d.chaine("photoRef"),
        paiement: {
          mode: paiement.enumeration("mode", MODES_PAIEMENT_GUICHET),
          montant: paiement.montant("montant"),
        },
      },
    };
  });

export interface EvenementColisDepose extends Enveloppe {
  donnees: { colisId: string; poidsReleveKg: number; photoRef: string; complement: number };
}

export const lireColisDepose = (brut: unknown): EvenementColisDepose =>
  lire(brut, (l) => {
    const enveloppe = lireEnveloppe(l, "colis.depose", false);
    const d = l.objet("donnees");
    return {
      ...enveloppe,
      donnees: {
        colisId: d.chaine("colisId"),
        poidsReleveKg: d.positif("poidsReleveKg"),
        photoRef: d.chaine("photoRef"),
        complement: d.montant("complement"),
      },
    };
  });

export interface EvenementColisDecharges extends Enveloppe {
  donnees: { departId: string; arret: string; colisIds: string[] };
}

export const lireColisDecharges = (brut: unknown): EvenementColisDecharges =>
  lire(brut, (l) => {
    const enveloppe = lireEnveloppe(l, "route.colis_decharges", false);
    const d = l.objet("donnees");
    return {
      ...enveloppe,
      donnees: {
        departId: d.chaine("departId"),
        arret: d.chaine("arret"),
        colisIds: d.chaines("colisIds", { min: 1, max: 500 }),
      },
    };
  });

/* ------------------------------------------------------------------ scans et décisions (hors contrat) */

export const ACTIONS_SCAN = [
  "charger",
  "expedier",
  "decharger",
  "rendre_disponible",
  "envoyer_en_relais",
  "mettre_en_livraison",
  "livrer",
  "remettre",
  "marquer_non_retire",
  "retourner",
  "declarer_perdu",
  "ouvrir_litige",
] as const;

export interface DemandeScan {
  colisId: string | undefined;
  numero: string | undefined;
  action: (typeof ACTIONS_SCAN)[number];
  code: string | undefined;
  pieceVerifiee: boolean;
  photoRef: string | undefined;
  relaisId: string | undefined;
  motif: string | undefined;
}

export const lireScan = (brut: unknown): DemandeScan =>
  lire(brut, (l) => {
    const colisId = l.chaineOpt("colisId");
    const numero = l.chaineOpt("numero", { max: 40 });
    if (colisId === undefined && numero === undefined) {
      l.chaine("colisId");
    }
    return {
      colisId,
      numero,
      action: l.enumeration("action", ACTIONS_SCAN),
      code: l.motifOpt("code", RE_CODE_RETRAIT, "6 chiffres attendus"),
      pieceVerifiee: l.present("pieceVerifiee") ? l.booleen("pieceVerifiee") : false,
      photoRef: l.chaineOpt("photoRef"),
      relaisId: l.chaineOpt("relaisId"),
      motif: l.chaineOpt("motif", { max: 500 }),
    };
  });

export interface DecisionReclamation {
  decision: "acceptee" | "refusee";
  montant: number | undefined;
  motif: string | undefined;
}

export const lireDecision = (brut: unknown): DecisionReclamation =>
  lire(brut, (l) => ({
    decision: l.enumeration("decision", ["acceptee", "refusee"] as const),
    montant: l.present("montant") ? l.montant("montant") : undefined,
    motif: l.chaineOpt("motif", { max: 500 }),
  }));
