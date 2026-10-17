import { ecrans } from "@afrimove/fixtures";
import { voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  GARDE_APRES_DEPART_MS,
  PREFIXE_CACHE_BILLET,
  chiffrer,
  creerCacheBillet,
  dechiffrer,
} from "./cache-billet";
import { cacheDEssai, cleDEssai, stockageMemoire } from "./rendre-pass";

const MAINTENANT = Date.parse("2027-01-05T07:38:00+01:00");

async function billetDeDemo(): Promise<c.BilletVoyageur> {
  const ecran = ecrans.Pass;
  const scenario = voyageur.installerMockVoyageur("Pass", ecran);
  const impl = scenario.operations.find((o) => o.operation.nom === voyageur.OP_BILLET.nom);
  return (impl?.repondre as (p: unknown, ctx: unknown) => c.BilletVoyageur)({ billetId: "b1" }, {});
}

function cleAutre(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

describe("chiffrer / dechiffrer (AES-GCM)", () => {
  it("relit ce qu'il a chiffré, et le chiffré ne contient pas le texte", async () => {
    const cle = await cleDEssai()();
    const charge = await chiffrer(cle, "Aïcha Ngo 7341", "b1");
    expect(charge).not.toContain("Aïcha");
    expect(charge).not.toContain("7341");
    expect(await dechiffrer(cle, charge, "b1")).toBe("Aïcha Ngo 7341");
  });

  it("n'écrit pas deux fois la même chose (vecteur d'initialisation aléatoire)", async () => {
    const cle = await cleDEssai()();
    expect(await chiffrer(cle, "x", "b1")).not.toBe(await chiffrer(cle, "x", "b1"));
  });

  it("refuse une autre clé, une autre donnée liée, un contenu altéré ou tronqué", async () => {
    const cle = await cleDEssai()();
    const charge = await chiffrer(cle, "secret", "b1");
    expect(await dechiffrer(await cleAutre(), charge, "b1")).toBeNull();
    expect(await dechiffrer(cle, charge, "b2")).toBeNull();

    const octets = Uint8Array.from(atob(charge), (ch) => ch.charCodeAt(0));
    octets[octets.length - 1] = (octets[octets.length - 1] ?? 0) ^ 1;
    const altere = btoa(String.fromCharCode(...octets));
    expect(await dechiffrer(cle, altere, "b1")).toBeNull();

    expect(await dechiffrer(cle, charge.slice(0, 8), "b1")).toBeNull();
    expect(await dechiffrer(cle, "pas du base64 !", "b1")).toBeNull();
    expect(await dechiffrer(cle, "", "b1")).toBeNull();
  });
});

describe("cache du billet", () => {
  it("garde puis relit le billet, identique", async () => {
    const billet = await billetDeDemo();
    const cache = cacheDEssai();
    expect(await cache.ecrire("b1", billet, MAINTENANT)).toBe(true);
    expect(await cache.lire("b1", MAINTENANT)).toEqual(billet);
  });

  it("ne laisse rien en clair dans le stockage : ni nom, ni pièce, ni QR, ni code", async () => {
    const billet = await billetDeDemo();
    const stockage = stockageMemoire();
    await cacheDEssai(stockage).ecrire("b1", billet, MAINTENANT);

    const tout = [...stockage.contenu.entries()].flat().join("\n");
    for (const secret of [
      billet.passager.nom,
      billet.passager.pieceQuatreDerniers ?? "?",
      billet.qr,
      billet.codeBillet,
      billet.numero,
      billet.compagnie.nom,
    ]) {
      expect(tout).not.toContain(secret);
    }
  });

  it("rend null pour un billet jamais gardé", async () => {
    expect(await cacheDEssai().lire("inconnu", MAINTENANT)).toBeNull();
  });

  it("expire 24 h après le départ et efface l'entrée", async () => {
    const billet = await billetDeDemo();
    const stockage = stockageMemoire();
    const cache = cacheDEssai(stockage);
    await cache.ecrire("b1", billet, MAINTENANT);

    const depart = Date.parse(billet.heureDepart);
    expect(await cache.lire("b1", depart + GARDE_APRES_DEPART_MS - 1)).toEqual(billet);
    expect(await cache.lire("b1", depart + GARDE_APRES_DEPART_MS)).toBeNull();
    expect(stockage.contenu.size).toBe(0);
  });

  it("ne garde pas un billet dont le délai est déjà passé", async () => {
    const billet = await billetDeDemo();
    const stockage = stockageMemoire();
    const apres = Date.parse(billet.heureDepart) + GARDE_APRES_DEPART_MS + 1;
    expect(await cacheDEssai(stockage).ecrire("b1", billet, apres)).toBe(false);
    expect(stockage.contenu.size).toBe(0);
  });

  it("purge les billets expirés à chaque écriture, sans toucher au reste du stockage", async () => {
    const billet = await billetDeDemo();
    const stockage = stockageMemoire();
    const cache = cacheDEssai(stockage);
    stockage.contenu.set("afrimove.langue", "fr");
    await cache.ecrire("vieux", billet, MAINTENANT);

    const plusTard = Date.parse(billet.heureDepart) + GARDE_APRES_DEPART_MS + 60_000;
    const recent = { ...billet, heureDepart: "2027-01-07T08:00:00.000+01:00" };
    await cache.ecrire("recent", recent, plusTard);

    expect([...stockage.contenu.keys()].sort()).toEqual(
      ["afrimove.langue", `${PREFIXE_CACHE_BILLET}recent`].sort(),
    );
  });

  it("efface une entrée illisible, altérée ou qui n'est plus un billet valide", async () => {
    const billet = await billetDeDemo();
    const cle = cleDEssai();
    const stockage = stockageMemoire();
    const cache = creerCacheBillet({ cle, stockage });
    const nom = `${PREFIXE_CACHE_BILLET}b1`;

    stockage.contenu.set(nom, "pas du JSON");
    expect(await cache.lire("b1", MAINTENANT)).toBeNull();
    expect(stockage.contenu.has(nom)).toBe(false);

    stockage.contenu.set(nom, JSON.stringify({ v: 99, x: MAINTENANT + 1e9, d: "AAAA" }));
    expect(await cache.lire("b1", MAINTENANT)).toBeNull();
    expect(stockage.contenu.has(nom)).toBe(false);

    stockage.contenu.set(
      nom,
      JSON.stringify({ v: 1, x: MAINTENANT + 1e9, d: "AAAAAAAAAAAAAAAAAAAAAA==" }),
    );
    expect(await cache.lire("b1", MAINTENANT)).toBeNull();
    expect(stockage.contenu.has(nom)).toBe(false);

    // Chiffré avec la bonne clé mais le contenu n'est pas un billet : refusé aussi.
    const d = await chiffrer(await cle(), JSON.stringify({ ...billet, codeBillet: "12" }), "b1");
    stockage.contenu.set(nom, JSON.stringify({ v: 1, x: MAINTENANT + 1e9, d }));
    expect(await cache.lire("b1", MAINTENANT)).toBeNull();
    expect(stockage.contenu.has(nom)).toBe(false);
  });

  it("retire un billet à la demande", async () => {
    const billet = await billetDeDemo();
    const stockage = stockageMemoire();
    const cache = cacheDEssai(stockage);
    await cache.ecrire("b1", billet, MAINTENANT);
    cache.retirer("b1");
    expect(await cache.lire("b1", MAINTENANT)).toBeNull();
    expect(stockage.contenu.size).toBe(0);
  });

  it("sans clé (IndexedDB bloqué) : ne rejette pas, ne garde rien en clair, laisse l'entrée existante", async () => {
    const billet = await billetDeDemo();
    const stockage = stockageMemoire();
    await cacheDEssai(stockage).ecrire("b1", billet, MAINTENANT);

    let tentatives = 0;
    const sansCle = creerCacheBillet({
      cle: () => {
        tentatives += 1;
        return Promise.reject(new Error("IndexedDB bloqué"));
      },
      stockage,
    });
    expect(await sansCle.lire("b1", MAINTENANT)).toBeNull();
    expect(await sansCle.ecrire("b2", billet, MAINTENANT)).toBe(false);
    expect(stockage.contenu.has(`${PREFIXE_CACHE_BILLET}b2`)).toBe(false);
    // L'entrée de b1 reste : elle se lira quand la clé reviendra.
    expect(stockage.contenu.has(`${PREFIXE_CACHE_BILLET}b1`)).toBe(true);
    // Chaque appel retente d'obtenir la clé.
    expect(tentatives).toBe(2);
  });

  it("stockage plein : l'écriture échoue sans lever d'erreur", async () => {
    const billet = await billetDeDemo();
    const stockage = {
      ...stockageMemoire(),
      ecrire: () => {
        throw new DOMException("plein", "QuotaExceededError");
      },
    };
    expect(await cacheDEssai(stockage).ecrire("b1", billet, MAINTENANT)).toBe(false);
  });

  it("par défaut, sans IndexedDB (jsdom) : pas de copie, mais aucune erreur", async () => {
    const billet = await billetDeDemo();
    const cache = creerCacheBillet({ stockage: stockageMemoire() });
    expect(await cache.ecrire("b1", billet, MAINTENANT)).toBe(false);
    expect(await cache.lire("b1", MAINTENANT)).toBeNull();
  });
});
