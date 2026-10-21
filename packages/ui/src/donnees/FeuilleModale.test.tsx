import "./configuration-tests";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeuilleModale } from "./FeuilleModale";

function rendre(surFermer = vi.fn(), extra: Partial<Parameters<typeof FeuilleModale>[0]> = {}) {
  return render(
    <FeuilleModale
      ouverte
      onFermer={surFermer}
      titre="Journal des ventes · décembre"
      sousTitre="31 404 lignes"
      badge="XLSX"
      actions={<button type="button">Télécharger</button>}
      {...extra}
    >
      <button type="button">Contenu</button>
    </FeuilleModale>,
  );
}

describe("FeuilleModale", () => {
  it("n'affiche rien quand elle est fermée", () => {
    render(
      <FeuilleModale ouverte={false} onFermer={() => {}} titre="x">
        y
      </FeuilleModale>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("expose une boîte de dialogue nommée par son titre", () => {
    rendre();
    const dialogue = screen.getByRole("dialog", { name: "Journal des ventes · décembre" });
    expect(dialogue).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("31 404 lignes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Télécharger" })).toBeInTheDocument();
  });

  it("place le focus dans la fenêtre à l'ouverture", () => {
    rendre();
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("se ferme avec le bouton, Échap et le voile, mais pas en cliquant dans la fenêtre", async () => {
    const surFermer = vi.fn();
    rendre(surFermer);
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(surFermer).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(surFermer).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByTestId("voile"));
    expect(surFermer).toHaveBeenCalledTimes(3);
    await userEvent.click(screen.getByRole("dialog"));
    expect(surFermer).toHaveBeenCalledTimes(3);
  });

  it("garde le focus dans la fenêtre avec Tab", async () => {
    rendre();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Contenu" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Télécharger" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Télécharger" })).toHaveFocus();
  });

  it("rend le focus à l'élément précédent à la fermeture", () => {
    const bouton = document.createElement("button");
    document.body.append(bouton);
    bouton.focus();
    const { rerender } = render(
      <FeuilleModale ouverte onFermer={() => {}} titre="x">
        y
      </FeuilleModale>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
    rerender(
      <FeuilleModale ouverte={false} onFermer={() => {}} titre="x">
        y
      </FeuilleModale>,
    );
    expect(bouton).toHaveFocus();
    bouton.remove();
  });

  it("choisit la forme selon la variante et accepte un libellé de fermeture", () => {
    const { unmount } = rendre(vi.fn());
    expect(screen.getByTestId("voile")).toHaveAttribute("data-forme", "feuille");
    unmount();
    rendre(vi.fn(), { variante: "large", libelleFermer: "Fermer l'aperçu", ancrage: "parent" });
    const voile = screen.getByTestId("voile");
    expect(voile).toHaveAttribute("data-forme", "centree");
    expect(voile).toHaveAttribute("data-ancrage", "parent");
    expect(screen.getByRole("button", { name: "Fermer l'aperçu" })).toBeInTheDocument();
  });
});
