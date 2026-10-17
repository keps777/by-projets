import { limiteRetraitColis } from "@afrimove/domain";
import type { Colis, IsoDouala } from "@afrimove/domain";
import { colis as c } from "@afrimove/contrats";
import type { Ecran } from "@afrimove/fixtures";
import { implementer } from "../../infra/scenarios";
import type { ContexteMock, FluxMock, ImplementationMock } from "../../infra/scenarios";
import type { Operation } from "../../infra/operations";

/**
 * Un scénario en cours de composition : le futur composeur central crée un `ScenarioEnConstruction`
 * vide, le passe à chaque `installerMock<Domaine>(scenario, donneesScenario)` puis le renvoie comme
 * `Scenario` à `SourceScenarios.charger`.
 */
export interface ScenarioEnConstruction {
  nom: string;
  operations: ImplementationMock[];
  flux: FluxMock[];
}

/** Le scénario de planche de `@afrimove/fixtures` : `ecrans[nomPlanche]`. */
export type DonneesScenario = Ecran<unknown>;

/** Lit les `donnees` d'une planche sous la forme structurelle que le mock en attend. */
export function lire<T>(d: DonneesScenario): T {
  return d.donnees as T;
}

/* ------------------------------------------------------------------ installation */

export function installer<P, R>(
  sc: ScenarioEnConstruction,
  operation: Operation<P, R>,
  repondre: (params: P, ctx: ContexteMock) => R | Promise<R>,
): void {
  sc.operations.push(implementer(operation, repondre));
}

/**
 * Comme `installer`, pour une opération dont la réponse part à un partenaire (guichet, relais,
 * livreur, compagnie) : un garde-fou refuse toute réponse qui porte un champ de code de retrait.
 * La validation stricte du contrat et les tests couvrent le reste.
 */
export function installerPartenaire<P, R>(
  sc: ScenarioEnConstruction,
  operation: Operation<P, R>,
  repondre: (params: P, ctx: ContexteMock) => R | Promise<R>,
): void {
  installer(sc, operation, async (params, ctx) => {
    const reponse = await repondre(params, ctx);
    const fuites = c.fuitesCodeRetrait(reponse);
    if (fuites.length > 0) {
      throw new Error(
        `Réponse partenaire « ${operation.nom} » : code de retrait interdit (${fuites.join(", ")})`,
      );
    }
    return reponse;
  });
}

/* ------------------------------------------------------------------ temps */

/** Jour AAAA-MM-JJ d'un instant ISO. */
export function jourDe(iso: string): string {
  return iso.slice(0, 10);
}

/** « 08:15 » le jour donné → ISO Africa/Douala. */
export function isoDu(jour: string, hhmm: string): IsoDouala {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(hhmm);
  if (!m) throw new RangeError(`Heure invalide : « ${hhmm} »`);
  return `${jour}T${m[1]}:${m[2]}:${m[3] ?? "00"}.000+01:00`;
}

/** Extrait la première heure « HH:MM » d'un texte, sinon null. */
export function heureDans(texte: string): string | null {
  const m = /(\d{2}):(\d{2})/.exec(texte);
  return m ? `${m[1]}:${m[2]}` : null;
}

/* ------------------------------------------------------------------ texte des planches */

/** Les chiffres d'un texte : « 482 913 » → « 482913 ». */
export function chiffres(texte: string): string {
  return texte.replace(/\D/g, "");
}

/** Entier d'un texte de planche : « 1 500 » → 1500, « 31 k » → 31000. */
export function entierDe(texte: string | number): number {
  if (typeof texte === "number") return texte;
  const k = /k\s*$/i.test(texte.trim());
  const n = Number(chiffres(texte));
  return k ? n * 1000 : n;
}

/** Retire la puce « · » et les espaces de tête d'un détail de planche. */
export function sansPuce(texte: string): string {
  return texte.replace(/^[\s·]+/, "").trim();
}

/** « 6 99 40 18 22 » (avec un éventuel libellé avant) → « +237699401822 ». */
export function telephoneDepuis(affiche: string): string {
  const num = chiffres(affiche.split("·").pop() ?? affiche);
  return num.startsWith("237") ? `+${num}` : `+237${num}`;
}

/** « +237671000011 » → « 6 71 … » : jamais le numéro complet côté partenaire. */
export function masquerTelephone(telephone: string): string {
  const n = chiffres(telephone).replace(/^237/, "");
  return `${n.slice(0, 1)} ${n.slice(1, 3)} …`;
}

/** Identifiant lisible : « Boutique Mama Fotso » → « boutique-mama-fotso ». */
export function slug(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Mois abrégés tels que les planches les écrivent (« 12 oct. », « 28 déc. »). */
export const MOIS_ABREGES: Readonly<Record<string, number>> = {
  "janv.": 1,
  "févr.": 2,
  mars: 3,
  "avr.": 4,
  mai: 5,
  juin: 6,
  "juil.": 7,
  août: 8,
  "sept.": 9,
  "oct.": 10,
  "nov.": 11,
  "déc.": 12,
};

/** « 4,1 » → 4.1 */
export function decimal(texte: string): number {
  return Number(texte.replace(/\s/g, "").replace(",", "."));
}

/* ------------------------------------------------------------------ colis du domaine → vues */

/** Colis du domaine → vue partenaire. Aucun code de retrait, ni haché, ni sel. */
export function versColisPartenaire(colis: Colis): c.ColisPartenaire {
  return {
    id: colis.id,
    numero: colis.numero,
    etat: colis.etat,
    mode: colis.mode,
    poidsKg: colis.poidsKg,
    assure: colis.assure,
    valeurAssuree: colis.assure ? colis.valeurDeclaree : 0,
    expediteur: { nom: colis.expediteur.nom },
    destinataire: {
      nom: colis.destinataire.nom,
      telephoneMasque: masquerTelephone(colis.destinataire.telephone),
    },
    codeRequis: true,
    disponibleDepuis: colis.disponibleDepuis ?? null,
    limiteRetrait: colis.disponibleDepuis ? limiteRetraitColis(colis.disponibleDepuis) : null,
  };
}

/** Le colis d'une planche, retrouvé par l'identifiant `_colisId` de ses données. */
export function colisDeLaPlanche(d: DonneesScenario, colisId: string): Colis {
  const colis = d.entites.colis?.find((x) => x.id === colisId);
  if (!colis)
    throw new Error(`Scénario « ${d.planche} » : colis « ${colisId} » absent des entités`);
  return colis;
}
