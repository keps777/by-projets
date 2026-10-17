import type { AddressInfo } from "node:net";
import { colis, patron, voyageur } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canalBus, canalControle } from "./ports";
import { jetonDeLaDemande } from "./passerelle";
import { COMPAGNIE, DEPART, pointAuKm } from "./testing/monde";
import { avec, creerAppGpsTest, peupler, type AppGpsTest } from "./testing/app-gps-test";
import { MS_PAR_MINUTE, versIsoDouala } from "./temps";

/**
 * Temps réel : la position du bus, du livreur et la salle de contrôle passent par WebSocket sur le
 * serveur HTTP de l'application. Le client est celui de Node (`WebSocket` global), qui ne pose pas
 * d'en-tête : le jeton passe par `?access_token=`.
 */

let t: AppGpsTest;
let g: Awaited<ReturnType<typeof peupler>>;
let port: number;

beforeAll(async () => {
  t = await creerAppGpsTest({ debut: new Date("2026-11-02T08:05:00.000Z") }); // 09:05
  g = await peupler(t);
  await t.app.listen(0, "127.0.0.1");
  port = (t.app.getHttpServer().address() as AddressInfo).port;
});
afterAll(async () => t.fermer());

interface Client {
  messages: unknown[];
  socket: WebSocket;
  attendre(predicat: (m: unknown) => boolean, ms?: number): Promise<unknown>;
  fermer(): void;
}

/** Ouvre un canal ; rejette avec « refuse » si le serveur n'accepte pas la connexion. */
function ouvrir(chemin: string, jeton: string | null): Promise<Client> {
  const url = `ws://127.0.0.1:${port}${chemin}${jeton ? `?access_token=${jeton}` : ""}`;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages: unknown[] = [];
    const ecouteurs: (() => void)[] = [];
    socket.addEventListener("message", (e) => {
      messages.push(JSON.parse(String(e.data)));
      for (const l of [...ecouteurs]) l();
    });
    socket.addEventListener("error", () => reject(new Error("refuse")));
    socket.addEventListener("open", () =>
      resolve({
        messages,
        socket,
        attendre: (predicat, ms = 3000) =>
          new Promise((ok, ko) => {
            const cherche = () => {
              const trouve = messages.find(predicat);
              if (trouve !== undefined) {
                clearTimeout(minuterie);
                ecouteurs.splice(ecouteurs.indexOf(cherche), 1);
                ok(trouve);
              }
            };
            const minuterie = setTimeout(() => {
              ecouteurs.splice(ecouteurs.indexOf(cherche), 1);
              ko(new Error(`message attendu non reçu : ${JSON.stringify(messages)}`));
            }, ms);
            ecouteurs.push(cherche);
            cherche();
          }),
        fermer: () => socket.close(),
      }),
    );
  });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const type = (m: unknown): string => (m as { type?: string }).type ?? "";

function position(km: number, extra: Record<string, unknown> = {}) {
  return {
    instant: versIsoDouala(t.horloge.maintenant()),
    ...pointAuKm(km),
    precisionM: 8,
    vitesseKmh: 80,
    ...extra,
  };
}
const poster = (positions: unknown[], jeton = g.chauffeur.jeton) =>
  t.http().post(`/gps/bus/${DEPART}/positions`).set(avec(jeton)).send({ positions });

const CANAL_BUS = "/voyageur/billets/billet-1/direct/position";

describe("jeton d'une demande d'ouverture", () => {
  it("lit l'en-tête Authorization ou ?access_token=, et rien d'autre", () => {
    expect(jetonDeLaDemande({ headers: { authorization: "Bearer abc.def-1" }, url: "/x" })).toBe(
      "abc.def-1",
    );
    expect(jetonDeLaDemande({ headers: {}, url: "/x?access_token=abc.def-1" })).toBe("abc.def-1");
    expect(jetonDeLaDemande({ headers: {}, url: "/x?access_token=a b" })).toBeNull();
    expect(jetonDeLaDemande({ headers: { authorization: "Basic abc" }, url: "/x" })).toBeNull();
    expect(jetonDeLaDemande({ headers: {}, url: "/x" })).toBeNull();
  });
});

