import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { creerI18n } from "@/i18n";
import { FeuilleClientConnu, jourCourt } from "./FeuilleClientConnu";
import { CLE_CLIENTS_CONNUS, type ClientConnu } from "./clients-connus";

const PAUL: ClientConnu = {
  nom: "Tchoumi Paul",
  telephone: "+237677301145",
  pieceQuatreDerniers: "8820",
  dernierBilletA: "2027-01-05T07:38:00+01:00",
};
const AICHA: ClientConnu = {
  nom: "Aïcha Ngo",
  telephone: "+237691221008",
  pieceQuatreDerniers: null,
  dernierBilletA: "2027-01-03T10:00:00+01:00",
};
const MARIE: ClientConnu = {
  nom: "Marie Essono",
  telephone: null,
  pieceQuatreDerniers: null,
  dernierBilletA: "2026-12-30T23:30:00+01:00",
};

function rendre(
  options: { clients?: readonly ClientConnu[]; ouverte?: boolean; langue?: "fr" | "en" } = {},
) {
  const onFermer = vi.fn();
  const onChoisir = vi.fn();
  render(
    <I18nextProvider i18n={creerI18n(options.langue ?? "fr")}>
      <FeuilleClientConnu
        ouverte={options.ouverte ?? true}
        onFermer={onFermer}
        onChoisir={onChoisir}
        ancrage="ecran"
        {...(options.clients ? { clients: options.clients } : {})}
      />
    </I18nextProvider>,
  );
  return { onFermer, onChoisir };
}

describe("Feuille « Client connu »", () => {
  it("est une fenêtre nommée « Client connu » avec sa consigne, et rien quand elle est fermée", () => {
    const { onFermer } = rendre({ clients: [PAUL], ouverte: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onFermer).not.toHaveBeenCalled();
  });

  it("montre chaque client avec son numéro, sa pièce et son dernier billet", () => {
    rendre({ clients: [PAUL, AICHA, MARIE] });
    const dialogue = screen.getByRole("dialog", { name: "Client connu" });
    expect(within(dialogue).getByText("Un nom, un numéro : le billet se remplit")).toBeVisible();

    const liste = within(dialogue).getByRole("list", { name: "Clients connus" });
    const lignes = within(liste).getAllByRole("button");
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toHaveTextContent("TP");
    expect(lignes[0]).toHaveTextContent("Tchoumi Paul");
    expect(lignes[0]).toHaveTextContent("6 77 30 11 45 · pièce 8820");
    expect(lignes[0]).toHaveTextContent("dernier billet le 5 janv.");
    expect(lignes[1]).toHaveTextContent("6 91 22 10 08");
    expect(lignes[1]).not.toHaveTextContent("pièce");
    expect(lignes[2]).toHaveTextContent("pas de numéro");
  });

  it("filtre à la frappe par le nom (sans accents) et par le numéro", async () => {
    rendre({ clients: [PAUL, AICHA, MARIE] });
    const recherche = screen.getByRole("searchbox", { name: "Chercher un nom ou un numéro" });

    await userEvent.type(recherche, "aicha");
    expect(screen.getAllByRole("button", { name: /Ngo|Tchoumi|Essono/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Aïcha Ngo/ })).toBeInTheDocument();

    await userEvent.clear(recherche);
    await userEvent.type(recherche, "677 30");
    expect(screen.getByRole("button", { name: /Tchoumi Paul/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aïcha Ngo/ })).not.toBeInTheDocument();
  });

  it("dit qu'aucun client ne correspond, puis remet la liste en effaçant la recherche", async () => {
    rendre({ clients: [PAUL, AICHA] });
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByRole("status")).toHaveTextContent("Aucun client ne correspond.");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("rend le client touché et ne ferme pas la feuille elle-même (c'est l'écran qui décide)", async () => {
    const { onChoisir, onFermer } = rendre({ clients: [PAUL, AICHA] });
    await userEvent.click(screen.getByRole("button", { name: /Aïcha Ngo/ }));
    expect(onChoisir).toHaveBeenCalledTimes(1);
    expect(onChoisir).toHaveBeenCalledWith(AICHA);
    expect(onFermer).not.toHaveBeenCalled();
  });

  it("lit le carnet de l'appareil quand aucun client n'est donné", () => {
    localStorage.setItem(CLE_CLIENTS_CONNUS, JSON.stringify([MARIE]));
    rendre();
    expect(screen.getByRole("button", { name: /Marie Essono/ })).toBeInTheDocument();
  });

  it("explique le carnet vide, sans champ de recherche", () => {
    rendre();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aucun client connu sur ce guichet pour l'instant. Chaque billet vendu l'ajoute ici.",
    );
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("se ferme avec le bouton, Échap et le voile", async () => {
    const { onFermer } = rendre({ clients: [PAUL] });
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByTestId("voile"));
    expect(onFermer).toHaveBeenCalledTimes(3);
  });

  it("écrit le jour d'après l'heure de Douala, pas celle de Greenwich", () => {
    // 23 h 30 UTC est déjà 0 h 30 le lendemain à Douala (UTC+1).
    expect(jourCourt("2026-12-30T23:30:00+01:00", "fr")).toBe("30 déc.");
    expect(jourCourt("2026-12-30T23:30:00Z", "fr")).toBe("31 déc.");
    expect(jourCourt("pas une date", "fr")).toBe("pas une date");
  });
});
