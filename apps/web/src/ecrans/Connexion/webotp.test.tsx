import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extraireCode, useWebOtp, webOtpDisponible } from "./webotp";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "OTPCredential");
});

function Sonde(props: { actif: boolean; cle: unknown; surCode: (code: string) => void }) {
  useWebOtp(props.actif, props.cle, 4, props.surCode);
  return null;
}

/** Installe un faux WebOTP : `get` rend `reponse` (ou attend la fin du signal quand `reponse` est absent). */
function installerWebOtp(reponse?: { code: string } | Error) {
  const get = vi.fn((options: { signal?: AbortSignal }) => {
    if (reponse instanceof Error) return Promise.reject(reponse);
    if (reponse) return Promise.resolve(reponse);
    return new Promise((_, rejeter) => {
      options.signal?.addEventListener("abort", () =>
        rejeter(new DOMException("annulé", "AbortError")),
      );
    });
  });
  vi.stubGlobal("navigator", { credentials: { get } });
  Object.defineProperty(window, "OTPCredential", { value: class {}, configurable: true });
  return get;
}

describe("Connexion · WebOTP", () => {
  it("lit le code dans un texte : exactement 4 chiffres de suite", () => {
    expect(extraireCode("4821", 4)).toBe("4821");
    expect(extraireCode("Ton code AfriMove : 4821", 4)).toBe("4821");
    expect(extraireCode("12345", 4)).toBeNull();
    expect(extraireCode("482", 4)).toBeNull();
    expect(extraireCode(undefined, 4)).toBeNull();
    expect(extraireCode("", 4)).toBeNull();
  });

  it("n'est pas disponible sans OTPCredential (Safari, Firefox, ordinateur)", () => {
    expect(webOtpDisponible()).toBe(false);
    installerWebOtp();
    expect(webOtpDisponible()).toBe(true);
  });

  it("ne demande rien au navigateur quand WebOTP n'existe pas", () => {
    const surCode = vi.fn();
    render(<Sonde actif cle={1} surCode={surCode} />);
    expect(surCode).not.toHaveBeenCalled();
  });

  it("demande le SMS au navigateur et donne le code reçu", async () => {
    const get = installerWebOtp({ code: "4821" });
    const surCode = vi.fn();
    render(<Sonde actif cle={1} surCode={surCode} />);

    await waitFor(() => expect(surCode).toHaveBeenCalledWith("4821"));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]![0]).toMatchObject({ otp: { transport: ["sms"] } });
  });

  it("ignore un code qui n'a pas 4 chiffres et un refus du navigateur", async () => {
    installerWebOtp({ code: "12" });
    const surCode = vi.fn();
    const { unmount } = render(<Sonde actif cle={1} surCode={surCode} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(surCode).not.toHaveBeenCalled();
    unmount();

    installerWebOtp(new Error("refusé"));
    render(<Sonde actif cle={1} surCode={surCode} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(surCode).not.toHaveBeenCalled();
  });

  it("n'attend pas tant que l'écran n'a pas demandé de code", () => {
    const get = installerWebOtp({ code: "4821" });
    render(<Sonde actif={false} cle={undefined} surCode={vi.fn()} />);
    expect(get).not.toHaveBeenCalled();
  });

  it("annule l'attente quand l'écran est quitté, et recommence à chaque nouvelle demande", async () => {
    const get = installerWebOtp();
    const { rerender, unmount } = render(<Sonde actif cle={1} surCode={vi.fn()} />);
    const premier = get.mock.calls[0]![0].signal!;
    expect(premier.aborted).toBe(false);

    rerender(<Sonde actif cle={2} surCode={vi.fn()} />);
    expect(premier.aborted).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);

    const second = get.mock.calls[1]![0].signal!;
    unmount();
    expect(second.aborted).toBe(true);
  });
});
