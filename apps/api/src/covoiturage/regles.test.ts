import { describe, expect, it } from "vitest";
import { chargerConfigCovoiturage } from "./config";
import type { DossierConducteur, PieceConducteur, TypePiece } from "./modeles";
import {
  FRAIS_PAR_PLACE,
  attenteVersementMs,
  decisionAnnulationPassager,
  devisReservation,
  estVerifie,
  initiales,
  jourCalendaireValide,
  liberationAuto,
  momentDe,
  moyenneNotes,
  motifPourSms,
  nomPublic,
  normaliser,
  normaliserImmatriculation,
  piecesAFournir,
  prixAutorise,
  quandDemande,
  quandTexte,
  rappelAvant,
  seChevauchent,
  statutDossier,
  trajetRepondALaDemande,
} from "./regles";

const config = chargerConfigCovoiturage({});
const T0 = new Date("2027-01-05T07:00:00.000Z"); // mardi 5 janvier 2027, 08:00 à Douala
const apres = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe("devis d'une réservation", () => {
  it("2 places à 4 000 F : 8 000 F pour le conducteur, 500 F de frais, sur deux lignes", () => {
    const devis = devisReservation(4000, 2);
    expect(devis.lignes).toEqual([
      { code: "places", libelle: "2 place(s)", montant: 8000 },
      { code: "frais_voyageur", libelle: "Frais AfriMove", montant: 500 },
    ]);
    expect(devis.total).toBe(8500);
  });

  it("250 F de frais par place, quel que soit le prix", () => {
    for (const places of [1, 2, 3, 4]) {
      const devis = devisReservation(3500, places);
      expect(devis.lignes[1]?.montant).toBe(FRAIS_PAR_PLACE * places);
      expect(devis.total).toBe(3500 * places + FRAIS_PAR_PLACE * places);
    }
  });

  it("refuse un nombre de places ou un prix invalide", () => {
    expect(() => devisReservation(4000, 0)).toThrow(RangeError);
    expect(() => devisReservation(4000, 1.5)).toThrow(RangeError);
    expect(() => devisReservation(-1, 1)).toThrow(RangeError);
    expect(() => devisReservation(40.5, 1)).toThrow(RangeError);
  });
});

describe("noms", () => {
  it("nom abrégé et initiales", () => {
    expect(nomPublic("Samuel Ekambi")).toBe("Samuel E.");
    expect(nomPublic("  Aïcha   Ngo Nkomo ")).toBe("Aïcha N.");
    expect(nomPublic("Marthe")).toBe("Marthe");
    expect(nomPublic("   ")).toBe("Voyageur");
    expect(initiales("Samuel Ekambi")).toBe("SE");
    expect(initiales("Marthe")).toBe("MA");
  });

  it("normaliser ignore accents, casse et ponctuation", () => {
    expect(normaliser("  Yaoundé ")).toBe("yaounde");
    expect(normaliser("Édéa")).toBe("edea");
    expect(normaliser("Bonamoussadi,  Rond-point")).toBe("bonamoussadi rond point");
  });

  it("immatriculation uniformisée", () => {
    expect(normaliserImmatriculation(" lt-882  ce ")).toBe("LT 882 CE");
  });
});

describe("libération de l'argent : arrivée prévue + 2 h", () => {
  it("départ 08:30, trajet de 2 h 30 : arrivée 11:00, libération automatique à 13:00", () => {
    const depart = new Date("2027-01-06T07:30:00.000Z"); // 08:30 à Douala
    const auto = liberationAuto(depart, 150, config);
    expect(auto.toISOString()).toBe("2027-01-06T12:00:00.000Z"); // 13:00 à Douala
  });

  it("le délai se règle", () => {
    const cfg = chargerConfigCovoiturage({ COVOITURAGE_LIBERATION_APRES_MIN: "30" });
    expect(liberationAuto(T0, 60, cfg).getTime() - T0.getTime()).toBe(90 * 60_000);
  });
});

