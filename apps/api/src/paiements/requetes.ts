import { corps as lireCorps, ou400 } from "../billetterie/http";
import {
  DonneesInvalides,
  booleen,
  entier,
  enumeration,
  idOpaque,
  nullable,
  objet,
  optionnel,
  parametre,
  parametreEntier,
  telephone,
  texte,
} from "../billetterie/validation";
import type { StatutPaiement } from "./modeles";

/**
 * Lecteurs des corps et des paramètres. `payerCommande` et `lienProche` suivent les schémas
 * `SchemaPayerCommande` et `SchemaCreerLienProche` de `@afrimove/contrats` (voyageur) ;
 * `contrats.test.ts` les compare aux schémas zod.
 */

export { ou400 };
export const corps = lireCorps;

/** Corps de `POST /voyageur/commandes/:commandeId/paiements` (le client n'envoie pas `commandeId` dans le corps). */
export const lirePayerCommande = objet({
  moyen: enumeration("mtn_momo", "orange_money", "carte", "proche"),
  telephone: optionnel(telephone),
  jetonCarte: optionnel(texte({ min: 0, max: 500 })),
});

export const lireLienProche = objet({
  procheId: optionnel(idOpaque),
  telephone: optionnel(telephone),
});

export const lirePaiementGuichet = objet({
  moyen: enumeration("mtn_momo", "orange_money"),
  telephone,
  montant: entier({ min: 1, max: 100_000_000 }),
  cle: texte({
    min: 8,
    max: 100,
    motif: /^[A-Za-z0-9_.:-]+$/,
    message: "lettres, chiffres, _ . : -",
  }),
});

export const lireEncaissementAgence = objet({
  mode: enumeration("especes", "momo_marchand"),
  reference: optionnel(texte({ min: 3, max: 80 })),
});

export const lireModeDegrade = objet({
  actif: booleen,
  motif: optionnel(texte({ min: 1, max: 300 })),
});

export const lireCompteReversement = objet({
  compteId: nullable(
    texte({ min: 1, max: 64, motif: /^[A-Za-z0-9_.:-]+$/, message: "lettres, chiffres, _ . : -" }),
  ),
});

export const lireRemboursementManuel = objet({
  montantCompagnie: entier({ min: 0, max: 100_000_000 }),
  montantAfrimove: entier({ min: 0, max: 100_000_000 }),
  motif: texte({ min: 3, max: 300 }),
  cle: texte({
    min: 8,
    max: 100,
    motif: /^[A-Za-z0-9_.:-]+$/,
    message: "lettres, chiffres, _ . : -",
  }),
});

export type Requete = Record<string, unknown>;

function date(q: Requete, cle: string): Date | undefined {
  const v = parametre(q, cle);
  if (v === undefined || v === "") return undefined;
  // « 2027-01-05 » = ce jour-là à minuit, heure de Douala.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+01:00` : v;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) throw new DonneesInvalides(cle, "date invalide");
  return d;
}

const STATUTS: readonly StatutPaiement[] = ["en_attente", "reussi", "echoue", "expire"];

/** `?du=&au=&compagnieId=&statut=&limite=` du rapprochement. */
export function lireFiltreReferences(q: Requete) {
  const statut = parametre(q, "statut");
  if (statut !== undefined && !(STATUTS as readonly string[]).includes(statut)) {
    throw new DonneesInvalides("statut", `valeur attendue : ${STATUTS.join(", ")}`);
  }
  const compagnieId = parametre(q, "compagnieId");
  return {
    du: date(q, "du"),
    au: date(q, "au"),
    compagnieId: compagnieId === "" ? undefined : compagnieId,
    statut: statut as StatutPaiement | undefined,
    limite: parametreEntier(q, "limite", { min: 1, max: 200 }) ?? 100,
  };
}
