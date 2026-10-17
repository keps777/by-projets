import { describe, expect, it, vi } from "vitest";
import { genererBillet } from "../gabarits/billet";
import { PlanificateurManuel, StockageDeTest } from "../test-outils";
import { TransportFactice } from "./factice";
import { ErreurTransport, decouperEnPaquets } from "./transport";
import {
  CLE_IMPRIMANTE_APPAIREE,
  SERVICES_IMPRIMANTES_BLE,
  TransportWebBluetooth,
  bluetoothDisponible,
  type Bluetooth,
  type CaracteristiqueGatt,
  type PeripheriqueBluetooth,
} from "./web-bluetooth";

class FausseCaracteristique implements CaracteristiqueGatt {
  readonly ecritures: Uint8Array[] = [];
  echec: Error | null = null;
  constructor(
    readonly uuid: string,
    readonly properties: { write: boolean; writeWithoutResponse: boolean },
    private readonly journal: string[] = [],
  ) {}
  async writeValueWithoutResponse(valeur: Uint8Array) {
    if (this.echec) throw this.echec;
    this.journal.push("sans-reponse");
    this.ecritures.push(Uint8Array.from(valeur));
  }
  async writeValueWithResponse(valeur: Uint8Array) {
    if (this.echec) throw this.echec;
    this.journal.push("avec-reponse");
    this.ecritures.push(Uint8Array.from(valeur));
  }
}

class FauxPeripherique implements PeripheriqueBluetooth {
  readonly ecouteurs = new Set<() => void>();
  connexions = 0;
  refuser = false;
  readonly gatt: PeripheriqueBluetooth["gatt"];
  constructor(
    readonly id: string,
    readonly name: string | undefined,
    caracteristiques: CaracteristiqueGatt[],
  ) {
    const serveur = {
      connected: false,
      connect: async () => {
        this.connexions += 1;
        if (this.refuser) throw new Error("hors de portée");
        serveur.connected = true;
        return serveur;
      },
      disconnect: () => {
        serveur.connected = false;
      },
      getPrimaryServices: async () => [
        {
          uuid: "0000ff00-0000-1000-8000-00805f9b34fb",
          getCharacteristics: async () => caracteristiques,
        },
      ],
    };
    this.gatt = serveur;
  }
  addEventListener(_type: "gattserverdisconnected", ecouteur: () => void) {
    this.ecouteurs.add(ecouteur);
  }
  removeEventListener(_type: "gattserverdisconnected", ecouteur: () => void) {
    this.ecouteurs.delete(ecouteur);
  }
  /** L'imprimante s'éteint ou sort de portée. */
  coupe() {
    if (this.gatt) this.gatt.connected = false;
    for (const e of [...this.ecouteurs]) e();
  }
}

function monter(
  options: {
    caracteristiques?: CaracteristiqueGatt[];
    getDevices?: boolean;
    refus?: Error;
  } = {},
) {
  const journal: string[] = [];
  const ecriture = new FausseCaracteristique(
    "0000ff02-0000-1000-8000-00805f9b34fb",
    { write: true, writeWithoutResponse: true },
    journal,
  );
  const peripherique = new FauxPeripherique(
    "id-pt210",
    "PT-210",
    options.caracteristiques ?? [ecriture],
  );
  const demandes: unknown[] = [];
  const bluetooth: Bluetooth = {
    requestDevice: async (o) => {
      demandes.push(o);
      if (options.refus) throw options.refus;
      return peripherique;
    },
    ...(options.getDevices ? { getDevices: async () => [peripherique] } : {}),
  };
  const plan = new PlanificateurManuel();
  const attentes: number[] = [];
  const stockage = new StockageDeTest();
  const transport = new TransportWebBluetooth({
    bluetooth,
    stockage,
    planifier: plan.planifier,
    attendre: async (ms) => {
      attentes.push(ms);
    },
    taillePaquet: 100,
    delaiEntrePaquetsMs: 10,
  });
  return {
    transport,
    peripherique,
    ecriture,
    demandes,
    plan,
    attentes,
    stockage,
    journal,
    bluetooth,
  };
}

describe("découpage en paquets BLE", () => {
  it("coupe en paquets de la taille demandée, sans perdre un octet", () => {
    const octets = Uint8Array.from({ length: 250 }, (_, i) => i % 256);
    const paquets = decouperEnPaquets(octets, 100);
    expect(paquets.map((p) => p.length)).toEqual([100, 100, 50]);
    expect(Uint8Array.from(paquets.flatMap((p) => [...p]))).toEqual(octets);
  });

  it("ne produit aucun paquet pour un envoi vide et refuse une taille invalide", () => {
    expect(decouperEnPaquets(new Uint8Array(), 20)).toEqual([]);
    expect(() => decouperEnPaquets(new Uint8Array(3), 0)).toThrow();
  });
});

