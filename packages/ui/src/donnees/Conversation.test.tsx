import "./configuration-tests";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BulleWhatsApp, ConversationWhatsApp } from "./BulleWhatsApp";
import { EcranUssd } from "./EcranUssd";

describe("BulleWhatsApp", () => {
  it("place le message reçu à gauche et le message envoyé à droite", () => {
    render(
      <>
        <BulleWhatsApp sens="recu">3 départs demain</BulleWhatsApp>
        <BulleWhatsApp sens="envoye" auteur="Aïcha">
          2
        </BulleWhatsApp>
      </>,
    );
    const recu = screen.getByRole("group", { name: "Message de AfriMove" });
    const envoye = screen.getByRole("group", { name: "Message de Aïcha" });
    expect(recu).toHaveAttribute("data-sens", "recu");
    expect(envoye).toHaveAttribute("data-sens", "envoye");
    expect(recu.parentElement).toHaveAttribute("data-sens", "recu");
  });

  it("nomme « Vous » l'auteur d'un message envoyé sans auteur", () => {
    render(<BulleWhatsApp sens="envoye">Pourquoi le 09:30 Oméga part si vide ?</BulleWhatsApp>);
    expect(screen.getByRole("group", { name: "Message de Vous" })).toBeInTheDocument();
  });

  it("gère la taille, la carte et la mention", () => {
    render(
      <BulleWhatsApp sens="recu" taille="compacte" carte mention="21:00 · signé Essono">
        Rapport
      </BulleWhatsApp>,
    );
    const bulle = screen.getByRole("group");
    expect(bulle).toHaveAttribute("data-taille", "compacte");
    expect(bulle).toHaveAttribute("data-carte", "oui");
    expect(screen.getByText("21:00 · signé Essono")).toBeInTheDocument();
  });
});

describe("ConversationWhatsApp", () => {
  it("regroupe les bulles dans un journal nommé", () => {
    render(
      <ConversationWhatsApp ariaLabel="Achat d'un billet">
        <BulleWhatsApp sens="envoye">Billet Douala Yaoundé</BulleWhatsApp>
        <BulleWhatsApp sens="recu">3 départs demain</BulleWhatsApp>
      </ConversationWhatsApp>,
    );
    const journal = screen.getByRole("log", { name: "Achat d'un billet" });
    expect(within(journal).getAllByRole("group")).toHaveLength(2);
  });
});

describe("EcranUssd", () => {
  const texte = "AfriMove\n1 Billet\n2 Mon billet";

  it("expose l'écran avec son texte comme alternative", () => {
    render(<EcranUssd texte={texte} />);
    const ecran = screen.getByRole("img", { name: /Écran USSD simulé/ });
    expect(ecran.getAttribute("aria-label")).toContain("1 Billet");
  });

  it("garde les sauts de ligne dans le texte affiché", () => {
    const { container } = render(<EcranUssd texte={texte} />);
    expect(container.textContent).toContain("AfriMove\n1 Billet\n2 Mon billet");
  });

  it("affiche les 9 touches du clavier, ou aucune", () => {
    const { container, rerender } = render(<EcranUssd texte={texte} />);
    const touches = container.querySelectorAll("[aria-hidden='true'] > span");
    expect(Array.from(touches).map((t) => t.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "*",
      "0",
      "#",
    ]);
    rerender(<EcranUssd texte={texte} clavier={false} />);
    expect(container.querySelectorAll("[aria-hidden='true'] > span")).toHaveLength(0);
  });

  it("accepte un libellé et une variante large", () => {
    render(<EcranUssd texte="x" ariaLabel="Écran du client" variante="large" />);
    const ecran = screen.getByRole("img", { name: "Écran du client : x" });
    expect(ecran.parentElement).toHaveAttribute("data-variante", "large");
  });
});
