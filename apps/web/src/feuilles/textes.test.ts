import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { creerI18n } from "@/i18n";
import { ESPACE_FEUILLES, enregistrerTextesFeuilles } from "./textes";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const dossier = dirname(fileURLToPath(import.meta.url));

function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    typeof valeur === "object" && valeur !== null
      ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`],
  );
}

function valeurs(objet: Record<string, unknown>): string[] {
  return Object.values(objet).flatMap((v) =>
    typeof v === "object" && v !== null ? valeurs(v as Record<string, unknown>) : [String(v)],
  );
}

describe("textes des feuilles", () => {
  it("a les mêmes clés en français, en anglais et en pidgin", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });

  it("n'a aucun texte français vide", () => {
    expect(valeurs(fr).filter((v) => v.trim() === "")).toEqual([]);
  });

  it('définit toutes les clés que le code des feuilles demande avec t("...")', () => {
    const connues = new Set(cles(fr));
    const sources = readdirSync(dossier).filter((f) => /^[A-Za-z]+\.tsx$/.test(f));
    expect(sources.length).toBeGreaterThan(0);
    const manquantes: string[] = [];
    for (const source of sources) {
      const code = readFileSync(join(dossier, source), "utf8");
      for (const [, cle] of code.matchAll(/\bt\("([^"]+)"/g)) {
        if (cle !== undefined && !connues.has(cle)) manquantes.push(`${source} : ${cle}`);
      }
    }
    expect(manquantes).toEqual([]);
  });

  it("s'enregistre une fois dans l'instance i18next et se lit en français", () => {
    const instance = creerI18n("fr");
    expect(instance.hasResourceBundle("fr", ESPACE_FEUILLES)).toBe(false);
    enregistrerTextesFeuilles(instance);
    enregistrerTextesFeuilles(instance);
    expect(instance.getFixedT("fr", ESPACE_FEUILLES)("reglages.titre")).toBe("Réglages");
  });

  it("se replie sur le français quand la langue n'a pas la traduction", async () => {
    const instance = creerI18n("en");
    enregistrerTextesFeuilles(instance);
    expect(instance.getFixedT("en", ESPACE_FEUILLES)("reglages.titre")).toBe("Réglages");
  });
});