describe("TransportFactice", () => {
  it("enregistre les envois et suit l'état de l'imprimante", async () => {
    const t = new TransportFactice();
    const etats: string[] = [];
    t.abonner(() => etats.push(t.instantane().etat));
    expect(t.instantane().etat).toBe("ok");
    await t.envoyer(Uint8Array.of(1, 2, 3));
    expect(t.envoyes).toEqual([Uint8Array.of(1, 2, 3)]);
    t.debrancher();
    await expect(t.envoyer(Uint8Array.of(4))).rejects.toMatchObject({ code: "absente" });
    t.brancher();
    expect(etats).toEqual(["deconnectee", "ok"]);
  });

  it("peut simuler Safari iOS : indisponible", async () => {
    const t = new TransportFactice({ disponible: false });
    expect(t.disponible).toBe(false);
    expect(t.instantane().etat).toBe("indisponible");
    await expect(t.appairer()).rejects.toBeInstanceOf(ErreurTransport);
  });

  it("démarre non appairé, s'appaire, puis oublie", async () => {
    const t = new TransportFactice({ appairee: false });
    expect(t.instantane().etat).toBe("non_appairee");
    await t.appairer();
    expect(t.instantane().etat).toBe("ok");
    await t.oublier();
    expect(t.instantane().etat).toBe("non_appairee");
  });

  it("fait échouer les n prochaines écritures", async () => {
    const t = new TransportFactice();
    t.echouerProchains(1);
    await expect(t.envoyer(Uint8Array.of(1))).rejects.toMatchObject({ code: "ecriture" });
    await t.envoyer(Uint8Array.of(2));
    expect(t.envoyes).toHaveLength(1);
  });
});

