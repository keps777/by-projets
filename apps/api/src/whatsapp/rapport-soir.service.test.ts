import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AucunDestinataire, RapportIndisponible } from "./erreurs";
import { VariablesInvalides } from "./gabarits";
import { remplirCorps } from "./rapport";
import { GABARITS } from "./gabarits";
import { PlanificateurRapportSoir } from "./rapport-soir.service";
import {
  COMPAGNIE_ALPHA,
  PATRON,
  SUPERVISEUR_AKWA,
  SUPERVISEUR_MVAN,
  VINGT_ET_UNE_HEURES,
  monterWhatsApp,
  rapportMaquette,
  type MontageWhatsApp,
} from "./testing/montage";

afterEach(() => vi.restoreAllMocks());

const silence = () => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
};

const JOUR = "2027-01-05";
const allerA = (m: MontageWhatsApp, instant: Date) =>
  m.horloge.avancer(instant.getTime() - m.horloge.maintenant().getTime());
const destinataires = (m: MontageWhatsApp) =>
  m.fournisseur.envoyes.map((e) => e.destinataire).sort();

describe("envoi du rapport d'une compagnie", () => {
  it("part pour le patron et chaque superviseur, avec le gabarit approuvé et les chiffres de la maquette", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    const resume = await m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR);
    expect(resume).toEqual({
      compagnieId: COMPAGNIE_ALPHA,
      jour: JOUR,
      destinataires: 3,
      envoyes: 3,
      dejaEnvoyes: 0,
      echecs: [],
    });
    await m.vider();

    expect(destinataires(m)).toEqual(
      [PATRON, SUPERVISEUR_AKWA, SUPERVISEUR_MVAN].map((p) => p.telephone).sort(),
    );
    for (const e of m.fournisseur.envoyes) {
      expect(e.contenu).toMatchObject({
        type: "gabarit",
        nom: "afrimove_rapport_soir",
        langue: "fr",
        boutonUrl: JOUR,
      });
    }
    // le texte lu par le patron est celui de la planche
    const texte = m.fournisseur.envoyes[0]!.texte;
    expect(texte).toContain("AfriMove · Alpha Voyages\nRapport du mardi 5 janvier · 3 gares");
    expect(texte).toContain("Billets : 1 004 (+6 % vs hier)");
    expect(texte).toContain("Recette : 4,41 M F (cash 2,9 M F · MoMo 1,5 M F)");
    expect(texte).toContain("Signé : Essono (Akwa), Tchinda (Mvan), Fosso (Baf.)");
  });

  it("est idempotent : relancer n'envoie rien de plus à ceux qui l'ont reçu", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR);
    await m.vider();
    const deuxieme = await m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR);
    expect(deuxieme).toMatchObject({ envoyes: 0, dejaEnvoyes: 3 });
    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(3);
  });

  it("un destinataire ajouté après le premier envoi reçoit le rapport, pas les autres une seconde fois", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR);
    m.annuaire.definir(COMPAGNIE_ALPHA, [
      PATRON,
      SUPERVISEUR_AKWA,
      SUPERVISEUR_MVAN,
      { personneId: "p-sup-baf", nom: "Fosso", role: "superviseur", telephone: "+237655010004" },
    ]);
    expect(await m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR)).toMatchObject({
      envoyes: 1,
      dejaEnvoyes: 3,
    });
  });

  it("un numéro invalide n'empêche pas les autres de recevoir le rapport", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    m.annuaire.definir(COMPAGNIE_ALPHA, [
      PATRON,
      { ...SUPERVISEUR_AKWA, telephone: "abc" },
      SUPERVISEUR_MVAN,
    ]);
    const resume = await m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR);
    expect(resume).toMatchObject({ destinataires: 3, envoyes: 2 });
    expect(resume.echecs).toEqual([{ personneId: "p-sup-akwa", raison: "telephone_invalide" }]);
  });

  it("refuse quand il n'y a pas de rapport, pas de compagnie ou personne à qui l'envoyer", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await expect(m.rapports.envoyerRapport(COMPAGNIE_ALPHA, "2027-01-06")).rejects.toBeInstanceOf(
      RapportIndisponible,
    );
    await expect(m.rapports.envoyerRapport("inconnue", JOUR)).rejects.toBeInstanceOf(
      RapportIndisponible,
    );
    m.annuaire.definir(COMPAGNIE_ALPHA, []);
    await expect(m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR)).rejects.toBeInstanceOf(
      AucunDestinataire,
    );
    expect(m.file.instantane()).toHaveLength(0);
  });

  it("un rapport mal formé n'est envoyé à personne (même erreur pour tous, on s'arrête)", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    const mauvais = { ...rapportMaquette(), gares: "Akwa" } as never;
    m.source.definirRapport(COMPAGNIE_ALPHA, mauvais);
    await expect(m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR)).rejects.toBeInstanceOf(
      VariablesInvalides,
    );
    expect(m.file.instantane()).toHaveLength(0);
  });

  it("suit le rapport du jour destinataire par destinataire, numéros masqués", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR);
    await m.vider();
    const premier = (await m.journal.lister({ type: "rapport_soir" }))[0]!;
    await m.reception.traiter(
      m.fournisseur.fabriquerWebhook({
        statuts: [{ idFournisseur: premier.idFournisseur!, etat: "lu" }],
      }),
    );
    const suivi = await m.rapports.statut(COMPAGNIE_ALPHA, JOUR);
    expect(suivi.messages).toHaveLength(3);
    expect(suivi.messages.map((l) => l.statut).sort()).toEqual(["envoye", "envoye", "lu"]);
    expect(suivi.messages.map((l) => l.destinataire).sort()).toEqual([
      "+237 ••••• 001",
      "+237 ••••• 002",
      "+237 ••••• 003",
    ]);
    expect(JSON.stringify(suivi)).not.toContain("6550100");
    expect((await m.rapports.statut(COMPAGNIE_ALPHA, "2027-01-06")).messages).toEqual([]);
  });
});

