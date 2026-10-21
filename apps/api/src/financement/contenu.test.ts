import { describe, expect, it } from "vitest";
import { groupes, montantCourt, pourcentage, quand, suiviDuDossier } from "./contenu";
import { dossierType } from "./testing/fabriques";

describe("formats", () => {
  it("écrit les montants comme la maquette", () => {
    expect(montantCourt(36_200_000)).toBe("36,2 M");
    expect(montantCourt(6_000_000)).toBe("6 M");
    expect(montantCourt(250_000)).toBe("250 k");
    expect(montantCourt(950)).toBe("950");
    expect(groupes(8940)).toBe("8 940");
    expect(groupes(6_000_000)).toBe("6 000 000");
    expect(pourcentage(99.8)).toBe("99,8");
    expect(pourcentage(100)).toBe("100");
  });

  it("dit aujourd'hui, hier et demain à l'heure de Douala", () => {
    const maintenant = "2027-01-05T14:00:00.000+01:00";
    expect(quand("2027-01-05T10:04:00.000+01:00", maintenant)).toBe("aujourd'hui 10:04");
    expect(quand("2027-01-04T23:59:00.000+01:00", maintenant)).toBe("hier 23:59");
    expect(quand("2027-01-06T10:04:00.000+01:00", maintenant)).toBe("demain 10:04");
    expect(quand("2027-01-12T09:05:00.000+01:00", maintenant)).toBe("12 janv. 09:05");
  });

  it("compte les jours à Douala, pas en UTC (minuit à Douala est 23 h la veille en UTC)", () => {
    // 00:30 à Douala le 6 janvier, vu depuis le 5 à 23:00 à Douala : c'est demain.
    expect(quand("2027-01-06T00:30:00.000+01:00", "2027-01-05T23:00:00.000+01:00")).toBe(
      "demain 00:30",
    );
  });
});

describe("pièces jointes du dossier", () => {
  it("reprennent les quatre pièces de la planche", () => {
    expect(dossierType().pieces).toEqual([
      {
        code: "ventes",
        nom: "90 jours de ventes certifiées AfriMove",
        detail: "36,2 M · 8 940 billets · 2 310 colis",
        format: "pdf",
      },
      {
        code: "releves_momo",
        nom: "Relevés MoMo rapprochés · 3 mois",
        detail: "99,8 % de correspondance",
        format: "csv",
      },
      {
        code: "registre",
        nom: "Registre de commerce · carte contribuable",
        detail: "fournis à l'inscription · valides",
        format: "pdf",
      },
      {
        code: "mandat",
        nom: "Mandat de prélèvement 8 % · signé PIN",
        detail: "sur le compte marchand MoMo · révocable à solde zéro",
        format: "pdf",
      },
    ]);
  });
});

describe("frise de suivi", () => {
  const dix_heures = "2027-01-05T10:30:00.000+01:00";

  it("dossier en analyse : la phrase de la planche, relative à maintenant", () => {
    const suivi = suiviDuDossier(dossierType(), dix_heures);
    expect(suivi).toEqual([
      {
        code: "envoye",
        libelle: "Envoyé",
        detail: "aujourd'hui 10:04 · accusé reçu du partenaire",
        at: "2027-01-05T10:04:00.000+01:00",
        etat: "fait",
      },
      {
        code: "analyse",
        libelle: "Analyse",
        detail: "le partenaire décide seul · jusqu'à demain 10:04",
        at: null,
        etat: "en_cours",
      },
      {
        code: "versement",
        libelle: "Versement",
        detail:
          "Versement sur ton compte · SMS + notification · le 8 % démarre au 1er billet MoMo suivant",
        at: null,
        etat: "a_venir",
      },
    ]);
  });

  it("le lendemain, les mêmes heures se relisent « hier » et « aujourd'hui »", () => {
    const suivi = suiviDuDossier(dossierType(), "2027-01-06T08:00:00.000+01:00");
    expect(suivi[0]!.detail).toBe("hier 10:04 · accusé reçu du partenaire");
    expect(suivi[1]!.detail).toBe("le partenaire décide seul · jusqu'à aujourd'hui 10:04");
  });

  it("sans accusé, le dossier le dit au lieu de promettre un accusé", () => {
    const suivi = suiviDuDossier(
      dossierType({ statut: "envoye", accuseA: null, referencePartenaire: null }),
      dix_heures,
    );
    expect(suivi[0]!.detail).toContain("n'a pas encore accusé réception");
    expect(suivi[0]!.etat).toBe("fait");
    expect(suivi[1]!.etat).toBe("en_cours");
  });

  it("délai de réponse dépassé : ne promet plus un « jusqu'à » passé", () => {
    const suivi = suiviDuDossier(dossierType(), "2027-01-07T09:00:00.000+01:00");
    expect(suivi[1]!.detail).toBe("le partenaire décide seul · sa réponse est attendue");
  });

  it("versé : les trois étapes sont faites", () => {
    const suivi = suiviDuDossier(
      dossierType({
        statut: "verse",
        decisionA: "2027-01-05T16:00:00.000+01:00",
        verseA: "2027-01-05T16:00:00.000+01:00",
      }),
      "2027-01-05T17:00:00.000+01:00",
    );
    expect(suivi.map((e) => e.etat)).toEqual(["fait", "fait", "fait"]);
    expect(suivi[2]!.detail).toContain("aujourd'hui 16:00");
    expect(suivi[2]!.detail.startsWith("Versement")).toBe(true);
  });

  it("refusé : le versement n'aura pas lieu", () => {
    const suivi = suiviDuDossier(
      dossierType({ statut: "refuse", decisionA: "2027-01-05T16:00:00.000+01:00" }),
      "2027-01-05T17:00:00.000+01:00",
    );
    expect(suivi.map((e) => e.etat)).toEqual(["fait", "fait", "a_venir"]);
    expect(suivi[2]!.detail).toContain("annulé");
  });

  it("retiré : l'analyse et le versement ne viendront pas", () => {
    const suivi = suiviDuDossier(
      dossierType({ statut: "retire", retireA: "2027-01-05T11:00:00.000+01:00" }),
      "2027-01-05T17:00:00.000+01:00",
    );
    expect(suivi.map((e) => e.etat)).toEqual(["fait", "a_venir", "a_venir"]);
    expect(suivi[1]!.detail).toContain("retirée");
  });
});