describe("position du bus d'un billet", () => {
  it("refuse sans jeton, avec un autre rôle, pour le billet d'un autre ou un billet inconnu", async () => {
    await expect(ouvrir(CANAL_BUS, null)).rejects.toThrow("refuse");
    await expect(ouvrir(CANAL_BUS, g.chauffeur.jeton)).rejects.toThrow("refuse");
    await expect(ouvrir(CANAL_BUS, g.autreVoyageur.jeton)).rejects.toThrow("refuse");
    await expect(
      ouvrir("/voyageur/billets/inconnu/direct/position", g.voyageur.jeton),
    ).rejects.toThrow("refuse");
    await expect(ouvrir(CANAL_BUS, "jeton.invalide.xx")).rejects.toThrow("refuse");
  });

  it("le rôle est vérifié avant le billet : un compte de direction n'ouvre pas le canal voyageur", async () => {
    t.billets.ajouter({
      billetId: "billet-patron",
      departId: DEPART,
      voyageurId: g.patron.id,
      siege: 1,
      passagerNom: "Le patron",
      valide: true,
    });
    await expect(
      ouvrir("/voyageur/billets/billet-patron/direct/position", g.patron.jeton),
    ).rejects.toThrow("refuse");
  });

  it("n'envoie rien tant que le bus n'a pas de position, puis chaque position du chauffeur", async () => {
    const c = await ouvrir(CANAL_BUS, g.voyageur.jeton);
    try {
      await pause(100);
      expect(c.messages).toEqual([]);

      expect((await poster([position(70, { vitesseKmh: 82 })])).status).toBe(200);
      const m = voyageur.SchemaMessagePositionBus.parse(await c.attendre(() => true));
      expect(m).toMatchObject({ billetId: "billet-1", vitesseKmh: 82, prochainArret: "Pouma" });
      expect(m.latitude).toBeCloseTo(pointAuKm(70).latitude, 5);
      expect(m.retardMinutes).toBeGreaterThanOrEqual(0);
      expect(Date.parse(m.arriveeEstimee)).toBeGreaterThan(Date.parse(m.instant));

      // La position suivante (30 s plus tard) arrive à son tour, mise à jour.
      t.horloge.avancer(30_000);
      await poster([position(71, { vitesseKmh: 75 })]);
      await c.attendre((x) => (x as { vitesseKmh: number }).vitesseKmh === 75);
      expect(c.messages).toHaveLength(2);
    } finally {
      c.fermer();
    }
  });

  it("à la connexion, envoie d'abord la dernière position connue", async () => {
    const c = await ouvrir(CANAL_BUS, g.voyageur.jeton);
    try {
      const m = voyageur.SchemaMessagePositionBus.parse(await c.attendre(() => true));
      expect(m).toMatchObject({ billetId: "billet-1", vitesseKmh: 75 });
    } finally {
      c.fermer();
    }
  });

  it("un lot rattrapé n'envoie que la dernière position", async () => {
    const c = await ouvrir(CANAL_BUS, g.voyageur.jeton);
    try {
      await c.attendre(() => true); // la position connue
      t.horloge.avancer(2 * MS_PAR_MINUTE);
      // Quatre positions de 30 s d'écart, retenues par le téléphone hors réseau.
      const maintenant = t.horloge.maintenant().getTime();
      const lot = [0, 1, 2, 3].map((i) => ({
        ...position(72 + i, { vitesseKmh: 60 + i }),
        instant: versIsoDouala(maintenant - (3 - i) * 30_000),
      }));
      expect((await poster(lot)).body).toMatchObject({ acceptees: 4 });
      await c.attendre((x) => (x as { vitesseKmh: number }).vitesseKmh === 63);
      await pause(100);
      const vitesses = c.messages.map((x) => (x as { vitesseKmh: number }).vitesseKmh);
      expect(vitesses.filter((v) => v >= 60 && v <= 63)).toEqual([63]);
    } finally {
      c.fermer();
    }
  });

  it("ne diffuse que les bus du billet suivi, et libère l'abonnement à la fermeture", async () => {
    const c = await ouvrir(CANAL_BUS, g.voyageur.jeton);
    await c.attendre(() => true);
    const avant = c.messages.length;
    // Une position d'un autre départ n'arrive pas sur ce canal.
    t.diffusion.publier(canalBus("autre-depart"), { departId: "autre-depart" });
    await pause(100);
    expect(c.messages).toHaveLength(avant);
    expect(t.diffusion.nombreAbonnes(canalBus(DEPART))).toBeGreaterThan(0);
    const abonnes = t.diffusion.nombreAbonnes(canalBus(DEPART));
    c.fermer();
    for (let i = 0; i < 50 && t.diffusion.nombreAbonnes(canalBus(DEPART)) >= abonnes; i++) {
      await pause(20);
    }
    expect(t.diffusion.nombreAbonnes(canalBus(DEPART))).toBeLessThan(abonnes);
  });
});