describe("rapport de 21 h : planificateur", () => {
  it("ne part pas avant 21 h (heure de Douala), puis part pour le patron et les superviseurs", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    expect(await m.planificateur.tick()).toEqual([]); // 08:00
    allerA(m, new Date(VINGT_ET_UNE_HEURES.getTime() - 60_000)); // 20:59
    expect(await m.planificateur.tick()).toEqual([]);
    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(0);

    m.horloge.avancer(60_000); // 21:00
    expect(await m.planificateur.tick()).toEqual([COMPAGNIE_ALPHA]);
    await m.vider();
    expect(destinataires(m)).toEqual(
      [PATRON, SUPERVISEUR_AKWA, SUPERVISEUR_MVAN].map((p) => p.telephone).sort(),
    );
    expect(m.auditRepo.lignes.map((l) => [l.action, l.resultat])).toEqual([
      ["whatsapp.rapport_envoye", "succes"],
    ]);
    expect(m.auditRepo.lignes[0]?.details).toMatchObject({
      compagnieId: COMPAGNIE_ALPHA,
      jour: JOUR,
      destinataires: 3,
      envoyes: 3,
    });
  });

  it("l'heure de départ se règle (WHATSAPP_RAPPORT_HEURE) et se lit à Douala, pas en UTC", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true, env: { WHATSAPP_RAPPORT_HEURE: "20:30" } });
    allerA(m, new Date("2027-01-05T19:29:00.000Z")); // 20:29 à Douala = 19:29 UTC
    expect(await m.planificateur.tick()).toEqual([]);
    m.horloge.avancer(60_000); // 20:30 à Douala
    expect(await m.planificateur.tick()).toEqual([COMPAGNIE_ALPHA]);
  });

  it("n'envoie qu'une fois par jour, même si la minuterie repasse toute la soirée", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    allerA(m, VINGT_ET_UNE_HEURES);
    await m.planificateur.tick();
    await m.vider();
    for (let i = 0; i < 5; i++) {
      m.horloge.avancer(30 * 60_000);
      expect(await m.planificateur.tick()).toEqual([]);
    }
    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(3);
  });

  it("un redémarrage en cours de soirée ne duplique rien (idempotence par personne et par jour)", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    allerA(m, VINGT_ET_UNE_HEURES);
    await m.planificateur.tick();
    await m.vider();
    const apresRedemarrage = new PlanificateurRapportSoir(
      m.rapports,
      m.source,
      m.journal,
      m.audit,
      m.horloge,
      m.config,
    );
    m.horloge.avancer(2 * 3_600_000);
    expect(await apresRedemarrage.tick()).toEqual([COMPAGNIE_ALPHA]); // il rejoue, la clé dédoublonne
    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(3);
  });

  it("le lendemain soir, le rapport du nouveau jour part", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    m.source.definirRapport(COMPAGNIE_ALPHA, rapportMaquette("2027-01-06"));
    allerA(m, VINGT_ET_UNE_HEURES);
    await m.planificateur.tick();
    await m.vider();
    m.horloge.avancer(24 * 3_600_000);
    expect(await m.planificateur.tick()).toEqual([COMPAGNIE_ALPHA]);
    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(6);
    expect((await m.rapports.statut(COMPAGNIE_ALPHA, "2027-01-06")).messages).toHaveLength(3);
  });

  it("un rapport pas encore prêt est réessayé à chaque passage, signalé une seule fois à l'audit, puis envoyé", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    m.source.panne = new Error("base indisponible");
    allerA(m, VINGT_ET_UNE_HEURES);
    expect(await m.planificateur.tick()).toEqual([]);
    m.horloge.avancer(60_000);
    expect(await m.planificateur.tick()).toEqual([]);
    expect(m.auditRepo.lignes.map((l) => [l.action, l.resultat])).toEqual([
      ["whatsapp.rapport_echec", "echec"],
    ]);
    expect(m.auditRepo.lignes[0]?.details).toMatchObject({ raison: "Error" });

    m.source.panne = null;
    m.horloge.avancer(60_000);
    expect(await m.planificateur.tick()).toEqual([COMPAGNIE_ALPHA]);
    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(3);
  });

  it("une compagnie sans rapport ou sans destinataire ne bloque pas les autres", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    m.source.ajouter({ id: "c-vide", nom: "Sans rapport" });
    m.source.ajouter({ id: "c-seule", nom: "Sans équipe" }, rapportMaquette());
    allerA(m, VINGT_ET_UNE_HEURES);
    expect(await m.planificateur.tick()).toEqual([COMPAGNIE_ALPHA]);
    const echecs = m.auditRepo.lignes.filter((l) => l.action === "whatsapp.rapport_echec");
    expect(echecs.map((l) => l.cibleId)).toEqual([`c-vide:${JOUR}`, `c-seule:${JOUR}`]);
    expect(echecs.map((l) => (l.details as { raison: string }).raison)).toEqual([
      "RapportIndisponible",
      "AucunDestinataire",
    ]);
  });

  it("un rapport mal formé n'est pas réessayé toute la soirée", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    m.source.definirRapport(COMPAGNIE_ALPHA, { ...rapportMaquette(), gares: null } as never);
    allerA(m, VINGT_ET_UNE_HEURES);
    await m.planificateur.tick();
    const lecturesAvant = vi.spyOn(m.source, "rapport");
    m.horloge.avancer(60_000);
    await m.planificateur.tick();
    expect(lecturesAvant).not.toHaveBeenCalled();
  });

  it("WhatsApp en panne à 21 h : le patron et les superviseurs reçoivent le rapport par SMS", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    m.fournisseur.mettreEnPanne();
    allerA(m, VINGT_ET_UNE_HEURES);
    await m.planificateur.tick();
    await m.vider();
    expect(m.fournisseur.envoyes).toHaveLength(0);
    expect(m.secoursSms.demandes.map((d) => d.destinataire).sort()).toEqual(
      [PATRON, SUPERVISEUR_AKWA, SUPERVISEUR_MVAN].map((p) => p.telephone).sort(),
    );
    for (const d of m.secoursSms.demandes) {
      expect(d).toMatchObject({
        type: "rapport_soir",
        variables: null,
        compagnieId: COMPAGNIE_ALPHA,
      });
      expect(d.texte).toContain("Billets 1 004 (+6 %)");
    }
    const suivi = await m.rapports.statut(COMPAGNIE_ALPHA, JOUR);
    expect(suivi.messages.every((l) => l.statut === "echec" && l.secours === "sms")).toBe(true);
  });

  it("efface au bout de 48 h le texte de repli des messages restés sans accusé", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR);
    await m.vider();
    const avant = await m.journal.lister({});
    expect(avant.every((x) => x.secoursChiffre !== null)).toBe(true);
    m.horloge.avancer(49 * 3_600_000);
    await m.planificateur.tick();
    const apres = await m.journal.lister({});
    expect(apres.every((x) => x.secoursChiffre === null)).toBe(true);
  });

  it("le texte du gabarit enregistré à WhatsApp est celui que reçoit le patron", async () => {
    silence();
    const m = monterWhatsApp({ avecRapport: true });
    await m.rapports.envoyerRapport(COMPAGNIE_ALPHA, JOUR);
    await m.vider();
    const e = m.fournisseur.envoyes[0]!;
    expect(
      e.contenu.type === "gabarit" &&
        e.texte === remplirCorps(GABARITS.rapport_soir.corps, e.contenu.parametres),
    ).toBe(true);
  });
});
