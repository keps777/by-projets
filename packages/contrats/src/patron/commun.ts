import { z } from "zod";

/**
 * Briques communes des contrats patron.
 *
 * - Les montants sont des **entiers de FCFA** (jamais de flottant, jamais de « 2,61 M » : c'est
 *   l'écran qui met en forme).
 * - Les instants sont des chaînes ISO 8601 en **Africa/Douala** (`+01:00`, sans heure d'été).
 * - Les jours sont `AAAA-MM-JJ`, les heures de départ récurrentes `HH:MM`.
 */

/** Montant en FCFA : entier, signé (un écart de caisse est négatif quand il manque de l'argent). */
export const FcfaSchema = z.number().int();
export type Fcfa = z.infer<typeof FcfaSchema>;

/** Montant en FCFA qui ne peut pas être négatif (prix, salaire, plafond…). */
export const FcfaPositifSchema = z.number().int().nonnegative();

/** Instant ISO 8601 à Douala : `2027-01-05T14:05:00.000+01:00`. */
export const IsoDoualaSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?\+01:00$/,
    "Instant ISO Africa/Douala attendu",
  );
export type IsoDouala = z.infer<typeof IsoDoualaSchema>;

/** Jour calendaire `AAAA-MM-JJ`. */
export const JourSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Jour AAAA-MM-JJ attendu");
/** Mois comptable `AAAA-MM`. */
export const MoisSchema = z.string().regex(/^\d{4}-\d{2}$/, "Mois AAAA-MM attendu");
/** Heure de départ récurrente `HH:MM`. */
export const HeureSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure HH:MM attendue");

export const IdSchema = z.string().min(1);

/** Variation en pourcentage par rapport à la période de comparaison (positive ou négative). */
export const VariationPctSchema = z.number();
/** Pourcentage compris entre 0 et 100 (remplissage, taux). */
export const TauxPctSchema = z.number().min(0).max(100);

export const PeriodeAnalyseSchema = z.enum(["semaine", "mois", "trimestre", "annee"]);
export type PeriodeAnalyse = z.infer<typeof PeriodeAnalyseSchema>;

/** Rôles de l'équipe que le patron gère (valeurs du domaine `Role`). */
export const RoleEquipeSchema = z.enum([
  "guichetier",
  "superviseur",
  "convoyeur",
  "chauffeur",
  "relais",
  "comptable",
]);
export type RoleEquipe = z.infer<typeof RoleEquipeSchema>;

export const OperateurMomoSchema = z.enum(["mtn", "orange"]);
export type OperateurMomo = z.infer<typeof OperateurMomoSchema>;

/* ----------------------------------------------------------------------- signature PIN */

/** PIN à 6 chiffres du patron (jamais stocké côté écran, jamais journalisé). */
export const PinSchema = z.string().regex(/^\d{6}$/, "PIN à 6 chiffres attendu");

/**
 * Signature PIN d'une écriture du patron : le PIN saisi (ou confirmé par l'empreinte de
 * l'appareil, `methode: "empreinte"`) et l'instant de la signature. L'API vérifie le PIN, date,
 * signe et ajoute l'écriture au journal ; elle ne le renvoie jamais.
 */
export const SignaturePinSchema = z.strictObject({
  pin: PinSchema,
  methode: z.enum(["pin", "empreinte"]),
  signeA: IsoDoualaSchema,
});
export type SignaturePin = z.infer<typeof SignaturePinSchema>;

/**
 * Déclare le corps d'une écriture du patron : `signature` est ajoutée d'office et **obligatoire**.
 * Toute modification de réglage, de module, de règle ou de compte passe par cette fonction ;
 * `COMMANDES_SIGNEES` (commandes.ts) les liste pour que le test vérifie qu'aucune n'oublie le PIN.
 */
export function commandeSignee<S extends z.ZodRawShape>(forme: S) {
  return z.strictObject({ ...forme, signature: SignaturePinSchema });
}

/** Résultat commun d'une écriture signée : ce que l'API a daté, signé et ajouté au journal. */
export const AccuseSigneSchema = z.strictObject({
  journalId: IdSchema,
  signeA: IsoDoualaSchema,
  /** Id du compte patron qui a signé. */
  signePar: IdSchema,
});
export type AccuseSigne = z.infer<typeof AccuseSigneSchema>;

/* ----------------------------------------------------------------------- référence légère */

export const RefPersonneSchema = z.strictObject({
  id: IdSchema,
  /** Nom tel que l'équipe le voit (« Joseph M. »). */
  nom: z.string(),
  initiales: z.string().min(1).max(3),
});
export type RefPersonne = z.infer<typeof RefPersonneSchema>;

export const EtatPersonneSchema = z.enum([
  "en_service",
  "a_bord",
  "en_route",
  "repos",
  "bloquee",
  "indisponible",
  "hors_service",
]);
export type EtatPersonne = z.infer<typeof EtatPersonneSchema>;

/** Ligne de personne telle que les listes du patron la montrent. */
export const PersonneResumeSchema = z.strictObject({
  id: IdSchema,
  nom: z.string(),
  initiales: z.string().min(1).max(3),
  role: RoleEquipeSchema,
  /** « Akwa guichet 2 », « LT 412 AB », « Mvan »… */
  lieu: z.string(),
  /** Synthèse déjà formulée par l'API (« 3 écarts · PIN à renouveler »). */
  indicateur: z.string(),
  etat: EtatPersonneSchema,
});
export type PersonneResume = z.infer<typeof PersonneResumeSchema>;
