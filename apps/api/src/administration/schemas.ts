import {
  DonneesInvalides,
  booleen,
  entier,
  enumeration,
  isoDouala,
  nullable,
  objet,
  optionnel,
  tableau,
  texte,
  type Lecteur,
} from "../billetterie/validation";
import { JOURS, type ClasseDepart, type GenreAppareil, type Jour } from "./modeles";

/**
 * Formes des corps reçus. Comme le reste de l'API, l'administration ne peut pas importer les schémas zod de
 * `@afrimove/contrats` à l'exécution (paquet non compilé) : `parite.test.ts` confronte ces lecteurs aux schémas
 * des réglages du patron (mêmes valeurs acceptées, mêmes valeurs refusées). Comme `z.strictObject`, un champ
 * inconnu est refusé.
 */

type Forme = Parameters<typeof objet>[0];

/** Un objet qui refuse les champs qu'il ne connaît pas (`z.strictObject`). */
export function objetStrict<F extends Forme>(forme: F): ReturnType<typeof objet<F>> {
  const lecteur = objet(forme);
  const connus = new Set(Object.keys(forme));
  return ((v: unknown, chemin: string) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const inconnu = Object.keys(v).find((cle) => !connus.has(cle));
      if (inconnu !== undefined) {
        throw new DonneesInvalides(
          chemin === "" ? inconnu : `${chemin}.${inconnu}`,
          "champ inattendu",
        );
      }
    }
    return lecteur(v, chemin);
  }) as ReturnType<typeof objet<F>>;
}

/* ------------------------------------------------------------------ formats */

export const idTexte = texte({ min: 1, max: 128 });
const heure = texte({
  min: 5,
  max: 5,
  motif: /^([01]\d|2[0-3]):[0-5]\d$/,
  message: "HH:MM attendu",
});
const jour = texte({
  min: 10,
  max: 10,
  motif: /^\d{4}-\d{2}-\d{2}$/,
  message: "AAAA-MM-JJ attendu",
});
const classe: Lecteur<ClasseDepart> = enumeration("classique", "vip");
const fcfa = entier({ min: 0, max: 100_000_000 });
const entierPositif = entier({ min: 1, max: 100_000 });
const nomJour: Lecteur<Jour> = enumeration(...JOURS);

export const signature = objetStrict({
  pin: texte({ min: 6, max: 6, motif: /^\d{6}$/, message: "6 chiffres attendus" }),
  methode: enumeration("pin", "empreinte"),
  signeA: isoDouala,
});

/* ------------------------------------------------------------------ réglages d'une ligne (contrats patron) */

const tarifs = objetStrict({ classique: fcfa, vip: fcfa, bagage: fcfa });

const departEditable = objetStrict({
  id: nullable(idTexte),
  heure,
  heureInitiale: nullable(heure),
  classe,
  prix: fcfa,
  actif: booleen,
  note: nullable(texte({ min: 0, max: 200 })),
  jours: tableau(nomJour, { max: 7 }),
  nouveau: booleen,
});

const arretModifie = objetStrict({ nom: texte({ min: 1, max: 100 }), montee: booleen });

const plan = objetStrict({
  capacite: entier({ min: 1, max: 1000 }),
  disposition: texte({
    min: 3,
    max: 20,
    motif: /^\d(\+\d)+$/,
    message: "disposition « 2+2 » attendue",
  }),
  rangees: entier({ min: 1, max: 1000 }),
});

const options = objetStrict({ venteEnLigne: booleen, fusionAuto: booleen });

export const creerLigne = objetStrict({
  origineGareId: idTexte,
  destinationGareId: idTexte,
  tarifs,
  arrets: tableau(texte({ min: 1, max: 100 }), { max: 30 }),
  capacite: entier({ min: 1, max: 1000 }),
  signature,
});

export const modifierLigne = objetStrict({
  ligneId: idTexte,
  departs: optionnel(tableau(departEditable, { max: 100 })),
  tarifs: optionnel(tarifs),
  arrets: optionnel(tableau(arretModifie, { max: 30 })),
  plan: optionnel(plan),
  options: optionnel(options),
  effetDu: optionnel(jour),
  signature,
});

/* ------------------------------------------------------------------ administration */

const uuidOuNul = nullable(idTexte);
const immatriculation = texte({
  min: 3,
  max: 20,
  motif: /^[A-Za-z0-9 -]+$/,
  message: "lettres, chiffres, espaces et tirets",
});

export const creerBus = objetStrict({
  immatriculation,
  capacite: entier({ min: 1, max: 200 }),
  capaciteSoute: optionnel(entier({ min: 0, max: 200 })),
  classe,
  modele: optionnel(texte({ min: 0, max: 100 })),
  annee: optionnel(entier({ min: 1980, max: 2100 })),
});

export const modifierBus = objetStrict({
  immatriculation: optionnel(immatriculation),
  capacite: optionnel(entier({ min: 1, max: 200 })),
  capaciteSoute: optionnel(entier({ min: 0, max: 200 })),
  classe: optionnel(classe),
  modele: optionnel(texte({ min: 0, max: 100 })),
  annee: optionnel(entier({ min: 1980, max: 2100 })),
});

export const creerDepart = objetStrict({
  ligneId: idTexte,
  heureDepart: isoDouala,
  classe: optionnel(classe),
  busId: optionnel(uuidOuNul),
  chauffeurId: optionnel(uuidOuNul),
  convoyeurId: optionnel(uuidOuNul),
  quai: optionnel(nullable(entierPositif)),
  ouvrirVente: optionnel(booleen),
});

export const genererDeparts = objetStrict({
  ligneId: optionnel(idTexte),
  du: jour,
  au: jour,
  ouvrirVente: optionnel(booleen),
});

export const changerEquipage = objetStrict({
  busId: optionnel(uuidOuNul),
  chauffeurId: optionnel(uuidOuNul),
  convoyeurId: optionnel(uuidOuNul),
  quai: optionnel(nullable(entierPositif)),
});

const genre: Lecteur<GenreAppareil> = enumeration("guichet", "convoyeur", "autre");

export const declarerAppareil = objetStrict({
  genre,
  rang: optionnel(entier({ min: 1, max: 999 })),
  nbConvoyeurs: optionnel(entier({ min: 1, max: 999 })),
  gareId: idTexte,
  libelle: optionnel(texte({ min: 1, max: 100 })),
  signature,
});

export const commandeSigneeSeule = objetStrict({ signature });

export const effacerAppareil = objetStrict({
  motif: optionnel(texte({ min: 1, max: 200 })),
  signature,
});

export const enrolerAppareil = objetStrict({
  code: texte({ min: 8, max: 20, motif: /^[A-Za-z0-9 -]+$/, message: "code d'enrôlement attendu" }),
});

export const rapportEffacement = objetStrict({
  effaceA: texte({ min: 10, max: 40, motif: /^\d{4}-\d{2}-\d{2}T/, message: "heure ISO attendue" }),
  complet: booleen,
  etapes: tableau(
    objetStrict({
      nom: texte({ min: 1, max: 50 }),
      ok: booleen,
      detail: optionnel(texte({ min: 0, max: 500 })),
    }),
    { max: 20 },
  ),
});

export type CreerLigneRecu = ReturnType<typeof creerLigne>;
export type ModifierLigneRecu = ReturnType<typeof modifierLigne>;
