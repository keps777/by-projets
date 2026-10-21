import { numeroBillet, rendu } from "@afrimove/domain";
import type { Billet, Depart } from "@afrimove/domain";
import { MONDE } from "@afrimove/fixtures";
import type { agence as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/index";
import { ECRITURES, OP_CADENCE_BILLET, OP_CADENCE_ETAT, OP_VENTE_CONTEXTE } from "../operations";
import { poserDemandeAnnulation } from "./annulation";
import { installerImpression } from "./impression";
import type { InstallateurPlanche } from "./types";
import {
  billetImprimable,
  capturer,
  groupe,
  guichetAlpha,
  idDepartAlpha,
  ilYA,
  iso,
  lire,
  montant,
  telephone,
} from "./utilitaires";

const CODES_GARE: Readonly<Record<string, string>> = { Yaoundé: "YDE", Bafoussam: "BAF" };

/** Le tarif d'Alpha Voyages sur la ligne Douala → Yaoundé (réglages du patron). */
function tarifsDlaYde(): c.VenteContexte["tarifs"] {
  const ligne = MONDE.lignes.find((l) => l.code === "DLAYDE" && l.compagnieId === "cie-alp");
  return {
    classique: lire(ligne?.tarifs.classique, "le tarif classique"),
    vip: lire(ligne?.tarifs.vip, "le tarif VIP"),
    bagage: lire(ligne?.tarifs.bagage, "le tarif bagage"),
  };
}

/** Le billet imprimable que produit un événement de vente (numéro calculé par le domaine). */
function billetDeLEvenement(p: {
  billetId: string;
  at: string;
  numeroPlage: number;
  siege: number | null;
  classe: c.BilletImprimable["classe"];
  prix: number;
  codeBillet: string;
  heureDepart: string;
  destination: string;
  passager: { nom: string | null; pieceQuatreDerniers: string | null };
  aCompleterAuQuai: boolean;
}): c.BilletImprimable {
  return {
    billetId: p.billetId,
    numero: numeroBillet({ agence: "ALP", gare: "DLA", at: p.at, sequence: p.numeroPlage }),
    sequence: p.numeroPlage,
    compagnie: "Alpha Voyages",
    trajet: { origine: "DLA", destination: CODES_GARE[p.destination] ?? p.destination },
    heureDepart: p.heureDepart,
    siege: p.siege,
    classe: p.classe,
    passager: p.passager,
    codeBillet: p.codeBillet,
    qr: `AM1:${numeroBillet({ agence: "ALP", gare: "DLA", at: p.at, sequence: p.numeroPlage })}:${p.codeBillet}`,
    prix: p.prix,
    aCompleterAuQuai: p.aCompleterAuQuai,
  };
}

/** Vérifie un paiement cash : reçu − rendu = dû (règle du domaine). */
function verifierPaiement(paiement: c.PaiementAgence, du: number): void {
  if (paiement.mode !== "cash") return;
  try {
    if (rendu(paiement.recu, du) !== paiement.rendu) throw new RangeError("Rendu incorrect");
  } catch (e) {
    throw new ErreurHttp(
      422,
      e instanceof Error ? e.message : "Paiement invalide",
      "PAIEMENT_INVALIDE",
    );
  }
}

/* ------------------------------------------------------------------ Vente */

/** Planche « Vente » : `useVenteContexte`, `useVendreBillet`, impression. */
export const installerVente: InstallateurPlanche<"Vente"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const billet0 = lire(ecran.entites.billets?.[0], "le billet de la vente");
  const depart0 = lire(ecran.entites.departs?.[0], "le départ de la vente");
  const guichet = capturer(
    /^Guichet (\d+) · billet n° (\S+)$/,
    d.guichet,
    "le guichet et le numéro de billet",
  );
  const bagage = capturer(/bagage ([\d\s]+)$/, lire(d.voyageur.options[1], "le bagage"), "bagage");

  const departs = d.departs.flatMap((x) => {
    if (x.heure === undefined || x.destination === undefined) return [];
    const m = capturer(/^(\S+) · (\d+)(?: pl\.)?$/, x.destination, "un départ");
    return [
      {
        departId: idDepartAlpha(x.heure, groupe(m, 1)),
        heureDepart: iso(x.heure),
        destination: groupe(m, 1),
        placesLibres: Number(groupe(m, 2)),
        choisi: x.choisi,
      },
    ];
  });
  const choisi = lire(
    departs.find((x) => x.choisi),
    "le départ choisi",
  );
  if (choisi.departId !== depart0.id) {
    throw new Error("Fixture Vente : le départ choisi n'est pas celui de l'entité");
  }
  const autres = capturer(
    /^\+ (\d+)$/,
    lire(d.departs.at(-1), "le dernier départ").libelle ?? "",
    "+ N",
  );
  const libres = capturer(/^(\d+) libres$/, d.siege.libres, "les places libres");
  const plan = ecran.visuel.plan as { colonnes: number; cases: string[] };
  const paiement: c.PaiementAgence = {
    mode: "cash",
    recu: d.caisse.recu,
    rendu: d.caisse.rendu,
    reference: null,
  };

  const contexte: c.VenteContexte = {
    guichet: guichetAlpha(Number(groupe(guichet, 1))),
    prochainNumero: { sequence: billet0.sequence, numero: groupe(guichet, 2) },
    departs: departs.map(({ choisi: _c, ...x }) => x),
    autresDeparts: Number(groupe(autres, 1)),
    departChoisiId: choisi.departId,
    siege: {
      propose: d.siege.numero,
      libres: Number(groupe(libres, 1)),
      plan: {
        colonnes: plan.colonnes,
        cases: plan.cases.map((etat, i) => ({
          numero: i + 1,
          etat: etat as c.EtatSiegeAgence,
        })),
      },
    },
    tarifs: { ...tarifsDlaYde(), bagage: montant(groupe(bagage, 1)) },
    brouillon: {
      passager: {
        nom: d.voyageur.nom,
        telephone: telephone(d.voyageur.telephone),
        pieceQuatreDerniers: d.voyageur.piece,
      },
      bagage: false,
      paiement,
      sms: d.sms === "oui",
      montant: d.action.montant,
    },
  };

  poseur.lecture(OP_VENTE_CONTEXTE, () => contexte);

  poseur.ecriture(ECRITURES.billetVendu, (evenement) => {
    const v = evenement.donnees;
    const depart = contexte.departs.find((x) => x.departId === v.departId);
    if (!depart) throw new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU");
    const case_ = contexte.siege.plan.cases.find((x) => x.numero === v.siege);
    if (v.siege !== null && !case_) throw new ErreurHttp(404, "Siège inconnu", "SIEGE_INCONNU");
    if (case_ && case_.etat === "pris") {
      throw new ErreurHttp(409, "Siège déjà pris", "SIEGE_PRIS");
    }
    verifierPaiement(v.paiement, v.prix + v.bagage);
    const numeroPlage = evenement.numeroPlage;
    if (case_) case_.etat = "pris";
    depart.placesLibres -= 1;
    contexte.siege.libres -= 1;
    contexte.prochainNumero = {
      sequence: numeroPlage + 1,
      numero: numeroBillet({
        agence: "ALP",
        gare: "DLA",
        at: evenement.at,
        sequence: numeroPlage + 1,
      }),
    };
    const prochain = contexte.siege.plan.cases.find((x) => x.etat === "libre");
    if (prochain) {
      prochain.etat = "attribue";
      contexte.siege.propose = prochain.numero;
    }
    contexte.brouillon = null;
    return {
      billet: billetDeLEvenement({
        billetId: v.billetId,
        at: evenement.at,
        numeroPlage,
        siege: v.siege,
        classe: v.classe,
        prix: v.prix + v.bagage,
        codeBillet: v.codeBillet,
        heureDepart: depart.heureDepart,
        destination: depart.destination,
        passager: { nom: v.passager.nom, pieceQuatreDerniers: v.passager.pieceQuatreDerniers },
        aCompleterAuQuai: false,
      }),
    };
  });

  installerImpression(poseur);
};

