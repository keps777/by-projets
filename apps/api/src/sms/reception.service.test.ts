import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecuInvalide } from "./fournisseur";
import { FournisseurInconnu } from "./reception.service";
import { monterSms, VARIABLES_BILLET, type MontageSms } from "./testing/montage";

const TEL = "+237655012345";
let m: MontageSms;

beforeEach(() => {
  m = monterSms({ avecSecours: true });
  vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

async function envoyer() {
  const { message } = await m.passerelle.envoyer({
    type: "billet",
    variables: VARIABLES_BILLET,
    destinataire: TEL,
    compagnieId: "c1",
  });
  await m.vider();
  const parti = await m.journal.trouver(message.id);
  return { id: message.id, idFournisseur: parti!.idFournisseur! };
}

const recu = (
  fournisseur: "principal" | "secours",
  ...r: Parameters<MontageSms["principal"]["fabriquerRecu"]>[0][number][]
) => (fournisseur === "principal" ? m.principal : m.secours!).fabriquerRecu(r);

describe("accusés de livraison", () => {
  it("envoyé → livré", async () => {
    const { id, idFournisseur } = await envoyer();
    m.horloge.avancer(4000);
    const resume = await m.reception.traiter(
      "principal",
      recu("principal", { idFournisseur, etat: "livre" }),
    );
    expect(resume).toEqual({ recus: 1, appliques: 1, ignores: 0, inconnus: 0 });
    expect(await m.journal.trouver(id)).toMatchObject({
      statut: "livre",
      livreA: m.horloge.maintenant(),
      coutFcfa: 12,
    });
  });

  it("non livré : le code de l'opérateur est gardé, le SMS reste facturé", async () => {
    const { id, idFournisseur } = await envoyer();
    await m.reception.traiter(
      "principal",
      recu("principal", { idFournisseur, etat: "non_livre", code: "telephone_eteint" }),
    );
    expect(await m.journal.trouver(id)).toMatchObject({
      statut: "non_livre",
      derniereErreur: "telephone_eteint",
      coutFcfa: 12,
    });
    const r = await m.statistiques.couts();
    expect(r.total).toMatchObject({ nonLivres: 1, envoyes: 1, coutFcfa: 12 });
  });

  it("un accusé rejoué est ignoré", async () => {
    const { idFournisseur } = await envoyer();
    const r = recu("principal", { idFournisseur, etat: "livre" });
    await m.reception.traiter("principal", r);
    expect(await m.reception.traiter("principal", r)).toMatchObject({ appliques: 0, ignores: 1 });
  });

  it("jamais de retour en arrière : « envoyé » après « livré » est ignoré, un statut final est définitif", async () => {
    const { id, idFournisseur } = await envoyer();
    await m.reception.traiter("principal", recu("principal", { idFournisseur, etat: "livre" }));
    const tard = await m.reception.traiter(
      "principal",
      recu("principal", { idFournisseur, etat: "envoye" }),
    );
    expect(tard.ignores).toBe(1);
    const contraire = await m.reception.traiter(
      "principal",
      recu("principal", { idFournisseur, etat: "non_livre", code: "x" }),
    );
    expect(contraire.ignores).toBe(1);
    expect((await m.journal.trouver(id))?.statut).toBe("livre");
  });

  it("plusieurs accusés dans un même appel, dont un message inconnu", async () => {
    const a = await envoyer();
    const resume = await m.reception.traiter(
      "principal",
      recu(
        "principal",
        { idFournisseur: a.idFournisseur, etat: "livre" },
        { idFournisseur: "inconnu-42", etat: "livre" },
      ),
    );
    expect(resume).toEqual({ recus: 2, appliques: 1, ignores: 0, inconnus: 1 });
  });

  it("l'accusé qui devance l'enregistrement de l'envoi est retrouvé par la référence", async () => {
    const { message } = await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: TEL,
    });
    // le message est encore en file : le fournisseur a déjà répondu à un appel dont on n'a pas la réponse
    await m.reception.traiter(
      "principal",
      recu("principal", { idFournisseur: "sim-vite", etat: "livre", reference: message.id }),
    );
    expect(await m.journal.trouver(message.id)).toMatchObject({
      statut: "livre",
      fournisseur: "principal",
      idFournisseur: "sim-vite",
      coutFcfa: 12,
    });
    // le travail de la file se réveille ensuite : le message est déjà livré, il n'est pas renvoyé
    await m.vider();
    expect(m.principal.appels).toBe(0);
  });

  it("un accusé de livraison sur un message vu en échec fait foi (réponse perdue)", async () => {
    m.principal.mettreEnPanne();
    m.secours!.mettreEnPanne();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { message } = await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: TEL,
    });
    await m.vider();
    expect((await m.journal.trouver(message.id))?.statut).toBe("echec");
    await m.reception.traiter(
      "secours",
      recu("secours", { idFournisseur: "s-9", etat: "livre", reference: message.id }),
    );
    expect(await m.journal.trouver(message.id)).toMatchObject({ statut: "livre", coutFcfa: 12 });
  });

  it("un accusé ne s'applique qu'au fournisseur qui a envoyé le message", async () => {
    const { id } = await envoyer(); // parti par le principal
    const resume = await m.reception.traiter(
      "secours",
      recu("secours", { idFournisseur: "s-1", etat: "livre", reference: id }),
    );
    expect(resume.inconnus).toBe(1);
    expect((await m.journal.trouver(id))?.statut).toBe("envoye");
  });
});

describe("authenticité", () => {
  it("refuse un appel mal signé sans toucher au journal", async () => {
    const { id, idFournisseur } = await envoyer();
    const faux = m.principal.fabriquerRecu([{ idFournisseur, etat: "livre" }], {
      secret: "pirate",
    });
    await expect(m.reception.traiter("principal", faux)).rejects.toBeInstanceOf(RecuInvalide);
    expect((await m.journal.trouver(id))?.statut).toBe("envoye");
  });

  it("refuse un appel périmé", async () => {
    const { idFournisseur } = await envoyer();
    const vieux = m.principal.fabriquerRecu([{ idFournisseur, etat: "livre" }]);
    m.horloge.avancer(10 * 60_000);
    await expect(m.reception.traiter("principal", vieux)).rejects.toMatchObject({
      raison: "horodatage",
    });
  });

  it("refuse un fournisseur inconnu", async () => {
    await expect(
      m.reception.traiter("pirate", m.principal.fabriquerRecu([])),
    ).rejects.toBeInstanceOf(FournisseurInconnu);
  });
});
