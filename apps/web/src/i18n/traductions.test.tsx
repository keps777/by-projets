import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { rendreApp } from "@/test/rendre";
import enGlobal from "./en.json";
import frGlobal from "./fr.json";
import pcmGlobal from "./pcm.json";
import { creerI18n } from "./index";

type Arbre = Record<string, unknown>;

/** Textes d'un espace de noms dans les trois langues (le français est la référence). */
interface Jeu {
  nom: string;
  fr: Arbre;
  en: Arbre;
  pcm: Arbre;
}

const lots = import.meta.glob<Arbre>(["../ecrans/*/i18n.*.json", "../feuilles/i18n.*.json"], {
  eager: true,
  import: "default",
});

function jeux(): Jeu[] {
  const parNom = new Map<string, Partial<Jeu>>();
  for (const [chemin, contenu] of Object.entries(lots)) {
    const m = chemin.match(/^\.\.\/(?:ecrans\/([^/]+)|(feuilles))\/i18n\.(fr|en|pcm)\.json$/);
    if (!m) continue;
    const nom = m[1] ?? m[2] ?? "";
    const langue = m[3] as "fr" | "en" | "pcm";
    parNom.set(nom, { ...parNom.get(nom), nom, [langue]: contenu });
  }
  const tous = [...parNom.values()] as Jeu[];
  tous.push({ nom: "global", fr: frGlobal, en: enGlobal, pcm: pcmGlobal });
  return tous.sort((a, b) => a.nom.localeCompare(b.nom));
}

function aplatir(arbre: Arbre, prefixe = ""): [string, string][] {
  return Object.entries(arbre).flatMap(([cle, valeur]) =>
    typeof valeur === "object" && valeur !== null
      ? aplatir(valeur as Arbre, `${prefixe}${cle}.`)
      : [[`${prefixe}${cle}`, String(valeur)] as [string, string]],
  );
}

/** Variables `{{...}}` et balises `<fort>` d'un texte : elles doivent survivre à la traduction. */
function marques(texte: string): string[] {
  return (texte.match(/\{\{[^}]+\}\}|<\/?[a-z]+>/g) ?? []).sort();
}

afterEach(cleanup);

describe("traductions · anglais et pidgin", () => {
  const tous = jeux();

  it("couvre les 75 écrans, les feuilles et les textes globaux", () => {
    expect(tous.length).toBeGreaterThanOrEqual(77);
    for (const jeu of tous) {
      expect(jeu.fr, jeu.nom).toBeDefined();
      expect(jeu.en, jeu.nom).toBeDefined();
      expect(jeu.pcm, jeu.nom).toBeDefined();
    }
  });

  it("n'a aucune clé manquante ni vide en anglais et en pidgin", () => {
    const vides: string[] = [];
    for (const jeu of tous) {
      const cles = aplatir(jeu.fr).map(([cle]) => cle);
      for (const langue of ["en", "pcm"] as const) {
        const traduit = new Map(aplatir(jeu[langue]));
        expect([...traduit.keys()], `${jeu.nom} · ${langue}`).toEqual(cles);
        for (const [cle, texte] of traduit) {
          if (texte.trim() === "") vides.push(`${jeu.nom} · ${langue} · ${cle}`);
        }
      }
    }
    expect(vides).toEqual([]);
  });

  it("garde les variables, les balises et les pluriels du français", () => {
    const ecarts: string[] = [];
    for (const jeu of tous) {
      const traduit = {
        en: new Map(aplatir(jeu.en)),
        pcm: new Map(aplatir(jeu.pcm)),
      };
      for (const [cle, texte] of aplatir(jeu.fr)) {
        for (const langue of ["en", "pcm"] as const) {
          const autre = traduit[langue].get(cle) ?? "";
          if (marques(autre).join("|") !== marques(texte).join("|")) {
            ecarts.push(`${jeu.nom} · ${langue} · ${cle}`);
          }
        }
      }
    }
    expect(ecarts).toEqual([]);
  });

  it("ne laisse aucune lettre accentuée française hors des noms propres", () => {
    // Noms propres qui gardent leur accent, quelle que soit la langue.
    const noms = /Yaoundé|Montréal|Bêta|Oméga|Français/g;
    const restes: string[] = [];
    for (const jeu of tous) {
      for (const langue of ["en", "pcm"] as const) {
        for (const [cle, texte] of aplatir(jeu[langue])) {
          if (/[àâçèéêëîïôùûœ]/i.test(texte.replace(noms, ""))) {
            restes.push(`${jeu.nom} · ${langue} · ${cle} : ${texte}`);
          }
        }
      }
    }
    expect(restes).toEqual([]);
  });

  it("accorde les pluriels en anglais et en pidgin", () => {
    const en = creerI18n("en");
    expect(en.t("Connexion:erreurs.codeFaux", { count: 1 })).toBe(
      "That code is not right. You have 1 try left.",
    );
    expect(en.t("Connexion:erreurs.codeFaux", { count: 2 })).toBe(
      "That code is not right. You have 2 tries left.",
    );
    const pcm = creerI18n("pcm");
    expect(pcm.t("Connexion:erreurs.codeFaux", { count: 1 })).toBe(
      "Dis code no correct. You get 1 try remain.",
    );
    expect(pcm.t("Connexion:erreurs.codeFaux", { count: 3 })).toBe(
      "Dis code no correct. You get 3 try dem remain.",
    );
  });
});

describe("traductions · rendu d'un écran", () => {
  it("affiche l'écran Connexion en anglais", async () => {
    rendreApp({ url: "/connexion", langue: "en" });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(/No password\. A code arrives by SMS/)).toBeInTheDocument();
    expect(screen.getByText("Phone number")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText(/Pas de mot de passe/)).not.toBeInTheDocument();
  });

  it("affiche l'écran Connexion en pidgin", async () => {
    rendreApp({ url: "/connexion", langue: "pcm" });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(/No password\. One code go reach you by SMS/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText(/Pas de mot de passe/)).not.toBeInTheDocument();
  });
});