describe("TransportWebBluetooth", () => {
  it("détecte Web Bluetooth : absent sur Safari iOS", () => {
    expect(bluetoothDisponible({})).toBe(false);
    expect(bluetoothDisponible(undefined)).toBe(false);
    expect(bluetoothDisponible({ bluetooth: {} })).toBe(true);
    const sansBluetooth = new TransportWebBluetooth({ bluetooth: null });
    expect(sansBluetooth.disponible).toBe(false);
    expect(sansBluetooth.instantane().etat).toBe("indisponible");
  });

  it("refuse d'appairer ou d'envoyer sans Web Bluetooth", async () => {
    const t = new TransportWebBluetooth({ bluetooth: null });
    await expect(t.appairer()).rejects.toMatchObject({ code: "indisponible" });
    await expect(t.envoyer(Uint8Array.of(1))).rejects.toMatchObject({ code: "indisponible" });
    expect(await t.reconnecter()).toBe(false);
  });

  it("s'appaire : demande les services d'imprimante, se connecte, passe à « ok »", async () => {
    const { transport, demandes, stockage } = monter();
    expect(transport.instantane().etat).toBe("non_appairee");
    await transport.appairer();
    expect(transport.instantane()).toMatchObject({
      etat: "ok",
      imprimante: { id: "id-pt210", nom: "PT-210" },
      erreur: null,
    });
    expect(demandes).toEqual([
      { acceptAllDevices: true, optionalServices: SERVICES_IMPRIMANTES_BLE },
    ]);
    expect(SERVICES_IMPRIMANTES_BLE).toContain("000018f0-0000-1000-8000-00805f9b34fb");
    expect(JSON.parse(stockage.valeurs.get(CLE_IMPRIMANTE_APPAIREE) ?? "null")).toEqual({
      id: "id-pt210",
      nom: "PT-210",
    });
  });

  it("l'appairage annulé par l'agent ne change rien", async () => {
    const annule = Object.assign(new Error("User cancelled"), { name: "NotFoundError" });
    const { transport } = monter({ refus: annule });
    await expect(transport.appairer()).rejects.toMatchObject({ code: "annule" });
    expect(transport.instantane().etat).toBe("non_appairee");
  });

  it("découpe l'envoi en paquets de 100 octets avec une pause entre deux", async () => {
    const { transport, ecriture, attentes, journal } = monter();
    await transport.appairer();
    const octets = Uint8Array.from({ length: 250 }, (_, i) => i % 251);
    await transport.envoyer(octets);
    expect(ecriture.ecritures.map((e) => e.length)).toEqual([100, 100, 50]);
    expect(Uint8Array.from(ecriture.ecritures.flatMap((e) => [...e]))).toEqual(octets);
    expect(attentes).toEqual([10, 10]);
    expect(new Set(journal)).toEqual(new Set(["sans-reponse"]));
  });

  it("un billet complet part en moins de 2 s de pauses (estimation hors latence radio)", async () => {
    const { transport, ecriture, attentes } = monter();
    await transport.appairer();
    const billet = genererBillet({
      compagnie: "ALPHA VOYAGES",
      trajet: "DLA → YDE",
      depart: "05:30 · 05.01.27",
      siege: "19",
      classe: "CLASSIQUE",
      nom: null,
      piece: null,
      qr: "AM1:ALP-DLA-270105-0232:9047",
      code: "9047",
      numero: "ALP-DLA-270105-0232",
      pied: "Au quai 20 min avant · afrimove.cm",
    });
    await transport.envoyer(billet);
    expect(ecriture.ecritures.length).toBe(Math.ceil(billet.length / 100));
    expect(attentes.reduce((a, b) => a + b, 0)).toBeLessThan(1000);
  });

  it("écrit avec réponse quand la caractéristique n'accepte pas l'écriture sans réponse", async () => {
    const journal: string[] = [];
    const seule = new FausseCaracteristique(
      "0000ff02",
      { write: true, writeWithoutResponse: false },
      journal,
    );
    const { transport } = monter({ caracteristiques: [seule] });
    await transport.appairer();
    await transport.envoyer(Uint8Array.of(1, 2, 3));
    expect(journal).toEqual(["avec-reponse"]);
  });

  it("signale un appareil sans caractéristique d'écriture", async () => {
    const lecture = new FausseCaracteristique("0000ff03", {
      write: false,
      writeWithoutResponse: false,
    });
    const { transport } = monter({ caracteristiques: [lecture] });
    await expect(transport.appairer()).rejects.toMatchObject({ code: "protocole" });
    expect(transport.instantane().etat).toBe("deconnectee");
  });

  it("sérialise les envois : un document n'en coupe pas un autre", async () => {
    const { transport, ecriture } = monter();
    await transport.appairer();
    await Promise.all([
      transport.envoyer(new Uint8Array(150).fill(1)),
      transport.envoyer(new Uint8Array(150).fill(2)),
    ]);
    expect(ecriture.ecritures.map((e) => e[0])).toEqual([1, 1, 2, 2]);
  });

  it("une écriture refusée passe à « erreur » sans perdre la liaison", async () => {
    const { transport, ecriture } = monter();
    await transport.appairer();
    ecriture.echec = new Error("GATT operation failed");
    await expect(transport.envoyer(Uint8Array.of(1))).rejects.toMatchObject({ code: "ecriture" });
    expect(transport.instantane()).toMatchObject({
      etat: "erreur",
      erreur: "GATT operation failed",
    });
    ecriture.echec = null;
    await transport.envoyer(Uint8Array.of(1));
    expect(transport.instantane().etat).toBe("ok");
  });

  it("repère la perte de l'imprimante et se reconnecte seule, avec une attente croissante", async () => {
    const { transport, peripherique, plan } = monter();
    await transport.appairer();
    const etats: string[] = [];
    transport.abonner(() => etats.push(transport.instantane().etat));

    peripherique.refuser = true;
    peripherique.coupe();
    expect(transport.instantane().etat).toBe("deconnectee");
    await expect(transport.envoyer(Uint8Array.of(1))).rejects.toMatchObject({ code: "absente" });
    expect(plan.delais).toEqual([1000]);

    plan.avancer(1000);
    await vi.waitFor(() => expect(plan.delais).toEqual([2000]));
    plan.avancer(2000);
    await vi.waitFor(() => expect(plan.delais).toEqual([5000]));

    peripherique.refuser = false;
    plan.avancer(5000);
    await vi.waitFor(() => expect(transport.instantane().etat).toBe("ok"));
    expect(plan.enAttente).toBe(0);
    expect(etats).toContain("connexion");
  });

  it("retrouve l'imprimante déjà autorisée après un rechargement, sans geste", async () => {
    const { transport, stockage, bluetooth, peripherique } = monter({ getDevices: true });
    await transport.appairer();
    const apres = new TransportWebBluetooth({ bluetooth, stockage });
    expect(apres.instantane().etat).toBe("non_appairee");
    peripherique.gatt!.connected = false;
    expect(await apres.reconnecter()).toBe(true);
    expect(apres.instantane()).toMatchObject({ etat: "ok", imprimante: { nom: "PT-210" } });
  });

  it("sans getDevices (navigateur plus ancien), demande de réappairer", async () => {
    const { transport, stockage, bluetooth } = monter();
    await transport.appairer();
    const apres = new TransportWebBluetooth({ bluetooth, stockage });
    expect(await apres.reconnecter()).toBe(false);
    expect(apres.instantane().etat).toBe("non_appairee");
  });

  it("oublie l'imprimante : plus de reconnexion, stockage vidé", async () => {
    const { transport, peripherique, plan, stockage } = monter();
    await transport.appairer();
    peripherique.refuser = true;
    peripherique.coupe();
    await transport.oublier();
    expect(plan.enAttente).toBe(0);
    expect(transport.instantane()).toMatchObject({ etat: "non_appairee", imprimante: null });
    expect(stockage.valeurs.has(CLE_IMPRIMANTE_APPAIREE)).toBe(false);
    expect(peripherique.ecouteurs.size).toBe(0);
  });
});
