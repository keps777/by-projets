import { agence } from "@afrimove/api-client";
import { beforeAll, describe, expect, it } from "vitest";
import { connecter, lire, type Session } from "../support/api";
import { creerDepart, declarerAppareil, type DepartCree } from "../support/journee";
import { Poste } from "../support/postes";

/**
 * Critère 3 : « un billet scanné deux fois est refusé ».
 *
 * Contre la vraie pile (API NestJS + PostgreSQL) : le billet est vendu au guichet, son QR est celui que le serveur a
 * signé, et le quai le scanne avec le vrai client HTTP de l'application. On vérifie la réponse du serveur ET la base.
 */
let guichetier: Session;
let quaiSession: Session;
let depart: DepartCree;
let guichet: Poste;
let quai1: Poste;
let quai2: Poste;
let sieges = 0;

beforeAll(async () => {
  guichetier = await connecter("guichetier");
  quaiSession = await connecter("superviseur");
  depart = creerDepart({ heureDepart: new Date(Date.now() + 90 * 60_000) });
  declarerAppareil("recette-c3-guichet", 1);
  guichet = new Poste(guichetier, 1);
  // Deux téléphones de quai : le guichetier lui-même et le superviseur (les deux ont le droit de scanner).
  quai1 = new Poste(guichetier, 1);
  quai2 = new Poste(quaiSession, 1);
});

const siegeSuivant = () => ++sieges;

describe("critère 3 : billet scanné deux fois refusé", () => {
  it("le premier scan fait monter le voyageur, le deuxième est refusé « déjà scanné » avec l'heure du premier", async () => {
    const billet = await guichet.vendre({ depart, siege: siegeSuivant(), nom: "Ngo Paul" });
    const premier = await quai1.scannerQr(depart.id, billet.qr);
    expect(premier.reponse.scan.resultat).toBe("monte");
    expect(premier.reponse.scan.numero).toBe(billet.numero);
    expect(premier.reponse.embarques).toBe(1);

    // Un autre téléphone, plus tard : refusé, et le serveur dit quand le voyageur est monté.
    const second = await quai2.scannerQr(depart.id, billet.qr);
    expect(second.reponse.scan.resultat).toBe("deja_scanne");
    expect(second.reponse.embarques).toBe(1);

    // La base : un seul embarquement, deux scans journalisés (un « monte », un « deja_scanne »).
    const [etat] = lire<{ etat: string }>(
      `select etat from billet where id = '${billet.billetId}'`,
    );
    expect(etat?.etat).toBe("embarque");
    const scans = lire<{ resultat: string }>(
      `select resultat from scan_quai where "billetId" = '${billet.billetId}' order by "at"`,
    );
    expect(scans.map((s) => s.resultat)).toEqual(["monte", "deja_scanne"]);
    // Le refus garde l'heure du premier scan (c'est elle que le quai montre : « déjà monté à 14 h 05 »).
    const [refus] = lire<{ premier: number | null }>(
      `select extract(epoch from "premierScanA") * 1000 as premier from scan_quai
       where "billetId" = '${billet.billetId}' and resultat = 'deja_scanne'`,
    );
    expect(refus?.premier).toBe(Date.parse(premier.evenement.at));
  });

  it("le code à 4 chiffres dicté après un scan est refusé de la même façon", async () => {
    const billet = await guichet.vendre({ depart, siege: siegeSuivant(), nom: "Fotso Marie" });
    expect((await quai1.scannerQr(depart.id, billet.qr)).reponse.scan.resultat).toBe("monte");
    const parCode = await quai1.saisirCode(depart.id, billet.codeBillet);
    expect(parCode.reponse.scan.resultat).toBe("deja_scanne");
  });

  it("l'ordre inverse (code puis QR) donne le même verdict", async () => {
    const billet = await guichet.vendre({ depart, siege: siegeSuivant(), nom: "Kamga Luc" });
    expect((await quai1.saisirCode(depart.id, billet.codeBillet)).reponse.scan.resultat).toBe(
      "monte",
    );
    expect((await quai2.scannerQr(depart.id, billet.qr)).reponse.scan.resultat).toBe("deja_scanne");
  });

  it("un rejeu du MÊME événement (réponse perdue) ne compte pas deux fois et ne refuse pas à tort le premier voyageur", async () => {
    const billet = await guichet.vendre({ depart, siege: siegeSuivant(), nom: "Biya Rose" });
    const premier = await quai1.scannerQr(depart.id, billet.qr);
    expect(premier.reponse.scan.resultat).toBe("monte");
    const rejeu = await quai1.client.executer(
      agence.ECRITURES.quaiScanne.operation,
      premier.evenement,
    );
    expect(rejeu.accuse.statut).toBe("deja_recu");
    expect(rejeu.scan.resultat).toBe("monte");
    const scans = lire<{ n: number }>(
      `select count(*)::int as n from scan_quai where "billetId" = '${billet.billetId}'`,
    );
    expect(scans[0]?.n).toBe(1);
  });

  it("deux téléphones qui scannent le même billet au même instant : un seul embarquement", async () => {
    const billet = await guichet.vendre({ depart, siege: siegeSuivant(), nom: "Eto'o Sam" });
    const resultats = await Promise.all(
      [quai1, quai2, quai1, quai2, quai1, quai2].map((q) => q.scannerQr(depart.id, billet.qr)),
    );
    const verdicts = resultats.map((r) => r.reponse.scan.resultat);
    expect(verdicts.filter((v) => v === "monte")).toHaveLength(1);
    expect(verdicts.filter((v) => v === "deja_scanne")).toHaveLength(5);
    const [n] = lire<{ n: number }>(
      `select count(*)::int as n from scan_quai where "billetId" = '${billet.billetId}' and resultat = 'monte'`,
    );
    expect(n?.n).toBe(1);
  });

  it("un QR modifié ou fabriqué est refusé sans embarquer personne", async () => {
    const billet = await guichet.vendre({ depart, siege: siegeSuivant(), nom: "Ndi Paul" });
    const trafique = billet.qr.replace(
      billet.codeBillet,
      billet.codeBillet === "1111" ? "2222" : "1111",
    );
    expect((await quai1.scannerQr(depart.id, trafique)).reponse.scan.resultat).toBe("introuvable");
    expect(
      (
        await quai1.scannerQr(
          depart.id,
          `AM1:${billet.numero}:${billet.codeBillet}:${depart.id}:AAAA`,
        )
      ).reponse.scan.resultat,
    ).toBe("introuvable");
    // Le vrai billet n'a pas été touché : il peut encore monter, une fois.
    expect((await quai1.scannerQr(depart.id, billet.qr)).reponse.scan.resultat).toBe("monte");
  });

  it("le compteur du quai ne compte chaque voyageur qu'une fois, malgré tous les scans refusés", async () => {
    const q = await quai1.client.executer(agence.OP_QUAI_EMBARQUEMENT, { departId: depart.id });
    const [embarques] = lire<{ n: number }>(
      `select count(*)::int as n from billet where "departId" = '${depart.id}' and etat = 'embarque'`,
    );
    expect(q.embarquement.embarques).toBe(embarques?.n);
    expect(q.refuses.nombre).toBeGreaterThan(0);
  });
});
