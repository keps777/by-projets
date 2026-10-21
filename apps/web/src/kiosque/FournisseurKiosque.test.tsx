import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanalMemoire, type CommandeAppareil } from "./canal";
import type { EnvEffacement } from "./effacement";
import { CLE_KIOSQUE, ecrireRepere } from "./etat";
import { FournisseurKiosque } from "./FournisseurKiosque";

const ORDRE: CommandeAppareil = {
  id: "cmd-9",
  type: "effacer",
  emiseA: "2026-10-20T08:00:00Z",
  secretAcquittement: "secret",
};

const envSimple = (): EnvEffacement => ({ localStorage: globalThis.localStorage });

function Application({ onMonte }: { onMonte?: () => void }) {
  useEffect(() => onMonte?.(), [onMonte]);
  return <h1>Caisse du guichet</h1>;
}

beforeEach(() => {
  localStorage.setItem("afrimove.session", '{"role":"guichet"}');
});
afterEach(() => localStorage.clear());

describe("FournisseurKiosque", () => {
  it("laisse l'application s'afficher tant qu'aucun ordre n'arrive", async () => {
    const canal = new CanalMemoire();
    render(
      <FournisseurKiosque appareilId="a1" canal={canal} kiosque={false} env={envSimple()}>
        <Application />
      </FournisseurKiosque>,
    );
    expect(screen.getByRole("heading", { name: "Caisse du guichet" })).toBeInTheDocument();
    await vi.waitFor(() => expect(canal.consultations).toBeGreaterThan(0));
    expect(screen.queryByTestId("appareil-efface")).not.toBeInTheDocument();
  });

  it("remplace l'application par l'écran de verrouillage dès qu'un ordre d'effacement arrive", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    render(
      <FournisseurKiosque appareilId="a1" canal={canal} kiosque={false} env={envSimple()}>
        <Application />
      </FournisseurKiosque>,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Appareil effacé" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Caisse du guichet" })).not.toBeInTheDocument();
    expect(localStorage.getItem("afrimove.session")).toBeNull();
    await vi.waitFor(() => expect(canal.acquittements).toHaveLength(1));
  });

  it("ne monte jamais l'application sur un appareil déjà effacé", () => {
    ecrireRepere({ phase: "efface", commande: ORDRE, acquitte: true });
    const onMonte = vi.fn();
    render(
      <FournisseurKiosque appareilId="a1" canal={new CanalMemoire()} kiosque={false}>
        <Application onMonte={onMonte} />
      </FournisseurKiosque>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Appareil effacé" })).toBeInTheDocument();
    expect(onMonte).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("n'affiche pas l'alerte « effacement incomplet » pendant que l'effacement tourne", () => {
    ecrireRepere({ phase: "en_cours", commande: ORDRE, acquitte: false });
    // Un effacement qui ne finit jamais (cache bloqué) : l'écran reste dans l'état « en cours », et rien
    // ne s'écrit plus tard dans le stockage des tests suivants.
    const bloque: EnvEffacement = {
      caches: { keys: () => new Promise(() => undefined), delete: vi.fn() },
    };
    render(
      <FournisseurKiosque appareilId="a1" canal={new CanalMemoire()} kiosque={false} env={bloque}>
        <Application />
      </FournisseurKiosque>,
    );
    expect(screen.getByTestId("appareil-efface")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dit de ne plus se servir de l'appareil quand l'effacement est resté incomplet", async () => {
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    const env: EnvEffacement = {
      localStorage: {
        clear: () => {
          throw new Error("stockage bloqué");
        },
      },
    };
    render(
      <FournisseurKiosque appareilId="a1" canal={canal} kiosque={false} env={env}>
        <Application />
      </FournisseurKiosque>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ne vous servez plus de cet appareil",
    );
  });

  it("affiche l'écran en anglais quand la langue conservée est l'anglais", async () => {
    localStorage.setItem("afrimove.langue", "en");
    const canal = new CanalMemoire();
    canal.emettre(ORDRE);
    render(
      <FournisseurKiosque appareilId="a1" canal={canal} kiosque={false} env={envSimple()}>
        <Application />
      </FournisseurKiosque>,
    );
    expect(await screen.findByRole("heading", { name: "Device erased" })).toBeInTheDocument();
  });

  it("en mode kiosque : bloque le menu contextuel et le rend à la sortie", () => {
    const { unmount } = render(
      <FournisseurKiosque appareilId="a1" canal={new CanalMemoire()} kiosque>
        <Application />
      </FournisseurKiosque>,
    );
    const evenement = new Event("contextmenu", { cancelable: true });
    document.dispatchEvent(evenement);
    expect(evenement.defaultPrevented).toBe(true);
    unmount();
    const apres = new Event("contextmenu", { cancelable: true });
    document.dispatchEvent(apres);
    expect(apres.defaultPrevented).toBe(false);
  });

  it("hors kiosque : le menu contextuel reste libre", () => {
    render(
      <FournisseurKiosque appareilId="a1" canal={new CanalMemoire()} kiosque={false}>
        <Application />
      </FournisseurKiosque>,
    );
    const evenement = new Event("contextmenu", { cancelable: true });
    document.dispatchEvent(evenement);
    expect(evenement.defaultPrevented).toBe(false);
  });

  it("détecte le mode kiosque depuis l'adresse quand il n'est pas imposé", () => {
    window.history.pushState({}, "", "/?kiosque=1");
    try {
      render(
        <FournisseurKiosque appareilId="a1" canal={new CanalMemoire()}>
          <Application />
        </FournisseurKiosque>,
      );
      expect(localStorage.getItem(CLE_KIOSQUE)).toBe("1");
      const evenement = new Event("contextmenu", { cancelable: true });
      document.dispatchEvent(evenement);
      expect(evenement.defaultPrevented).toBe(true);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});
