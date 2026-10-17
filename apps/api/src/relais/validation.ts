import { requeteInvalide } from "../colis/erreurs";
import { RE_CODE_RETRAIT, lire, type Lecteur } from "../colis/validation";
import type { FicheRelais } from "./modele";

/**
 * Lecture des corps de requête des points relais. Comme pour les colis, l'API ne peut pas importer
 * zod à l'exécution : ces lecteurs reprennent à la main les règles des schémas de
 * `@afrimove/contrats` (colis), et `validation.test.ts` les compare aux schémas zod. Les champs
 * inconnus sont ignorés et jamais recopiés ; seules quelques longueurs maximales s'ajoutent au
 * contrat, pour qu'une fiche ne devienne pas un fourre-tout.
 */

export const OPERATEURS = ["mtn", "orange"] as const;

const NOM_MAX = 120;
const TEXTE_MAX = 200;

/** `{ relaisId }` du choix d'un point relais par l'expéditeur. */
export const lireChoixRelais = (brut: unknown): { relaisId: string } =>
  lire(brut, (l) => ({ relaisId: l.chaine("relaisId") }));

export const lireReception = (brut: unknown): { numeroColis: string } =>
  lire(brut, (l) => ({ numeroColis: l.chaine("numeroColis", { max: 60 }) }));

export interface RemiseRelais {
  colisId: string;
  code: string;
  photoRef: string;
}

/** La pièce a été vue (et jamais photographiée) : `pieceVerifiee` doit valoir `true`. */
export const lireRemiseRelais = (brut: unknown): RemiseRelais =>
  lire(brut, (l) => {
    l.vrai("pieceVerifiee");
    return {
      colisId: l.chaine("colisId"),
      code: l.motif("code", RE_CODE_RETRAIT, "6 chiffres attendus"),
      photoRef: l.chaine("photoRef"),
    };
  });

const lireMomo = (l: Lecteur): FicheRelais["momo"] => ({
  telephone: l.telephone("telephone"),
  operateur: l.enumeration("operateur", OPERATEURS),
});

const lirePosition = (l: Lecteur): FicheRelais["position"] => ({
  ville: l.chaine("ville", { max: NOM_MAX }),
  quartier: l.chaine("quartier", { max: NOM_MAX }),
  repere: l.chaineOpt("repere", { max: TEXTE_MAX, vide: true }) ?? null,
});

export const lireFicheRelais = (brut: unknown): FicheRelais =>
  lire(brut, (l) => ({
    nom: l.chaine("nom", { max: NOM_MAX }),
    type: l.chaine("type", { max: TEXTE_MAX }),
    ouvert: l.chaine("ouvert", { max: TEXTE_MAX }),
    position: lirePosition(l.objet("position")),
    tailleMax: l.chaine("tailleMax", { max: TEXTE_MAX }),
    momo: lireMomo(l.objet("momo")),
    facadeRef: l.chaine("facadeRef"),
  }));

/** `{ fiche: SchemaFicheRelais.partial() }` : chaque champ présent est complet et valide. */
export const lireBrouillonRelais = (brut: unknown): { fiche: Partial<FicheRelais> } =>
  lire(brut, (l) => {
    const f = l.objet("fiche");
    const fiche: Partial<FicheRelais> = {};
    if (f.present("nom")) fiche.nom = f.chaine("nom", { max: NOM_MAX });
    if (f.present("type")) fiche.type = f.chaine("type", { max: TEXTE_MAX });
    if (f.present("ouvert")) fiche.ouvert = f.chaine("ouvert", { max: TEXTE_MAX });
    if (f.present("position")) fiche.position = lirePosition(f.objet("position"));
    if (f.present("tailleMax")) fiche.tailleMax = f.chaine("tailleMax", { max: TEXTE_MAX });
    if (f.present("momo")) fiche.momo = lireMomo(f.objet("momo"));
    if (f.present("facadeRef")) fiche.facadeRef = f.chaine("facadeRef");
    return { fiche };
  });

/* ------------------------------------------------------------------ agents AfriMove (hors contrat) */

export const lireVisite = (brut: unknown): { agent: string; creneau: string } =>
  lire(brut, (l) => ({
    agent: l.chaine("agent", { max: NOM_MAX }),
    creneau: l.chaine("creneau", { max: TEXTE_MAX }),
  }));

export interface ActivationRelais {
  /** Latitude et longitude relevées à la visite. */
  position: { lat: number; lon: number } | null;
  capacite: number | undefined;
  particularite: string | null;
}

/** Lit `{ lat, lon }` : deux nombres dans les bornes du globe, ou rien. */
export function lirePointGps(valeur: unknown, chemin: string): { lat: number; lon: number } | null {
  if (valeur === undefined || valeur === null) return null;
  const brut = valeur as { lat?: unknown; lon?: unknown };
  const erreurs: { chemin: string; message: string }[] = [];
  const dans = (v: unknown, min: number, max: number): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (typeof valeur !== "object" || Array.isArray(valeur)) {
    throw requeteInvalide("Requête invalide", [{ chemin, message: "Objet attendu" }]);
  }
  if (!dans(brut.lat, -90, 90))
    erreurs.push({ chemin: `${chemin}.lat`, message: "Latitude attendue" });
  if (!dans(brut.lon, -180, 180)) {
    erreurs.push({ chemin: `${chemin}.lon`, message: "Longitude attendue" });
  }
  if (erreurs.length > 0) throw requeteInvalide("Requête invalide", erreurs);
  return { lat: brut.lat as number, lon: brut.lon as number };
}

export function lireActivationRelais(brut: unknown): ActivationRelais {
  const corps = brut ?? {};
  const base = lire(corps, (l) => ({
    capacite: l.present("capacite") ? l.entier("capacite", { min: 1, max: 500 }) : undefined,
    particularite: l.chaineOpt("particularite", { max: TEXTE_MAX }) ?? null,
  }));
  const position = lirePointGps((corps as { position?: unknown }).position, "position");
  return { ...base, position };
}

export const lireRefusDemande = (brut: unknown): { motif: string } =>
  lire(brut, (l) => ({ motif: l.chaine("motif", { max: 500 }) }));