describe("annulation par le passager", () => {
  const r = { departA: apres(24 * 60), prixParPlace: 4000, places: 2 };

  it("gratuite jusqu'à 2 h avant le départ : tout le prix est rendu, jamais les frais", () => {
    const d = decisionAnnulationPassager(r, apres(22 * 60 - 1), config);
    expect(d).toEqual({ autorise: true, gratuite: true, retenue: 0, remboursement: 8000 });
  });

  it("pile 2 h avant : encore gratuite", () => {
    expect(decisionAnnulationPassager(r, apres(22 * 60), config).gratuite).toBe(true);
  });

  it("moins de 2 h avant : la moitié du prix reste au conducteur", () => {
    const d = decisionAnnulationPassager(r, apres(23 * 60), config);
    expect(d).toEqual({ autorise: true, gratuite: false, retenue: 4000, remboursement: 4000 });
  });

  it("la retenue arrondit en faveur du passager et le total reste exact", () => {
    const d = decisionAnnulationPassager(
      { departA: apres(60), prixParPlace: 3333, places: 1 },
      T0,
      config,
    );
    expect(d.retenue).toBe(1666);
    expect(d.retenue + d.remboursement).toBe(3333);
  });

  it("le pourcentage de retenue se règle", () => {
    const cfg = chargerConfigCovoiturage({ COVOITURAGE_RETENUE_TARDIVE_PCT: "100" });
    const d = decisionAnnulationPassager(r, apres(23 * 60), cfg);
    expect(d).toMatchObject({ retenue: 8000, remboursement: 0 });
  });

  it("plus d'annulation une fois le départ passé", () => {
    expect(decisionAnnulationPassager(r, apres(24 * 60), config).autorise).toBe(false);
    expect(decisionAnnulationPassager(r, apres(25 * 60), config)).toMatchObject({
      autorise: false,
      remboursement: 0,
    });
  });
});

