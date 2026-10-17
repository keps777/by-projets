import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CLES, ecrire, lire } from "@/coquille/stockage";
import { rendreApp } from "@/test/rendre";
import { CLE_TUTORIEL_VU, tutorielVu } from "./vu";

/** Monte l'application sur /tutoriel et attend que la page (chargée à la demande) soit arrivée. */
async function rendre(options: Parameters<typeof rendreApp>[0] = {}) {
  const rendu = rendreApp({ url: "/tutoriel", langue: "fr", ...options });
  const region = await screen.findByRole("region", {
    name: /^(Tutoriel en 3 écrans|Tutorial in 3 screens|Tutorial for 3 screen)$/,
  });
  return { ...rendu, region };
}

/** Les trois écrans, qu'ils soient visibles ou non (ceux qui ne sont pas à l'écran sont masqués aux lecteurs d'écran). */
function diapos(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[aria-roledescription="diapositive"]'));
}

function diapoActive(): HTMLElement {
  return screen.getByRole("region", { name: /^Écran \d sur 3$/ });
}

/** Les points de position du pied : 3 pastilles, une seule active. */
function points(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-actif]")).filter(
    (el) => el.tagName === "SPAN" && el.children.length === 0 && el.closest("main") === null,
  );
}

/** jsdom ne fait pas de mise en page : on fixe la largeur de la piste et on simule un balayage jusqu'à `rang`. */
function balayer(region: HTMLElement, rang: number) {
  Object.defineProperty(region, "clientWidth", { configurable: true, value: 390 });
  region.scrollLeft = rang * 390;
  fireEvent.scroll(region);
}

describe("Tutoriel · premier écran", () => {
  it("reprend les textes, le parcours en trois touches et les deux aperçus de la planche", async () => {
    await rendre();
    const actif = diapoActive();
    expect(actif).toHaveTextContent("Tutoriel · 1 / 3 · tout en 3 touches");
    expect(
      within(actif).getByRole("heading", { level: 2, name: "Ton billet, ton nom, ta place." }),
    ).toBeInTheDocument();
    expect(
      within(actif).getByText(
        "Un départ, un siège, un paiement : ton billet arrive par SMS avec un QR code et un code à 4 chiffres. Au quai, on te scanne et tu montes.",
      ),
    ).toBeInTheDocument();
    for (const texte of [
      "08:00",
      "Bêta Express VIP",
      "9 places",
      "choisis ta place",
      "Payer · MoMo",
    ]) {
      expect(within(actif).getByText(texte)).toBeInTheDocument();
    }
    for (const touche of ["1", "2", "3"]) {
      expect(within(actif).getByText(touche)).toBeInTheDocument();
    }
    // Les deux autres écrans en aperçu, avec leur rang.
    expect(within(actif).getByText("2 / 3")).toBeInTheDocument();
    expect(within(actif).getByText("Ton colis suivi jusqu'au bout")).toBeInTheDocument();
    expect(within(actif).getByText("photo, code de retrait, livraison")).toBeInTheDocument();
    expect(within(actif).getByText("3 / 3")).toBeInTheDocument();
    expect(within(actif).getByText("Tes proches savent quand tu arrives")).toBeInTheDocument();
    expect(within(actif).getByText("bus en direct, SMS automatique")).toBeInTheDocument();
  });

  it("a un titre de page pour les lecteurs d'écran, un « Passer » vers l'accueil et un « Suivant »", async () => {
    await rendre();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Tutoriel · 3 écrans · tout en 3 touches",
    );
    expect(screen.getByRole("link", { name: "Passer" })).toHaveAttribute("href", "/voyager");
    expect(screen.getByRole("button", { name: "Suivant" })).toBeInTheDocument();
  });

  it("montre trois écrans et trois points, le premier actif, les autres masqués aux lecteurs d'écran", async () => {
    await rendre();
    expect(diapos()).toHaveLength(3);
    expect(diapos().map((d) => d.getAttribute("aria-hidden"))).toEqual(["false", "true", "true"]);
    expect(points().map((p) => p.dataset["actif"])).toEqual(["true", "false", "false"]);
  });
});

