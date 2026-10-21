import {
  booleen,
  enumeration,
  entier,
  fcfaPositif,
  idOpaque,
  isoDouala,
  litteral,
  nul,
  nullable,
  objet,
  optionnel,
  quatreChiffres,
  siegeNumero,
  tableau,
  telephone,
  texte,
  uuid,
  type Lecteur,
} from "./validation";

/**
 * Formes des corps reçus : miroir des schémas zod de `@afrimove/contrats` (agence et voyageur).
 * `contrats.test.ts` vérifie qu'ils acceptent et refusent les mêmes valeurs.
 */

/* ------------------------------------------------------------------ événements de l'agence */

export const TYPES_CIBLE = [
  "billet",
  "colis",
  "depart",
  "session",
  "appareil",
  "personne",
  "demande",
  "controle",
] as const;

export interface EvenementRecu<T extends string, D> {
  id: string;
  type: T;
  at: string;
  appareilId: string;
  auteurId: string;
  cible: { type: (typeof TYPES_CIBLE)[number]; id: string };
  numeroPlage: number | null;
  donnees: D;
}

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

const modePaiement = enumeration("cash", "momo", "orange_money");

export const lirePaiement = objet({
  mode: modePaiement,
  recu: fcfaPositif,
  rendu: fcfaPositif,
  reference: nullable(texte({ min: 0 })),
});
export type PaiementRecu = ReturnType<typeof lirePaiement>;

export const lirePassagerSaisi = objet({
  nom: texte({ min: 1 }),
  telephone: nullable(telephone),
  pieceQuatreDerniers: nullable(quatreChiffres),
});

const classe = enumeration("classique", "vip");

export const lireBilletVendu = evenement(
  "billet.vendu",
  true,
  objet({
    billetId: idOpaque,
    departId: idOpaque,
    siege: nullable(siegeNumero),
    classe,
    prix: fcfaPositif,
    bagage: fcfaPositif,
    passager: lirePassagerSaisi,
    paiement: lirePaiement,
    codeBillet: quatreChiffres,
    sms: booleen,
  }),
);

export const lireBilletVenduCadence = evenement(
  "billet.vendu_cadence",
  true,
  objet({
    billetId: idOpaque,
    departId: idOpaque,
    siege: siegeNumero,
    prix: fcfaPositif,
    paiement: lirePaiement,
    codeBillet: quatreChiffres,
    telephone: nullable(telephone),
  }),
);

export const lireTelephoneAjoute = evenement(
  "billet.telephone_ajoute",
  false,
  objet({ billetId: idOpaque, telephone }),
);

export const lireBilletComplete = evenement(
  "billet.complete",
  false,
  objet({
    billetId: idOpaque,
    departId: idOpaque,
    nom: texte({ min: 1 }),
    pieceQuatreDerniers: quatreChiffres,
    telephone: nullable(telephone),
    embarquer: booleen,
  }),
);

export const lireQuaiScanne = evenement(
  "quai.scanne",
  false,
  objet({ departId: idOpaque, qr: texte({ min: 1, max: 1000 }) }),
);

export const lireQuaiCodeSaisi = evenement(
  "quai.code_saisi",
  false,
  objet({ departId: idOpaque, codeBillet: quatreChiffres }),
);

export const lireQuaiLibere = evenement(
  "quai.libere",
  false,
  objet({
    departId: idOpaque,
    billetId: idOpaque,
    siege: siegeNumero,
    motif: enumeration("retard", "absent"),
  }),
);

export const lireQuaiListeEnvoyee = evenement(
  "quai.liste_envoyee",
  false,
  objet({
    departId: idOpaque,
    embarques: entier({ min: 0 }),
    capacite: entier({ min: 1 }),
  }),
);

/* ------------------------------------------------------------------ voyageur */

export const lireFiltresDeparts = objet({
  classe: optionnel(enumeration("toutes", "vip", "classique")),
  compagnies: optionnel(tableau(idOpaque)),
  preferees: optionnel(booleen),
  inclureCovoit: optionnel(booleen),
  matinSeulement: optionnel(booleen),
  placesCoteACote: optionnel(booleen),
  prixMax: optionnel(fcfaPositif),
});
export type FiltresDeparts = ReturnType<typeof lireFiltresDeparts>;

export const lireEnregistrerFiltres = objet({
  depart: texte({ min: 0, max: 64 }),
  arrivee: texte({ min: 0, max: 64 }),
  filtres: lireFiltresDeparts,
});

export const lireDefinirPreferee = objet({ preferee: booleen });

export const lireCreerCommande = objet({
  departId: idOpaque,
  sieges: tableau(entier({ min: 1 }), { min: 1, max: 40 }),
  pour: enumeration("moi", "proche", "plusieurs"),
  procheId: optionnel(idOpaque),
  passagers: optionnel(
    tableau(objet({ nom: texte({ min: 0 }), telephone: optionnel(telephone) }), { max: 40 }),
  ),
  codePromo: optionnel(texte({ min: 0, max: 64 })),
  devise: optionnel(texte({ min: 3, max: 3 })),
});

export const lireAnnulerBillet = objet({ motif: optionnel(texte({ min: 0 })) });
export const lireReporterBillet = objet({ departCibleId: idOpaque });

/* ------------------------------------------------------------------ exploitation des départs */

export const lireTransitionDepart = objet({
  action: enumeration(
    "ouvrir_vente",
    "ouvrir_embarquement",
    "partir",
    "arriver",
    "annuler",
    "retarder",
    "reprendre_vente",
  ),
  /** Nouvelle heure de départ, obligatoire pour « retarder ». */
  heureDepart: optionnel(isoDouala),
  motif: optionnel(texte({ min: 1, max: 300 })),
});

export const lireFusionDepart = objet({ dansDepartId: idOpaque });