describe("prix : partage de frais", () => {
  it("jamais au-dessus de la fourchette conseillée", () => {
    const conseil = { min: 3500, max: 4500 };
    expect(prixAutorise(4500, conseil, config)).toEqual({ ok: true, max: 4500 });
    expect(prixAutorise(4501, conseil, config).ok).toBe(false);
    expect(prixAutorise(3000, conseil, config).ok).toBe(true);
  });

  it("trajet inconnu : plafond général, et pas de prix dérisoire ni décimal", () => {
    expect(prixAutorise(20_000, null, config).ok).toBe(true);
    expect(prixAutorise(20_001, null, config).ok).toBe(false);
    expect(prixAutorise(99, null, config).ok).toBe(false);
    expect(prixAutorise(1000.5, null, config).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ dossier */

const piece = (type: TypePiece, surcharge: Partial<PieceConducteur> = {}): PieceConducteur => ({
  type,
  statut: "validee",
  fichierId: `f-${type}`,
  numeroChiffre: null,
  expireLe: null,
  deposeeA: T0,
  verifieePar: "afrimove-1",
  verifieeA: T0,
  motifRefus: null,
  ...surcharge,
});

const dossier = (
  pieces: Partial<Record<TypePiece, PieceConducteur>>,
  vehicule: DossierConducteur["vehicule"] = {
    marque: "Toyota",
    modele: "Corolla",
    couleur: "grise",
    immatriculation: "LT 882 CE",
    places: 3,
    grandBagage: false,
  },
): DossierConducteur => ({
  conducteurId: "c1",
  vehicule,
  pieces,
  numeroVersementChiffre: null,
  creeA: T0,
  modifieA: T0,
});

const complet = () => ({
  identite: piece("identite"),
  permis: piece("permis", { expireLe: "2030-06-30" }),
  carte_grise: piece("carte_grise"),
  voiture: piece("voiture"),
});

describe("vérification du conducteur", () => {
  it("vérifié seulement avec les quatre pièces validées et le véhicule", () => {
    expect(statutDossier(dossier(complet()), T0)).toBe("verifie");
    expect(estVerifie(dossier(complet()), T0)).toBe(true);
    expect(estVerifie(null, T0)).toBe(false);
  });

  it("une pièce manquante ou un véhicule absent : incomplet", () => {
    const { voiture: _v, ...sansVoiture } = complet();
    expect(statutDossier(dossier(sansVoiture), T0)).toBe("incomplet");
    expect(statutDossier(dossier(complet(), null), T0)).toBe("incomplet");
    expect(statutDossier(dossier({}), T0)).toBe("incomplet");
  });

  it("une pièce à vérifier : en vérification ; refusée : refusé, quoi qu'il manque d'autre", () => {
    expect(
      statutDossier(
        dossier({
          ...complet(),
          permis: piece("permis", { statut: "a_verifier", expireLe: "2030-06-30" }),
        }),
        T0,
      ),
    ).toBe("en_verification");
    expect(statutDossier(dossier({ identite: piece("identite", { statut: "refusee" }) }), T0)).toBe(
      "refuse",
    );
  });

  it("un permis périmé rend le dossier expiré le lendemain de sa date, pas avant", () => {
    const d = dossier({ ...complet(), permis: piece("permis", { expireLe: "2027-01-05" }) });
    expect(statutDossier(d, T0)).toBe("verifie");
    expect(statutDossier(d, apres(24 * 60))).toBe("expire");
    expect(estVerifie(d, apres(24 * 60))).toBe(false);
  });

  it("dit ce qu'il reste à fournir", () => {
    const d = dossier({
      identite: piece("identite"),
      permis: piece("permis", { statut: "refusee" }),
    });
    expect(piecesAFournir(d, T0)).toEqual(["permis", "carte_grise", "voiture"]);
    const perime = dossier({ ...complet(), permis: piece("permis", { expireLe: "2026-12-31" }) });
    expect(piecesAFournir(perime, T0)).toEqual(["permis"]);
  });
});

describe("demandes de passagers", () => {
  const trajet = {
    statut: "publie" as const,
    type: "entre_villes" as const,
    departVille: "Douala",
    arriveeVille: "Kribi",
    departA: new Date("2027-01-10T07:30:00.000Z"), // dimanche 08:30 à Douala
  };
  const demande = {
    departVille: "douala",
    arriveeVille: "Kribi",
    jour: "2027-01-10",
    moment: "matin" as const,
    places: 1,
  };

  it("répond : mêmes villes (sans tenir compte de la casse), même jour, bon créneau, assez de places", () => {
    expect(trajetRepondALaDemande(trajet, 2, demande)).toBe(true);
    expect(trajetRepondALaDemande(trajet, 2, { ...demande, moment: null })).toBe(true);
  });

  it("ne répond pas : autre jour, autre créneau, trop peu de places, autre sens, trajet annulé", () => {
    expect(trajetRepondALaDemande(trajet, 2, { ...demande, jour: "2027-01-09" })).toBe(false);
    expect(trajetRepondALaDemande(trajet, 2, { ...demande, moment: "soir" })).toBe(false);
    expect(trajetRepondALaDemande(trajet, 0, demande)).toBe(false);
    expect(trajetRepondALaDemande(trajet, 1, { ...demande, places: 2 })).toBe(false);
    expect(
      trajetRepondALaDemande(trajet, 2, {
        ...demande,
        departVille: "Kribi",
        arriveeVille: "Douala",
      }),
    ).toBe(false);
    expect(trajetRepondALaDemande({ ...trajet, statut: "annule" }, 2, demande)).toBe(false);
    expect(trajetRepondALaDemande({ ...trajet, type: "ville" }, 2, demande)).toBe(false);
  });

  it("textes de la demande", () => {
    expect(quandDemande({ jour: "2027-01-10", moment: "matin" })).toBe("dimanche matin");
    expect(quandDemande({ jour: "2027-01-10", moment: null })).toBe("dimanche");
    expect(quandDemande({ jour: "2027-01-10", moment: "apres_midi" })).toBe("dimanche après-midi");
    expect(momentDe(new Date("2027-01-10T07:30:00.000Z"))).toBe("matin");
    expect(momentDe(new Date("2027-01-10T11:30:00.000Z"))).toBe("apres_midi");
    expect(momentDe(new Date("2027-01-10T17:30:00.000Z"))).toBe("soir");
    expect(quandTexte(new Date("2027-01-09T07:30:00.000Z"))).toBe("sam. 09/01 à 08:30");
  });
});

describe("autres règles", () => {
  it("deux trajets du même conducteur se chevauchent entre le départ et l'arrivée prévue", () => {
    const a = { departA: T0, dureeMinutes: 150 };
    expect(seChevauchent(a, { departA: apres(60), dureeMinutes: 30 })).toBe(true);
    expect(seChevauchent(a, { departA: apres(150), dureeMinutes: 30 })).toBe(false);
    expect(seChevauchent(a, { departA: apres(-30), dureeMinutes: 30 })).toBe(false);
    expect(seChevauchent(a, { departA: apres(-30), dureeMinutes: 31 })).toBe(true);
  });

  it("moyenne arrondie à une décimale, rien sans note", () => {
    expect(moyenneNotes([])).toBeNull();
    expect(moyenneNotes([{ valeur: 5 }, { valeur: 4 }, { valeur: 5 }])).toBe(4.7);
    expect(moyenneNotes([{ valeur: 3 }])).toBe(3);
  });

  it("heure de rappel du trajet régulier", () => {
    expect(rappelAvant("07:00")).toBe("06:40");
    expect(rappelAvant("00:10")).toBe("23:50");
  });

  it("le motif d'un refus part sans adresse, sur une ligne, en 80 caractères", () => {
    expect(motifPourSms("Photo floue.\nVoir https://exemple.com/x pour un modèle")).toBe(
      "Photo floue. Voir pour un modèle",
    );
    expect(motifPourSms("a".repeat(200))).toHaveLength(80);
  });

  it("attente des versements : 1 min, 2 min, 4 min… plafonnée à 6 h", () => {
    expect(attenteVersementMs(1, 60_000)).toBe(60_000);
    expect(attenteVersementMs(2, 60_000)).toBe(120_000);
    expect(attenteVersementMs(3, 60_000)).toBe(240_000);
    expect(attenteVersementMs(30, 60_000)).toBe(6 * 3_600_000);
  });

  it("jour calendaire réel", () => {
    expect(jourCalendaireValide("2027-02-28")).toBe(true);
    expect(jourCalendaireValide("2027-02-30")).toBe(false);
    expect(jourCalendaireValide("27-02-28")).toBe(false);
  });
});
