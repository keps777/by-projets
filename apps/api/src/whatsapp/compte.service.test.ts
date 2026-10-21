import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { libelleDelaiReponse, mediane } from "./compte.service";
import {
  COMPAGNIE_ALPHA,
  VARIABLES_BILLET,
  monterWhatsApp,
  type MontageWhatsApp,
} from "./testing/montage";

afterEach(() => vi.restoreAllMocks());

const silence = () => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
};

const MIN = 60_000;

/** La personne écrit, on lui répond `apresMs` plus tard : le délai de réponse est mesuré. */
async function questionReponse(m: MontageWhatsApp, apresMs: number, de = "237655012345", n = 1) {
  await m.reception.traiter(
    m.fournisseur.fabriquerWebhook({
      messages: [
        {
          idFournisseur: `wamid.q-${de}-${n}-${m.horloge.maintenant().getTime()}`,
          de,
          texte: "Question",
        },
      ],
    }),
  );
  m.horloge.avancer(apresMs);
  await m.passerelle.repondre({
    destinataire: `+${de}`,
    texte: "Réponse",
    cle: `rep-${de}-${n}-${apresMs}`,
  });
  await m.vider();
}

describe("libellé du délai de réponse", () => {
  it.each([
    [null, null],
    [5_000, "répond en 1 min"],
    [89_000, "répond en 1 min"],
    [90_000, "répond en 2 min"],
    [120_000, "répond en 2 min"],
    [59 * MIN, "répond en 59 min"],
    [60 * MIN, "répond en 1 h"],
    [5 * 60 * MIN, "répond en 5 h"],
    [30 * 60 * MIN, "répond en plus d'un jour"],
  ])("%s ms → %s", (ms, attendu) => {
    expect(libelleDelaiReponse(ms)).toBe(attendu);
  });

  it("médiane : valeur centrale, moyenne des deux centrales, null si vide", () => {
    expect(mediane([])).toBeNull();
    expect(mediane([30, 10, 20])).toBe(20);
    expect(mediane([10, 20, 30, 40])).toBe(25);
    expect(mediane([1, 2])).toBe(2); // arrondi
  });
});

describe("vue du compte : « compte vérifié · répond en 2 min »", () => {
  it("affiche le délai mesuré entre le message reçu et la réponse, comme la maquette", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await questionReponse(m, 2 * MIN);
    const vue = await m.compte.vue(COMPAGNIE_ALPHA);
    expect(vue).toEqual({
      nom: "AfriMove · Alpha Voyages",
      detail: "compte vérifié · répond en 2 min",
      verifie: true,
      delaiReponseMedianMs: 2 * MIN,
      reponsesMesurees: 1,
      qualite: "haute",
      mode: "normal",
    });
  });

  it("prend la médiane de plusieurs réponses (pas la moyenne : une réponse très lente ne la fausse pas)", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await questionReponse(m, 1 * MIN, "237655000001");
    await questionReponse(m, 2 * MIN, "237655000002");
    await questionReponse(m, 3 * MIN, "237655000003");
    await questionReponse(m, 600 * MIN, "237655000004"); // 10 h : très lente, la médiane l'ignore
    const vue = await m.compte.vue(COMPAGNIE_ALPHA);
    expect(vue.reponsesMesurees).toBe(4);
    expect(vue.delaiReponseMedianMs).toBe(2.5 * MIN);
    expect(vue.detail).toBe("compte vérifié · répond en 3 min");
  });

  it("sans réponse mesurée : « compte vérifié » seulement", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    expect((await m.compte.vue(COMPAGNIE_ALPHA)).detail).toBe("compte vérifié");
    await m.reception.traiter(
      m.fournisseur.fabriquerWebhook({
        messages: [{ idFournisseur: "wamid.q", de: "237655012345", texte: "?" }],
      }),
    );
    const vue = await m.compte.vue(COMPAGNIE_ALPHA);
    expect(vue).toMatchObject({
      delaiReponseMedianMs: null,
      reponsesMesurees: 0,
      detail: "compte vérifié",
    });
  });

  it("un message envoyé par gabarit (rapport, billet) n'est pas une réponse", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await m.reception.traiter(
      m.fournisseur.fabriquerWebhook({
        messages: [{ idFournisseur: "wamid.q", de: "237655012345", texte: "?" }],
      }),
    );
    m.horloge.avancer(30_000);
    await m.passerelle.envoyer({
      type: "billet",
      variables: VARIABLES_BILLET,
      destinataire: "+237655012345",
    });
    await m.vider();
    expect((await m.compte.vue(null)).reponsesMesurees).toBe(0);
  });

  it("une réponse ne compte que pour le plus ancien message resté sans réponse", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    const ecrire = (id: string) =>
      m.reception.traiter(
        m.fournisseur.fabriquerWebhook({
          messages: [{ idFournisseur: id, de: "237655012345", texte: "?" }],
        }),
      );
    await ecrire("wamid.q1");
    m.horloge.avancer(1 * MIN);
    await ecrire("wamid.q2");
    m.horloge.avancer(1 * MIN);
    await m.passerelle.repondre({ destinataire: "+237655012345", texte: "Réponse" });
    await m.vider();
    const vue = await m.compte.vue(null);
    expect(vue.reponsesMesurees).toBe(1);
    expect(vue.delaiReponseMedianMs).toBe(2 * MIN); // mesuré depuis q1
  });

  it("ne regarde que les 7 derniers jours (réglable)", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await questionReponse(m, 10 * MIN);
    m.horloge.avancer(8 * 24 * 60 * MIN);
    expect((await m.compte.vue(null)).delaiReponseMedianMs).toBeNull();
    const large = monterWhatsApp({ env: { WHATSAPP_DELAI_REPONSE_JOURS: "30" } });
    await questionReponse(large, 10 * MIN);
    large.horloge.avancer(8 * 24 * 60 * MIN);
    expect((await large.compte.vue(null)).delaiReponseMedianMs).toBe(10 * MIN);
  });

  it("sans compagnie (compte AfriMove), le nom est « AfriMove »", async () => {
    const m = monterWhatsApp({ avecRapport: true });
    expect((await m.compte.vue(null)).nom).toBe("AfriMove");
    expect((await m.compte.vue("inconnue")).nom).toBe("AfriMove");
  });

  it("dit « compte non vérifié » quand WhatsApp n'a pas validé le nom", async () => {
    const m = monterWhatsApp();
    m.fournisseur.compte = { ...m.fournisseur.compte, verifie: false, qualite: "basse" };
    expect(await m.compte.vue(null)).toMatchObject({
      verifie: false,
      detail: "compte non vérifié",
      qualite: "basse",
    });
  });

  it("garde la dernière valeur connue quand WhatsApp ne répond pas, et n'invente rien sans valeur", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.compteInjoignable = true;
    expect(await m.compte.vue(null)).toMatchObject({
      verifie: null,
      detail: "compte WhatsApp",
      qualite: "inconnue",
    });

    const m2 = monterWhatsApp();
    expect((await m2.compte.vue(null)).verifie).toBe(true);
    m2.fournisseur.compteInjoignable = true;
    m2.horloge.avancer(10 * MIN); // le cache de 5 minutes est périmé : relecture, échec, ancienne valeur
    expect((await m2.compte.vue(null)).verifie).toBe(true);
  });

  it("ne relit l'état chez WhatsApp qu'une fois toutes les 5 minutes", async () => {
    const m = monterWhatsApp();
    const lecture = vi.spyOn(m.fournisseur, "etatCompte");
    await m.compte.vue(null);
    await m.compte.vue(null);
    m.horloge.avancer(4 * MIN);
    await m.compte.vue(null);
    expect(lecture).toHaveBeenCalledTimes(1);
    m.horloge.avancer(2 * MIN);
    await m.compte.vue(null);
    expect(lecture).toHaveBeenCalledTimes(2);
  });

  it("annonce le mode de la passerelle (repli SMS pendant une panne)", async () => {
    silence();
    const m = monterWhatsApp({ env: { WHATSAPP_TENTATIVES_MAX: "1", WHATSAPP_CONCURRENCE: "1" } });
    m.fournisseur.mettreEnPanne();
    for (let i = 0; i < 3; i++) {
      await m.passerelle.envoyer({
        type: "billet",
        variables: VARIABLES_BILLET,
        destinataire: `+23765500000${i}`,
      });
    }
    await m.vider();
    expect((await m.compte.vue(null)).mode).toBe("secours_sms");
  });
});

