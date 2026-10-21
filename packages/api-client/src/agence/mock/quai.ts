import type { Billet } from "@afrimove/domain";
import { MONDE } from "@afrimove/fixtures";
import type { agence as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/index";
import { CANAL_QUAI, ECRITURES, OP_QUAI_CADENCE, OP_QUAI_EMBARQUEMENT } from "../operations";
import type { InstallateurPlanche } from "./types";
import { capturer, groupe, iso, lire, montant, personne } from "./utilitaires";

/** Billet tel que le quai le connaît : le scan le fait passer de « payé » à « embarqué ». */
interface BilletQuai {
  id: string;
  numero: string;
  codeBillet: string;
  siege: number;
  nom: string | null;
  pieceQuatreDerniers: string | null;
  classe: c.ScanQuai["classe"];
  prix: number;
  creeA: string;
  embarque: boolean;
}

function billetQuai(b: Billet): BilletQuai {
  return {
    id: b.id,
    numero: b.numero,
    codeBillet: b.codeBillet,
    siege: lire(b.siege ?? undefined, `le siège de ${b.numero}`),
    nom: b.passager.nom ?? null,
    pieceQuatreDerniers: b.passager.pieceQuatreDerniers ?? null,
    classe: b.classe,
    prix: b.prix,
    creeA: b.creeA,
    embarque: b.etat === "embarque",
  };
}

function scanDe(
  b: BilletQuai,
  resultat: c.ResultatScanQuai,
  at: string,
  bagagesSoute: number,
): c.ScanQuai {
  return {
    billetId: b.id,
    numero: b.numero,
    resultat,
    at,
    voyageur: b.nom,
    siege: b.siege,
    pieceQuatreDerniers: b.pieceQuatreDerniers,
    classe: b.classe,
    bagagesSoute,
  };
}

/** Retrouve un billet par le contenu de son QR (« AM1:NUMERO:CODE »). */
function parQr(billets: readonly BilletQuai[], qr: string): BilletQuai | undefined {
  const m = /^AM1:([^:]+):(\d{4})$/.exec(qr);
  return m ? billets.find((b) => b.numero === m[1] && b.codeBillet === m[2]) : undefined;
}

/* ------------------------------------------------------------------ Quai */

/** Planche « Quai » : `useQuaiEmbarquement`, scans, code 4 chiffres, libérer, liste au chauffeur. */
export const installerQuai: InstallateurPlanche<"Quai"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const depart0 = lire(ecran.entites.departs?.[0], "le départ du quai");
  const billets = (ecran.entites.billets ?? []).map(billetQuai);
  const titre = capturer(/^Quai (\d+) · (\d{2}:\d{2}) (\S+)$/, d.titre, "le titre du quai");
  const equipage = capturer(
    /^Bus (.+) · chauffeur (.+) · convoyeur (.+)$/,
    d.equipage,
    "l'équipage",
  );
  const scan = capturer(
    /^(\S+) · CNI ···· (\d{4}) · (VIP|Classique) · (\d+) bagage/i,
    d.dernierScan.detail,
    "le dernier scan",
  );
  const attendus = capturer(
    /^(\d+) attendus · (\d+) non présentés/,
    d.embarquement.attendus,
    "les attendus",
  );
  const [soute, refuses, enRoute] = d.compteurs;
  const aCharger = capturer(/^(\d+) colis/, lire(soute?.detail, "la soute"), "les colis à charger");
  const premierScan = capturer(
    /déjà scanné (\d{2}:\d{2})$/,
    lire(refuses?.detail, "refusés"),
    "refus",
  );
  const arret = capturer(/montent à (.+)$/, lire(enRoute?.detail, "en route"), "l'arrêt");
  const restantes = capturer(
    /^Vendre les (\d+) restantes$/,
    lire(d.actions[0], "actions"),
    "restantes",
  );
  const bus = lire(
    MONDE.bus.find((b) => b.immatriculation === groupe(equipage, 1)),
    "le bus de l'équipage",
  );

  const absents: c.AbsentQuai[] = d.absents.liste.map((a) => {
    const siege = Number(groupe(capturer(/siège (\d+)/, a.siege, "le siège d'un absent"), 1));
    const connu = billets.find((b) => b.siege === siege);
    const vendu = /vendu (\d{2}:\d{2})/.exec(a.detail);
    return {
      billetId: connu?.id ?? `billet-quai-${siege}`,
      voyageur: a.voyageur,
      siege,
      venduA: vendu?.[1] ? iso(vendu[1]) : null,
      retardPrevenu: a.detail.includes("en retard"),
      actionSuggeree: a.action === "libérer" ? "liberer" : "code_billet",
    };
  });

  const etat: c.QuaiEmbarquement = {
    quai: Number(groupe(titre, 1)),
    depart: {
      departId: depart0.id,
      heureDepart: iso(groupe(titre, 2)),
      destination: groupe(titre, 3),
      placesLibres: Number(groupe(restantes, 1)),
    },
    equipage: {
      bus: { id: bus.id, immatriculation: bus.immatriculation },
      chauffeur: personne(groupe(equipage, 2)),
      convoyeur: personne(groupe(equipage, 3)),
    },
    mode: d.mode === "scan" ? "scan" : "code",
    dernierScan: {
      billetId: lire(billets.find((b) => b.numero === groupe(scan, 1))?.id, "le billet scanné"),
      numero: groupe(scan, 1),
      resultat: "monte",
      at: iso(d.dernierScan.heure),
      voyageur: d.dernierScan.voyageur,
      siege: Number(groupe(capturer(/siège (\d+)/, d.dernierScan.siege, "siège"), 1)),
      pieceQuatreDerniers: groupe(scan, 2),
      classe: groupe(scan, 3).toLowerCase() === "vip" ? "vip" : "classique",
      bagagesSoute: Number(groupe(scan, 4)),
    },
    embarquement: {
      embarques: d.embarquement.embarques,
      capacite: d.embarquement.capacite,
      attendus: Number(groupe(attendus, 1)),
      nonPresentes: Number(groupe(attendus, 2)),
    },
    soute: {
      charges: lire(soute?.valeur, "soute"),
      capacite: lire(soute && "sur" in soute ? soute.sur : undefined, "capacité de la soute"),
      colisACharger: Number(groupe(aCharger, 1)),
    },
    refuses: {
      nombre: lire(refuses?.valeur, "refusés"),
      motif: "deja_scanne",
      premierScanA: iso(groupe(premierScan, 1)),
    },
    enRoute: { nombre: lire(enRoute?.valeur, "en route"), arret: groupe(arret, 1) },
    absents,
    placesAVendre: Number(groupe(restantes, 1)),
  };

  // Les écouteurs du canal temps réel : chaque scan est diffusé à la gare.
  const ecouteurs = new Set<(message: c.MessageQuai) => void>();
  const diffuser = (message: c.MessageQuai): void => {
    for (const ecouter of ecouteurs) ecouter(structuredClone(message));
  };
  const message = (at: string, scanne: c.ScanQuai | null): c.MessageQuai => ({
    departId: etat.depart.departId,
    at,
    scan: scanne,
    embarques: etat.embarquement.embarques,
    capacite: etat.embarquement.capacite,
  });

  poseur.lecture(OP_QUAI_EMBARQUEMENT, () => etat);

  const enregistrerScan = (b: BilletQuai | undefined, at: string): c.ScanQuai => {
    if (!b) {
      return {
        billetId: "inconnu",
        numero: "inconnu",
        resultat: "introuvable",
        at,
        voyageur: null,
        siege: null,
        pieceQuatreDerniers: null,
        classe: "classique",
        bagagesSoute: 0,
      };
    }
    if (b.embarque) {
      etat.refuses = { ...etat.refuses, nombre: etat.refuses.nombre + 1 };
      return scanDe(b, "deja_scanne", at, 0);
    }
    b.embarque = true;
    etat.embarquement.embarques += 1;
    etat.embarquement.attendus = Math.max(0, etat.embarquement.attendus - 1);
    etat.absents = etat.absents.filter((a) => a.billetId !== b.id);
    const resultat = scanDe(b, "monte", at, 0);
    etat.dernierScan = resultat;
    return resultat;
  };

  const repondreScan = (b: BilletQuai | undefined, at: string): Omit<c.ResultatScan, "accuse"> => {
    const scanne = enregistrerScan(b, at);
    diffuser(message(at, scanne));
    return {
      scan: scanne,
      embarques: etat.embarquement.embarques,
      capacite: etat.embarquement.capacite,
    };
  };

  poseur.ecriture(ECRITURES.quaiScanne, (evenement) => {
    if (evenement.donnees.departId !== etat.depart.departId) {
      throw new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU");
    }
    return repondreScan(parQr(billets, evenement.donnees.qr), evenement.at);
  });

  poseur.ecriture(ECRITURES.quaiCodeSaisi, (evenement) => {
    if (evenement.donnees.departId !== etat.depart.departId) {
      throw new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU");
    }
    const b = billets.find((x) => x.codeBillet === evenement.donnees.codeBillet);
    return repondreScan(b, evenement.at);
  });

  poseur.ecriture(ECRITURES.quaiLibere, (evenement) => {
    const l = evenement.donnees;
    const absent = etat.absents.find((a) => a.billetId === l.billetId);
    if (!absent)
      throw new ErreurHttp(404, "Ce voyageur n'est pas dans les absents", "ABSENT_INCONNU");
    etat.absents = etat.absents.filter((a) => a.billetId !== l.billetId);
    etat.placesAVendre += 1;
    etat.depart.placesLibres += 1;
    return { siegesLibres: etat.placesAVendre };
  });

  poseur.ecriture(ECRITURES.quaiListeEnvoyee, (evenement) => {
    if (evenement.donnees.departId !== etat.depart.departId) {
      throw new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU");
    }
    return { chauffeur: etat.equipage.chauffeur, embarques: etat.embarquement.embarques };
  });

  poseur.flux(CANAL_QUAI, ({ departId }, ctx) => {
    if (departId !== etat.depart.departId) {
      ctx.echouer(new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU"));
      return;
    }
    const ecouter = (m: c.MessageQuai): void => ctx.emettre(m);
    ecouteurs.add(ecouter);
    ctx.emettre(message(ctx.horloge.iso(), etat.dernierScan));
    return () => {
      ecouteurs.delete(ecouter);
    };
  });
};

/* ------------------------------------------------------------------ CadenceQuai */

/** Planche « CadenceQuai » : `useQuaiCadence`, `useCompleterBillet`. */
export const installerCadenceQuai: InstallateurPlanche<"CadenceQuai"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const depart0 = lire(ecran.entites.departs?.[0], "le départ de la cadence");
  const billets = (ecran.entites.billets ?? []).map(billetQuai);
  const titre = capturer(/^Quai (\d+) · (\d{2}:\d{2}) (\S+)$/, d.titre, "le titre du quai");
  const convoyeur = capturer(/^Convoyeur (\S+) ·/, d.detail, "le convoyeur");
  const siege = capturer(/siège (\d+)/, d.scan.siege, "le siège scanné");
  const vente = capturer(
    /^Vendu à (\d{2}:\d{2}) au guichet (\d+) · (cash|MoMo) ([\d\s]+) ·/,
    d.scan.detail,
    "la vente scannée",
  );
  const mode = (m: string): "cash" | "momo" => (m.toLowerCase() === "momo" ? "momo" : "cash");

  const sansNomListe: c.BilletSansNom[] = d.sansNom.liste.map((l) => {
    const m = capturer(
      /^· siège (\d+) · (\d{2}:\d{2}) · (cash|MoMo)/,
      l.detail,
      "un billet sans nom",
    );
    return {
      billetId: l._billetId,
      sequence: Number(l.numero),
      siege: Number(groupe(m, 1)),
      venduA: iso(groupe(m, 2)),
      paiement: mode(groupe(m, 3)),
      smsEnvoye: "sms" in l,
    };
  });

  const etat: c.QuaiCadence = {
    quai: Number(groupe(titre, 1)),
    depart: {
      departId: depart0.id,
      heureDepart: iso(groupe(titre, 2)),
      destination: groupe(titre, 3),
      placesLibres: d.embarquement.capacite - d.embarquement.embarques,
    },
    convoyeur: personne(groupe(convoyeur, 1)),
    scan: {
      at: iso(d.scan.heure),
      billetId: d.scan._billetId,
      numero: d.scan.numero,
      siege: Number(groupe(siege, 1)),
      venduA: iso(groupe(vente, 1)),
      guichetRang: Number(groupe(vente, 2)),
      paiement: mode(groupe(vente, 3)),
      montant: montant(groupe(vente, 4)),
      validePourCeDepart: d.scan.detail.includes("valide pour ce départ"),
    },
    saisie: {
      nom: d.completer.nom.valeur,
      pieceQuatreDerniers: d.completer.piece.valeur,
      telephone: d.completer.telephone.valeur,
    },
    embarquement: {
      embarques: d.embarquement.embarques,
      capacite: d.embarquement.capacite,
      nominatifs: d.embarquement.nominatifs,
      cadenceCompletes: d.embarquement.completes,
    },
    sansNom: { total: d.sansNom.total, liste: sansNomListe },
  };

  poseur.lecture(OP_QUAI_CADENCE, () => etat);

  poseur.ecriture(ECRITURES.billetComplete, (evenement) => {
    const v = evenement.donnees;
    const enAttente =
      v.billetId === etat.scan.billetId ||
      etat.sansNom.liste.some((x) => x.billetId === v.billetId);
    const connu = billets.find((b) => b.id === v.billetId);
    if (!enAttente || !connu) {
      throw new ErreurHttp(404, "Billet de cadence inconnu", "BILLET_INCONNU");
    }
    if (connu.nom) throw new ErreurHttp(409, "Ce billet porte déjà un nom", "DEJA_COMPLETE");
    connu.nom = v.nom;
    connu.pieceQuatreDerniers = v.pieceQuatreDerniers;
    etat.sansNom.liste = etat.sansNom.liste.filter((x) => x.billetId !== v.billetId);
    etat.sansNom.total = Math.max(0, etat.sansNom.total - 1);
    etat.embarquement.nominatifs += 1;
    etat.embarquement.cadenceCompletes += 1;
    if (v.embarquer && !connu.embarque) {
      connu.embarque = true;
      etat.embarquement.embarques += 1;
      etat.depart.placesLibres = Math.max(0, etat.depart.placesLibres - 1);
    }
    return {
      billet: { billetId: connu.id, numero: connu.numero, nom: v.nom, embarque: connu.embarque },
      embarques: etat.embarquement.embarques,
      sansNomRestants: etat.sansNom.total,
    };
  });

  poseur.ecriture(ECRITURES.quaiScanne, (evenement) => {
    const b = parQr(billets, evenement.donnees.qr);
    if (!b) throw new ErreurHttp(404, "Billet introuvable", "BILLET_INCONNU");
    etat.scan = {
      at: evenement.at,
      billetId: b.id,
      numero: b.numero,
      siege: b.siege,
      venduA: b.creeA,
      guichetRang: etat.scan.guichetRang,
      paiement: "cash",
      montant: b.prix,
      validePourCeDepart: true,
    };
    return {
      scan: scanDe(b, b.nom ? "monte" : "sans_nom", evenement.at, 0),
      embarques: etat.embarquement.embarques,
      capacite: etat.embarquement.capacite,
    };
  });
};
