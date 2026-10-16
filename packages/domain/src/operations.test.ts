import { describe, expect, it } from "vitest";
import { emettreCodeRetrait } from "./codes";
import type { Billet, Colis, Depart, SessionCaisse } from "./entites";
import { TransitionInterdite } from "./machine";
import {
  annulerBillet,
  appliquerBillet,
  appliquerColis,
  appliquerDepart,
  CodeRetraitInvalide,
  cloturerSession,
  completerBillet,
  creerBillet,
  creerColis,
  creerDepart,
  estCadenceSansNom,
  fusionnerDepart,
  ouvrirSession,
  refuserCloture,
  remettreColis,
  validerSession,
  ValidationSuperviseurRequise,
} from "./operations";
import { aleaGraine } from "./testing/alea";

const HEURE_DEPART = "2027-01-05T08:00:00+01:00";

function billet(surcharge: Partial<Billet> = {}): Billet {
  return creerBillet({
    id: "b-1",
    numero: "ALP-DLA-270105-0232",
    sequence: 232,
    compagnieId: "alp",
    gareId: "dla",
    departId: "d-1",
    siege: 19,
    classe: "classique",
    prix: 4000,
    canal: "guichet",
    guichetId: "g-2",
    passager: {},
    codeBillet: "9047",
    creeA: "2027-01-05T05:14:52+01:00",
    ...surcharge,
  });
}

describe("billet", () => {
  it("naît « réservé » avec un historique vide", () => {
    const b = billet();
    expect(b.etat).toBe("reserve");
    expect(b.historique).toEqual([]);
    expect(b.creeA).toBe("2027-01-05T05:14:52.000+01:00");
  });

  it("suit réservé → payé → embarqué → voyagé en gardant son numéro", () => {
    let b = billet();
    for (const action of ["payer", "embarquer", "terminer"] as const) {
      b = appliquerBillet(b, action, { at: "2027-01-05T06:00:00+01:00", par: "agent" });
    }
    expect(b.etat).toBe("voyage");
    expect(b.numero).toBe("ALP-DLA-270105-0232");
    expect(b.historique.map((h) => h.vers)).toEqual(["paye", "embarque", "voyage"]);
  });

  it("refuse d'annuler un billet embarqué (jamais de retour)", () => {
    let b = billet({ canal: "en_ligne" });
    b = appliquerBillet(b, "payer", { at: "2027-01-05T06:00:00+01:00" });
    b = appliquerBillet(b, "embarquer", { at: "2027-01-05T07:40:00+01:00" });
    expect(() =>
      annulerBillet(b, {
        evenementId: "e-1",
        at: "2027-01-05T07:45:00+01:00",
        par: "voyageur",
        heureDepart: HEURE_DEPART,
      }),
    ).toThrow(TransitionInterdite);
    expect(b.etat).toBe("embarque");
  });

  it("une annulation au guichet exige le PIN d'un superviseur", () => {
    const paye = appliquerBillet(billet(), "payer", { at: "2027-01-05T05:15:00+01:00" });
    expect(() =>
      annulerBillet(paye, {
        evenementId: "e-1",
        at: "2027-01-05T05:30:00+01:00",
        par: "agent-1",
        heureDepart: HEURE_DEPART,
      }),
    ).toThrow(ValidationSuperviseurRequise);
  });

  it("un billet annulé garde son numéro, rien ne s'efface : l'annulation est un événement", () => {
    const paye = appliquerBillet(billet(), "payer", { at: "2027-01-05T05:15:00+01:00" });
    const {
      billet: annule,
      evenement,
      decision,
    } = annulerBillet(paye, {
      evenementId: "e-42",
      at: "2027-01-05T05:30:00+01:00",
      par: "agent-1",
      validePar: "superviseur-1",
      motif: "client absent",
      appareilId: "tel-guichet-2",
      heureDepart: HEURE_DEPART,
    });
    // Le billet d'origine n'est pas modifié ; le nouveau garde tout son contenu.
    expect(paye.etat).toBe("paye");
    expect(annule.etat).toBe("annule");
    expect(annule.numero).toBe("ALP-DLA-270105-0232");
    expect(annule.sequence).toBe(232);
    expect(annule.siege).toBe(19);
    expect(annule.prix).toBe(4000);
    expect(annule.historique).toHaveLength(2);
    expect(annule.historique[0]).toMatchObject({ action: "payer", vers: "paye" });
    expect(annule.historique[1]).toMatchObject({
      action: "annuler",
      de: "paye",
      vers: "annule",
      par: "superviseur-1",
      motif: "client absent",
    });
    // L'événement trace qui, quand, combien.
    expect(evenement).toMatchObject({
      id: "e-42",
      type: "billet.annule",
      appareilId: "tel-guichet-2",
      auteurId: "agent-1",
      cible: { type: "billet", id: "b-1" },
      donnees: { numero: "ALP-DLA-270105-0232", validePar: "superviseur-1", remboursement: 4000 },
    });
    expect(decision).toMatchObject({ gratuite: true, remboursement: 4000 });
  });

  it("un billet annulé ne repart pas : ni paiement, ni embarquement, ni nouvelle annulation", () => {
    const paye = appliquerBillet(billet({ canal: "en_ligne" }), "payer", { at: 0 });
    const { billet: annule } = annulerBillet(paye, {
      evenementId: "e-1",
      at: "2027-01-05T05:30:00+01:00",
      par: "voyageur",
      heureDepart: HEURE_DEPART,
    });
    for (const action of ["payer", "embarquer", "annuler", "reporter", "terminer"] as const) {
      expect(() => appliquerBillet(annule, action, { at: 0 })).toThrow(TransitionInterdite);
    }
  });

  it("une vente en ligne s'annule sans superviseur", () => {
    const paye = appliquerBillet(billet({ canal: "en_ligne" }), "payer", { at: 0 });
    const r = annulerBillet(paye, {
      evenementId: "e-1",
      at: "2027-01-05T06:00:00+01:00",
      par: "voyageur",
      heureDepart: HEURE_DEPART,
    });
    expect(r.billet.etat).toBe("annule");
  });

  it("billet de cadence : sans nom jusqu'au quai, puis nominatif avec le même numéro", () => {
    const b = billet();
    expect(estCadenceSansNom(b)).toBe(true);
    const complet = completerBillet(b, { nom: "Aïcha Ngo", pieceQuatreDerniers: "4471" });
    expect(estCadenceSansNom(complet)).toBe(false);
    expect(complet.numero).toBe(b.numero);
    expect(complet.passager.pieceQuatreDerniers).toBe("4471");
    expect(() => completerBillet(b, { nom: "X", pieceQuatreDerniers: "44" })).toThrow(RangeError);
  });

  it("report puis reprogrammation : le numéro ne change pas", () => {
    let b = appliquerBillet(billet(), "payer", { at: 0 });
    b = appliquerBillet(b, "reporter", { at: 1 });
    b = appliquerBillet(b, "reprogrammer", { at: 2 });
    expect(b.etat).toBe("paye");
    expect(b.numero).toBe("ALP-DLA-270105-0232");
  });
});

