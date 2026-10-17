import { patron as c } from "@afrimove/contrats";
import { describe, expect, it, vi } from "vitest";
import { ErreurHttp } from "./erreurs";
import { creerClientHttp } from "./http";
import { nomDansContentDisposition } from "./operations";
import { OP_FICHIER_EXPORT } from "../patron/operations";

/** Le téléchargement d'un fichier : l'adaptateur HTTP remet les octets tels quels, avec ce que les en-têtes disent. */

const OCTETS = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x80]);
const EMPREINTE = "ab".repeat(32);

function fichier(entetes: Record<string, string> = {}, statut = 200): Response {
  return new Response(OCTETS, {
    status: statut,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="journal-ventes-2026-12.xlsx"',
      "X-Empreinte-AfriMove": EMPREINTE,
      ...entetes,
    },
  });
}

function client(f: typeof fetch) {
  return creerClientHttp({
    urlBase: "https://api.afrimove.test/v1/",
    fetch: f,
    relance: { max: 2, delaiMs: 1, delaiMaxMs: 2 },
  });
}

describe("lecture d'un fichier (opération « binaire »)", () => {
  it("appelle la route du fichier et remet octets, nom, type et empreinte", async () => {
    const f = vi.fn<typeof fetch>(async () => fichier());
    const recu = await client(f).executer(OP_FICHIER_EXPORT, {
      exportId: "journal_ventes",
      mois: "2026-12",
    });

    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(
      "https://api.afrimove.test/v1/patron/comptable/exports/journal_ventes/fichier?mois=2026-12",
    );
    expect(init?.method).toBe("GET");
    // Un fichier n'est pas du JSON : on n'annonce pas « application/json ».
    expect(init?.headers).toMatchObject({ Accept: "*/*" });
    expect(c.FichierExportSchema.safeParse(recu).success).toBe(true);
    expect(recu.nom).toBe("journal-ventes-2026-12.xlsx");
    expect(recu.typeMime).toContain("spreadsheetml.sheet");
    expect(recu.empreinte).toBe(EMPREINTE);
    // Les octets sont ceux de la réponse, y compris ceux qui ne sont pas du texte valide.
    expect([...recu.octets]).toEqual([...OCTETS]);
  });

  it("sans en-têtes utiles : nom par défaut, type générique, pas d'empreinte", async () => {
    const f = vi.fn<typeof fetch>(
      async () => new Response(OCTETS, { status: 200, headers: { "Content-Type": "" } }),
    );
    const recu = await client(f).executer(OP_FICHIER_EXPORT, { exportId: "annulations" });
    expect(recu.empreinte).toBeNull();
    expect(recu.nom).toBe("export");
    expect(recu.octets).toHaveLength(OCTETS.length);
    expect(recu.typeMime.length).toBeGreaterThan(0);
  });

  it("une erreur reste lue comme du JSON : code et message du serveur", async () => {
    const f = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ code: "EXPORT_INCONNU", message: "Export inconnu" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const erreur = await client(f)
      .executer(OP_FICHIER_EXPORT, { exportId: "annulations" })
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurHttp);
    expect(erreur).toMatchObject({ statut: 404, code: "EXPORT_INCONNU" });
  });

  it("le téléchargement est un GET : il est relancé sur une panne passagère (503)", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(fichier());
    const recu = await client(f).executer(OP_FICHIER_EXPORT, { exportId: "journal_caisse" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(recu.octets).toHaveLength(OCTETS.length);
  });
});

describe("nomDansContentDisposition", () => {
  it("lit le nom entre guillemets, sans guillemets, ou encodé (UTF-8)", () => {
    expect(nomDansContentDisposition('attachment; filename="a b.xlsx"')).toBe("a b.xlsx");
    expect(nomDansContentDisposition("attachment; filename=journal.csv")).toBe("journal.csv");
    expect(
      nomDansContentDisposition("attachment; filename*=UTF-8''journal%20d%C3%A9cembre.pdf"),
    ).toBe("journal décembre.pdf");
    expect(nomDansContentDisposition('attachment; filename="a\\"b.csv"')).toBe('a"b.csv');
  });

  it("rend null sans en-tête ou sans nom", () => {
    expect(nomDansContentDisposition(null)).toBeNull();
    expect(nomDansContentDisposition("attachment")).toBeNull();
  });
});
