import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { empreinteDuJeton } from "./liens.service";
import {
  AFRIMOVE,
  AUTRE_VOYAGEUR,
  COMPAGNIE,
  DEBUT,
  TEL_MTN,
  TEL_ORANGE,
  VOYAGEUR,
  commandeType,
  monterPaiements,
  type Montage,
} from "./testing/montage";

const json = (valeur: unknown) =>
  JSON.stringify(valeur, (_cle, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

/** Le jeton est le dernier segment de l'adresse. */
const jetonDe = (url: string): string => url.slice(url.lastIndexOf("/") + 1);

const TEL_PROCHE = "+237677012345";

function avecProche(t: Montage) {
  t.proches.ajouter(VOYAGEUR.id, { id: "proche-1", nom: "Paul", telephone: TEL_PROCHE });
  t.proches.ajouter(VOYAGEUR.id, { id: "proche-2", nom: "Sans numéro", telephone: null });
}

describe("créer un lien de paiement pour un proche", () => {
  it("lien à jeton secret : seule l'empreinte est gardée, il expire avec la commande", async () => {
    const t = monterPaiements();
    const lien = await t.liensService.creer(VOYAGEUR, "commande-1", {});

    expect(lien.url).toMatch(/^https:\/\/afrimove\.app\/payer\/[A-Za-z0-9_-]{43}$/);
    expect(lien.commandeId).toBe("commande-1");
    expect(lien.expireA).toBe("2027-01-05T08:15:00.000+01:00");
    expect(lien.envoyeA).toBeUndefined();

    const jeton = jetonDe(lien.url);
    const [stocke] = t.liens.tous();
    expect(stocke).toMatchObject({
      commandeId: "commande-1",
      empreinte: empreinteDuJeton(jeton),
      creePar: VOYAGEUR.id,
      envoyeA: null,
      revoqueA: null,
    });
    expect(stocke!.expireA).toEqual(new Date(DEBUT.getTime() + 15 * 60_000));
    // le jeton lui-même n'est nulle part : ni en base, ni dans le journal d'audit
    expect(json(t.liens.tous())).not.toContain(jeton);
    expect(json(t.auditRepo.lignes)).not.toContain(jeton);
    expect(t.actions()).toContain("paiement.lien_proche_cree");
    expect(t.notifieur.envoyes).toEqual([]);
  });

  it("deux liens n'ont pas le même jeton", async () => {
    const t = monterPaiements();
    const a = await t.liensService.creer(VOYAGEUR, "commande-1", {});
    const b = await t.liensService.creer(VOYAGEUR, "commande-1", {});
    expect(jetonDe(a.url)).not.toBe(jetonDe(b.url));
  });

  it("proche enregistré : le SMS part avec le trajet, le prix et le lien", async () => {
    const t = monterPaiements();
    avecProche(t);
    const lien = await t.liensService.creer(VOYAGEUR, "commande-1", { procheId: "proche-1" });

    expect(lien.envoyeA).toBe(TEL_PROCHE);
    expect(t.notifieur.envoyes).toHaveLength(1);
    const sms = t.notifieur.envoyes[0]!;
    expect(sms).toMatchObject({
      telephone: TEL_PROCHE,
      compagnieId: COMPAGNIE,
      demandeurId: VOYAGEUR.id,
      commandeId: "commande-1",
    });
    // le gabarit SMS « système » refuse les adresses complètes : le lien part sans « https:// »
    expect(sms.texte).toBe(
      `AfriMove : Aïcha vous demande de payer son voyage Alpha Voyages · Douala → Yaoundé · 14:00 (4 250 F). Payer : ${lien.url.replace("https://", "")}`,
    );
    expect(sms.texte).not.toContain("://");
    // le numéro du proche n'est gardé qu'à l'état masqué
    expect(t.liens.tous()[0]!.envoyeA).toBe("+237 ••••• 345");
    expect(json(t.liens.tous())).not.toContain("677012345");
    expect(json(t.auditRepo.lignes)).not.toContain("677012345");
  });

  it("un nom de compte ne peut pas glisser une adresse dans le SMS", async () => {
    const t = monterPaiements();
    t.annuaire.ajouter(VOYAGEUR.id, TEL_ORANGE, "Arnaque.cc/gagne 2000");
    await t.liensService.creer(VOYAGEUR, "commande-1", { telephone: TEL_PROCHE });
    const texte = t.notifieur.envoyes[0]!.texte;
    expect(texte.startsWith("AfriMove : Arnaqueccgagne vous demande")).toBe(true);
    // la seule adresse du message est celle du lien de paiement
    expect(texte.match(/[a-z]+\.[a-z]+\//g)).toEqual(["afrimove.app/"]);
  });

  it("numéro saisi : normalisé avant l'envoi", async () => {
    const t = monterPaiements();
    const lien = await t.liensService.creer(VOYAGEUR, "commande-1", { telephone: "6 77 01 23 45" });
    expect(lien.envoyeA).toBe(TEL_PROCHE);
    expect(t.notifieur.envoyes[0]!.telephone).toBe(TEL_PROCHE);
  });

  it("proche inconnu, sans numéro, numéro invalide : refusé net", async () => {
    const t = monterPaiements();
    avecProche(t);
    await expect(
      t.liensService.creer(VOYAGEUR, "commande-1", { procheId: "inconnu" }),
    ).rejects.toMatchObject({ code: "PROCHE_INCONNU" });
    await expect(
      t.liensService.creer(VOYAGEUR, "commande-1", { procheId: "proche-2" }),
    ).rejects.toMatchObject({ code: "PROCHE_SANS_TELEPHONE" });
    await expect(
      t.liensService.creer(VOYAGEUR, "commande-1", { telephone: "abc" }),
    ).rejects.toMatchObject({ code: "TELEPHONE_INVALIDE" });
    expect(t.liens.tous()).toEqual([]);
  });

  it("le proche d'un autre voyageur n'est pas accessible", async () => {
    const t = monterPaiements();
    avecProche(t);
    t.commandes.ajouter(commandeType({ id: "commande-2", voyageurId: AUTRE_VOYAGEUR.id }));
    await expect(
      t.liensService.creer(AUTRE_VOYAGEUR, "commande-2", { procheId: "proche-1" }),
    ).rejects.toMatchObject({ code: "PROCHE_INCONNU" });
  });

  it("SMS en échec : le lien existe quand même (le voyageur le copie), l'échec est audité", async () => {
    const t = monterPaiements();
    t.notifieur.echec = new Error("passerelle SMS en panne");
    const lien = await t.liensService.creer(VOYAGEUR, "commande-1", { telephone: TEL_PROCHE });

    expect(lien.envoyeA).toBeUndefined();
    expect(lien.url).toContain("https://afrimove.app/payer/");
    expect(t.actions()).toContain("paiement.lien_proche_sms_echec");
  });

  it("quota de SMS dépassé (429) : l'erreur remonte pour que l'écran le dise", async () => {
    const t = monterPaiements();
    t.notifieur.echec = new HttpException("Trop de messages", 429);
    await expect(
      t.liensService.creer(VOYAGEUR, "commande-1", { telephone: TEL_PROCHE }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("refus : commande d'un autre, déjà payée, expirée, compagnie sans compte, mode dégradé", async () => {
    const t = monterPaiements();
    await expect(t.liensService.creer(AUTRE_VOYAGEUR, "commande-1", {})).rejects.toMatchObject({
      code: "COMMANDE_INCONNUE",
    });
    await expect(t.liensService.creer(VOYAGEUR, "inconnue", {})).rejects.toMatchObject({
      code: "COMMANDE_INCONNUE",
    });

    t.commandes.modifier("commande-1", { statut: "payee" });
    await expect(t.liensService.creer(VOYAGEUR, "commande-1", {})).rejects.toMatchObject({
      code: "COMMANDE_DEJA_PAYEE",
    });

    t.commandes.modifier("commande-1", { statut: "en_attente_paiement" });
    t.horloge.avancer(16 * 60_000);
    await expect(t.liensService.creer(VOYAGEUR, "commande-1", {})).rejects.toMatchObject({
      code: "COMMANDE_EXPIREE",
    });

    const sansCompte = monterPaiements({ sansCompte: true });
    await expect(sansCompte.liensService.creer(VOYAGEUR, "commande-1", {})).rejects.toMatchObject({
      code: "COMPAGNIE_SANS_COMPTE",
    });

    const degrade = monterPaiements();
    await degrade.mode.definir(AFRIMOVE, true, "panne");
    await expect(degrade.liensService.creer(VOYAGEUR, "commande-1", {})).rejects.toMatchObject({
      code: "MODE_DEGRADE",
    });
  });
});

describe("ce que le proche voit et peut faire", () => {
  it("aperçu : trajet, prix, prénom du voyageur, rien d'autre", async () => {
    const t = monterPaiements();
    const lien = await t.liensService.creer(VOYAGEUR, "commande-1", {});
    const apercu = await t.liensService.apercu(jetonDe(lien.url));

    expect(apercu).toEqual({
      libelle: "Alpha Voyages · Douala → Yaoundé · 14:00",
      voyageur: "Aïcha",
      lignes: [
        { code: "billet", libelle: "Billet", montant: 4000 },
        { code: "frais_voyageur", libelle: "Frais de service", montant: 250 },
      ],
      total: 4250,
      statut: "en_attente_paiement",
      expireA: "2027-01-05T08:15:00.000+01:00",
      payable: true,
      modeDegrade: false,
    });
    const brut = json(apercu);
    expect(brut).not.toContain(VOYAGEUR.id);
    expect(brut).not.toContain("677012345");
    expect(brut).not.toContain("691221008");
  });

  it("jeton inconnu, mal formé ou deviné : même réponse, rien ne fuit", async () => {
    const t = monterPaiements();
    await t.liensService.creer(VOYAGEUR, "commande-1", {});
    for (const faux of ["x", "", "a".repeat(43), "../../etc/passwd", "a".repeat(200)]) {
      await expect(t.liensService.apercu(faux)).rejects.toMatchObject({
        code: "LIEN_INCONNU",
        status: 404,
      });
      await expect(
        t.liensService.payer(faux, { moyen: "mtn_momo", telephone: TEL_MTN }),
      ).rejects.toMatchObject({ code: "LIEN_INCONNU" });
    }
    expect(t.agregateur.appelsEncaissement).toBe(0);
  });

  it("un nouveau lien révoque le précédent", async () => {
    const t = monterPaiements();
    const ancien = await t.liensService.creer(VOYAGEUR, "commande-1", {});
    const nouveau = await t.liensService.creer(VOYAGEUR, "commande-1", {});

    await expect(t.liensService.apercu(jetonDe(ancien.url))).rejects.toMatchObject({
      code: "LIEN_INCONNU",
    });
    await expect(
      t.liensService.payer(jetonDe(ancien.url), { moyen: "mtn_momo", telephone: TEL_MTN }),
    ).rejects.toMatchObject({ code: "LIEN_INCONNU" });
    expect((await t.liensService.apercu(jetonDe(nouveau.url))).payable).toBe(true);
  });

  it("le proche paie : le voyageur reçoit son billet, le paiement garde la trace du lien", async () => {
    const t = monterPaiements();
    const lien = await t.liensService.creer(VOYAGEUR, "commande-1", {});
    const jeton = jetonDe(lien.url);

    const p = await t.liensService.payer(jeton, { moyen: "orange_money", telephone: TEL_ORANGE });
    expect(p).toMatchObject({
      origine: "proche",
      commandeId: "commande-1",
      voyageurId: VOYAGEUR.id,
      moyen: "orange_money",
      montant: 4250,
      statut: "en_attente",
    });

    await t.encaissements.traiterNotifications("simule", t.agregateur.notificationDeReussite(p.id));
    expect(t.commandes.confirmations).toEqual([{ commandeId: "commande-1", moyen: "proche" }]);
    expect((await t.commandes.trouver("commande-1"))!.statut).toBe("payee");

    const suivi = await t.liensService.statutPaiement(jeton, p.id);
    expect(suivi).toMatchObject({ id: p.id, statut: "reussi", confirmation: "faite" });
    // le lien ne sert plus une fois la commande payée
    await expect(
      t.liensService.payer(jeton, { moyen: "mtn_momo", telephone: TEL_MTN }),
    ).rejects.toMatchObject({ code: "COMMANDE_DEJA_PAYEE" });
    expect((await t.liensService.apercu(jeton)).payable).toBe(false);
  });

  it("le proche doit donner lui-même son numéro, ne peut pas choisir « proche » comme moyen", async () => {
    const t = monterPaiements();
    const lien = await t.liensService.creer(VOYAGEUR, "commande-1", {});
    const jeton = jetonDe(lien.url);
    await expect(t.liensService.payer(jeton, { moyen: "mtn_momo" })).rejects.toMatchObject({
      code: "TELEPHONE_REQUIS",
    });
    await expect(t.liensService.payer(jeton, { moyen: "proche" })).rejects.toMatchObject({
      code: "MOYEN_INVALIDE",
    });
    expect(t.agregateur.appelsEncaissement).toBe(0);
  });

  it("le proche peut payer par carte avec un jeton, jamais avec un numéro", async () => {
    const t = monterPaiements();
    const jeton = jetonDe((await t.liensService.creer(VOYAGEUR, "commande-1", {})).url);
    await expect(
      t.liensService.payer(jeton, { moyen: "carte", jetonCarte: "4111111111111111" }),
    ).rejects.toMatchObject({ code: "NUMERO_DE_CARTE_REFUSE" });
    const p = await t.liensService.payer(jeton, {
      moyen: "carte",
      jetonCarte: "tok_1NxQ7a2eZvKYlo2C",
    });
    expect(p).toMatchObject({ origine: "proche", moyen: "carte" });
  });

  it("lien périmé avec la commande : 410, plus de paiement possible", async () => {
    const t = monterPaiements();
    const jeton = jetonDe((await t.liensService.creer(VOYAGEUR, "commande-1", {})).url);
    t.horloge.avancer(16 * 60_000);

    await expect(
      t.liensService.payer(jeton, { moyen: "mtn_momo", telephone: TEL_MTN }),
    ).rejects.toMatchObject({ code: "LIEN_EXPIRE", status: 410 });
    expect((await t.liensService.apercu(jeton)).payable).toBe(false);
    expect(t.agregateur.appelsEncaissement).toBe(0);
  });

  it("mode dégradé : l'aperçu le dit, le paiement est refusé", async () => {
    const t = monterPaiements();
    const jeton = jetonDe((await t.liensService.creer(VOYAGEUR, "commande-1", {})).url);
    await t.mode.definir(AFRIMOVE, true, "maintenance");

    expect(await t.liensService.apercu(jeton)).toMatchObject({ payable: false, modeDegrade: true });
    await expect(
      t.liensService.payer(jeton, { moyen: "mtn_momo", telephone: TEL_MTN }),
    ).rejects.toMatchObject({ code: "MODE_DEGRADE" });
  });

  it("le lien ne donne accès qu'aux paiements de sa commande", async () => {
    const t = monterPaiements();
    t.commandes.ajouter(commandeType({ id: "commande-2" }));
    const autre = await t.service.payerCommande(VOYAGEUR, "commande-2", {
      moyen: "mtn_momo",
      telephone: TEL_MTN,
    });
    const jeton = jetonDe((await t.liensService.creer(VOYAGEUR, "commande-1", {})).url);

    await expect(t.liensService.statutPaiement(jeton, autre.id)).rejects.toMatchObject({
      code: "PAIEMENT_INCONNU",
    });
    await expect(t.liensService.statutPaiement(jeton, "inconnu")).rejects.toMatchObject({
      code: "PAIEMENT_INCONNU",
    });
  });
});
