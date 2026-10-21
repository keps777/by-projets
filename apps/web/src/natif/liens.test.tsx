import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBrowserRouter, RouterProvider, useParams } from "react-router";
import { cheminInterne, hotesDeLiens, naviguerVers, SCHEMA_APPLICATION } from "./liens";

const HOTES = ["afrimove.exemple.org"];

describe("hotesDeLiens", () => {
  it("lit une liste séparée par des virgules, en minuscules, sans blancs ni éléments vides", () => {
    expect(hotesDeLiens(" AfriMove.exemple.org, www.afrimove.exemple.org ,,")).toEqual([
      "afrimove.exemple.org",
      "www.afrimove.exemple.org",
    ]);
    expect(hotesDeLiens(undefined)).toEqual([]);
    expect(hotesDeLiens("")).toEqual([]);
  });
});

describe("cheminInterne", () => {
  it("garde le chemin, la requête et l'ancre d'un lien web de l'hôte de l'application", () => {
    expect(cheminInterne("https://afrimove.exemple.org/depart/12?place=3#haut", HOTES)).toBe(
      "/depart/12?place=3#haut",
    );
    expect(cheminInterne("https://AFRIMOVE.exemple.org", HOTES)).toBe("/");
  });

  it("refuse un hôte inconnu, un faux hôte et un autre schéma", () => {
    expect(cheminInterne("https://autre.exemple.org/depart/12", HOTES)).toBeNull();
    expect(cheminInterne("https://afrimove.exemple.org.pirate.net/x", HOTES)).toBeNull();
    expect(cheminInterne("https://pirate.net/@afrimove.exemple.org", HOTES)).toBeNull();
    expect(cheminInterne("http://afrimove.exemple.org/depart/12", HOTES)).toBeNull();
    expect(cheminInterne("javascript:alert(1)", HOTES)).toBeNull();
    expect(cheminInterne("intent://depart/12#Intent;scheme=https;end", HOTES)).toBeNull();
    expect(cheminInterne("file:///etc/passwd", HOTES)).toBeNull();
  });

  it("sans hôte déclaré, aucun lien web n'est suivi", () => {
    expect(cheminInterne("https://afrimove.exemple.org/depart/12", [])).toBeNull();
  });

  it("refuse ce qui n'est pas une adresse", () => {
    expect(cheminInterne("", HOTES)).toBeNull();
    expect(cheminInterne("/depart/12", HOTES)).toBeNull();
    expect(cheminInterne("pas une adresse", HOTES)).toBeNull();
  });

  it("lit le schéma propre, avec ou sans hôte", () => {
    expect(cheminInterne(`${SCHEMA_APPLICATION}://depart/12?x=1`, [])).toBe("/depart/12?x=1");
    expect(cheminInterne(`${SCHEMA_APPLICATION}:///depart/12`, [])).toBe("/depart/12");
    expect(cheminInterne(`${SCHEMA_APPLICATION}://voyager`, [])).toBe("/voyager");
    expect(cheminInterne(`${SCHEMA_APPLICATION}://`, [])).toBe("/");
  });

  it("ne produit jamais un chemin qui sorte de l'application (redirection ouverte)", () => {
    for (const lien of [
      `${SCHEMA_APPLICATION}:////pirate.net/voler`,
      `${SCHEMA_APPLICATION}://pirate.net`,
      "https://afrimove.exemple.org//pirate.net/voler",
      "https://afrimove.exemple.org/%5Cpirate.net",
      "https://afrimove.exemple.org/a%0Ab",
    ]) {
      const chemin = cheminInterne(lien, HOTES);
      if (chemin === null) continue;
      expect(chemin.startsWith("/")).toBe(true);
      expect(chemin.startsWith("//")).toBe(false);
      expect(chemin).not.toMatch(/[\\\u0000-\u001f]/);
      // Résolu contre l'origine de l'application, il reste dans l'application.
      expect(new URL(chemin, "https://localhost").origin).toBe("https://localhost");
    }
  });
});

function Depart() {
  const { id } = useParams();
  return <p>Départ {id}</p>;
}

describe("naviguerVers (React Router réel)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/voyager");
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("affiche la page du lien sans recharger, et le retour revient à la page précédente", async () => {
    const routeur = createBrowserRouter([
      { path: "/voyager", element: <p>Accueil voyageur</p> },
      { path: "/depart/:id", element: <Depart /> },
    ]);
    render(<RouterProvider router={routeur} />);
    expect(await screen.findByText("Accueil voyageur")).toBeInTheDocument();

    act(() => naviguerVers("/depart/12?place=3"));
    expect(await screen.findByText("Départ 12")).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe("/depart/12?place=3");

    act(() => window.history.back());
    expect(await screen.findByText("Accueil voyageur")).toBeInTheDocument();
    routeur.dispose();
  });

  it("n'empile rien quand on est déjà sur la page", () => {
    const avant = window.history.length;
    naviguerVers("/voyager");
    expect(window.history.length).toBe(avant);
  });
});
