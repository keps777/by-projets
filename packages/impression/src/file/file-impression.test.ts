import { describe, expect, it, vi } from "vitest";
import { genererBillet, type DonneesBillet } from "../gabarits/billet";
import { genererEtiquette, type DonneesEtiquette } from "../gabarits/etiquette";
import { ServiceImpression } from "../service";
import { PlanificateurManuel, StockageDeTest, attendreMicrotaches } from "../test-outils";
import { TransportFactice, type OptionsTransportFactice } from "../transport/factice";
import { CLE_FILE_IMPRESSION, FileImpression, type OptionsFile } from "./file-impression";

const billet = (sequence: number): DonneesBillet => ({
  compagnie: "ALPHA VOYAGES",
  trajet: "DLA → YDE",
  depart: "05:30 · 05.01.27",
  siege: String(sequence % 40),
  classe: "CLASSIQUE",
  nom: null,
  piece: null,
  qr: `AM1:ALP-DLA-270105-${String(sequence).padStart(4, "0")}:9047`,
  code: "9047",
  numero: `ALP-DLA-270105-${String(sequence).padStart(4, "0")}`,
  pied: "Au quai 20 min avant · afrimove.cm",
});

const etiquette: DonneesEtiquette = {
  trajet: "DLA → BAF",
  destinataire: "Ngo Thérèse · ···· 18 22",
  reference: "C-ALP-DLA-270105-0042",
  poids: "2 kg",
  heure: "08:15",
  mention: "Alpha Voyages · afrimove.cm · pas de code ici",
};

function monter(
  options: {
    transport?: OptionsTransportFactice;
    stockage?: StockageDeTest;
    file?: Partial<OptionsFile>;
  } = {},
) {
  const transport = new TransportFactice(options.transport);
  const stockage = options.stockage ?? new StockageDeTest();
  const plan = new PlanificateurManuel();
  let n = 0;
  let temps = 1_000;
  const file = new FileImpression({
    transport,
    stockage,
    planifier: plan.planifier,
    maintenant: () => (temps += 10),
    identifiant: () => `t${(n += 1)}`,
    ...options.file,
  });
  return { transport, stockage, plan, file };
}

