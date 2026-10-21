import "./setup-test";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BadgeTouche, ConceptionProvider } from "./badge-touche";
import { Pastille, statutsPastille, type StatutPastille } from "./pastille";
import styles from "./pastille.module.css";

const tous: StatutPastille[] = [
  "direct",
  "horsLigne",
  "bloque",
  "inopine",
  "enCours",
  "active",
  "verifie",
  "aSurveiller",
  "brouillon",
  "modifier",
  "sync",
  "cadence",
];

describe("Pastille", () => {
  it("définit les douze statuts du ticket avec leur libellé de la maquette", () => {
    expect(Object.keys(statutsPastille).sort()).toEqual([...tous].sort());
    const attendus: Record<StatutPastille, string> = {
      direct: "DIRECT",
      horsLigne: "HORS LIGNE",
      bloque: "BLOQUÉ",
      inopine: "INOPINÉ",
      enCours: "EN COURS",
      active: "ACTIVE",
      verifie: "VÉRIFIÉ",
      aSurveiller: "À SURVEILLER",
      brouillon: "BROUILLON",
      modifier: "MODIFIER",
      sync: "SYNC",
      cadence: "CADENCE",
    };
    for (const statut of tous) {
      const { unmount } = render(<Pastille statut={statut} />);
      expect(screen.getByText(attendus[statut])).toBeInTheDocument();
      unmount();
    }
  });

  it("DIRECT a un point vert qui pulse", () => {
    const { container } = render(<Pastille statut="direct" />);
    const point = container.querySelector("[data-pulse]");
    expect(point).toHaveClass("am-pulse", styles["point-vert"]!);
    expect(point).toHaveAttribute("aria-hidden", "true");
  });

  it("respecte la règle des couleurs : direct vert, attente ambre, bloquant rouge", () => {
    expect(statutsPastille.direct.point).toBe("vert");
    expect(statutsPastille.sync.point).toBe("vert");
    expect(statutsPastille.horsLigne.point).toBe("ambre");
    expect(statutsPastille.enCours.ton).toBe("ambre");
    expect(statutsPastille.bloque.ton).toBe("rouge");
    expect(statutsPastille.bloque.point).toBe("rouge");
    expect(statutsPastille.inopine.ton).toBe("rouge");
    expect(statutsPastille.aSurveiller.ton).toBe("rouge");
    expect(statutsPastille.active.ton).toBe("vert");
    expect(statutsPastille.verifie.ton).toBe("vert");
  });

  it("n'ajoute pas de point à ACTIVE ni à VÉRIFIÉ", () => {
    const { container } = render(
      <>
        <Pastille statut="active" />
        <Pastille statut="verifie" />
      </>,
    );
    expect(container.querySelector("[data-pulse]")).toBeNull();
  });

  it("ajoute un détail après le libellé", () => {
    render(<Pastille statut="direct" detail="07:38" />);
    expect(screen.getByText("DIRECT · 07:38")).toBeInTheDocument();
  });

  it("remplace le libellé et peut changer de ton sans changer de statut", () => {
    render(<Pastille statut="enCours" ton="bleu" point={false} libelle="EN COURS" />);
    const pastille = screen.getByText("EN COURS");
    expect(pastille).toHaveAttribute("data-statut", "enCours");
    expect(pastille).toHaveAttribute("data-ton", "bleu");
    expect(pastille).toHaveClass(styles["ton-bleu"]!);
    expect(pastille.querySelector("[data-pulse]")).toBeNull();
  });

  it("CADENCE porte un éclair décoratif", () => {
    const { container } = render(<Pastille statut="cadence" detail="05:14" />);
    expect(screen.getByText("CADENCE · 05:14")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("BadgeTouche", () => {
  it("n'est pas rendu quand le flag conception est inactif", () => {
    const { container } = render(<BadgeTouche n={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("s'affiche quand le flag conception est actif dans le contexte", () => {
    render(
      <ConceptionProvider actif>
        <BadgeTouche n={2} />
        <BadgeTouche n={2} sur={3} />
      </ConceptionProvider>,
    );
    expect(screen.getByText("TOUCHE 2")).toBeInTheDocument();
    expect(screen.getByText("TOUCHE 2 / 3")).toBeInTheDocument();
  });

  it("peut être forcé par la propriété actif", () => {
    const { rerender } = render(<BadgeTouche n={1} actif />);
    expect(screen.getByText("TOUCHE 1")).toBeInTheDocument();
    rerender(
      <ConceptionProvider actif>
        <BadgeTouche n={1} actif={false} />
      </ConceptionProvider>,
    );
    expect(screen.queryByText("TOUCHE 1")).not.toBeInTheDocument();
  });
});
