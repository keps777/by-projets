import "./configuration-tests";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BandeauAssistant } from "./BandeauAssistant";

describe("BandeauAssistant", () => {
  it("forme lien : un lien avec titre et détail", () => {
    render(
      <BandeauAssistant
        titre="L'assistant a 2 choses à te dire"
        detail="Le 09:30 Oméga te prend 40 clients"
        href="#assistant"
      />,
    );
    const lien = screen.getByRole("link", { name: /L'assistant a 2 choses à te dire/ });
    expect(lien).toHaveAttribute("href", "#assistant");
    expect(lien).toHaveTextContent("Le 09:30 Oméga te prend 40 clients");
  });

  it("forme lien sans href : un bouton", async () => {
    const onClick = vi.fn();
    render(<BandeauAssistant titre="Voir" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: /Voir/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forme bloc : étiquette par défaut et texte libre", () => {
    render(
      <BandeauAssistant forme="bloc">
        Deux pannes en 10 jours. <strong>Je mettrais LT 207 au garage lundi.</strong>
      </BandeauAssistant>,
    );
    expect(screen.getByText("L'assistant")).toBeInTheDocument();
    expect(screen.getByText("Je mettrais LT 207 au garage lundi.").tagName).toBe("STRONG");
  });

  it("forme bloc : étiquette personnalisée", () => {
    render(
      <BandeauAssistant forme="bloc" etiquette="Rapport du soir">
        Part à 21:00.
      </BandeauAssistant>,
    );
    expect(screen.getByText("Rapport du soir")).toBeInTheDocument();
  });
});
