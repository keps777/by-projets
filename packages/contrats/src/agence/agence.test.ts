import { describe, expect, it } from "vitest";
import {
  EVENEMENTS_AGENCE,
  SchemaAccuse,
  SchemaFcfa,
  SchemaIsoDouala,
  SchemaPaiement,
  SchemaTelephone,
  TYPES_EVENEMENT_NUMEROTES,
  lireEvenementAgence,
} from "./index";
import type { TypeEvenementAgence } from "./index";

const UUID = "3f2b8c1e-9a4d-4e7b-8c55-0d6f1a2b3c4d";
const AUTRE_UUID = "7d1c5a90-2b6e-4f38-9a10-5e4c3b2a1f00";
const PREUVE = {
  superviseurId: "pers-essono",
  methode: "pin" as const,
  signature: "a1b2c3d4e5f60718",
};
const CASH = { mode: "cash" as const, recu: 5000, rendu: 1000, reference: null };
const PASSAGER = { nom: "Tchoumi Paul", telephone: "+237677301145", pieceQuatreDerniers: "8820" };
const CONTACT = { nom: "Ngo Aïcha", telephone: "+237691221008" };
const GPS = { latitude: 4.05, longitude: 9.7, precisionM: 12 };

/** Un exemple de données pour chaque type d'événement : le test échoue si un type n'en a pas. */
const DONNEES: Record<TypeEvenementAgence, unknown> = {
  "caisse.ouverte": {
    sessionId: "s1",
    numero: "K-DLA-270105-2-1",
    guichetId: "guichet-alp-dla-2",
    fondDeCaisse: 20_000,
  },
  "caisse.comptee": {
    sessionId: "s1",
    coupures: [{ valeur: 10_000, nombre: 48 }],
    pieces: 0,
    total: 480_000,
  },
  "caisse.cloturee": {
    sessionId: "s1",
    cashCompte: 694_500,
    cashAttendu: 695_500,
    ecart: -1000,
    auto: false,
  },
  "billet.vendu": {
    billetId: "b1",
    departId: "d1",
    siege: 24,
    classe: "classique",
    prix: 4000,
    bagage: 0,
    passager: PASSAGER,
    paiement: CASH,
    codeBillet: "6204",
    sms: true,
  },
  "billet.vendu_cadence": {
    billetId: "b2",
    departId: "d1",
    siege: 19,
    prix: 4000,
    paiement: CASH,
    codeBillet: "9047",
    telephone: null,
  },
  "billet.telephone_ajoute": { billetId: "b2", telephone: "+237655120000" },
  "colis.enregistre": {
    colisId: "c1",
    departId: "d2",
    expediteur: CONTACT,
    destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
    contenu: "Médicaments, vêtements",
    poidsKg: 2,
    valeurDeclaree: 25_000,
    assure: true,
    photoRef: "photo-1",
    paiement: { mode: "cash", montant: 2000 },
  },
  "colis.depose": { colisId: "c2", poidsReleveKg: 2.1, photoRef: "photo-2", complement: 0 },
  "impression.demandee": { document: "billet", documentId: "b1", copies: 1, reimpression: false },
  "quai.scanne": { departId: "d1", qr: "AM1:ALP-DLA-270105-0142:7341" },
  "quai.code_saisi": { departId: "d1", codeBillet: "6204" },
  "billet.complete": {
    billetId: "b2",
    departId: "d1",
    nom: "Ngono Albertine",
    pieceQuatreDerniers: "2210",
    telephone: null,
    embarquer: true,
  },
  "quai.libere": { departId: "d1", billetId: "b3", siege: 12, motif: "retard" },
  "quai.liste_envoyee": { departId: "d1", embarques: 31, capacite: 40 },
  "route.billet_vendu": {
    billetId: "b4",
    departId: "d1",
    arretMontee: "Pouma",
    arretDescente: "Yaoundé Mvan",
    siege: 36,
    prix: 4500,
    passager: { nom: "Mballa J.", telephone: null },
    paiement: CASH,
    codeBillet: "1183",
    gps: GPS,
  },
  "route.scanne": { departId: "d1", arret: "Pouma", qr: "AM1:ALP-DLA-270105-0142:7341" },
  "route.colis_decharges": { departId: "d1", arret: "Pouma", colisIds: ["c1", "c2"] },
  "chauffeur.depense": {
    depenseId: "dep-1",
    departId: "d1",
    categorie: "carburant",
    libelle: "Carburant · Total Edéa",
    montant: 45_000,
    justificatifRef: "photo-3",
  },
  "chauffeur.incident": {
    incidentId: "inc-1",
    departId: "d1",
    nature: "panne",
    gps: GPS,
    note: null,
  },
  "chauffeur.retard": { departId: "d1", minutes: 20 },
  "chauffeur.arrivee_arret": { departId: "d1", arret: "Pouma", gps: null },
  "controle.siege_verifie": {
    controleId: "ctl-1",
    departId: "d1",
    siege: 7,
    constat: "sans_billet",
  },
  "controle.regularise": {
    controleId: "ctl-1",
    billetId: "b5",
    departId: "d1",
    siege: 7,
    prix: 4000,
    paiement: CASH,
    codeBillet: "4471",
    passager: { nom: null, pieceQuatreDerniers: null },
  },
  "controle.convoyeur_signale": {
    controleId: "ctl-1",
    departId: "d1",
    convoyeurId: "pers-alain-b",
    siege: 7,
    montantDeclare: 4000,
    note: null,
  },
  "controle.cloture": { controleId: "ctl-1", departId: "d1", liste: 35, tetes: 36, ecart: 1 },
  "annulation.demandee": { demandeId: "dem-1", billetId: "b6", motif: "Client parti" },
  "annulation.decidee": {
    demandeId: "dem-1",
    billetId: "b6",
    decision: "rembourser",
    montant: 4000,
    validePar: PREUVE,
  },
  "caisse.validee": {
    sessionId: "s1",
    ecart: -1000,
    commentaire: "Recompté avec Joseph",
    validePar: PREUVE,
  },
  "caisse.refusee": { sessionId: "s1", motif: null, validePar: PREUVE },
  "equipe.pin_renouvele": { personneId: "pers-joseph", validePar: PREUVE },
  "equipe.affectation_changee": {
    personneId: "pers-joseph",
    guichetId: "guichet-alp-dla-1",
    role: null,
    validePar: PREUVE,
  },
  "equipe.compte_desactive": { personneId: "pers-joseph", validePar: PREUVE },
  "equipe.personne_debloquee": { personneId: "pers-pauline", validePar: PREUVE },
  "appareil.debloque": {
    appareilId: "appareil-gu3-dla",
    option: "debloquer_4h",
    validePar: PREUVE,
  },
};