describe("FileImpression", () => {
  it("imprime tout de suite quand l'imprimante est prête", async () => {
    const { file, transport } = monter();
    const { statut, travail } = await file.imprimer("billet", billet(232));
    expect(statut).toBe("imprime");
    expect(travail).toMatchObject({ statut: "imprime", tentatives: 0, reimpression: false });
    expect(transport.envoyes).toEqual([genererBillet(billet(232))]);
    expect(file.instantane().enAttente).toBe(0);
  });

  it("imprime aussi l'étiquette colis", async () => {
    const { file, transport } = monter();
    await file.imprimer("etiquette", etiquette);
    expect(transport.envoyes).toEqual([genererEtiquette(etiquette)]);
  });

  it("garde le travail en file quand l'imprimante est absente, puis le relance seule à son retour", async () => {
    const { file, transport } = monter({ transport: { branchee: false } });
    const { statut, travail } = await file.imprimer("billet", billet(232));
    expect(statut).toBe("en_attente_imprimante");
    expect(travail.statut).toBe("en_attente");
    expect(transport.envoyes).toHaveLength(0);

    transport.brancher();
    await vi.waitFor(() => expect(transport.envoyes).toHaveLength(1));
    expect(transport.envoyes[0]).toEqual(genererBillet(billet(232)));
    await vi.waitFor(() => expect(file.instantane().enAttente).toBe(0));
    expect(file.instantane().travaux[0]?.statut).toBe("imprime");
  });

  it("garde le travail quand l'écriture échoue, puis le relance après une attente", async () => {
    const { file, transport, plan } = monter({ file: { delaisRelanceMs: [2000, 5000] } });
    transport.echouerProchains(1);
    const { statut, travail } = await file.imprimer("billet", billet(232));
    expect(statut).toBe("en_attente_imprimante");
    expect(travail).toMatchObject({
      statut: "en_attente",
      tentatives: 1,
      derniereErreur: "Écriture refusée par l'imprimante",
    });
    expect(plan.delais).toEqual([5000]);

    plan.avancer(5000);
    await vi.waitFor(() => expect(transport.envoyes).toHaveLength(1));
    await vi.waitFor(() => expect(file.instantane().enAttente).toBe(0));
    expect(plan.enAttente).toBe(0);
  });

  it("allonge l'attente tant que l'imprimante est absente, sans dépasser la dernière valeur", async () => {
    const { file, plan } = monter({ transport: { branchee: false } });
    await file.imprimer("billet", billet(1));
    const vus: number[] = [...plan.delais];
    for (let i = 0; i < 5; i += 1) {
      plan.avancer(plan.delais[0] ?? 0);
      await attendreMicrotaches();
      vus.push(...plan.delais);
    }
    expect(vus).toEqual([2000, 5000, 10_000, 30_000, 30_000, 30_000]);
  });

  it("imprime dans l'ordre d'arrivée, même quand plusieurs billets attendaient", async () => {
    const { file, transport } = monter({ transport: { branchee: false } });
    await file.imprimer("billet", billet(1));
    await file.imprimer("etiquette", etiquette);
    await file.imprimer("billet", billet(2));
    expect(file.instantane().enAttente).toBe(3);
    transport.brancher();
    await vi.waitFor(() => expect(transport.envoyes).toHaveLength(3));
    expect(transport.envoyes).toEqual([
      genererBillet(billet(1)),
      genererEtiquette(etiquette),
      genererBillet(billet(2)),
    ]);
  });

  it("n'envoie pas deux billets quand on touche deux fois avant la sortie du papier", async () => {
    const { file, transport } = monter({ transport: { branchee: false } });
    const a = await file.imprimer("billet", billet(232));
    const b = await file.imprimer("billet", billet(232));
    expect(b.travail.id).toBe(a.travail.id);
    transport.brancher();
    await vi.waitFor(() => expect(transport.envoyes).toHaveLength(1));
  });

  it("écrit la file dans le stockage avant d'imprimer", async () => {
    const { file, stockage } = monter({ transport: { branchee: false } });
    await file.imprimer("billet", billet(232));
    const ecrit = JSON.parse(stockage.valeurs.get(CLE_FILE_IMPRESSION) ?? "null");
    expect(ecrit.travaux).toHaveLength(1);
    expect(ecrit.travaux[0]).toMatchObject({
      type: "billet",
      cle: "ALP-DLA-270105-0232",
      statut: "en_attente",
    });
  });

  it("survit au rechargement de la page : la file reprend et s'imprime quand l'imprimante répond", async () => {
    const stockage = new StockageDeTest();
    const avant = monter({ stockage, transport: { branchee: false } });
    await avant.file.imprimer("billet", billet(232));
    await avant.file.imprimer("etiquette", etiquette);
    avant.file.arreter();

    const apres = monter({ stockage, transport: { branchee: false } });
    await apres.file.demarrer();
    expect(apres.file.instantane().enAttente).toBe(2);
    apres.transport.brancher();
    await vi.waitFor(() => expect(apres.transport.envoyes).toHaveLength(2));
    expect(apres.transport.envoyes).toEqual([
      genererBillet(billet(232)),
      genererEtiquette(etiquette),
    ]);
  });

  it("au démarrage, imprime tout de suite ce qui attendait si l'imprimante est déjà là", async () => {
    const stockage = new StockageDeTest();
    const avant = monter({ stockage, transport: { branchee: false } });
    await avant.file.imprimer("billet", billet(232));
    const apres = monter({ stockage });
    await apres.file.demarrer();
    await vi.waitFor(() => expect(apres.transport.envoyes).toHaveLength(1));
  });

  it("réimprime un document déjà sorti : même contenu, marqué réimpression", async () => {
    const { file, transport } = monter();
    const { travail } = await file.imprimer("billet", billet(232));
    const copie = await file.reimprimer(travail.id);
    expect(copie.statut).toBe("imprime");
    expect(copie.travail).toMatchObject({ reimpression: true, cle: travail.cle });
    expect(copie.travail.id).not.toBe(travail.id);
    expect(transport.envoyes).toHaveLength(2);
    expect(transport.envoyes[1]).toEqual(transport.envoyes[0]);
  });

  it("réimprime après un rechargement, depuis l'historique persisté", async () => {
    const stockage = new StockageDeTest();
    const avant = monter({ stockage });
    const { travail } = await avant.file.imprimer("etiquette", etiquette);
    avant.file.arreter();

    const apres = monter({ stockage });
    await apres.file.demarrer();
    await apres.file.reimprimer(travail.id);
    expect(apres.transport.envoyes).toEqual([genererEtiquette(etiquette)]);
  });

  it("réimprimer un travail inconnu échoue clairement", async () => {
    const { file } = monter();
    await expect(file.reimprimer("nope")).rejects.toThrow(/introuvable/);
  });

  it("une réimpression en attente ne se confond pas avec l'original", async () => {
    const { file, transport } = monter();
    const { travail } = await file.imprimer("billet", billet(232));
    transport.debrancher();
    const copie = await file.reimprimer(travail.id);
    expect(copie.statut).toBe("en_attente_imprimante");
    transport.brancher();
    await vi.waitFor(() => expect(transport.envoyes).toHaveLength(2));
  });

  it("ne garde que les derniers documents imprimés, jamais un travail en attente", async () => {
    const { file } = monter({ file: { historiqueMax: 3 } });
    for (let i = 1; i <= 6; i += 1) await file.imprimer("billet", billet(i));
    const imprimes = file.instantane().travaux.filter((t) => t.statut === "imprime");
    expect(imprimes.map((t) => t.cle)).toEqual([
      "ALP-DLA-270105-0004",
      "ALP-DLA-270105-0005",
      "ALP-DLA-270105-0006",
    ]);
  });

  it("met de côté un document dont le gabarit est invalide et passe au suivant", async () => {
    const { file, transport } = monter();
    const invalide = { ...billet(1), code: "90" };
    const a = await file.imprimer("billet", invalide);
    const b = await file.imprimer("billet", billet(2));
    expect(a.travail).toMatchObject({ statut: "echec" });
    expect(a.travail.derniereErreur).toMatch(/4 chiffres/);
    expect(a.statut).toBe("en_attente_imprimante");
    expect(b.statut).toBe("imprime");
    expect(transport.envoyes).toHaveLength(1);
  });

  it("permet d'abandonner un travail en attente, pas un document imprimé", async () => {
    const { file, transport } = monter({ transport: { branchee: false } });
    const { travail } = await file.imprimer("billet", billet(1));
    await file.abandonner(travail.id);
    expect(file.instantane().travaux).toHaveLength(0);
    transport.brancher();
    await attendreMicrotaches();
    expect(transport.envoyes).toHaveLength(0);

    const fait = await file.imprimer("billet", billet(2));
    await file.abandonner(fait.travail.id);
    expect(file.instantane().travaux).toHaveLength(1);
  });

  it("n'écrit jamais un code de retrait dans le stockage, même passé par erreur", async () => {
    const { file, stockage, transport } = monter();
    const empoisonne = { ...etiquette, codeRetrait: "483920" } as DonneesEtiquette;
    await file.imprimer("etiquette", empoisonne);
    expect(JSON.stringify([...stockage.valeurs.values()])).not.toContain("483920");
    expect(transport.envoyes).toEqual([genererEtiquette(etiquette)]);
  });

  it("continue en mémoire quand le stockage est en panne, et démarre avec une file vide", async () => {
    const stockage = new StockageDeTest();
    stockage.enPanne = true;
    const { file, transport } = monter({ stockage });
    const { statut } = await file.imprimer("billet", billet(232));
    expect(statut).toBe("imprime");
    expect(transport.envoyes).toHaveLength(1);
  });

  it("ignore un stockage corrompu", async () => {
    const stockage = new StockageDeTest();
    stockage.valeurs.set(CLE_FILE_IMPRESSION, "{pas du json");
    const { file } = monter({ stockage });
    await file.demarrer();
    expect(file.instantane().travaux).toEqual([]);
    stockage.valeurs.set(CLE_FILE_IMPRESSION, JSON.stringify({ travaux: [{ id: 1 }, null, "x"] }));
    const autre = monter({ stockage });
    await autre.file.demarrer();
    expect(autre.file.instantane().travaux).toEqual([]);
  });

  it("prévient les abonnés à chaque changement de la file", async () => {
    const { file } = monter();
    const ecouteur = vi.fn();
    file.abonner(ecouteur);
    await file.imprimer("billet", billet(1));
    expect(ecouteur).toHaveBeenCalled();
    const avant = file.instantane();
    await file.imprimer("billet", billet(2));
    expect(file.instantane()).not.toBe(avant);
  });
});

