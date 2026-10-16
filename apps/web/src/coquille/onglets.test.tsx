import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import fr from "@/i18n/fr.json";
import { rendreApp } from "@/test/rendre";
import { BARRES } from "./onglets";
import { urlPlanche } from "./planches";
import type { Espace } from "./roles";

interface OngletMaquette {
  libelle: string;
  courant: boolean;
  svg: string;
}

/** Relève la barre `<nav>` d'une planche : aria-label, et pour chaque onglet son libellé, son état et son dessin. */
function barreDeLaMaquette(planche: string): { aria: string; onglets: OngletMaquette[] } {
  const html = readFileSync(
    resolve(process.cwd(), `../../docs/maquettes-v3/${planche}.dc.html`),
    "utf8",
  );
  const nav = html.match(/<nav aria-label="([^"]*)"[^>]*>(.*?)<\/nav>/s);
  if (!nav) throw new Error(`Pas de barre d'onglets dans ${planche}`);
  const onglets = [...nav[2]!.matchAll(/<a [^>]*?(aria-current="page")?[^>]*>(.*?)<\/a>/gs)].map(
    (lien) => {
      const interieur = lien[2]!;
      const svg = interieur.match(/<svg[^>]*>(.*?)<\/svg>/s)![1]!;
      return {
        libelle: interieur.replace(/<svg.*?<\/svg>/s, "").trim(),
        courant: lien[0].includes("aria-current"),
        svg: svg.replace(/\s+/g, " ").trim(),
      };
    },
  );
  return { aria: nav[1]!, onglets };
}

const barres: Array<{
  espace: Espace;
  planche: string;
  url: string;
  libelles: string[];
  ariaCourant: string;
}> = [
  {
    espace: "voyageur",
    planche: "Main",
    url: "/voyager",
    libelles: ["Voyager", "Colis", "Covoit", "Moi"],
    ariaCourant: "Voyager",
  },
  {
    espace: "guichet",
    planche: "Guichet",
    url: "/guichet/accueil",
    libelles: ["Guichet", "Vendre", "Colis", "Quai", "Caisse"],
    ariaCourant: "Guichet",
  },
  {
    espace: "superviseur",
    planche: "Superviseur",
    url: "/gare",
    libelles: ["Gare", "Caisses", "Quais", "Patron"],
    ariaCourant: "Gare",
  },
  {
    espace: "patron",
    planche: "Patron",
    url: "/aujourdhui",
    libelles: ["Aujourd'hui", "Analyses", "Gares", "Réglages"],
    ariaCourant: "Aujourd'hui",
  },
];

describe.each(barres)("barre d'onglets $espace", (barre) => {
  const maquette = barreDeLaMaquette(barre.planche);

  it("a les libellés, l'ordre et le nom de la maquette", async () => {
    expect(maquette.onglets.map((o) => o.libelle)).toEqual(barre.libelles);
    rendreApp({ url: barre.url });
    const nav = await screen.findByRole("navigation", { name: maquette.aria });
    const liens = within(nav).getAllByRole("link");
    expect(liens.map((lien) => lien.textContent)).toEqual(barre.libelles);
    expect(fr.navigation[barre.espace as "voyageur"].aria).toBe(maquette.aria);
  });

  it("éclaire le même onglet que la maquette", async () => {
    rendreApp({ url: barre.url });
    const nav = await screen.findByRole("navigation", { name: maquette.aria });
    const courants = within(nav)
      .getAllByRole("link")
      .filter((lien) => lien.getAttribute("aria-current") === "page");
    expect(courants).toHaveLength(1);
    expect(courants[0]?.textContent).toBe(barre.ariaCourant);
    expect(maquette.onglets.filter((o) => o.courant).map((o) => o.libelle)).toEqual([
      barre.ariaCourant,
    ]);
  });

  it("reprend les icônes de la maquette, trait pour trait", async () => {
    rendreApp({ url: barre.url });
    const nav = await screen.findByRole("navigation", { name: maquette.aria });
    const dessins = within(nav)
      .getAllByRole("link")
      .map((lien) => lien.querySelector("svg")!.innerHTML.replace(/\s+/g, " ").trim());
    const attendus = maquette.onglets.map((o) =>
      // La maquette écrit `<path ...></path>`, le DOM relu aussi ; seul l'espacement peut différer.
      o.svg.replace(/> </g, "><"),
    );
    expect(dessins.map((d) => d.replace(/> </g, "><"))).toEqual(attendus);
  });

  it("mène chaque onglet à une route qui existe", () => {
    const table = BARRES[barre.espace];
    expect(table?.onglets.length).toBe(barre.libelles.length);
    for (const onglet of table?.onglets ?? []) {
      expect(urlPlanche(onglet.planche)).toMatch(/^\//);
    }
  });
});

describe("barre d'onglets : où elle s'affiche", () => {
  it("n'est pas sur les écrans qui n'en ont pas dans les maquettes (vente, paiement, quai)", async () => {
    rendreApp({ url: "/depart/dep-0800" });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("éclaire Colis sur le suivi d'un colis, Covoit sur le covoiturage, Moi sur Moi", async () => {
    const { routeur } = rendreApp({ url: "/colis/COL-0001" });
    let nav = await screen.findByRole("navigation", { name: "Navigation" });
    expect(within(nav).getByRole("link", { name: "Colis" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await routeur.navigate("/covoit/ville");
    nav = await screen.findByRole("navigation", { name: "Navigation" });
    expect(within(nav).getByRole("link", { name: "Covoit" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await routeur.navigate("/moi");
    nav = await screen.findByRole("navigation", { name: "Navigation" });
    expect(within(nav).getByRole("link", { name: "Moi" })).toHaveAttribute("aria-current", "page");
  });
});