describe("salle de contrôle en direct", () => {
  const CANAL = "/patron/controle/bus/direct";

  it("refuse sans jeton et aux rôles qui n'y ont pas droit", async () => {
    await expect(ouvrir(CANAL, null)).rejects.toThrow("refuse");
    await expect(ouvrir(CANAL, g.voyageur.jeton)).rejects.toThrow("refuse");
    await expect(ouvrir(CANAL, g.chauffeur.jeton)).rejects.toThrow("refuse");
    // Même rattaché à une compagnie, un voyageur n'y a pas droit : c'est le rôle qui décide.
    const intrus = await t.compte("voyageur", { compagnieId: COMPAGNIE });
    await expect(ouvrir(CANAL, intrus.jeton)).rejects.toThrow("refuse");
  });

  it("envoie les bus à la connexion puis chaque position, l'alerte d'arrêt et sa résolution", async () => {
    const c = await ouvrir(CANAL, g.patron.jeton);
    try {
      // À la connexion : le bus qui a déjà envoyé sa position.
      await c.attendre((m) => type(m) === "bus");

      // Le bus s'arrête hors arrêt : 10 minutes, l'alerte arrive en direct.
      const arret = (extra: Record<string, unknown> = {}) =>
        position(74, { vitesseKmh: 0, ...extra });
      for (let i = 0; i < 21; i++) {
        t.horloge.avancer(30_000);
        await poster([arret()]);
      }
      const alerte = (await c.attendre((m) => type(m) === "a_traiter")) as {
        element: unknown;
      };
      const element = patron.ATraiterSchema.parse(alerte.element);
      expect(element).toMatchObject({ type: "bus_arrete" });
      expect(element.texte).toMatch(/^LT 412 AB arrêté 1\d min après Edéa/);

      // Chaque position est aussi une mise à jour de la carte.
      const bus = (await c.attendre(
        (m) =>
          type(m) === "bus" &&
          (m as { bus: { arretMinutes?: number } }).bus.arretMinutes !== undefined,
      )) as { bus: { immatriculation: string; departId: string } };
      expect(bus.bus).toMatchObject({ immatriculation: "LT 412 AB", departId: DEPART });

      // Le bus repart : l'alerte est résolue.
      t.horloge.avancer(30_000);
      await poster([position(76, { vitesseKmh: 70 })]);
      const resolue = await c.attendre((m) => type(m) === "alerte_resolue");
      expect(resolue).toEqual({ type: "alerte_resolue", id: element.id });
    } finally {
      c.fermer();
    }
  });

  it("ne reçoit pas les messages d'une autre compagnie", async () => {
    const c = await ouvrir(CANAL, g.superviseur.jeton);
    try {
      await c.attendre((m) => type(m) === "bus");
      const avant = c.messages.length;
      t.diffusion.publier(canalControle("00000000-0000-4000-8000-0000000000c9"), {
        type: "a_traiter",
        element: { id: "x" },
      });
      await pause(100);
      expect(c.messages).toHaveLength(avant);
    } finally {
      c.fermer();
    }
  });
});

describe("position du livreur", () => {
  const mission = (
    expediteurId: string | null,
    destinataireId: string | null,
    livreurId: string,
  ) => ({
    colisId: "colis-9",
    livreurId,
    expediteurId,
    destinataireId,
    active: true,
    retire: true,
    retrait: { latitude: 4.05, longitude: 9.7 },
    remise: { latitude: 4.06, longitude: 9.7 },
  });
  const CANAL = "/colis/colis-9/livraison/direct";

  it("l'expéditeur et le destinataire suivent le temps restant, personne d'autre", async () => {
    const destinataire = await t.compte("voyageur", { nom: "Maman" });
    t.missions.ajouter(mission(g.voyageur.id, destinataire.id, g.livreur.id));
    await expect(ouvrir(CANAL, null)).rejects.toThrow("refuse");
    await expect(ouvrir(CANAL, g.autreVoyageur.jeton)).rejects.toThrow("refuse");
    await expect(ouvrir(CANAL, g.livreur.jeton)).rejects.toThrow("refuse");
    await expect(ouvrir("/colis/inconnu/livraison/direct", g.voyageur.jeton)).rejects.toThrow(
      "refuse",
    );

    const c1 = await ouvrir(CANAL, g.voyageur.jeton);
    const c2 = await ouvrir(CANAL, destinataire.jeton);
    try {
      await pause(100);
      expect(c1.messages).toEqual([]); // pas encore de position

      const envoi = await t
        .http()
        .post("/gps/livraisons/colis-9/positions")
        .set(avec(g.livreur.jeton))
        .send({
          positions: [{ instant: t.maintenant(), latitude: 4.05, longitude: 9.7, vitesseKmh: 20 }],
        });
      expect(envoi.status).toBe(200);
      for (const c of [c1, c2]) {
        const m = colis.SchemaPositionLivreur.parse(await c.attendre(() => true));
        // ~1,1 km à vol d'oiseau × 1,3 à 20 km/h = 4,3 min : 5 minutes.
        expect(m).toMatchObject({ colisId: "colis-9", minutesRestantes: 5 });
        expect(Date.parse(m.arriveeEstimee)).toBe(
          t.horloge.maintenant().getTime() + 5 * MS_PAR_MINUTE,
        );
        // Jamais la position exacte du livreur, ni un code de retrait.
        expect(Object.keys(m).sort()).toEqual(["arriveeEstimee", "colisId", "minutesRestantes"]);
      }

      // Une connexion tardive reçoit la dernière estimation, décomptée de l'heure écoulée.
      t.horloge.avancer(2 * MS_PAR_MINUTE);
      const tard = await ouvrir(CANAL, g.voyageur.jeton);
      const m = colis.SchemaPositionLivreur.parse(await tard.attendre(() => true));
      expect(m.minutesRestantes).toBe(3);
      tard.fermer();
    } finally {
      c1.fermer();
      c2.fermer();
    }
  });

  it("refuse le canal d'une livraison terminée", async () => {
    t.missions.changer("colis-9", { active: false });
    await expect(ouvrir(CANAL, g.voyageur.jeton)).rejects.toThrow("refuse");
  });
});