/* ------------------------------------------------------------------ Cadence */

/** Planche « Cadence » : `useCadenceEtat`, `useVendreBilletCadence`. */
export const installerCadence: InstallateurPlanche<"Cadence"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const billet0 = lire(ecran.entites.billets?.[0], "le dernier billet");
  const depart0 = lire(ecran.entites.departs?.[0], "le départ de la cadence");
  const depart = capturer(/^(\d{2}:\d{2}) (\S+)$/, d.depart.valeur, "le départ en cours");
  const dernier = capturer(
    /^(\d{4}) · siège (\d+) · (.+)$/,
    d.dernierBillet.detail,
    "le dernier billet",
  );
  const age = capturer(/· (\d+) s$/, d.dernierBillet.libelle, "l'âge du dernier billet");
  const annulations = capturer(/(\d+) annulation/, d.pied.annulations, "les annulations");
  const synchro = capturer(/sync (\d{2}:\d{2})$/, d.pied.synchro, "la synchronisation");

  const etat: c.CadenceEtat = {
    depart: {
      departId: depart0.id,
      heureDepart: iso(groupe(depart, 1)),
      destination: groupe(depart, 2),
      placesLibres: d.depart.restantes,
      placesRestantes: d.depart.restantes,
    },
    dernierBillet: {
      billetId: billet0.id,
      sequence: Number(groupe(dernier, 1)),
      siege: Number(groupe(dernier, 2)),
      nom: groupe(dernier, 3),
      venduA: ilYA(ecran.maintenant, Number(groupe(age, 1))),
    },
    prochain: { prix: d.prochain.prix, siege: d.siegeSuivant.numero },
    modesPaiement: ["cash", "momo"],
    vendusEnCadence: d.pied.vendus,
    annulations: Number(groupe(annulations, 1)),
    synchro: {
      etat: "hors_ligne",
      derniereSyncA: iso(groupe(synchro, 1)),
      evenementsEnAttente: 0,
    },
  };

  const billets = new Set<string>([billet0.id]);

  poseur.lecture(OP_CADENCE_ETAT, () => etat);

  poseur.ecriture(ECRITURES.billetVenduCadence, (evenement) => {
    const v = evenement.donnees;
    if (v.departId !== etat.depart.departId) {
      throw new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU");
    }
    if (etat.depart.placesRestantes === 0) {
      throw new ErreurHttp(409, "Départ complet", "DEPART_COMPLET");
    }
    verifierPaiement(v.paiement, v.prix);
    const billet = billetDeLEvenement({
      billetId: v.billetId,
      at: evenement.at,
      numeroPlage: evenement.numeroPlage,
      siege: v.siege,
      classe: "classique",
      prix: v.prix,
      codeBillet: v.codeBillet,
      heureDepart: etat.depart.heureDepart,
      destination: etat.depart.destination,
      passager: { nom: null, pieceQuatreDerniers: null },
      aCompleterAuQuai: true,
    });
    billets.add(v.billetId);
    etat.depart.placesRestantes -= 1;
    etat.depart.placesLibres -= 1;
    etat.vendusEnCadence += 1;
    etat.dernierBillet = {
      billetId: v.billetId,
      sequence: evenement.numeroPlage,
      siege: v.siege,
      nom: null,
      venduA: evenement.at,
    };
    etat.prochain = { ...etat.prochain, siege: v.siege + 1 };
    return { billet, placesRestantes: etat.depart.placesRestantes };
  });

  poseur.ecriture(ECRITURES.billetTelephoneAjoute, (evenement) => {
    if (!billets.has(evenement.donnees.billetId)) {
      throw new ErreurHttp(404, "Billet inconnu", "BILLET_INCONNU");
    }
    return {};
  });
  poserDemandeAnnulation(poseur, (id) => billets.has(id));
  installerImpression(poseur);
};

