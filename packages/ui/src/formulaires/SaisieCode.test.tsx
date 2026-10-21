import "./testing";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaisieCode } from "./SaisieCode";

function cases(): string[] {
  return screen.getAllByTestId("case-code").map((c) => c.textContent ?? "");
}

describe("SaisieCode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("déclare l'auto-remplissage SMS et un clavier numérique", () => {
    render(<SaisieCode longueur={4} />);
    const champ = screen.getByRole("textbox", { name: "Code reçu par SMS" });
    expect(champ).toHaveAttribute("autocomplete", "one-time-code");
    expect(champ).toHaveAttribute("inputmode", "numeric");
    expect(champ).toHaveAttribute("pattern", "[0-9]*");
  });

  it("affiche 4 ou 6 cases, les vides avec un tiret bas", () => {
    const { unmount } = render(<SaisieCode longueur={4} defaultValue="48" />);
    expect(cases()).toEqual(["4", "8", "_", "_"]);
    unmount();
    render(<SaisieCode longueur={6} />);
    expect(cases()).toEqual(["_", "_", "_", "_", "_", "_"]);
  });

  it("reçoit les chiffres tapés et prévient quand le code est complet", async () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(<SaisieCode longueur={4} onChange={onChange} onComplete={onComplete} />);
    await userEvent.type(screen.getByRole("textbox"), "4821");
    expect(cases()).toEqual(["4", "8", "2", "1"]);
    expect(onChange).toHaveBeenLastCalledWith("4821");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("4821");
  });

  it("ignore les caractères qui ne sont pas des chiffres et tronque à la longueur", async () => {
    const onComplete = vi.fn();
    render(<SaisieCode longueur={4} onComplete={onComplete} />);
    const champ = screen.getByRole("textbox");
    await userEvent.type(champ, "a4b8");
    expect(cases()).toEqual(["4", "8", "_", "_"]);
    await userEvent.type(champ, "2159");
    expect(cases()).toEqual(["4", "8", "2", "1"]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("extrait le code d'un SMS collé ou rempli automatiquement", () => {
    const onComplete = vi.fn();
    render(<SaisieCode longueur={6} onComplete={onComplete} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "AfriMove : votre code est 482 915" },
    });
    expect(cases()).toEqual(["4", "8", "2", "9", "1", "5"]);
    expect(onComplete).toHaveBeenCalledWith("482915");
  });

  it("permet de corriger avec la touche retour arrière", async () => {
    render(<SaisieCode longueur={4} />);
    await userEvent.type(screen.getByRole("textbox"), "482{Backspace}");
    expect(cases()).toEqual(["4", "8", "_", "_"]);
  });

  it("met la case courante en évidence quand le champ a le focus", async () => {
    render(<SaisieCode longueur={4} defaultValue="482" />);
    const avant = screen.getAllByTestId("case-code").map((c) => c.className);
    expect(new Set(avant).size).toBe(2);
    await userEvent.click(screen.getByRole("textbox"));
    const apres = screen.getAllByTestId("case-code").map((c) => c.className);
    expect(apres[2]).not.toBe(avant[2]);
    expect(apres[0]).toBe(avant[0]);
  });

  it("fonctionne piloté par l'appelant", () => {
    const { rerender } = render(<SaisieCode longueur={4} value="12" />);
    expect(cases()).toEqual(["1", "2", "_", "_"]);
    rerender(<SaisieCode longueur={4} value="1234" />);
    expect(cases()).toEqual(["1", "2", "3", "4"]);
  });

  it("montre l'erreur et la relie au champ", () => {
    render(<SaisieCode id="otp" longueur={4} erreur="Code incorrect" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Code incorrect");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Code incorrect");
  });

  it("n'accepte plus de saisie quand il est désactivé", () => {
    render(<SaisieCode longueur={4} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  describe("WebOTP", () => {
    it("demande le code par SMS et le remplit", async () => {
      const get = vi.fn(() => Promise.resolve({ code: "7340" }));
      vi.stubGlobal("OTPCredential", class {});
      Object.defineProperty(navigator, "credentials", { value: { get }, configurable: true });
      const onComplete = vi.fn();
      render(<SaisieCode longueur={4} onComplete={onComplete} />);
      await act(async () => {});
      expect(get).toHaveBeenCalledWith(
        expect.objectContaining({ otp: { transport: ["sms"] }, signal: expect.any(AbortSignal) }),
      );
      expect(cases()).toEqual(["7", "3", "4", "0"]);
      expect(onComplete).toHaveBeenCalledWith("7340");
    });

    it("annule la demande au démontage", async () => {
      let signal: AbortSignal | undefined;
      const get = vi.fn((options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise(() => {});
      });
      vi.stubGlobal("OTPCredential", class {});
      Object.defineProperty(navigator, "credentials", { value: { get }, configurable: true });
      const { unmount } = render(<SaisieCode longueur={4} />);
      expect(signal?.aborted).toBe(false);
      unmount();
      expect(signal?.aborted).toBe(true);
    });

    it("ne demande rien si webOtp est coupé ou si le navigateur ne le propose pas", async () => {
      const get = vi.fn(() => Promise.resolve(null));
      Object.defineProperty(navigator, "credentials", { value: { get }, configurable: true });
      render(<SaisieCode longueur={4} />);
      vi.stubGlobal("OTPCredential", class {});
      render(<SaisieCode longueur={4} webOtp={false} />);
      await act(async () => {});
      expect(get).not.toHaveBeenCalled();
    });

    it("garde la saisie manuelle si la demande est refusée", async () => {
      const get = vi.fn(() => Promise.reject(new Error("refusé")));
      vi.stubGlobal("OTPCredential", class {});
      Object.defineProperty(navigator, "credentials", { value: { get }, configurable: true });
      render(<SaisieCode longueur={4} />);
      await act(async () => {});
      await userEvent.type(screen.getByRole("textbox"), "1234");
      expect(cases()).toEqual(["1", "2", "3", "4"]);
    });
  });
});