function evenement(type: TypeEvenementAgence, numeroPlage: number | null, id = UUID) {
  const definition = EVENEMENTS_AGENCE.find((e) => e.type === type)!;
  const donnees = DONNEES[type] as Record<string, unknown>;
  return {
    id,
    type,
    at: "2027-01-05T08:11:00.000+01:00",
    appareilId: "appareil-gu2-dla",
    auteurId: "pers-joseph",
    cible: definition.cible(donnees as never),
    numeroPlage,
    donnees,
  };
}

describe("événements d'agence", () => {
  it("chaque type a un exemple, et chaque exemple passe le schéma complet", () => {
    expect(Object.keys(DONNEES).sort()).toEqual(EVENEMENTS_AGENCE.map((e) => e.type).sort());
    for (const definition of EVENEMENTS_AGENCE) {
      const numero = definition.numerote ? 232 : null;
      const resultat = lireEvenementAgence(evenement(definition.type, numero));
      expect(resultat.ok, definition.type).toBe(true);
    }
  });

  it("les types sont uniques", () => {
    const types = EVENEMENTS_AGENCE.map((e) => e.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("chaque écriture porte un identifiant d'événement UUID créé sur l'appareil", () => {
    for (const definition of EVENEMENTS_AGENCE) {
      const numero = definition.numerote ? 232 : null;
      const sansId = { ...evenement(definition.type, numero), id: "pas-un-uuid" };
      expect(lireEvenementAgence(sansId).ok, definition.type).toBe(false);
      const { id: _id, ...absent } = evenement(definition.type, numero);
      expect(lireEvenementAgence(absent).ok, definition.type).toBe(false);
      expect(lireEvenementAgence(evenement(definition.type, numero, AUTRE_UUID)).ok).toBe(true);
    }
  });

  it("les événements qui créent un document numéroté exigent un numéro de plage", () => {
    expect([...TYPES_EVENEMENT_NUMEROTES].sort()).toEqual([
      "billet.vendu",
      "billet.vendu_cadence",
      "colis.enregistre",
      "controle.regularise",
      "route.billet_vendu",
    ]);
    for (const definition of EVENEMENTS_AGENCE) {
      if (definition.numerote) {
        expect(lireEvenementAgence(evenement(definition.type, null)).ok, definition.type).toBe(
          false,
        );
        expect(lireEvenementAgence(evenement(definition.type, 0)).ok).toBe(false);
        expect(lireEvenementAgence(evenement(definition.type, 10_000)).ok).toBe(false);
        expect(lireEvenementAgence(evenement(definition.type, 1001)).ok).toBe(true);
      } else {
        expect(lireEvenementAgence(evenement(definition.type, 12)).ok, definition.type).toBe(false);
      }
    }
  });

  it("refuse un type inconnu, une heure hors Douala et des montants décimaux", () => {
    expect(lireEvenementAgence({ ...evenement("quai.scanne", null), type: "inconnu" }).ok).toBe(
      false,
    );
    expect(lireEvenementAgence(null).ok).toBe(false);
    expect(
      lireEvenementAgence({ ...evenement("quai.scanne", null), at: "2027-01-05T07:11:00.000Z" }).ok,
    ).toBe(false);
    const vente = evenement("billet.vendu", 232);
    expect(lireEvenementAgence({ ...vente, donnees: { ...vente.donnees, prix: 4000.5 } }).ok).toBe(
      false,
    );
  });

  it("une validation de superviseur ne porte jamais le PIN, seulement une signature", () => {
    const annulation = evenement("annulation.decidee", null);
    expect(lireEvenementAgence(annulation).ok).toBe(true);
    const sansSignature = {
      ...annulation,
      donnees: { ...annulation.donnees, validePar: { superviseurId: "x", methode: "pin" } },
    };
    expect(lireEvenementAgence(sansSignature).ok).toBe(false);
    const sansPreuve = {
      ...annulation,
      donnees: { ...annulation.donnees, validePar: undefined },
    };
    expect(lireEvenementAgence(sansPreuve).ok).toBe(false);
  });

  it("la cible de chaque événement désigne le document concerné", () => {
    expect(evenement("billet.vendu", 232).cible).toEqual({ type: "billet", id: "b1" });
    expect(evenement("caisse.cloturee", null).cible).toEqual({ type: "session", id: "s1" });
    expect(evenement("appareil.debloque", null).cible).toEqual({
      type: "appareil",
      id: "appareil-gu3-dla",
    });
    expect(evenement("impression.demandee", null).cible).toEqual({ type: "billet", id: "b1" });
  });
});

describe("briques communes", () => {
  it("les montants sont des entiers de FCFA", () => {
    expect(SchemaFcfa.safeParse(-1000).success).toBe(true);
    expect(SchemaFcfa.safeParse(4000.5).success).toBe(false);
  });

  it("les heures sont en Africa/Douala (+01:00)", () => {
    expect(SchemaIsoDouala.safeParse("2027-01-05T08:11:00.000+01:00").success).toBe(true);
    expect(SchemaIsoDouala.safeParse("2027-01-05T08:11:00+01:00").success).toBe(true);
    expect(SchemaIsoDouala.safeParse("2027-01-05T07:11:00.000Z").success).toBe(false);
    expect(SchemaIsoDouala.safeParse("2027-01-05T08:11:00.000+02:00").success).toBe(false);
  });

  it("le téléphone est au format international", () => {
    expect(SchemaTelephone.safeParse("+237677301145").success).toBe(true);
    expect(SchemaTelephone.safeParse("6 77 30 11 45").success).toBe(false);
  });

  it("un paiement a un mode, un montant reçu et un rendu entiers", () => {
    expect(
      SchemaPaiement.safeParse({ mode: "cash", recu: 5000, rendu: 1000, reference: null }).success,
    ).toBe(true);
    expect(
      SchemaPaiement.safeParse({ mode: "cheque", recu: 0, rendu: 0, reference: null }).success,
    ).toBe(false);
  });

  it("l'accusé distingue un événement nouveau d'un événement déjà reçu", () => {
    const recuA = "2027-01-05T08:11:01.000+01:00";
    expect(SchemaAccuse.safeParse({ evenementId: UUID, statut: "accepte", recuA }).success).toBe(
      true,
    );
    expect(SchemaAccuse.safeParse({ evenementId: UUID, statut: "deja_recu", recuA }).success).toBe(
      true,
    );
    expect(SchemaAccuse.safeParse({ evenementId: "x", statut: "accepte", recuA }).success).toBe(
      false,
    );
  });
});