/* ------------------------------------------------------------------ CadenceBillet */

/** Planche « CadenceBillet » : `useCadenceBillet`. */
export const installerCadenceBillet: InstallateurPlanche<"CadenceBillet"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const billet = lire(ecran.entites.billets?.[0], "le billet de cadence");
  const depart: Depart | undefined = ecran.entites.departs?.[0];
  const duree = capturer(/· ([\d,]+) s$/, d.vendu.libelle, "la durée de la vente");
  const detail = capturer(
    /^billet (\d{4}) · siège (\d+) · cash ([\d\s]+) · rendu ([\d\s]+)$/,
    d.vendu.detail,
    "le détail de la vente",
  );
  const lignes = d.fait.lignes;
  const caisse = capturer(
    /^\+([\d\s]+) cash/,
    lire(lignes[3], "la ligne de caisse").detail,
    "la caisse",
  );
  const suivant = capturer(/^siège (\d+) · ([\d\s]+)$/, d.pied.suivant.detail, "le billet suivant");

  const recu = montant(groupe(detail, 3)) + montant(groupe(detail, 4));
  const imprimable = billetImprimable(billet as Billet, depart);

  const vue: c.CadenceBillet = {
    billet: imprimable,
    vente: {
      dureeMs: Math.round(Number(groupe(duree, 1).replace(",", ".")) * 1000),
      paiement: { mode: "cash", recu, rendu: montant(groupe(detail, 4)), reference: null },
      placesRestantes: d.vendu.restent,
    },
    recapitulatif: {
      plageSansTrou: lire(lignes[0], "la ligne de numéro").detail.includes("sans trou"),
      siegeBloque: Number(groupe(detail, 2)),
      imprime: lire(lignes[2], "la ligne d'impression").etape === "Imprimé",
      caisseCash: montant(groupe(caisse, 1)),
      sms: lire(lignes[4], "la ligne de SMS").detail.includes("pas de numéro")
        ? "pas_de_numero"
        : "envoye",
      synchro: "au_retour_du_reseau",
    },
    suivant: { siege: Number(groupe(suivant, 1)), prix: montant(groupe(suivant, 2)) },
  };

  poseur.lecture(OP_CADENCE_BILLET, ({ billetId }) => {
    if (billetId !== billet.id) throw new ErreurHttp(404, "Billet inconnu", "BILLET_INCONNU");
    return vue;
  });
  poseur.ecriture(ECRITURES.billetTelephoneAjoute, (evenement) => {
    if (evenement.donnees.billetId !== billet.id) {
      throw new ErreurHttp(404, "Billet inconnu", "BILLET_INCONNU");
    }
    vue.recapitulatif.sms = "envoye";
    return {};
  });
  poserDemandeAnnulation(poseur, (id) => id === billet.id);
  installerImpression(poseur);
};
