// @vitest-environment jsdom
import { MODULES as MODULES_FIXTURES, ALPHA_AKWA, ALPHA_MVAN, ecrans } from "@afrimove/fixtures";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErreurHttp, ErreurValidation } from "../infra/erreurs";
import { creerClientHttp } from "../infra/http";
import { creerClientMock } from "../infra/mock";
import type { ClientMock } from "../infra/mock";
import { FournisseurApi } from "../infra/react";
import { sourceScenariosVide } from "../infra/scenarios";
import type { SourceScenarios } from "../infra/scenarios";
import { OP_CHANGER_MODULE, OP_MODULES } from "../patron/operations";
import { installerMockPatron } from "../patron/installer";
import { useSignaturePin } from "../patron/hooks";
import {
  CATALOGUE_MODULES,
  CODES_MODULES,
  codeDuModule,
  idWebDuModule,
  moduleDuCatalogue,
  useChangerModule,
  useModule,
  useModulesActifs,
  useModulesMasques,
  installerMockModules,
  OP_MODULES_ACTIFS,
  PIN_REFUSE_PAR_LE_MOCK,
} from "./index";
import type { OptionsMockModules } from "./index";
import type { ReactNode } from "react";

afterEach(cleanup);

const PIN = "483920";

/** Une source comme le composeur central la fabriquera : le mock des modules AVANT celui du patron. */
function source(options?: OptionsMockModules): SourceScenarios {
  return {
    noms: () => ["defaut", "Modules"],
    charger: (nom) => {
      const patron = installerMockPatron(nom, nom === "Modules" ? ecrans.Modules : undefined);
      return {
        nom,
        operations: [...installerMockModules(options).operations, ...patron.operations],
        flux: patron.flux,
      };
    },
  };
}

function clientModules(options?: OptionsMockModules): ClientMock {
  return creerClientMock({ source: source(options), scenario: "Modules", latenceMs: 0 });
}

function enveloppe(client: ClientMock) {
  return function Enveloppe({ children }: { children?: ReactNode }) {
    return <FournisseurApi client={client}>{children}</FournisseurApi>;
  };
}

const signature = (pin = PIN) => ({
  pin,
  methode: "pin" as const,
  signeA: "2026-11-02T09:00:00.000+01:00",
});

async function erreurDe(promesse: Promise<unknown>): Promise<ErreurHttp> {
  try {
    await promesse;
  } catch (e) {
    if (e instanceof ErreurHttp) return e;
    throw e;
  }
  throw new Error("Une erreur était attendue");
}

