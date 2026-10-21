import "./setup-test";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConceptionProvider } from "./badge-touche";
import { Bouton, BoutonIcone } from "./bouton";
import styles from "./bouton.module.css";
import css from "./bouton.module.css?raw";
import { IconeRetour } from "./icones";

describe("Bouton", () => {
  it("rend le bouton principal orange avec libellé, sous-libellé et prix", () => {
    render(<Bouton libelle="Payer" sousLibelle="confirmation MoMo" prix="7 500 F" />);
    const bouton = screen.getByRole("button", { name: /Payer/ });
    expect(bouton).toHaveClass(styles.principal!);
    expect(bouton).toHaveAttribute("type", "button");
    expect(screen.getByText("confirmation MoMo")).toBeInTheDocument();
    expect(screen.getByText("7 500 F")).toBeInTheDocument();
  });

  it("rend la variante verte de l'assistant", () => {
    render(<Bouton variante="assistant" libelle="Demander à l'assistant" />);
    expect(screen.getByRole("button")).toHaveClass(styles.assistant!);
  });

  it("rend un lien quand href est donné", () => {
    render(<Bouton variante="secondaire" libelle="Appeler le superviseur" href="#sup" />);
    const lien = screen.getByRole("link", { name: "Appeler le superviseur" });
    expect(lien).toHaveAttribute("href", "#sup");
    expect(lien).toHaveClass(styles.secondaire!);
  });

  it("applique le ton ambre au bouton secondaire seulement", () => {
    render(
      <>
        <Bouton variante="secondaire" ton="ambre" libelle="Cadence" />
        <Bouton variante="secondaire" libelle="Neutre" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Cadence" })).toHaveClass(styles.ambre!);
    expect(screen.getByRole("button", { name: "Neutre" })).not.toHaveClass(styles.ambre!);
  });

  it("appelle onClick et respecte disabled", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Bouton libelle="Continuer" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Bouton libelle="Continuer" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("n'affiche « touche n » que si le flag conception est actif", () => {
    const { rerender } = render(<Bouton libelle="Payer" touche={3} sousLibelle="par MoMo" />);
    expect(screen.getByText("par MoMo")).toBeInTheDocument();
    expect(screen.queryByText(/touche 3/)).not.toBeInTheDocument();
    rerender(
      <ConceptionProvider actif>
        <Bouton libelle="Payer" touche={3} sousLibelle="par MoMo" />
      </ConceptionProvider>,
    );
    expect(screen.getByText("touche 3 · par MoMo")).toBeInTheDocument();
  });

  it("a une hauteur minimale d'au moins 44 px dans le CSS", () => {
    const hauteurs = [...css.matchAll(/min-height:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(hauteurs.length).toBeGreaterThan(0);
    expect(Math.min(...hauteurs)).toBeGreaterThanOrEqual(44);
  });
});

describe("BoutonIcone", () => {
  it("expose son aria-label et fait 44 px", () => {
    render(<BoutonIcone aria-label="Inverser le sens" icone={<IconeRetour />} />);
    const bouton = screen.getByRole("button", { name: "Inverser le sens" });
    expect(bouton).toHaveClass(styles.rond!);
    expect(css).toMatch(/\.rond\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
  });

  it("peut être un lien et prend la variante orange", () => {
    render(<BoutonIcone variante="orange" href="#x" aria-label="Aller" icone={<IconeRetour />} />);
    const lien = screen.getByRole("link", { name: "Aller" });
    expect(lien).toHaveClass(styles["rond-orange"]!);
  });

  it("marque l'icône comme décorative", () => {
    const { container } = render(<BoutonIcone aria-label="Retour" icone={<IconeRetour />} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
