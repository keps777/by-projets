import type { AddressInfo } from "node:net";
import { agence, voyageur } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jetonDeLaDemande } from "./passerelle";
import {
  AUTRE_COMPAGNIE,
  AUTRE_GARE_DOUALA,
  DEPART,
  avec,
  creerAppBilletterieTest,
  especes,
  evenement,
  type AppBilletterieTest,
} from "./testing/app-billetterie-test";

/**
 * Temps réel : le plan des sièges et le quai passent par WebSocket sur le serveur HTTP de
 * l'application. Le client est celui de Node (`WebSocket` global), qui ne pose pas d'en-tête : le
 * jeton passe par `?access_token=`.
 */

let t: AppBilletterieTest;
let port: number;
let v1: { id: string; jeton: string };
let v2: { id: string; jeton: string };
let agent: { id: string; jeton: string };

beforeAll(async () => {
  t = await creerAppBilletterieTest();
  await t.app.listen(0, "127.0.0.1");
  port = (t.app.getHttpServer().address() as AddressInfo).port;
  v1 = await t.compte("voyageur", { nom: "Mireille Kamga" });
  v2 = await t.compte("voyageur", { nom: "Jean Atangana" });
  agent = await t.guichetier();
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

const sieges = (id = DEPART) => `/voyageur/departs/${id}/sieges/direct`;
const bloquer = (siege: number, j: string) =>
  t.http().post(`/voyageur/departs/${DEPART}/sieges/${siege}/blocage`).set(avec(j)).send({});

describe("plan des sièges en temps réel", () => {
  it("envoie le plan à la connexion, puis chaque changement de siège avec la version du plan", async () => {
    const c1 = await ouvrir(sieges(), v1.jeton);
    const c2 = await ouvrir(sieges(), v2.jeton);
    try {
      const plan = voyageur.SchemaMessagePlanSieges.parse(
        await c1.attendre((m) => (m as { type: string }).type === "plan"),
      );
      expect(plan.type).toBe("plan");
      if (plan.type === "plan") expect(plan.plan.sieges).toHaveLength(40);

      expect((await bloquer(12, v1.jeton)).status).toBe(200);
      const vu = (c: Client, etat: string) =>
        c.attendre((m) => {
          const x = m as { type: string; siege?: number; etat?: string };
          return x.type === "siege" && x.siege === 12 && x.etat === etat;
        });
      // Celui qui a bloqué le siège le voit « à moi » ; l'autre le voit « bloqué ».
      const moi = voyageur.SchemaMessagePlanSieges.parse(await vu(c1, "a_moi"));
      const lui = voyageur.SchemaMessagePlanSieges.parse(await vu(c2, "bloque"));
      expect(moi.type === "siege" && moi.jusqua).toBeTruthy();
      expect(lui.type === "siege" && lui.jusqua).toBeTruthy();
      // Personne ne reçoit l'identité de celui qui a bloqué.
      expect(JSON.stringify(c2.messages)).not.toContain(v1.id);

      // Vente au guichet du siège 13 : « pris » pour tout le monde, version en hausse.
      const evt = evenement(
        agence.EVENEMENT_BILLET_VENDU,
        agent.id,
        t.maintenant(),
        {
          billetId: crypto.randomUUID(),
          departId: DEPART,
          siege: 13,
          classe: "classique",
          prix: 4000,
          bagage: 0,
          passager: { nom: "Test Guichet", telephone: null, pieceQuatreDerniers: null },
          paiement: especes(4000),
          codeBillet: "5001",
          sms: false,
        },
        { numeroPlage: 1 },
      );
      expect((await t.http().post("/agence/billets").set(avec(agent.jeton)).send(evt)).status).toBe(
        200,
      );
      const pris = (await c2.attendre((m) => {
        const x = m as { siege?: number; etat?: string };
        return x.siege === 13 && x.etat === "pris";
      })) as { versionPlan: number };
      const bloque = (await vu(c2, "bloque")) as { versionPlan: number };
      expect(pris.versionPlan).toBeGreaterThan(bloque.versionPlan);

      // Un blocage qui expire est diffusé : le siège redevient libre.
      t.horloge.avancer(16 * 60_000);
      await t.services.balayage.balayer();
      const libre = voyageur.SchemaMessagePlanSieges.parse(
        await c2.attendre((m) => {
          const x = m as { siege?: number; etat?: string };
          return x.siege === 12 && x.etat === "libre";
        }),
      );
      expect(libre.type).toBe("siege");
      t.horloge.avancer(-16 * 60_000);
    } finally {
      c1.fermer();
      c2.fermer();
    }
  });

  it("une fois la connexion fermée, plus aucun abonné sur le canal", async () => {
    const c = await ouvrir(sieges(), v1.jeton);
    await c.attendre((m) => (m as { type: string }).type === "plan");
    expect(t.diffusion.nombreAbonnes(`sieges:${DEPART}`)).toBeGreaterThan(0);
    c.fermer();
    const debut = Date.now();
    while (t.diffusion.nombreAbonnes(`sieges:${DEPART}`) > 0 && Date.now() - debut < 2000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(t.diffusion.nombreAbonnes(`sieges:${DEPART}`)).toBe(0);
  });

  it("refuse la connexion sans jeton, avec un faux jeton, ou pour un autre rôle", async () => {
    await expect(ouvrir(sieges(), null)).rejects.toThrow("refuse");
    await expect(ouvrir(sieges(), "faux.jeton.ici")).rejects.toThrow("refuse");
    await expect(ouvrir(sieges(), agent.jeton)).rejects.toThrow("refuse");
    await expect(ouvrir(sieges("inconnu"), v1.jeton)).rejects.toThrow("refuse");
  });
});

describe("quai en temps réel", () => {
  it("diffuse chaque scan et le compte des embarqués au quai du départ", async () => {
    const quai = await ouvrir(`/agence/quai/${DEPART}/direct`, agent.jeton);
    try {
      const vente = evenement(
        agence.EVENEMENT_BILLET_VENDU,
        agent.id,
        t.maintenant(),
        {
          billetId: crypto.randomUUID(),
          departId: DEPART,
          siege: 20,
          classe: "classique",
          prix: 4000,
          bagage: 0,
          passager: { nom: "Aminatou Fotso", telephone: null, pieceQuatreDerniers: "4821" },
          paiement: especes(4000),
          codeBillet: "5002",
          sms: false,
        },
        { numeroPlage: 2 },
      );
      const v = await t.http().post("/agence/billets").set(avec(agent.jeton)).send(vente);
      const scan = evenement(agence.EVENEMENT_QUAI_SCANNE, agent.id, t.maintenant(), {
        departId: DEPART,
        qr: v.body.billet.qr,
      });
      expect(
        (await t.http().post("/agence/quai/scans").set(avec(agent.jeton)).send(scan)).status,
      ).toBe(200);
      const m = agence.SchemaMessageQuai.parse(
        await quai.attendre((x) => (x as { scan: unknown }).scan !== null),
      );
      expect(m.scan?.resultat).toBe("monte");
      expect(m.scan?.voyageur).toBe("Aminatou Fotso");
      expect(m.embarques).toBeGreaterThanOrEqual(1);
      expect(m.capacite).toBe(40);
    } finally {
      quai.fermer();
    }
  });

  it("refuse les voyageurs et les agents d'une autre compagnie", async () => {
    await expect(ouvrir(`/agence/quai/${DEPART}/direct`, v1.jeton)).rejects.toThrow("refuse");
    await expect(ouvrir(`/agence/quai/${DEPART}/direct`, null)).rejects.toThrow("refuse");
    const autre = await t.compte("guichetier", {
      compagnieId: AUTRE_COMPAGNIE,
      gareId: AUTRE_GARE_DOUALA,
    });
    await expect(ouvrir(`/agence/quai/${DEPART}/direct`, autre.jeton)).rejects.toThrow("refuse");
  });
});

describe("jetonDeLaDemande", () => {
  it("lit l'en-tête Authorization, sinon le paramètre access_token", () => {
    expect(jetonDeLaDemande({ headers: { authorization: "Bearer abc.def" }, url: "/x" })).toBe(
      "abc.def",
    );
    expect(jetonDeLaDemande({ headers: {}, url: "/x?access_token=uvw.xyz" })).toBe("uvw.xyz");
    expect(jetonDeLaDemande({ headers: {}, url: "/x" })).toBeNull();
    expect(jetonDeLaDemande({ headers: { authorization: "Basic abc" }, url: "/x" })).toBeNull();
    expect(jetonDeLaDemande({ headers: {}, url: "/x?access_token=a b<script>" })).toBeNull();
  });
});
