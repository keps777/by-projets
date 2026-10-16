// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { creerClient, lireConfig } from "./config";
import { creerHorlogeManuelle } from "./horloge";
import { FournisseurApi, useFlux, useMutationApi, useRequete } from "./react";
import { CANAL_POSITION, DEPARTS_DEMO, OP_DEPARTS, OP_RESERVER, sourceDemo } from "./exemples";
import { creerClientMock } from "./mock";

afterEach(cleanup);

/**
 * Un « écran » : il n'importe ni fetch, ni fixtures, ni adaptateur. Il ne connaît que les hooks
 * et les contrats. C'est ce code qui doit fonctionner à l'identique en mock et en HTTP.
 */
function EcranDeparts() {
  const departs = useRequete(OP_DEPARTS, { gare: "DLA" });
  const reserver = useMutationApi(OP_RESERVER);
  if (departs.isPending) return <p>Chargement</p>;
  if (departs.error) return <p>Erreur {departs.error.genre}</p>;
  return (
    <div>
      <ul>
        {departs.data.map((d) => (
          <li key={d.id}>{d.numero}</li>
        ))}
      </ul>
      <button onClick={() => reserver.mutate({ departId: "d1", siege: 3 })}>Réserver</button>
      {reserver.data && <p>Billet {reserver.data.billetId}</p>}
    </div>
  );
}

function clientHttpFactice() {
  const f = vi.fn<typeof fetch>(async (url, init) => {
    const u = String(url);
    const corps = u.includes("/billets") ? { billetId: "b-http" } : DEPARTS_DEMO;
    return new Response(JSON.stringify(corps), { status: init?.method === "POST" ? 201 : 200 });
  });
  const client = creerClient(
    lireConfig({ VITE_API_MODE: "http", VITE_API_URL: "https://api.test" }),
    { fetch: f },
  );
  return { client, f };
}

describe("bascule mock / HTTP sans toucher à l'écran", () => {
  it("le même écran fonctionne avec l'adaptateur mock", async () => {
    const client = creerClient(lireConfig({}), { source: sourceDemo(), latenceMs: 0 });
    render(
      <FournisseurApi client={client}>
        <EcranDeparts />
      </FournisseurApi>,
    );
    expect(screen.getByText("Chargement")).toBeTruthy();
    for (const d of DEPARTS_DEMO) expect(await screen.findByText(d.numero)).toBeTruthy();
    screen.getByText("Réserver").click();
    expect(await screen.findByText("Billet b1")).toBeTruthy();
  });

  it("le même écran fonctionne avec l'adaptateur HTTP (variable d'environnement)", async () => {
    const { client, f } = clientHttpFactice();
    expect(client.mode).toBe("http");
    render(
      <FournisseurApi client={client}>
        <EcranDeparts />
      </FournisseurApi>,
    );
    for (const d of DEPARTS_DEMO) expect(await screen.findByText(d.numero)).toBeTruthy();
    screen.getByText("Réserver").click();
    expect(await screen.findByText("Billet b-http")).toBeTruthy();
    expect(f.mock.calls.map((c) => c[1]?.method)).toEqual(["GET", "POST"]);
  });

  it("remonte une erreur typée à l'écran dans les deux modes", async () => {
    const f = vi.fn<typeof fetch>(async () => new Response("{}", { status: 404 }));
    const client = creerClient(lireConfig({ VITE_API_MODE: "http" }), { fetch: f });
    render(
      <FournisseurApi client={client}>
        <EcranDeparts />
      </FournisseurApi>,
    );
    expect(await screen.findByText("Erreur http")).toBeTruthy();

    cleanup();
    const mockVide = creerClient(lireConfig({}), { latenceMs: 0 });
    render(
      <FournisseurApi client={mockVide}>
        <EcranDeparts />
      </FournisseurApi>,
    );
    expect(await screen.findByText("Erreur non_implemente")).toBeTruthy();
  });

  it("change de client sans réutiliser le cache de l'autre", async () => {
    const mock = creerClient(lireConfig({}, "?scenario=vide"), {
      source: sourceDemo(),
      latenceMs: 0,
    });
    const { client: http } = clientHttpFactice();
    const vue = (client: typeof mock) => (
      <FournisseurApi client={client}>
        <EcranDeparts />
      </FournisseurApi>
    );
    const { rerender } = render(vue(mock));
    await waitFor(() => expect(screen.queryByText("Chargement")).toBeNull());
    rerender(vue(http));
    expect(await screen.findByText(DEPARTS_DEMO[0]!.numero)).toBeTruthy();
  });

  it("useFlux suit le temps réel simulé par l'horloge injectée", async () => {
    const horloge = creerHorlogeManuelle("2026-10-16T05:30:00+01:00");
    const client = creerClientMock({ source: sourceDemo(), horloge, latenceMs: 0 });
    function Direct() {
      const { dernier, etat } = useFlux(CANAL_POSITION, { departId: "d1" });
      return (
        <p>
          {etat} {dernier ? `${dernier.km} km` : "aucune position"}
        </p>
      );
    }
    render(
      <FournisseurApi client={client}>
        <Direct />
      </FournisseurApi>,
    );
    await act(async () => {
      await horloge.avancer(0); // laisse le scénario se charger
      await horloge.avancer(2000);
    });
    expect(screen.getByText("ouvert 20 km")).toBeTruthy();
  });
});