describe("Tutoriel · navigation entre les écrans", () => {
  it("« Suivant » passe d'un écran au suivant, puis ouvre l'accueil voyageur après le troisième", async () => {
    const utilisateur = userEvent.setup();
    const { routeur } = await rendre();

    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
    expect(diapoActive()).toHaveTextContent("Tutoriel · 2 / 3");
    expect(within(diapoActive()).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Ton colis suivi jusqu'au bout",
    );
    expect(points().map((p) => p.dataset["actif"])).toEqual(["false", "true", "false"]);
    expect(routeur.state.location.pathname).toBe("/tutoriel");

    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
    expect(diapoActive()).toHaveTextContent("Tutoriel · 3 / 3");
    expect(within(diapoActive()).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Tes proches savent quand tu arrives",
    );
    expect(points().map((p) => p.dataset["actif"])).toEqual(["false", "false", "true"]);
    expect(routeur.state.location.pathname).toBe("/tutoriel");

    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
  });

  it("le balayage horizontal change d'écran (position de la piste)", async () => {
    const { region } = await rendre();
    act(() => balayer(region, 1));
    expect(diapoActive()).toHaveTextContent("Tutoriel · 2 / 3");
    act(() => balayer(region, 2));
    expect(diapoActive()).toHaveTextContent("Tutoriel · 3 / 3");
    expect(points().map((p) => p.dataset["actif"])).toEqual(["false", "false", "true"]);
    act(() => balayer(region, 0));
    expect(diapoActive()).toHaveTextContent("Tutoriel · 1 / 3");
  });

  it("après un balayage, « Suivant » continue depuis l'écran où l'on est arrivé", async () => {
    const utilisateur = userEvent.setup();
    const { region, routeur } = await rendre();
    act(() => balayer(region, 2));
    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
  });

  it("« Suivant » fait défiler la piste jusqu'à l'écran suivant", async () => {
    const utilisateur = userEvent.setup();
    const { region } = await rendre();
    Object.defineProperty(region, "clientWidth", { configurable: true, value: 390 });
    const defilements: ScrollToOptions[] = [];
    region.scrollTo = ((options: ScrollToOptions) => {
      defilements.push(options);
    }) as typeof region.scrollTo;

    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
    expect(defilements.map((d) => d.left)).toEqual([390, 780]);
  });
});

describe("Tutoriel · « Passer » et affichage unique", () => {
  it("« Passer » mène à l'accueil voyageur et mémorise que le tutoriel est vu", async () => {
    const utilisateur = userEvent.setup();
    const { routeur } = await rendre();
    expect(tutorielVu()).toBe(false);
    await utilisateur.click(screen.getByRole("link", { name: "Passer" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
    expect(lire(CLE_TUTORIEL_VU)).toBe("1");
  });

  it("le dernier « Suivant » mémorise aussi que le tutoriel est vu ; un « Suivant » intermédiaire non", async () => {
    const utilisateur = userEvent.setup();
    await rendre();
    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
    expect(tutorielVu()).toBe(false);
    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
    await utilisateur.click(screen.getByRole("button", { name: "Suivant" }));
    expect(tutorielVu()).toBe(true);
  });

  it("une fois vu, le tutoriel n'est plus montré : on arrive directement à l'accueil voyageur", async () => {
    ecrire(CLE_TUTORIEL_VU, "1");
    const { routeur } = rendreApp({ url: "/tutoriel", langue: "fr", demo: false });
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/voyager"));
    expect(screen.queryByRole("region", { name: "Tutoriel en 3 écrans" })).not.toBeInTheDocument();
  });

  it("jamais vu, hors démo : le tutoriel est montré, et il n'est pas marqué vu par sa seule ouverture", async () => {
    const { routeur } = await rendre({ demo: false });
    expect(routeur.state.location.pathname).toBe("/tutoriel");
    expect(lire(CLE_TUTORIEL_VU)).toBeNull();
  });

  it("en mode démo (développement, banc de fidélité) le tutoriel reste accessible même s'il a été vu", async () => {
    ecrire(CLE_TUTORIEL_VU, "1");
    const { routeur } = await rendre({ demo: true });
    expect(routeur.state.location.pathname).toBe("/tutoriel");
  });

  it("la clé de mémoire est propre au tutoriel : la session et la langue n'y touchent pas", () => {
    expect(CLE_TUTORIEL_VU).not.toBe(CLES.session);
    expect(CLE_TUTORIEL_VU).not.toBe(CLES.langue);
  });
});

describe("Tutoriel · textes", () => {
  it("s'affiche en anglais, sans clé brute", async () => {
    await rendre({ langue: "en" });
    expect(screen.getByRole("link", { name: "Skip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/diapos\.|exemple\./);
  });

  it("s'affiche en pidgin, sans clé brute", async () => {
    await rendre({ langue: "pcm" });
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tutorial for 3 screen" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/diapos\.|exemple\./);
  });
});
