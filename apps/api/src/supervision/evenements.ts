import {
  Lecteur,
  lireEvenement,
  type DefinitionLecture,
  type EvenementLu,
  type ValidationSuperviseurLue,
} from "../caisse/validation";
import { ROLES_EQUIPE, type DecisionAnnulation, type RoleEquipe } from "./ports";

/**
 * Lecteurs des écritures de la supervision (`EVENEMENT_ANNULATION_*`, `EVENEMENT_CAISSE_VALIDEE`,
 * `EVENEMENT_CAISSE_REFUSEE`, `EVENEMENT_EQUIPE_*` de `@afrimove/contrats`). `parite.test.ts` les
 * compare aux schémas zod.
 */

export const DECISIONS: readonly DecisionAnnulation[] = [
  "rembourser",
  "reporter",
  "avoir",
  "refuser",
];

export interface DonneesDemandeAnnulation {
  demandeId: string;
  billetId: string;
  motif: string;
}

export interface DonneesDecisionAnnulation {
  demandeId: string;
  billetId: string;
  decision: DecisionAnnulation;
  montant: number;
  validePar: ValidationSuperviseurLue;
}

export interface DonneesValidationCaisse {
  sessionId: string;
  ecart: number;
  commentaire: string | null;
  validePar: ValidationSuperviseurLue;
}

export interface DonneesRefusCaisse {
  sessionId: string;
  motif: string | null;
  validePar: ValidationSuperviseurLue;
}

export interface DonneesPersonne {
  personneId: string;
  validePar: ValidationSuperviseurLue;
}

export interface DonneesAffectation extends DonneesPersonne {
  guichetId: string | null;
  role: RoleEquipe | null;
}

/** Les données dont il manque un morceau : on laisse le lecteur signaler lequel. */
const complet = <T extends object>(o: { [K in keyof T]: T[K] | undefined }): T | undefined =>
  Object.values(o).includes(undefined) ? undefined : (o as T);

export const DEF_ANNULATION_DEMANDEE: DefinitionLecture<DonneesDemandeAnnulation> = {
  type: "annulation.demandee",
  donnees: (l: Lecteur, d) =>
    complet<DonneesDemandeAnnulation>({
      demandeId: l.texte(d["demandeId"], "donnees.demandeId", 128),
      billetId: l.texte(d["billetId"], "donnees.billetId", 128),
      motif: l.texte(d["motif"], "donnees.motif", 500),
    }),
  cible: (d) => ({ type: "demande", id: d.demandeId }),
};

export const DEF_ANNULATION_DECIDEE: DefinitionLecture<DonneesDecisionAnnulation> = {
  type: "annulation.decidee",
  donnees: (l: Lecteur, d) =>
    complet<DonneesDecisionAnnulation>({
      demandeId: l.texte(d["demandeId"], "donnees.demandeId", 128),
      billetId: l.texte(d["billetId"], "donnees.billetId", 128),
      decision: l.choix(d["decision"], "donnees.decision", DECISIONS),
      montant: l.fcfaPositif(d["montant"], "donnees.montant"),
      validePar: l.validationSuperviseur(d["validePar"], "donnees.validePar"),
    }),
  cible: (d) => ({ type: "demande", id: d.demandeId }),
};

export const DEF_CAISSE_VALIDEE: DefinitionLecture<DonneesValidationCaisse> = {
  type: "caisse.validee",
  donnees: (l: Lecteur, d) => {
    const commentaire = l.nullable(d["commentaire"], (x) =>
      l.texteLibre(x, "donnees.commentaire", 1000),
    );
    return complet<DonneesValidationCaisse>({
      sessionId: l.texte(d["sessionId"], "donnees.sessionId", 128),
      ecart: l.fcfa(d["ecart"], "donnees.ecart"),
      commentaire,
      validePar: l.validationSuperviseur(d["validePar"], "donnees.validePar"),
    });
  },
  cible: (d) => ({ type: "session", id: d.sessionId }),
};