async function nouveauColis(): Promise<{ colis: Colis; code: string }> {
  const { code, hache, sel } = await emettreCodeRetrait(aleaGraine(7));
  const colis = creerColis({
    id: "c-1",
    numero: "C-DLA-270105-0017",
    sequence: 17,
    gareOrigineId: "dla",
    gareDestinationId: "baf",
    departId: "d-1",
    expediteur: { nom: "Joseph", telephone: "670000001" },
    destinataire: { nom: "Maman", telephone: "670000002" },
    contenu: "vêtements",
    poidsKg: 2,
    valeurDeclaree: 25_000,
    assure: true,
    mode: "moto",
    canal: "app",
    codeRetraitHache: hache,
    codeRetraitSel: sel,
    prixTotal: 3200,
    creeA: "2027-01-05T10:00:00+01:00",
  });
  return { colis, code };
}

describe("colis", () => {
  it("garde le code de retrait haché, jamais en clair", async () => {
    const { colis, code } = await nouveauColis();
    expect(JSON.stringify(colis)).not.toContain(code);
    expect(colis.etat).toBe("enregistre");
  });

  it("démarre les 7 jours de garde quand le colis devient disponible", async () => {
    let { colis } = await nouveauColis();
    for (const action of ["charger", "expedier", "decharger"] as const) {
      colis = appliquerColis(colis, action, { at: "2027-01-05T11:00:00+01:00" });
    }
    expect(colis.disponibleDepuis).toBeUndefined();
    colis = appliquerColis(colis, "rendre_disponible", { at: "2027-01-05T13:00:00+01:00" });
    expect(colis.disponibleDepuis).toBe("2027-01-05T13:00:00.000+01:00");
  });

  it("remet le colis avec le bon code seulement", async () => {
    let { colis, code } = await nouveauColis();
    for (const action of ["charger", "expedier", "decharger", "rendre_disponible"] as const) {
      colis = appliquerColis(colis, action, { at: 0 });
    }
    const faux = code === "111111" ? "222222" : "111111";
    await expect(remettreColis(colis, faux, { at: 1 })).rejects.toThrow(CodeRetraitInvalide);
    expect(colis.etat).toBe("disponible");
    const remis = await remettreColis(colis, code, { at: 1, par: "relais-1" });
    expect(remis.etat).toBe("remis");
    expect(remis.historique.at(-1)).toMatchObject({ action: "remettre", par: "relais-1" });
  });

  it("refuse la remise d'un colis pas encore arrivé, même avec le bon code", async () => {
    const { colis, code } = await nouveauColis();
    await expect(remettreColis(colis, code, { at: 0 })).rejects.toThrow(TransitionInterdite);
  });
});

