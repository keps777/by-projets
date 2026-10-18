import { CLE_JETON } from "@afrimove/api-client";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "@/coquille/session";
import { CLE_JETON_EXPIRE, memoriserJeton } from "./stockage";
import { SurveillantSessionAgent } from "./surveillant-session";

function Role() {
  const { session } = useSession();
  return <p data-testid="role">{session?.role ?? "personne"}</p>;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function monter(actif: boolean, maintenant: () => number) {
  return render(
    <SessionProvider initiale={{ role: "guichet" }}>
      <SurveillantSessionAgent actif={actif} intervalleMs={1000} maintenant={maintenant} />
      <Role />
    </SessionProvider>,
  );
}

describe("SurveillantSessionAgent", () => {
  it("ferme la session et oublie le jeton quand sa durée est passée", () => {
    memoriserJeton("jwt", 60, 0);
    let t = 1000;
    const vue = monter(true, () => t);
    expect(vue.getByTestId("role")).toHaveTextContent("guichet");
    t = 61_000;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(localStorage.getItem(CLE_JETON)).toBeNull();
    expect(localStorage.getItem(CLE_JETON_EXPIRE)).toBeNull();
    expect(vue.getByTestId("role")).toHaveTextContent("personne");
  });

  it("contrôle aussi au démarrage : un jeton déjà périmé ferme la session tout de suite", () => {
    memoriserJeton("jwt", 60, 0);
    const vue = monter(true, () => 10 * 60_000);
    expect(localStorage.getItem(CLE_JETON)).toBeNull();
    expect(vue.getByTestId("role")).toHaveTextContent("personne");
  });

  it("laisse la session tant que le jeton vaut encore", () => {
    memoriserJeton("jwt", 3600, 0);
    const vue = monter(true, () => 1000);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(localStorage.getItem(CLE_JETON)).toBe("jwt");
    expect(vue.getByTestId("role")).toHaveTextContent("guichet");
  });

  it("ne fait rien en démonstration (mode mock)", () => {
    memoriserJeton("jwt", 60, 0);
    const vue = monter(false, () => 10 * 60_000);
    expect(localStorage.getItem(CLE_JETON)).toBe("jwt");
    expect(vue.getByTestId("role")).toHaveTextContent("guichet");
  });
});
