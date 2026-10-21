import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RouteObject } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rendreApp } from "@/test/rendre";
import { effacerMiseAJour, signalerMiseAJourPrete } from "./mise-a-jour";
import { Cadre } from "./cadre";

const routes: RouteObject[] = [
  {
    path: "/",
    element: (
      <Cadre>
        <a href="/reseau">Le réseau</a>
        <a href="https://exemple.org/aide">Aide</a>
        <a href="#haut">Haut</a>
      </Cadre>
    ),
  },
  { path: "/reseau", element: <p>page réseau</p> },
];

/** Taille de la fenêtre pour un test (jsdom : 1024 x 768 par défaut). */
function fenetre(largeur: number, hauteur: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: largeur });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: hauteur });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

const racineCadre = () => document.querySelector("[data-mode]") as HTMLElement;

describe("cadre : écran plein ou boîtier d'iPhone", () => {
  afterEach(() => {
    fenetre(1024, 768);
    vi.unstubAllGlobals();
  });

  it("téléphone : écran plein, sans cadre", () => {
    fenetre(390, 844);
    rendreApp({ routes });
    expect(racineCadre().dataset["mode"]).toBe("plein");
  });

  it("ordinateur : cadre d'iPhone, mis à l'échelle pour tenir dans la fenêtre", () => {
    fenetre(1440, 900);
    rendreApp({ routes });
    const racine = racineCadre();
    expect(racine.dataset["mode"]).toBe("cadre");
    const echelle = Number(racine.style.getPropertyValue("--echelle"));
    expect(echelle).toBeGreaterThan(0.5);
    expect(echelle).toBeLessThan(1);
  });

  it("bascule en direct à la rotation ou au redimensionnement, sans remonter l'écran", () => {
    fenetre(1440, 900);
    rendreApp({ routes });
    const lien = screen.getByRole("link", { name: "Le réseau" });
    expect(racineCadre().dataset["mode"]).toBe("cadre");
    fenetre(844, 390); // téléphone en paysage : fenêtre courte
    expect(racineCadre().dataset["mode"]).toBe("plein");
    fenetre(390, 844);
    expect(racineCadre().dataset["mode"]).toBe("plein");
    fenetre(1280, 800);
    expect(racineCadre().dataset["mode"]).toBe("cadre");
    // Même élément DOM tout du long : l'état de l'écran (saisies, défilement) survit à la bascule.
    expect(screen.getByRole("link", { name: "Le réseau" })).toBe(lien);
  });

  it("écran plus court que 844 px : les blocs du corps ne se compriment plus (le corps défile)", () => {
    fenetre(360, 740);
    rendreApp({ routes });
    expect(racineCadre().style.getPropertyValue("--am-retrecit")).toBe("0");
    fenetre(390, 844);
    expect(racineCadre().style.getPropertyValue("--am-retrecit")).toBe("1");
    fenetre(1440, 900); // dans le cadre l'écran fait 844 px de haut, quelle que soit la fenêtre
    expect(racineCadre().style.getPropertyValue("--am-retrecit")).toBe("1");
  });

  it("l'habillage du cadre (îlot, barre d'accueil) est décoratif : caché aux lecteurs d'écran", () => {
    fenetre(1440, 900);
    rendreApp({ routes });
    const decor = racineCadre().querySelectorAll("span[aria-hidden='true']");
    expect(decor).toHaveLength(2);
    for (const element of decor) expect(element.textContent).toBe("");
    // Rien de décoratif dans l'arbre d'accessibilité : seuls les vrais contenus sont des liens.
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("le contenu est rangé dans l'écran du cadre (contenant des éléments en position fixe)", () => {
    fenetre(1440, 900);
    rendreApp({ routes });
    const lien = screen.getByRole("link", { name: "Le réseau" });
    expect(racineCadre().contains(lien)).toBe(true);
    // L'écran du cadre est le parent direct du contenu et n'est pas la racine : il porte `contain: paint`.
    expect(lien.parentElement).not.toBe(racineCadre());
  });

  it("le bandeau « nouvelle version » (toast en position fixe) s'affiche dans l'écran du cadre", async () => {
    fenetre(1440, 900);
    rendreApp({ routes });
    act(() => signalerMiseAJourPrete(() => undefined));
    try {
      const bandeau = await screen.findByRole("status");
      const lien = screen.getByRole("link", { name: "Le réseau" });
      // Même parent que le contenu : l'écran du cadre, qui ancre les éléments `position: fixed`.
      expect(bandeau.parentElement).toBe(lien.parentElement);
    } finally {
      act(() => effacerMiseAJour());
    }
  });

  it("le sélecteur de rôle du mode démo reste accessible dans le cadre", () => {
    fenetre(1440, 900);
    rendreApp({ routes });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("les salles fluides (contrôle, développement) restent en plein écran, sans cadre ni sélecteur", () => {
    fenetre(1440, 900);
    rendreApp({
      routes: [
        {
          path: "/",
          element: (
            <Cadre fluide>
              <p>salle</p>
            </Cadre>
          ),
        },
      ],
    });
    expect(racineCadre().dataset["mode"]).toBe("plein");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("au doigt, un appui à côté d'une petite cible est renvoyé à cette cible", () => {
    vi.stubGlobal("matchMedia", (requete: string) => ({
      matches: requete.includes("coarse"),
      media: requete,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    fenetre(390, 844);
    const clics: string[] = [];
    rendreApp({
      routes: [
        {
          path: "/",
          element: (
            <Cadre>
              <button type="button" onClick={() => clics.push("puce")}>
                Tout
              </button>
              <div data-testid="vide">vide</div>
            </Cadre>
          ),
        },
      ],
    });
    const puce = screen.getByRole("button", { name: "Tout" });
    puce.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 100,
        right: 152,
        bottom: 132,
        width: 52,
        height: 32,
        x: 100,
        y: 100,
      }) as DOMRect;
    const vide = screen.getByTestId("vide");
    const appui = (clientY: number, detail = 1) =>
      vide.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          detail,
          clientX: 120,
          clientY,
        }),
      );
    appui(97); // 3 px au-dessus de la puce de 32 px : dans sa zone de 44 px
    expect(clics).toEqual(["puce"]);
    appui(200); // loin de toute cible
    expect(clics).toEqual(["puce"]);
    appui(97, 0); // clic programmatique ou au clavier (detail 0) : jamais détourné
    expect(clics).toEqual(["puce"]);
  });
});

describe("cadre", () => {
  it("traite les liens internes comme des navigations (pas de rechargement, l'état de démarrage survit)", async () => {
    const { routeur } = rendreApp({ routes });
    await userEvent.click(screen.getByRole("link", { name: "Le réseau" }));
    expect(routeur.state.location.pathname).toBe("/reseau");
    expect(await screen.findByText("page réseau")).toBeInTheDocument();
  });

  it("laisse au navigateur les liens externes et les ancres", async () => {
    const { routeur } = rendreApp({ routes });
    const clic = (nom: string) => {
      const lien = screen.getByRole("link", { name: nom });
      let empeche = false;
      lien.addEventListener("click", (evenement) => {
        empeche = evenement.defaultPrevented;
        evenement.preventDefault(); // jsdom ne navigue pas ; on observe seulement
      });
      lien.click();
      return empeche;
    };
    expect(clic("Aide")).toBe(false);
    expect(clic("Haut")).toBe(false);
    expect(routeur.state.location.pathname).toBe("/");
  });

  it("range un écran d'espace dans le cadre de l'application", async () => {
    rendreApp({ url: "/voyager" });
    await screen.findByRole("heading", { level: 1 });
    expect(document.querySelector("[data-espace='voyageur']")).not.toBeNull();
  });
});
