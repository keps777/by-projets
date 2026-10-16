import { describe, expect, it } from "vitest";
import { lire, CLES } from "@/coquille/stockage";
import en from "./en.json";
import fr from "./fr.json";
import pcm from "./pcm.json";
import { LANGUES, changerLangue, creerI18n } from "./index";

function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    typeof valeur === "object" && valeur !== null
      ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`],
  );
}

function valeurs(objet: Record<string, unknown>): string[] {
  return Object.values(objet).flatMap((valeur) =>
    typeof valeur === "object" && valeur !== null
      ? valeurs(valeur as Record<string, unknown>)
      : [String(valeur)],
  );
}

describe("i18n FR / EN / Pidgin", () => {
  it("propose les trois langues", () => {
    expect([...LANGUES]).toEqual(["fr", "en", "pcm"]);
  });

  it("a exactement les mêmes clés dans les trois langues", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });

  it("a le français rempli, sans valeur vide", () => {
    expect(valeurs(fr).filter((valeur) => valeur.trim() === "")).toEqual([]);
  });

  it("n'emploie aucun des mots interdits par la marque", () => {
    const interdits =
      /révolution|disruption|digitalis|plateforme|écosystème|solution innovante|fini les arnaques/i;
    expect(valeurs(fr).filter((valeur) => interdits.test(valeur))).toEqual([]);
  });

  it("répond en français par défaut", () => {
    const i18n = creerI18n();
    expect(i18n.language).toBe("fr");
    expect(i18n.t("navigation.voyageur.voyager")).toBe("Voyager");
    expect(i18n.t("ecrans.Main.titre")).toBe(fr.ecrans.Main.titre);
  });

  it("se replie sur le français quand une clé anglaise ou pidgin est vide", () => {
    for (const langue of ["en", "pcm"] as const) {
      const i18n = creerI18n(langue);
      expect(i18n.language).toBe(langue);
      expect(i18n.t("navigation.patron.reglages")).toBe("Réglages");
    }
  });

  it("change de langue, la mémorise et met à jour l'attribut lang", async () => {
    const i18n = creerI18n("fr");
    await changerLangue(i18n, "en");
    expect(i18n.language).toBe("en");
    expect(lire(CLES.langue)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(creerI18n().language).toBe("en");
  });
});