describe("départ", () => {
  const depart = (): Depart =>
    creerDepart({
      id: "d-1",
      numero: "ALP-DLAYDE-270105-0800",
      ligneId: "l-1",
      busId: "bus-1",
      classe: "classique",
      heureDepart: HEURE_DEPART,
    });

  it("suit programmé → en vente → embarquement → parti → arrivé", () => {
    let d = depart();
    for (const action of ["ouvrir_vente", "ouvrir_embarquement", "partir", "arriver"] as const) {
      d = appliquerDepart(d, action, { at: 0 });
    }
    expect(d.etat).toBe("arrive");
    expect(d.numero).toBe("ALP-DLAYDE-270105-0800");
  });

  it("fusionne dans un autre départ et garde la trace de la cible", () => {
    const d = fusionnerDepart(appliquerDepart(depart(), "ouvrir_vente", { at: 0 }), "d-2", {
      at: 1,
      par: "superviseur-1",
    });
    expect(d).toMatchObject({ etat: "fusionne", fusionneDansId: "d-2" });
    expect(() => fusionnerDepart(depart(), "d-1", { at: 1 })).toThrow(RangeError);
  });

  it("un départ parti ne peut plus fusionner", () => {
    let d = depart();
    for (const action of ["ouvrir_vente", "ouvrir_embarquement", "partir"] as const) {
      d = appliquerDepart(d, action, { at: 0 });
    }
    expect(() => fusionnerDepart(d, "d-2", { at: 1 })).toThrow(TransitionInterdite);
  });
});

describe("session de caisse", () => {
  const ouverte = (): SessionCaisse =>
    ouvrirSession({
      id: "s-1",
      numero: "K-DLA-270105-2-1",
      guichetId: "g-2",
      agentId: "joseph",
      fondDeCaisse: 20_000,
      at: "2027-01-05T05:02:00+01:00",
    });

  it("ouvre, clôture avec l'écart calculé, puis le superviseur valide", () => {
    const cloturee = cloturerSession(ouverte(), {
      at: "2027-01-05T13:58:00+01:00",
      cashAttendu: 695_500,
      cashCompte: 694_500,
    });
    expect(cloturee.etat).toBe("cloturee");
    expect(cloturee.cloturee).toMatchObject({ ecart: -1000, auto: false });
    const validee = validerSession(cloturee, "superviseur-1", "2027-01-05T14:10:00+01:00");
    expect(validee.etat).toBe("validee");
    expect(validee.validee).toEqual({
      at: "2027-01-05T14:10:00.000+01:00",
      superviseurId: "superviseur-1",
    });
    expect(validee.numero).toBe("K-DLA-270105-2-1");
  });

  it("la clôture automatique de minuit est faite par le système", () => {
    const s = cloturerSession(ouverte(), {
      at: "2027-01-06T00:00:00+01:00",
      cashAttendu: 1000,
      cashCompte: 1000,
      auto: true,
    });
    expect(s.cloturee?.auto).toBe(true);
    expect(s.historique[0]?.par).toBe("systeme");
  });

  it("le superviseur peut refuser : la session redevient ouverte, la trace reste", () => {
    const cloturee = cloturerSession(ouverte(), {
      at: "2027-01-05T13:58:00+01:00",
      cashAttendu: 1000,
      cashCompte: 0,
    });
    const rouverte = refuserCloture(
      cloturee,
      "superviseur-1",
      "2027-01-05T14:00:00+01:00",
      "recompter",
    );
    expect(rouverte.etat).toBe("ouverte");
    expect(rouverte.cloturee).toBeUndefined();
    expect(rouverte.historique.map((h) => h.action)).toEqual(["cloturer", "refuser"]);
  });

  it("ne valide pas une session ouverte, ni sans superviseur", () => {
    expect(() => validerSession(ouverte(), "superviseur-1", 0)).toThrow(TransitionInterdite);
    const cloturee = cloturerSession(ouverte(), { at: 1, cashAttendu: 0, cashCompte: 0 });
    expect(() => validerSession(cloturee, "", 2)).toThrow(ValidationSuperviseurRequise);
  });

  it("une session validée est figée", () => {
    const cloturee = cloturerSession(ouverte(), { at: 1, cashAttendu: 0, cashCompte: 0 });
    const validee = validerSession(cloturee, "sup", 2);
    expect(() => cloturerSession(validee, { at: 3, cashAttendu: 0, cashCompte: 0 })).toThrow(
      TransitionInterdite,
    );
    expect(() => refuserCloture(validee, "sup", 3)).toThrow(TransitionInterdite);
  });
});