export const DEF_CAISSE_REFUSEE: DefinitionLecture<DonneesRefusCaisse> = {
  type: "caisse.refusee",
  donnees: (l: Lecteur, d) => {
    const motif = l.nullable(d["motif"], (x) => l.texteLibre(x, "donnees.motif", 1000));
    return complet<DonneesRefusCaisse>({
      sessionId: l.texte(d["sessionId"], "donnees.sessionId", 128),
      motif,
      validePar: l.validationSuperviseur(d["validePar"], "donnees.validePar"),
    });
  },
  cible: (d) => ({ type: "session", id: d.sessionId }),
};

const definitionPersonne = (type: string): DefinitionLecture<DonneesPersonne> => ({
  type,
  donnees: (l: Lecteur, d) =>
    complet<DonneesPersonne>({
      personneId: l.texte(d["personneId"], "donnees.personneId", 128),
      validePar: l.validationSuperviseur(d["validePar"], "donnees.validePar"),
    }),
  cible: (d) => ({ type: "personne", id: d.personneId }),
});

export const DEF_EQUIPE_PIN_RENOUVELE = definitionPersonne("equipe.pin_renouvele");
export const DEF_EQUIPE_COMPTE_DESACTIVE = definitionPersonne("equipe.compte_desactive");
export const DEF_EQUIPE_PERSONNE_DEBLOQUEE = definitionPersonne("equipe.personne_debloquee");

export const DEF_EQUIPE_AFFECTATION_CHANGEE: DefinitionLecture<DonneesAffectation> = {
  type: "equipe.affectation_changee",
  donnees: (l: Lecteur, d) => {
    const guichetId = l.nullable(d["guichetId"], (x) => l.texte(x, "donnees.guichetId", 128));
    const role = l.nullable(d["role"], (x) => l.choix(x, "donnees.role", ROLES_EQUIPE));
    return complet<DonneesAffectation>({
      personneId: l.texte(d["personneId"], "donnees.personneId", 128),
      guichetId,
      role,
      validePar: l.validationSuperviseur(d["validePar"], "donnees.validePar"),
    });
  },
  cible: (d) => ({ type: "personne", id: d.personneId }),
};

export const lireDemandeAnnulation = (b: unknown): EvenementLu<DonneesDemandeAnnulation> =>
  lireEvenement(b, DEF_ANNULATION_DEMANDEE);
export const lireDecisionAnnulation = (b: unknown): EvenementLu<DonneesDecisionAnnulation> =>
  lireEvenement(b, DEF_ANNULATION_DECIDEE);
export const lireValidationCaisse = (b: unknown): EvenementLu<DonneesValidationCaisse> =>
  lireEvenement(b, DEF_CAISSE_VALIDEE);
export const lireRefusCaisse = (b: unknown): EvenementLu<DonneesRefusCaisse> =>
  lireEvenement(b, DEF_CAISSE_REFUSEE);
export const lirePinRenouvele = (b: unknown): EvenementLu<DonneesPersonne> =>
  lireEvenement(b, DEF_EQUIPE_PIN_RENOUVELE);
export const lireCompteDesactive = (b: unknown): EvenementLu<DonneesPersonne> =>
  lireEvenement(b, DEF_EQUIPE_COMPTE_DESACTIVE);
export const lirePersonneDebloquee = (b: unknown): EvenementLu<DonneesPersonne> =>
  lireEvenement(b, DEF_EQUIPE_PERSONNE_DEBLOQUEE);
export const lireAffectation = (b: unknown): EvenementLu<DonneesAffectation> =>
  lireEvenement(b, DEF_EQUIPE_AFFECTATION_CHANGEE);

/** Tous les types d'événements qui exigent la validation d'un superviseur par son PIN. */
export const TYPES_AVEC_VALIDATION = [
  "annulation.decidee",
  "caisse.validee",
  "caisse.refusee",
  "equipe.pin_renouvele",
  "equipe.affectation_changee",
  "equipe.compte_desactive",
  "equipe.personne_debloquee",
] as const;
