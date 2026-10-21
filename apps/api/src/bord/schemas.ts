import { TYPES_CIBLE, lirePaiement, type EvenementRecu } from "../billetterie/schemas";
import {
  DonneesInvalides,
  entier,
  enumeration,
  fcfaPositif,
  idOpaque,
  isoDouala,
  litteral,
  nul,
  nullable,
  objet,
  quatreChiffres,
  siegeNumero,
  telephone,
  texte,
  uuid,
  type Lecteur,
} from "../billetterie/validation";

/**
 * Formes des événements du bord reçus en HTTP : miroir des schémas zod de `@afrimove/contrats`
 * (`agence/bus.ts`). `parite.test.ts` vérifie que ces lecteurs acceptent et refusent les mêmes valeurs.
 *
 * Comme zod, un objet ignore les champs qu'il ne connaît pas (le champ `motif` que la recette ajoute à un
 * retard, par exemple) et la première erreur arrête la lecture.
 */

/** Enveloppe commune des événements (voir `contrats/agence/evenements.ts`). */
function evenement<T extends string, D>(
  type: T,
  numerote: boolean,
  donnees: Lecteur<D>,
): Lecteur<EvenementRecu<T, D>> {
  return objet({
    id: uuid,
    type: litteral(type),
    at: isoDouala,
    appareilId: idOpaque,
    auteurId: idOpaque,
    cible: objet({ type: enumeration(...TYPES_CIBLE), id: idOpaque }),
    numeroPlage: numerote ? entier({ min: 1, max: 9999 }) : nul,
    donnees,
  }) as unknown as Lecteur<EvenementRecu<T, D>>;
}

/** Nombre fini (zod refuse NaN et l'infini). */
function reel(min: number, max: number): Lecteur<number> {
  return (v, chemin) => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new DonneesInvalides(chemin, "nombre attendu");
    }
    if (v < min) throw new DonneesInvalides(chemin, `au moins ${min}`);
    if (v > max) throw new DonneesInvalides(chemin, `au plus ${max}`);
    return v;
  };
}

export const lirePositionGps = objet({
  latitude: reel(-90, 90),
  longitude: reel(-180, 180),
  precisionM: reel(0, Number.MAX_VALUE),
});
export type PositionRecue = ReturnType<typeof lirePositionGps>;

const texteLibre = texte({ min: 0, max: 1000 });
const nom = texte({ min: 1, max: 500 });

/* ------------------------------------------------------------------ convoyeur */

export const lireRouteBilletVendu = evenement(
  "route.billet_vendu",
  true,
  objet({
    billetId: idOpaque,
    departId: idOpaque,
    arretMontee: nom,
    arretDescente: nom,
    siege: siegeNumero,
    prix: fcfaPositif,
    passager: objet({ nom: nullable(texte({ min: 0 })), telephone: nullable(telephone) }),
    paiement: lirePaiement,
    codeBillet: quatreChiffres,
    gps: nullable(lirePositionGps),
  }),
);

export const lireRouteScanne = evenement(
  "route.scanne",
  false,
  objet({ departId: idOpaque, arret: nom, qr: texte({ min: 1, max: 1000 }) }),
);

/* ------------------------------------------------------------------ chauffeur */

export const lireChauffeurDepense = evenement(
  "chauffeur.depense",
  false,
  objet({
    depenseId: idOpaque,
    departId: idOpaque,
    categorie: enumeration("carburant", "peage", "autre"),
    libelle: nom,
    montant: fcfaPositif,
    justificatifRef: texte({ min: 1, max: 500 }),
  }),
);

export const lireChauffeurIncident = evenement(
  "chauffeur.incident",
  false,
  objet({
    incidentId: idOpaque,
    departId: idOpaque,
    nature: enumeration("panne", "accident", "route_coupee", "autre"),
    gps: nullable(lirePositionGps),
    note: nullable(texteLibre),
  }),
);

export const lireChauffeurRetard = evenement(
  "chauffeur.retard",
  false,
  objet({ departId: idOpaque, minutes: entier({ min: 1 }) }),
);

export const lireChauffeurArrivee = evenement(
  "chauffeur.arrivee_arret",
  false,
  objet({ departId: idOpaque, arret: nom, gps: nullable(lirePositionGps) }),
);

/* ------------------------------------------------------------------ contrôle inopiné */

const constat = enumeration("scanne", "sans_billet", "libre");

export const lireControleSiegeVerifie = evenement(
  "controle.siege_verifie",
  false,
  objet({ controleId: idOpaque, departId: idOpaque, siege: siegeNumero, constat }),
);

export const lireControleRegularise = evenement(
  "controle.regularise",
  true,
  objet({
    controleId: idOpaque,
    billetId: idOpaque,
    departId: idOpaque,
    siege: siegeNumero,
    prix: fcfaPositif,
    paiement: lirePaiement,
    codeBillet: quatreChiffres,
    passager: objet({
      nom: nullable(texte({ min: 0 })),
      pieceQuatreDerniers: nullable(quatreChiffres),
    }),
  }),
);

export const lireControleConvoyeurSignale = evenement(
  "controle.convoyeur_signale",
  false,
  objet({
    controleId: idOpaque,
    departId: idOpaque,
    convoyeurId: idOpaque,
    siege: siegeNumero,
    montantDeclare: fcfaPositif,
    note: nullable(texteLibre),
  }),
);

export const lireControleCloture = evenement(
  "controle.cloture",
  false,
  objet({
    controleId: idOpaque,
    departId: idOpaque,
    liste: fcfaPositif,
    tetes: fcfaPositif,
    ecart: entier(),
  }),
);

/* ------------------------------------------------------------------ types */

type Evt<F> = F extends (v: unknown, c: string) => infer R ? R : never;
export type EvenementRouteVente = Evt<typeof lireRouteBilletVendu>;
export type EvenementRouteScan = Evt<typeof lireRouteScanne>;
export type EvenementDepense = Evt<typeof lireChauffeurDepense>;
export type EvenementIncident = Evt<typeof lireChauffeurIncident>;
export type EvenementRetard = Evt<typeof lireChauffeurRetard>;
export type EvenementArrivee = Evt<typeof lireChauffeurArrivee>;
export type EvenementSiegeVerifie = Evt<typeof lireControleSiegeVerifie>;
export type EvenementRegularise = Evt<typeof lireControleRegularise>;
export type EvenementSignalement = Evt<typeof lireControleConvoyeurSignale>;
export type EvenementCloture = Evt<typeof lireControleCloture>;
