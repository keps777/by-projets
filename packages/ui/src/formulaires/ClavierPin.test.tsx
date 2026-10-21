import "./testing";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClavierPin } from "./ClavierPin";

const QUINZE_MIN = 15 * 60 * 1000;

async function taper(pin: string) {
  for (const chiffre of pin) {
    fireEvent.click(screen.getByRole("button", { name: chiffre }));
  }
  await act(async () => {});
}

function nbPoints(): number {
  const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
  return Number(label.split(" ")[0]);
}

describe("ClavierPin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("affiche un pavé 3 x 4 : chiffres 0 à 9, effacer, et six points", () => {
    render(<ClavierPin onComplet={() => true} />);
    for (const c of "0123456789") {
      expect(screen.getByRole("button", { name: c })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Effacer" })).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName("0 chiffres saisis sur 6");
  });

  it("compte les chiffres saisis et efface le dernier", () => {
    render(<ClavierPin onComplet={() => true} />);
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByRole("img")).toHaveAccessibleName("3 chiffres saisis sur 6");
    fireEvent.click(screen.getByRole("button", { name: "Effacer" }));
    expect(screen.getByRole("img")).toHaveAccessibleName("2 chiffres saisis sur 6");
  });

  it("renvoie le PIN complet à l'appelant, une seule fois, au dernier chiffre", async () => {
    const onComplet = vi.fn(() => true);
    render(<ClavierPin onComplet={onComplet} />);
    await taper("24681");
    expect(onComplet).not.toHaveBeenCalled();
    await taper("3");
    expect(onComplet).toHaveBeenCalledTimes(1);
    expect(onComplet).toHaveBeenCalledWith("246813");
  });

  it("accepte un PIN de 4 chiffres", async () => {
    const onComplet = vi.fn();
    render(<ClavierPin longueur={4} onComplet={onComplet} />);
    await taper("9021");
    expect(onComplet).toHaveBeenCalledWith("9021");
  });

  it("accepte le clavier physique : chiffres et retour arrière", async () => {
    const onComplet = vi.fn();
    render(<ClavierPin longueur={4} onComplet={onComplet} />);
    const groupe = screen.getByRole("group", { name: "Clavier PIN" });
    fireEvent.keyDown(groupe, { key: "5" });
    fireEvent.keyDown(groupe, { key: "6" });
    fireEvent.keyDown(groupe, { key: "Backspace" });
    expect(nbPoints()).toBe(1);
    for (const k of ["7", "8", "9"]) fireEvent.keyDown(groupe, { key: k });
    await act(async () => {});
    expect(onComplet).toHaveBeenCalledWith("5789");
  });

  describe("ne stocke jamais le PIN en clair", () => {
    it("n'écrit le PIN ni dans le DOM, ni dans un champ, ni dans le stockage du navigateur", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const onComplet = vi.fn(() => new Promise<boolean>(() => {}));
      const { container } = render(<ClavierPin onComplet={onComplet} />);
      const avant = container.textContent;

      await taper("2468");
      expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
      expect(container.innerHTML).not.toContain("2468");
      expect(container.textContent).toBe(avant);

      await taper("13");
      expect(onComplet).toHaveBeenCalledWith("246813");
      expect(container.innerHTML).not.toContain("246813");
      expect(container.textContent).toBe(avant);

      expect(setItem).not.toHaveBeenCalled();
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      expect(document.cookie).toBe("");
      setItem.mockRestore();
    });

    it("vide la saisie dès que le PIN est remis, même si l'appelant l'accepte", async () => {
      const onComplet = vi.fn(() => true);
      render(<ClavierPin longueur={4} onComplet={onComplet} />);
      await taper("1357");
      expect(nbPoints()).toBe(0);
      // Un effacer après coup n'a plus rien à retirer, et la saisie suivante repart de zéro.
      fireEvent.click(screen.getByRole("button", { name: "Effacer" }));
      await taper("0000");
      expect(onComplet).toHaveBeenNthCalledWith(2, "0000");
    });

    it("vide la saisie après un refus et ne rejoue pas l'ancien PIN", async () => {
      const onComplet = vi.fn(() => false);
      render(<ClavierPin longueur={4} onComplet={onComplet} />);
      await taper("1357");
      expect(nbPoints()).toBe(0);
      await taper("2");
      expect(onComplet).toHaveBeenCalledTimes(1);
      expect(nbPoints()).toBe(1);
    });

    it("ignore les chiffres tapés pendant la vérification", async () => {
      let finir: (ok: boolean) => void = () => {};
      const onComplet = vi.fn(() => new Promise<boolean>((r) => (finir = r)));
      render(<ClavierPin longueur={4} onComplet={onComplet} />);
      await taper("1111");
      fireEvent.keyDown(screen.getByRole("group"), { key: "9" });
      expect(screen.getByRole("button", { name: "1" })).toBeDisabled();
      await act(async () => finir(true));
      expect(onComplet).toHaveBeenCalledTimes(1);
      expect(nbPoints()).toBe(0);
    });
  });

  describe("3 essais, puis blocage de 15 minutes", () => {
    it("annonce les essais restants après un PIN refusé", async () => {
      const onEchec = vi.fn();
      render(<ClavierPin longueur={4} onComplet={() => false} onEchec={onEchec} />);
      await taper("1111");
      expect(screen.getByRole("alert")).toHaveTextContent("PIN incorrect. 2 essais restants.");
      await taper("1111");
      expect(screen.getByRole("alert")).toHaveTextContent("PIN incorrect. 1 essai restant.");
      expect(onEchec).toHaveBeenNthCalledWith(1, 2);
      expect(onEchec).toHaveBeenNthCalledWith(2, 1);
    });

    it("bloque au troisième refus, prévient par callback, puis rouvre après 15 min", async () => {
      const onBlocage = vi.fn();
      const onDeblocage = vi.fn();
      const onComplet = vi.fn(() => false);
      render(
        <ClavierPin
          longueur={4}
          onComplet={onComplet}
          onBlocage={onBlocage}
          onDeblocage={onDeblocage}
        />,
      );
      await taper("1111");
      await taper("2222");
      expect(onBlocage).not.toHaveBeenCalled();
      await taper("3333");

      expect(onComplet).toHaveBeenCalledTimes(3);
      expect(onBlocage).toHaveBeenCalledTimes(1);
      expect(onBlocage).toHaveBeenCalledWith({ jusqua: Date.now() + QUINZE_MIN, essais: 3 });
      expect(screen.getByRole("alert")).toHaveTextContent("Clavier bloqué pendant 15 min");
      expect(screen.getByText("15:00")).toBeInTheDocument();
      for (const c of "0123456789") {
        expect(screen.getByRole("button", { name: c })).toBeDisabled();
      }

      // Un chiffre tapé au clavier physique ne passe pas non plus.
      fireEvent.keyDown(screen.getByRole("group"), { key: "4" });
      expect(onComplet).toHaveBeenCalledTimes(3);
      expect(nbPoints()).toBe(0);

      await act(async () => {
        vi.advanceTimersByTime(QUINZE_MIN - 1000);
      });
      expect(onDeblocage).not.toHaveBeenCalled();
      expect(screen.getByText("00:01")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(onDeblocage).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "5" })).toBeEnabled();
    });

    it("repart de trois essais après le déblocage", async () => {
      const onBlocage = vi.fn();
      render(<ClavierPin longueur={4} onComplet={() => false} onBlocage={onBlocage} />);
      for (const pin of ["1111", "2222", "3333"]) await taper(pin);
      await act(async () => {
        vi.advanceTimersByTime(QUINZE_MIN);
      });
      await taper("4444");
      expect(screen.getByRole("alert")).toHaveTextContent("2 essais restants");
      expect(onBlocage).toHaveBeenCalledTimes(1);
    });

    it("remet les essais à trois après un PIN accepté", async () => {
      const reponses = [false, false, true, false];
      const onComplet = vi.fn(() => reponses.shift());
      render(<ClavierPin longueur={4} onComplet={onComplet} />);
      await taper("1111");
      await taper("2222");
      await taper("3333");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await taper("4444");
      expect(screen.getByRole("alert")).toHaveTextContent("2 essais restants");
    });

    it("respecte un nombre d'essais et une durée de blocage personnalisés", async () => {
      const onBlocage = vi.fn();
      render(
        <ClavierPin
          longueur={4}
          essaisMax={1}
          dureeBlocageMs={60_000}
          onComplet={() => false}
          onBlocage={onBlocage}
        />,
      );
      await taper("1111");
      expect(onBlocage).toHaveBeenCalledWith({ jusqua: Date.now() + 60_000, essais: 1 });
      expect(screen.getByRole("alert")).toHaveTextContent("bloqué pendant 1 min");
    });

    it("démarre bloqué quand l'appelant fournit un blocage encore en cours", () => {
      render(<ClavierPin bloqueJusqua={Date.now() + 5 * 60 * 1000} onComplet={() => true} />);
      expect(screen.getByRole("button", { name: "1" })).toBeDisabled();
      expect(screen.getByText("05:00")).toBeInTheDocument();
    });

    it("ignore un blocage déjà expiré", () => {
      render(<ClavierPin bloqueJusqua={Date.now() - 1} onComplet={() => true} />);
      expect(screen.getByRole("button", { name: "1" })).toBeEnabled();
    });

    it("ne compte pas une erreur technique comme un essai raté", async () => {
      const onEchec = vi.fn();
      const onComplet = vi.fn(() => Promise.reject(new Error("réseau")));
      render(<ClavierPin longueur={4} onComplet={onComplet} onEchec={onEchec} />);
      for (const pin of ["1111", "2222", "3333", "4444"]) await taper(pin);
      expect(screen.getByRole("alert")).toHaveTextContent("Vérification impossible");
      expect(onEchec).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "1" })).toBeEnabled();
    });
  });

  describe("empreinte", () => {
    it("n'affiche pas la touche quand l'empreinte est coupée", () => {
      render(<ClavierPin empreinte={false} onEmpreinte={() => {}} onComplet={() => true} />);
      expect(screen.queryByRole("button", { name: "Utiliser mon empreinte" })).toBeNull();
    });

    it("n'affiche pas la touche sans callback : PIN seul", () => {
      render(<ClavierPin empreinte onComplet={() => true} />);
      expect(screen.queryByRole("button", { name: "Utiliser mon empreinte" })).toBeNull();
    });

    it("affiche la touche et appelle le callback quand l'empreinte est proposée", () => {
      const onEmpreinte = vi.fn();
      render(<ClavierPin empreinte onEmpreinte={onEmpreinte} onComplet={() => true} />);
      fireEvent.click(screen.getByRole("button", { name: "Utiliser mon empreinte" }));
      expect(onEmpreinte).toHaveBeenCalledTimes(1);
    });

    it("détecte WebAuthn en mode auto", async () => {
      const verifier = vi.fn(() => Promise.resolve(true));
      vi.stubGlobal("PublicKeyCredential", {
        isUserVerifyingPlatformAuthenticatorAvailable: verifier,
      });
      render(<ClavierPin onEmpreinte={() => {}} onComplet={() => true} />);
      await act(async () => {});
      expect(screen.getByRole("button", { name: "Utiliser mon empreinte" })).toBeInTheDocument();
      vi.unstubAllGlobals();
    });

    it("reste en PIN seul en mode auto quand WebAuthn manque", async () => {
      render(<ClavierPin onEmpreinte={() => {}} onComplet={() => true} />);
      await act(async () => {});
      expect(screen.queryByRole("button", { name: "Utiliser mon empreinte" })).toBeNull();
    });

    it("désactive l'empreinte pendant un blocage", () => {
      render(
        <ClavierPin
          empreinte
          onEmpreinte={() => {}}
          bloqueJusqua={Date.now() + 1000}
          onComplet={() => true}
        />,
      );
      expect(screen.getByRole("button", { name: "Utiliser mon empreinte" })).toBeDisabled();
    });
  });
});