describe("ServiceImpression", () => {
  it("expose disponibilité, liaison et file dans un instantané stable", async () => {
    const transport = new TransportFactice({ disponible: false });
    const service = new ServiceImpression({ transport, stockage: new StockageDeTest() });
    expect(service.instantane().disponible).toBe(false);
    expect(service.instantane()).toBe(service.instantane());
    expect(service.instantane().liaison.etat).toBe("indisponible");
  });

  it("démarre, imprime et réimprime", async () => {
    const transport = new TransportFactice();
    const service = new ServiceImpression({ transport, stockage: new StockageDeTest() });
    await service.demarrer();
    const ecouteur = vi.fn();
    service.abonner(ecouteur);
    const avant = service.instantane();
    const { travail } = await service.imprimerBillet(billet(1));
    await service.imprimerEtiquette(etiquette);
    await service.reimprimer(travail.id);
    expect(transport.envoyes).toHaveLength(3);
    expect(ecouteur).toHaveBeenCalled();
    expect(service.instantane()).not.toBe(avant);
  });

  it("appaire depuis une touche puis oublie", async () => {
    const transport = new TransportFactice({ appairee: false });
    const service = new ServiceImpression({ transport, stockage: new StockageDeTest() });
    expect(service.instantane().liaison.etat).toBe("non_appairee");
    await service.appairer();
    expect(service.instantane().liaison.etat).toBe("ok");
    await service.oublier();
    expect(service.instantane().liaison.etat).toBe("non_appairee");
  });
});
