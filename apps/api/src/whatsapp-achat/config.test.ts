import { describe, expect, it } from "vitest";
import {
  BASE_LIEN_BILLET_DEFAUT,
  ConfigAchatWhatsAppInvalide,
  chargerConfigAchatWhatsApp,
} from "./config";
import { VILLES_PAR_DEFAUT, VillesInvalides, formeAlias, villesAvecSupplement } from "./villes";

describe("chargerConfigAchatWhatsApp", () => {
  it("valeurs par défaut", () => {
    const c = chargerConfigAchatWhatsApp({});
    expect(c).toMatchObject({
      langueDefaut: "fr",
      sessionTtlMs: 15 * 60_000,
      trajetDefaut: { depart: "DLA", arrivee: "YDE" },
      nombreDeparts: 3,
      siegesProposes: 8,
      codeSansFrais: "WHATSAPP",
      baseLienBillet: BASE_LIEN_BILLET_DEFAUT,
      erreursMax: 3,
      vocal: true,
      production: false,
    });
    // la place retenue dure 15 minutes : l'abandon vient après la session
    expect(c.abandonApresMs).toBe(16 * 60_000);
    expect(c.villes.map((v) => v.code)).toEqual(VILLES_PAR_DEFAUT.map((v) => v.code));
  });

  it("lit les variables WHATSAPP_ACHAT_*", () => {
    const c = chargerConfigAchatWhatsApp(
      {
        WHATSAPP_ACHAT_LANGUE_DEFAUT: "pcm",
        WHATSAPP_ACHAT_SESSION_TTL_MIN: "10",
        WHATSAPP_ACHAT_TRAJET_DEFAUT: "YDE>DLA",
        WHATSAPP_ACHAT_NOMBRE_DEPARTS: "5",
        WHATSAPP_ACHAT_CODE_SANS_FRAIS: "SANSFRAIS",
        WHATSAPP_ACHAT_VOCAL: "non",
        WHATSAPP_ACHAT_ABANDON_MARGE_S: "0",
        WHATSAPP_ACHAT_VILLES: "Garoua=GAR",
      },
      true,
    );
    expect(c).toMatchObject({
      langueDefaut: "pcm",
      sessionTtlMs: 600_000,
      abandonApresMs: 600_000,
      trajetDefaut: { depart: "YDE", arrivee: "DLA" },
      nombreDeparts: 5,
      codeSansFrais: "SANSFRAIS",
      vocal: false,
      production: true,
    });
    expect(c.villes.some((v) => v.code === "GAR")).toBe(true);
  });

  it("liste toutes les erreurs d'un coup", () => {
    let erreur: unknown;
    try {
      chargerConfigAchatWhatsApp({
        WHATSAPP_ACHAT_LANGUE_DEFAUT: "de",
        WHATSAPP_ACHAT_TRAJET_DEFAUT: "DLA>DLA",
        WHATSAPP_ACHAT_SESSION_TTL_MIN: "1",
        WHATSAPP_ACHAT_NOMBRE_DEPARTS: "9",
        WHATSAPP_ACHAT_VOCAL: "peut-être",
        WHATSAPP_ACHAT_BASE_LIEN_BILLET: "http://afrimove.app/b",
        WHATSAPP_ACHAT_CODE_SANS_FRAIS: "a",
        WHATSAPP_ACHAT_VILLES: "Garoua",
      });
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ConfigAchatWhatsAppInvalide);
    const { erreurs } = erreur as ConfigAchatWhatsAppInvalide;
    expect(erreurs).toHaveLength(8);
    expect(erreurs.join("\n")).toContain("WHATSAPP_ACHAT_LANGUE_DEFAUT");
    expect(erreurs.join("\n")).toContain("départ et arrivée doivent différer");
    expect(erreurs.join("\n")).toContain("WHATSAPP_ACHAT_VILLES");
  });

  it("le trajet par défaut doit s'écrire DLA>YDE", () => {
    expect(() =>
      chargerConfigAchatWhatsApp({ WHATSAPP_ACHAT_TRAJET_DEFAUT: "Douala-Yaoundé" }),
    ).toThrow(/WHATSAPP_ACHAT_TRAJET_DEFAUT/);
  });

  it("l'adresse du billet doit tenir dans le gabarit WhatsApp", () => {
    expect(() =>
      chargerConfigAchatWhatsApp({
        WHATSAPP_ACHAT_BASE_LIEN_BILLET:
          "https://un-nom-de-domaine-vraiment-trop-long.example.com/b/",
      }),
    ).toThrow(/WHATSAPP_ACHAT_BASE_LIEN_BILLET/);
    expect(
      chargerConfigAchatWhatsApp({ WHATSAPP_ACHAT_BASE_LIEN_BILLET: "https://afri.cm/b/" })
        .baseLienBillet,
    ).toBe("https://afri.cm/b/");
  });
});

describe("villesAvecSupplement", () => {
  it("sans supplément : les six villes de la billetterie", () => {
    expect(villesAvecSupplement(undefined).map((v) => v.code)).toEqual([
      "DLA",
      "YDE",
      "BAF",
      "BAM",
      "KRI",
      "NGA",
    ]);
    expect(villesAvecSupplement("  ")).toHaveLength(6);
  });

  it("ajoute une ville, ou un alias à une ville connue", () => {
    const villes = villesAvecSupplement("Garoua=GAR, Yaoundé Centre=YDE");
    expect(villes.find((v) => v.code === "GAR")).toEqual({
      code: "GAR",
      nom: "Garoua",
      alias: ["garoua"],
    });
    expect(villes.find((v) => v.code === "YDE")!.alias).toContain("yaounde centre");
    // la liste par défaut n'est jamais modifiée
    expect(VILLES_PAR_DEFAUT.find((v) => v.code === "YDE")!.alias).not.toContain("yaounde centre");
  });

  it.each(["Garoua", "Garoua=GA", "Garoua=gar", "=GAR", "Un deux trois=GAR"])(
    "« %s » est refusé",
    (texte) => {
      expect(() => villesAvecSupplement(texte)).toThrow(VillesInvalides);
    },
  );

  it("formeAlias", () => {
    expect(formeAlias("  Ngaoundéré ")).toBe("ngaoundere");
    expect(formeAlias("Saint-Louis")).toBe("saint louis");
  });
});