describe("détail d'administration : gabarits approuvés", () => {
  it("liste les cinq gabarits à soumettre, mot pour mot, avec leur statut chez WhatsApp", async () => {
    const m = monterWhatsApp();
    const d = await m.compte.detail(null);
    expect(d.gabarits.map((g) => [g.type, g.nom, g.statut])).toEqual([
      ["rapport_soir", "afrimove_rapport_soir", "approuve"],
      ["billet", "afrimove_billet", "approuve"],
      ["colis", "afrimove_colis_retrait", "approuve"],
      ["alerte_proche", "afrimove_alerte_proche", "approuve"],
      ["alerte_retard", "afrimove_alerte_retard", "approuve"],
    ]);
    expect(d.gabaritsNonApprouves).toEqual([]);
    expect(d.gabarits[0]?.corps).toContain("AfriMove · {{1}}");
    expect(d.gabarits[1]?.bouton).toEqual({
      libelle: "Ouvrir mon billet",
      urlModele: "https://afrimove.app/b/{{1}}",
    });
    expect(d.numeroAffiche).toBe("+237 6 00 00 00 00");
    expect(d.passerelle.mode).toBe("normal");
  });

  it("signale un gabarit en attente, refusé ou jamais soumis (son envoi échouerait)", async () => {
    const m = monterWhatsApp();
    m.fournisseur.compte = {
      ...m.fournisseur.compte,
      gabarits: [
        { nom: "afrimove_rapport_soir", langue: "fr", statut: "approuve" },
        { nom: "afrimove_billet", langue: "fr", statut: "en_attente" },
        { nom: "afrimove_colis_retrait", langue: "fr", statut: "refuse" },
        { nom: "afrimove_alerte_proche", langue: "en", statut: "approuve" }, // autre langue
      ],
    };
    const d = await m.compte.detail(null);
    expect(d.gabaritsNonApprouves).toEqual([
      "afrimove_billet",
      "afrimove_colis_retrait",
      "afrimove_alerte_proche",
      "afrimove_alerte_retard",
    ]);
    expect(d.gabarits.map((g) => g.statut)).toEqual([
      "approuve",
      "en_attente",
      "refuse",
      "absent",
      "absent",
    ]);
  });

  it("quand WhatsApp est injoignable, ne prétend pas que les gabarits manquent", async () => {
    silence();
    const m = monterWhatsApp();
    m.fournisseur.compteInjoignable = true;
    const d = await m.compte.detail(null);
    expect(d.gabarits.every((g) => g.statut === "inconnu")).toBe(true);
    expect(d.gabaritsNonApprouves).toEqual([]);
  });
});