describe("catalogue", () => {
  it("reprend les 12 modules des fixtures, dans l'ordre, avec les mêmes noms et états par défaut", () => {
    expect(CATALOGUE_MODULES).toHaveLength(12);
    expect(CATALOGUE_MODULES.map((m) => m.code)).toEqual(MODULES_FIXTURES.map((m) => m.code));
    expect(CATALOGUE_MODULES.map((m) => m.nom)).toEqual(MODULES_FIXTURES.map((m) => m.nom));
    expect(CATALOGUE_MODULES.map((m) => m.actifParDefaut)).toEqual(
      MODULES_FIXTURES.map((m) => m.actif),
    );
  });

  it("reprend les identifiants de la coquille web, dans le même ordre", () => {
    const source = readFileSync(
      resolve(__dirname, "../../../../apps/web/src/coquille/modules.tsx"),
      "utf8",
    );
    const bloc = /export const MODULES = \[([^\]]*)\] as const/.exec(source)?.[1] ?? "";
    const idsWeb = [...bloc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(idsWeb).toHaveLength(12);
    expect(CATALOGUE_MODULES.map((m) => m.idWeb)).toEqual(idsWeb);
    // Le socle de la coquille est le même que celui du moteur.
    const toujoursActifs = /MODULES_TOUJOURS_ACTIFS[^=]*=\s*\[([^\]]*)\]/.exec(source)?.[1] ?? "";
    expect([...toujoursActifs.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual(
      CATALOGUE_MODULES.filter((m) => m.socle).map((m) => m.idWeb),
    );
  });

  it("traduit un identifiant web en code API et inversement", () => {
    expect(codeDuModule("covoit")).toBe("covoit_vendeurs");
    expect(codeDuModule("covoit_vendeurs")).toBe("covoit_vendeurs");
    expect(codeDuModule("livraison")).toBe("livraison_moto");
    expect(codeDuModule("inter-agences")).toBe("inter_agences");
    expect(codeDuModule("inconnu")).toBeUndefined();
    expect(idWebDuModule("quai_bus")).toBe("quai");
    expect(moduleDuCatalogue("guichet")?.socle).toBe(true);
    expect(CODES_MODULES).toHaveLength(12);
  });
});

describe("adaptateur HTTP", () => {
  const reponse = {
    agenceId: "a1",
    gareId: "g1",
    ville: "Douala",
    calculeA: "2026-11-02T09:00:00.000+01:00",
    modules: [{ code: "colis", actif: false }],
  };
  const json = (corps: unknown) =>
    new Response(JSON.stringify(corps), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  it("appelle GET /modules/actifs avec les paramètres du contexte", async () => {
    const f = vi.fn<typeof fetch>(async () => json(reponse));
    const client = creerClientHttp({ urlBase: "https://api.afrimove.test/v1/", fetch: f });
    await expect(
      client.executer(OP_MODULES_ACTIFS, { gare: "g1", ville: "Douala" }),
    ).resolves.toEqual(reponse);
    expect(f.mock.calls[0]![0]).toBe(
      "https://api.afrimove.test/v1/modules/actifs?gare=g1&ville=Douala",
    );
    expect(f.mock.calls[0]![1]?.method).toBe("GET");
  });

  it("n'envoie aucun paramètre quand le contexte est vide", async () => {
    const f = vi.fn<typeof fetch>(async () => json(reponse));
    const client = creerClientHttp({ urlBase: "https://api.afrimove.test/v1/", fetch: f });
    await client.executer(OP_MODULES_ACTIFS, {});
    expect(f.mock.calls[0]![0]).toBe("https://api.afrimove.test/v1/modules/actifs");
  });

  it("refuse une réponse qui n'a pas la forme du contrat", async () => {
    const f = vi.fn<typeof fetch>(async () => json({ ...reponse, modules: [{ code: "colis" }] }));
    const client = creerClientHttp({ urlBase: "https://api.afrimove.test/v1/", fetch: f });
    await expect(client.executer(OP_MODULES_ACTIFS, {})).rejects.toBeInstanceOf(ErreurValidation);
  });
});

describe("hooks", () => {
  it("useModule suit l'état de l'agence : les 10 modules actifs et les 2 masqués des fixtures", async () => {
    const client = clientModules();
    const { result } = renderHook(
      () => ({
        covoit: useModule("covoit"),
        covoitCode: useModule("covoit_vendeurs"),
        financement: useModule("financement"),
        relais: useModule("relais"),
        caisse: useModule("guichet"),
        masques: useModulesMasques(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.covoit).toBe(false));
    expect(result.current).toMatchObject({
      covoit: false,
      covoitCode: false,
      financement: false,
      relais: true,
      caisse: true,
    });
    expect(result.current.masques).toEqual(["covoit", "financement"]);
  });

  it("affiche tout tant que l'état est inconnu, puis si le serveur ne répond pas", async () => {
    const client = creerClientMock({ source: sourceScenariosVide(), latenceMs: 0 });
    const { result } = renderHook(
      () => ({
        colis: useModule("colis"),
        masques: useModulesMasques(),
        lecture: useModulesActifs(),
      }),
      { wrapper: enveloppe(client) },
    );
    expect(result.current.colis).toBe(true);
    await waitFor(() => expect(result.current.lecture.isError).toBe(true));
    expect(result.current.colis).toBe(true);
    expect(result.current.masques).toEqual([]);
  });

  it("refuse un identifiant de module inconnu (faute de frappe)", () => {
    const client = clientModules();
    expect(() =>
      renderHook(() => useModule("covoiturage" as never), { wrapper: enveloppe(client) }),
    ).toThrow(/module inconnu/);
  });

  it("masquer un module met à jour les menus tout de suite, sans recharger la page", async () => {
    const client = clientModules();
    const { result } = renderHook(
      () => ({
        relais: useModule("relais"),
        masques: useModulesMasques(),
        changer: useChangerModule(),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.masques).toEqual(["covoit", "financement"]));
    expect(result.current.relais).toBe(true);

    await act(async () => {
      await result.current.changer.mutateAsync({
        code: "relais",
        actif: false,
        portee: { type: "agence" },
        signature: result.current.signer(PIN),
      });
    });
    await waitFor(() => expect(result.current.relais).toBe(false));
    expect(result.current.masques).toContain("relais");

    // Le rallumer rend le module (aucune donnée perdue : seule la visibilité change).
    await act(async () => {
      await result.current.changer.mutateAsync({
        code: "relais",
        actif: true,
        portee: { type: "agence" },
        signature: result.current.signer(PIN),
      });
    });
    await waitFor(() => expect(result.current.relais).toBe(true));
  });

  it("une exception par gare allume un module éteint pour cette gare seulement", async () => {
    const client = clientModules();
    await client.executer(OP_CHANGER_MODULE, {
      code: "covoit_vendeurs",
      actif: true,
      portee: { type: "gare", id: ALPHA_AKWA.id },
      signature: signature(),
    });
    const { result } = renderHook(
      () => ({
        akwa: useModule("covoit", { gare: ALPHA_AKWA.id }),
        mvan: useModule("covoit", { gare: ALPHA_MVAN.id }),
        agence: useModule("covoit"),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.akwa).toBe(true));
    await waitFor(() => expect(result.current.mvan).toBe(false));
    expect(result.current.agence).toBe(false);
  });
});

describe("mock des modules", () => {
  const modifier = (client: ClientMock, parametres: Record<string, unknown>) =>
    client.executer(OP_CHANGER_MODULE, {
      code: "colis",
      actif: false,
      portee: { type: "agence" },
      signature: signature(),
      ...parametres,
    } as never);

  it("garde le socle : « Guichet et caisse » ne se masque à aucune portée", async () => {
    const client = clientModules();
    for (const portee of [
      { type: "agence" },
      { type: "gare", id: ALPHA_AKWA.id },
      { type: "ville", nom: "Douala" },
    ]) {
      const erreur = await erreurDe(modifier(client, { code: "guichet_caisse", portee }));
      expect(erreur).toMatchObject({ statut: 409, code: "MODULE_SOCLE" });
    }
    const actifs = await client.executer(OP_MODULES_ACTIFS, {});
    expect(actifs.modules.find((m) => m.code === "guichet_caisse")?.actif).toBe(true);
  });

  it("exige la signature et refuse un PIN faux, sans rien changer", async () => {
    const client = clientModules();
    const sans = await erreurDe(modifier(client, { signature: undefined }));
    expect(sans).toMatchObject({ statut: 401, code: "PIN_REQUIS" });
    const faux = await erreurDe(modifier(client, { signature: signature(PIN_REFUSE_PAR_LE_MOCK) }));
    expect(faux).toMatchObject({ statut: 403, code: "PIN_INCORRECT" });
    const actifs = await client.executer(OP_MODULES_ACTIFS, {});
    expect(actifs.modules.find((m) => m.code === "colis")?.actif).toBe(true);
  });

  it("refuse un module, une gare ou une ville inconnus, et un corps invalide", async () => {
    const client = clientModules();
    expect(await erreurDe(modifier(client, { code: "teleportation" }))).toMatchObject({
      statut: 404,
      code: "MODULE_INCONNU",
    });
    expect(
      await erreurDe(modifier(client, { portee: { type: "gare", id: "gare-inconnue" } })),
    ).toMatchObject({ statut: 404, code: "GARE_INCONNUE" });
    expect(
      await erreurDe(modifier(client, { portee: { type: "ville", nom: "Garoua" } })),
    ).toMatchObject({ statut: 404, code: "VILLE_INCONNUE" });
    expect(await erreurDe(modifier(client, { actif: "non" }))).toMatchObject({
      statut: 422,
      code: "COMMANDE_INVALIDE",
    });
  });

  it("la gare prime sur la ville, la ville sur l'agence ; « toute l'agence » remet à plat", async () => {
    const client = clientModules();
    await modifier(client, { portee: { type: "ville", nom: "douala" } }); // colis éteint à Douala
    await modifier(client, { actif: true, portee: { type: "gare", id: ALPHA_AKWA.id } });
    const lire = async (gare?: string, ville?: string) =>
      (
        await client.executer(OP_MODULES_ACTIFS, {
          ...(gare ? { gare } : {}),
          ...(ville ? { ville } : {}),
        })
      ).modules.find((m) => m.code === "colis")?.actif;
    expect(await lire(ALPHA_AKWA.id)).toBe(true);
    expect(await lire(undefined, "Douala")).toBe(false);
    expect(await lire(ALPHA_MVAN.id)).toBe(true);
    expect(await lire()).toBe(true);

    const liste = await client.executer(OP_MODULES, undefined);
    expect(liste.modules.find((m) => m.code === "colis")?.exceptions).toEqual([
      { portee: { type: "ville", nom: "Douala" }, actif: false },
      { portee: { type: "gare", id: ALPHA_AKWA.id }, actif: true },
    ]);

    await modifier(client, { actif: true });
    expect(
      (await client.executer(OP_MODULES, undefined)).modules.find((m) => m.code === "colis"),
    ).toMatchObject({ actif: true, exceptions: [] });
    expect(await lire(undefined, "Douala")).toBe(true);
  });

  it("une exception égale à la règle dont elle hérite disparaît", async () => {
    const client = clientModules();
    await modifier(client, { portee: { type: "ville", nom: "Douala" } });
    const r = await modifier(client, { portee: { type: "gare", id: ALPHA_AKWA.id } });
    expect(r.module.exceptions).toEqual([
      { portee: { type: "ville", nom: "Douala" }, actif: false },
    ]);
    const rallume = await modifier(client, {
      actif: true,
      portee: { type: "ville", nom: "Douala" },
    });
    expect(rallume.module.exceptions).toEqual([]);
  });

  it("le mock des modules prend la place de celui du patron : même état pour les deux lectures", async () => {
    const client = clientModules();
    await modifier(client, { code: "ussd" });
    const [patron, actifs] = await Promise.all([
      client.executer(OP_MODULES, undefined),
      client.executer(OP_MODULES_ACTIFS, {}),
    ]);
    expect(patron.modules.find((m) => m.code === "ussd")?.actif).toBe(false);
    expect(patron.actifs).toBe(9);
    expect(actifs.modules.find((m) => m.code === "ussd")?.actif).toBe(false);
  });

  it("repart d'un état neuf à chaque client", async () => {
    const a = clientModules();
    await modifier(a, { code: "ussd" });
    const b = clientModules();
    expect((await b.executer(OP_MODULES, undefined)).actifs).toBe(10);
  });

  it("applique la gare par défaut du compte quand l'écran n'en nomme pas", async () => {
    const client = clientModules({ gareParDefaut: ALPHA_AKWA.id });
    await modifier(client, { portee: { type: "gare", id: ALPHA_AKWA.id } });
    const actifs = await client.executer(OP_MODULES_ACTIFS, {});
    expect(actifs).toMatchObject({ gareId: ALPHA_AKWA.id, ville: "Douala" });
    expect(actifs.modules.find((m) => m.code === "colis")?.actif).toBe(false);
  });
});
