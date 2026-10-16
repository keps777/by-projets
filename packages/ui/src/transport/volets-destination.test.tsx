import "./soutien-tests";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoletsDestination } from "./volets-destination";

function simulerReductionAnimations(reduit: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((requete: string) => ({
      matches: reduit && requete.includes("prefers-reduced-motion"),
      media: requete,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VoletsDestination", () => {
  it("affiche une lame par lettre et se nomme par le libellé", () => {
    render(<VoletsDestination code="DLA" libelle="Douala" />);
    const volets = screen.getByRole("img", { name: "Douala" });
    expect(volets).toHaveTextContent("DLA");
    expect(volets.children).toHaveLength(3);
  });

  it("se nomme par le code sans libellé", () => {
    render(<VoletsDestination code="yde" />);
    expect(screen.getByRole("img", { name: "yde" })).toHaveTextContent("YDE");
  });

  it("anime les lames quand le code change", () => {
    const { rerender } = render(<VoletsDestination code="DLA" libelle="Ville" />);
    const volets = screen.getByRole("img", { name: "Ville" });
    expect(volets).toHaveAttribute("data-animation", "active");
    // Premier affichage : les lames sont posées sans animation.
    expect(volets.querySelectorAll("[class*='lameAnimee']")).toHaveLength(0);

    rerender(<VoletsDestination code="DYE" libelle="Ville" />);
    // La première lettre ne change pas ; les deux autres rejouent leur bascule.
    expect(volets.querySelectorAll("[class*='lameAnimee']")).toHaveLength(2);
    expect(volets).toHaveTextContent("DYE");
  });

  it("coupe l'animation quand le système demande de réduire les animations", () => {
    simulerReductionAnimations(true);
    const { rerender } = render(<VoletsDestination code="DLA" libelle="Ville" />);
    rerender(<VoletsDestination code="YDE" libelle="Ville" />);
    const volets = screen.getByRole("img", { name: "Ville" });
    expect(volets).toHaveAttribute("data-animation", "coupee");
    expect(volets.querySelectorAll("[class*='lameAnimee']")).toHaveLength(0);
    expect(volets).toHaveTextContent("YDE");
  });

  it("garde l'animation quand le système ne demande rien", () => {
    simulerReductionAnimations(false);
    render(<VoletsDestination code="DLA" libelle="Ville" />);
    expect(screen.getByRole("img", { name: "Ville" })).toHaveAttribute("data-animation", "active");
  });

  it("peut être coupée par la propriété anime", () => {
    render(<VoletsDestination code="DLA" libelle="Ville" anime={false} />);
    expect(screen.getByRole("img", { name: "Ville" })).toHaveAttribute("data-animation", "coupee");
  });
});
