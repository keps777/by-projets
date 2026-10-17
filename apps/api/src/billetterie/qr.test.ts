import { describe, expect, it } from "vitest";
import { genererPaireQr, lireQr, publiqueDe, signerQr, verifierQr, type PaireCles } from "./qr";

const CONTENU = { numero: "ALP-DLA-261102-4001", code: "4821", departId: "depart-1" };

let paire: PaireCles;
let autre: PaireCles;
const charger = async () => {
  paire ??= await genererPaireQr();
  autre ??= await genererPaireQr();
};

describe("QR signé", () => {
  it("a la forme AM1:numéro:code:départ:signature, et se vérifie avec la clé publique seule", async () => {
    await charger();
    const qr = await signerQr(paire.privee, CONTENU);
    expect(qr).toMatch(/^AM1:ALP-DLA-261102-4001:4821:depart-1:[A-Za-z0-9_-]{86}$/);
    expect(await verifierQr(paire.publique, qr)).toEqual(CONTENU);
    expect(lireQr(qr)?.contenu).toEqual(CONTENU);
  });

  it("la clé publique ne contient aucun secret", async () => {
    await charger();
    expect(paire.publique.d).toBeUndefined();
    expect(paire.privee.d).toBeDefined();
    expect(publiqueDe(paire.privee)).toEqual(paire.publique);
    // Même si on lui passe la clé privée, la vérification n'utilise que la partie publique.
    const qr = await signerQr(paire.privee, CONTENU);
    expect(await verifierQr(paire.privee, qr)).toEqual(CONTENU);
  });

  it("refuse un QR dont un seul caractère a changé, à n'importe quelle position", async () => {
    await charger();
    const qr = await signerQr(paire.privee, CONTENU);
    // Le dernier caractère de la signature n'a que 4 bits utiles : voir le test suivant.
    for (let i = 0; i < qr.length - 1; i++) {
      const c = qr[i]!;
      const autreCaractere = c === "A" ? "B" : "A";
      const altere = qr.slice(0, i) + autreCaractere + qr.slice(i + 1);
      expect(await verifierQr(paire.publique, altere), `position ${i}`).toBeNull();
    }
  });

  it("n'accepte qu'une écriture de la signature (pas de variante en base64url)", async () => {
    await charger();
    const qr = await signerQr(paire.privee, CONTENU);
    const dernier = qr.at(-1)!;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let variantes = 0;
    for (const c of alphabet) {
      if (c === dernier) continue;
      if ((await verifierQr(paire.publique, qr.slice(0, -1) + c)) !== null) variantes++;
    }
    expect(variantes).toBe(0);
  });

  it("refuse la signature d'un autre billet, d'une autre clé, ou l'absence de signature", async () => {
    await charger();
    const qr = await signerQr(paire.privee, CONTENU);
    const autreBillet = await signerQr(paire.privee, { ...CONTENU, code: "1234" });
    const signatureAutre = autreBillet.split(":")[4];
    const recolle = qr.split(":").slice(0, 4).join(":") + ":" + signatureAutre;
    expect(await verifierQr(paire.publique, recolle)).toBeNull();
    const pirate = await signerQr(autre.privee, CONTENU);
    expect(await verifierQr(paire.publique, pirate)).toBeNull();
    expect(await verifierQr(paire.publique, qr.split(":").slice(0, 4).join(":"))).toBeNull();
    expect(await verifierQr(paire.publique, "")).toBeNull();
    expect(await verifierQr(paire.publique, "AM1:::::")).toBeNull();
    expect(await verifierQr(paire.publique, qr.replace("AM1", "AM2"))).toBeNull();
  });

  it("deux signatures du même contenu restent toutes deux valides (signature non déterministe)", async () => {
    await charger();
    const a = await signerQr(paire.privee, CONTENU);
    const b = await signerQr(paire.privee, CONTENU);
    expect(await verifierQr(paire.publique, a)).toEqual(CONTENU);
    expect(await verifierQr(paire.publique, b)).toEqual(CONTENU);
  });

  it("lireQr refuse ce qui n'a pas la forme d'un QR AfriMove", () => {
    for (const faux of [
      "",
      "hello",
      "AM1:x:y:z:w",
      "AM1:ALP-DLA-261102-4001:48:d:" + "A".repeat(86),
    ]) {
      expect(lireQr(faux), faux).toBeNull();
    }
  });
});
