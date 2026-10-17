import {
  PLAGE_EN_LIGNE,
  TARIFS,
  creerColis,
  devisColis,
  emettreCodeRetrait,
  numeroColis,
  numeroDepart,
  repartitionLivraison,
  repartitionRelais,
} from "@afrimove/domain";
import type { Colis, EtatColis } from "@afrimove/domain";
import { colis as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/erreurs";
import { simulerFlux } from "../../infra/scenarios";
import {
  CANAL_POSITION_LIVREUR,
  CANAL_SUIVI_COLIS,
  OP_CHANGER_ADRESSE_LIVRAISON,
  OP_CHANGER_MODE_COLIS,
  OP_CHOISIR_RELAIS,
  OP_COLIS,
  OP_CREER_COLIS,
  OP_DEVIS_COLIS,
  OP_ENVOYER_CODE_COLIS,
  OP_ESTIMER_PHOTO_COLIS,
  OP_LIVRAISON_COLIS,
  OP_OPTIONS_ENVOI_COLIS,
  OP_PARTAGER_SUIVI_LIVRAISON,
  OP_RECLAMER_COLIS,
  OP_RELAIS_PROCHES,
} from "../operations";
import {
  chiffres,
  colisDeLaPlanche,
  decimal,
  entierDe,
  heureDans,
  installer,
  isoDu,
  jourDe,
  lire,
  masquerTelephone,
  sansPuce,
  slug,
  telephoneDepuis,
} from "./outils";
import type { DonneesScenario, ScenarioEnConstruction } from "./outils";

/* ------------------------------------------------------------------ constantes du monde de démonstration */

/** Identifiants du monde commun (`@afrimove/fixtures`), recopiés pour ne pas importer les fixtures. */
const GARE_ORIGINE_DEMO = "gare-alp-dla";
const GARE_DESTINATION_DEMO = "gare-alp-baf";
const EXPEDITEUR_DEMO = { nom: "Ngo Aïcha", telephone: "+237691221008" };

/** Le départ de 08:15 vers Bafoussam du monde commun : `dep-alp-dlabaf-270105-0815`. */
function idDepart08h15(jour: string): string {
  const numero = numeroDepart({ agence: "ALP", ligne: "DLABAF", at: isoDu(jour, "08:15") });
  return `dep-${numero.toLowerCase()}`;
}

const LIBELLES_JALON: Record<c.JalonSuivi, string> = {
  depose: "Déposé",
  charge: "Chargé",
  en_route: "En route",
  disponible: "Disponible",
  remis: "Remis",
};

function ajouterJoursOuvres(iso: string, jours: number): string {
  let ms = Date.parse(iso);
  let restant = jours;
  while (restant > 0) {
    ms += 86_400_000;
    const jourSemaine = new Date(ms + 3_600_000).getUTCDay(); // 0 dimanche, 6 samedi, à Douala
    if (jourSemaine !== 0 && jourSemaine !== 6) restant -= 1;
  }
  const d = new Date(ms + 3_600_000);
  const p = (n: number, l = 2): string => String(n).padStart(l, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}+01:00`
  );
}

/* ------------------------------------------------------------------ vue propriétaire depuis le domaine */

const JALON_DE_ACTION: Partial<Record<string, c.JalonSuivi>> = {
  charger: "charge",
  expedier: "en_route",
  rendre_disponible: "disponible",
  remettre: "remis",
  livrer: "remis",
};

function suiviDepuisDomaine(colis: Colis): c.EtapeSuivi[] {
  const horodatage = new Map<c.JalonSuivi, string>();
  for (const h of colis.historique) {
    const jalon = JALON_DE_ACTION[h.action];
    if (jalon) horodatage.set(jalon, h.at);
  }
  return c.JALONS_SUIVI.map((jalon) => {
    const a = jalon === "depose" ? colis.creeA : (horodatage.get(jalon) ?? null);
    return {
      jalon,
      libelle: LIBELLES_JALON[jalon],
      detail: null,
      a: jalon === "depose" ? null : a,
      estimee: false,
      fait: jalon === "depose" ? colis.etat !== "enregistre" : a !== null,
    };
  });
}

function optionsDeRetrait(mode: c.ColisProprietaire["mode"]): c.ColisProprietaire["options"] {
  const options: c.ColisProprietaire["options"] = [];
  if (mode !== "moto") {
    options.push({
      mode: "moto",
      titre: "Faire livrer chez elle",
      detail: "moto · dès l'arrivée",
      prix: TARIFS.livraison.minimum,
    });
  }
  if (mode !== "relais") {
    options.push({
      mode: "relais",
      titre: "Déposer en relais",
      detail: "près de chez elle",
      prix: repartitionRelais().voyageur,
    });
  }
  return options;
}

function proprietaireDepuisDomaine(colis: Colis, code: string): c.ColisProprietaire {
  return {
    id: colis.id,
    numero: colis.numero,
    role: "expediteur",
    etat: colis.etat,
    mode: colis.mode,
    contenu: colis.contenu,
    poidsKg: colis.poidsKg,
    assure: colis.assure,
    valeurAssuree: colis.assure ? colis.valeurDeclaree : 0,
    prixTotal: colis.prixTotal,
    creeA: colis.creeA,
    expediteur: colis.expediteur,
    destinataire: {
      nom: colis.destinataire.nom,
      surnom: null,
      telephone: colis.destinataire.telephone,
    },
    retrait: {
      code,
      libelle: `Code de retrait · à donner à ${colis.destinataire.nom} seulement`,
      consigne: "Remis contre ce code + sa pièce. Jamais sur l'étiquette, jamais au téléphone.",
      photoDepot: null,
    },
    suivi: suiviDepuisDomaine(colis),
    arriveePrevue: null,
    options: optionsDeRetrait(colis.mode),
    reclamation: {
      delaiReponseJoursOuvres: 2,
      multiplePortSiPerte: 10,
      texte: "Réclamation en 1 touche, réponse sous 2 jours ouvrés.",
    },
  };
}

/* ------------------------------------------------------------------ ColisEnvoi (13) */

interface DonneesColisEnvoi {
  photo: string;
  formulaire: { pourQui: string; ou: string; contenu: string; valeur: number };
  depart: {
    options: {
      heure?: string;
      compagnie?: string;
      detail: string;
      prix?: number;
      mode?: string;
      supplement?: number;
      choisi?: boolean;
    }[];
  };
  assurance: { prime: number; active: boolean; detail: string };
  action: { total: number };
  detailPrix: string;
}

export function installerColisEnvoi(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesColisEnvoi>(d);
  const jour = jourDe(d.horloge);
  const offre = e.depart.options.find((o) => o.heure !== undefined);
  if (!offre?.heure || offre.prix === undefined) {
    throw new Error("ColisEnvoi : le scénario ne propose aucun départ");
  }
  const departId = idDepart08h15(jour);
  const arrivee = /arrivée (\d{1,2}) h/.exec(offre.detail)?.[1];
  const retrait = /retrait à (?:la )?(gare de [^·]+?)(?: ·|$)/.exec(offre.detail)?.[1] ?? "la gare";
  const port = offre.prix;
  const [surnom = "", telAffiche = ""] = e.formulaire.pourQui.split("·").map((s) => s.trim());
  const [ville = "", gare = ""] = e.formulaire.ou.split("·").map((s) => s.trim());

  const crees = new Map<string, { colis: Colis; code: string }>();
  let sequence = PLAGE_EN_LIGNE.debut;

  const devisDe = (p: c.DemandeDevisColis): c.DevisColis => {
    if (p.departId !== departId) {
      throw new ErreurHttp(404, "Départ introuvable", "depart_introuvable");
    }
    try {
      return devisColis({
        port,
        canal: "app",
        mode: p.mode,
        valeurAssuree: p.valeurAssuree,
        ...(p.prixLivraison !== undefined ? { prixLivraison: p.prixLivraison } : {}),
      });
    } catch (err) {
      throw new ErreurHttp(422, (err as Error).message, "devis_invalide");
    }
  };

  installer(sc, OP_OPTIONS_ENVOI_COLIS, () => ({
    suggestion: { surnom, telephone: telephoneDepuis(telAffiche), destination: { ville, gare } },
    departs: [
      {
        departId,
        compagnie: offre.compagnie ?? "",
        heureDepart: isoDu(jour, offre.heure ?? "00:00"),
        retrait,
        arriveePrevue: isoDu(jour, `${String(arrivee ?? "0").padStart(2, "0")}:00`),
        port,
        recommande: offre.choisi === true,
      },
    ],
    modes: [
      { mode: "gare" as const, detail: sansPuce(offre.detail), supplement: 0 },
      ...e.depart.options
        .filter((o) => o.mode !== undefined)
        .map((o) => ({
          mode: o.mode as "relais" | "moto",
          detail: o.detail,
          supplement: o.supplement ?? 0,
        })),
    ],
    assurance: {
      tauxPct: TARIFS.assurance.tauxPct,
      minimum: TARIFS.assurance.minimum,
      plafondValeur: TARIFS.assurance.plafondValeur,
      assureur: sansPuce(e.assurance.detail.split("·").pop() ?? ""),
    },
    interdits: e.detailPrix.split("interdits :").pop()?.trim() ?? "",
  }));

  installer(sc, OP_ESTIMER_PHOTO_COLIS, (p) => {
    const m = /taille estimée : (.+?) · (\d+(?:,\d+)?) kg/.exec(e.photo);
    return {
      photoRef: p.photoRef,
      taille: m?.[1] ?? "colis",
      poidsKg: m ? decimal(m[2] ?? "1") : 1,
    };
  });

  installer(sc, OP_DEVIS_COLIS, (p) => devisDe(p));

  installer(sc, OP_CREER_COLIS, async (p, ctx) => {
    const devis = devisDe({
      departId: p.departId,
      mode: p.mode,
      valeurAssuree: p.assurer ? p.valeurDeclaree : 0,
    });
    if (p.mode === "relais" && !p.relaisId) {
      throw new ErreurHttp(422, "Choisissez un point relais", "relais_requis");
    }
    if (p.mode === "moto" && !p.adresseLivraison) {
      throw new ErreurHttp(422, "Indiquez l'adresse de livraison", "adresse_requise");
    }
    const maintenant = ctx.horloge.iso();
    const emis = await emettreCodeRetrait(ctx.alea);
    sequence += 1;
    const colis = creerColis({
      id: "",
      numero: numeroColis({ gare: "DLA", at: maintenant, sequence }),
      sequence,
      gareOrigineId: GARE_ORIGINE_DEMO,
      gareDestinationId: GARE_DESTINATION_DEMO,
      departId: p.departId,
      expediteur: EXPEDITEUR_DEMO,
      destinataire: p.destinataire,
      contenu: p.contenu,
      poidsKg: p.poidsKg,
      valeurDeclaree: p.valeurDeclaree,
      assure: p.assurer,
      mode: p.mode,
      canal: "app",
      codeRetraitHache: emis.hache,
      codeRetraitSel: emis.sel,
      prixTotal: devis.total,
      creeA: maintenant,
    });
    const complet: Colis = { ...colis, id: `colis-${colis.numero.toLowerCase()}` };
    crees.set(complet.id, { colis: complet, code: emis.code });
    return {
      colis: proprietaireDepuisDomaine(complet, emis.code),
      devis,
      paiement: {
        reference: `PAY-${complet.numero}`,
        moyen: p.paiement.moyen,
        etat: "paye" as const,
        montant: devis.total,
      },
      etiquettePrete: true,
    };
  });

  // Après la création, l'écran « code » relit le colis par son identifiant.
  installer(sc, OP_COLIS, ({ colisId }) => {
    const cree = crees.get(colisId);
    if (!cree) throw new ErreurHttp(404, "Colis introuvable", "colis_introuvable");
    return proprietaireDepuisDomaine(cree.colis, cree.code);
  });
}

/* ------------------------------------------------------------------ ColisCode (14) */

interface DonneesColisCode {
  titre: string;
  resume: string;
  retrait: {
    _colisId: string;
    libelle: string;
    code: string;
    consigne: string;
    photo: { libelle: string; heure: string };
  };
  suivi: { etape?: string; detail: string; heure: string }[];
  options: { titre: string; detail: string }[];
  reclamation: string;
}

const ORDRE_JALONS = c.JALONS_SUIVI;

export function installerColisCode(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesColisCode>(d);
  const jour = jourDe(d.horloge);
  const entite = colisDeLaPlanche(d, e.retrait._colisId);
  const surnom = e.titre.replace(/^Colis pour\s+/, "");
  let mode: Colis["mode"] = entite.mode;
  let reclamations = 0;

  const suivi: c.EtapeSuivi[] = ORDRE_JALONS.map((jalon, i) => {
    const ligne = e.suivi[i];
    const heure = ligne?.heure ?? "—";
    const connue = heureDans(heure);
    const detail = sansPuce(
      (ligne?.detail ?? "").replace(new RegExp(`^${LIBELLES_JALON[jalon]}`), ""),
    );
    return {
      jalon,
      libelle: LIBELLES_JALON[jalon],
      detail: detail === "" ? null : detail,
      a: connue ? isoDu(jour, connue) : null,
      estimee: heure.startsWith("~"),
      fait: connue !== null && !heure.startsWith("~"),
    };
  });
  const prevue = suivi.find((s) => s.estimee)?.a ?? null;
  const parHeure = new Map(e.options.map((o) => [o.titre, o]));
  const options: c.ColisProprietaire["options"] = [...parHeure.values()].map((o) => {
    const prix = entierDe(/(\d[\d ]*)\s*F/.exec(o.detail)?.[1] ?? "0");
    return {
      mode: /relais/i.test(o.titre) ? ("relais" as const) : ("moto" as const),
      titre: o.titre,
      detail: o.detail,
      prix,
    };
  });

  const vue = (): c.ColisProprietaire => ({
    id: entite.id,
    numero: e.resume.split("·")[0]?.trim() ?? entite.numero,
    role: "expediteur",
    etat: entite.etat,
    mode,
    contenu: entite.contenu,
    poidsKg: entite.poidsKg,
    assure: entite.assure,
    valeurAssuree: entite.assure ? entite.valeurDeclaree : 0,
    prixTotal: entite.prixTotal,
    creeA: entite.creeA,
    expediteur: entite.expediteur,
    destinataire: {
      nom: entite.destinataire.nom,
      surnom,
      telephone: entite.destinataire.telephone,
    },
    retrait: {
      code: chiffres(e.retrait.code),
      libelle: e.retrait.libelle,
      consigne: e.retrait.consigne,
      photoDepot: {
        libelle: e.retrait.photo.libelle,
        a: isoDu(jour, e.retrait.photo.heure),
      },
    },
    suivi,
    arriveePrevue: prevue,
    options: options.filter((o) => o.mode !== mode),
    reclamation: {
      delaiReponseJoursOuvres: Number(/(\d+) jours ouvrés/.exec(e.reclamation)?.[1] ?? 2),
      multiplePortSiPerte: Number(/(\d+) × le port/.exec(e.reclamation)?.[1] ?? 10),
      texte: e.reclamation,
    },
  });

  const verifier = (colisId: string): void => {
    if (colisId !== entite.id) throw new ErreurHttp(404, "Colis introuvable", "colis_introuvable");
  };

  installer(sc, OP_COLIS, ({ colisId }) => {
    verifier(colisId);
    return vue();
  });

  installer(sc, OP_ENVOYER_CODE_COLIS, (p, ctx) => {
    verifier(p.colisId);
    return {
      colisId: p.colisId,
      canal: p.canal ?? "sms",
      envoyeA: masquerTelephone(entite.destinataire.telephone),
      envoyeLe: ctx.horloge.iso(),
    };
  });

  installer(sc, OP_RECLAMER_COLIS, (p, ctx) => {
    verifier(p.colisId);
    reclamations += 1;
    const ouverteLe = ctx.horloge.iso();
    return {
      reference: `RCL-${entite.numero}-${reclamations}`,
      colisId: p.colisId,
      motif: p.motif,
      ouverteLe,
      reponseAvant: ajouterJoursOuvres(ouverteLe, vue().reclamation.delaiReponseJoursOuvres),
    };
  });

  installer(sc, OP_CHANGER_MODE_COLIS, (p) => {
    verifier(p.colisId);
    const supplement =
      p.mode === "relais" ? repartitionRelais().voyageur : TARIFS.livraison.minimum;
    mode = p.mode;
    return {
      colisId: p.colisId,
      mode: p.mode,
      supplement,
      devis: { total: entite.prixTotal + supplement },
    };
  });

  sc.flux.push(
    simulerFlux(CANAL_SUIVI_COLIS, (p, ctx) => {
      verifier(p.colisId);
      const dernier = [...suivi].reverse().find((s) => s.fait);
      ctx.emettre({
        colisId: p.colisId,
        etat: entite.etat as EtatColis,
        jalon: dernier?.jalon ?? "depose",
        a: dernier?.a ?? d.maintenant,
      });
    }),
  );
}

/* ------------------------------------------------------------------ Relais (15) */

interface DonneesRelais {
  carte: string[];
  titre: string;
  relais: { rang: number; nom: string; etat: string; detail: string; supplement: number }[];
  devenir: { titre: string; detail: string };
}

export function installerRelais(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesRelais>(d);
  const jour = jourDe(d.horloge);
  const ville = e.titre.split("·").pop()?.trim() ?? "";

  const points: c.PointRelais[] = e.relais.map((r) => {
    const parties = r.detail.split("·").map((s) => s.trim());
    const distance = parties[0] ?? "";
    const km = /([\d,]+)\s*km/.exec(distance);
    const m = /(\d+)\s*m\b/.exec(distance);
    const distanceM = km ? Math.round(decimal(km[1] ?? "0") * 1000) : Number(m?.[1] ?? 0);
    const reste = parties.slice(1);
    const note = reste.find((s) => s.includes("★"));
    const remis = reste.find((s) => /colis remis/.test(s));
    const horaires = reste[0] ?? "";
    const jours =
      reste[1] && reste[1] !== note && reste[1] !== remis && /(lun|7 j)/.test(reste[1])
        ? reste[1]
        : null;
    const particularite =
      reste.slice(1).find((s) => s !== jours && s !== note && s !== remis) ?? null;
    const ferme = /ferme à (\d{1,2}) h/.exec(r.etat)?.[1];
    return {
      id: `relais-${slug(r.nom)}`,
      rang: r.rang,
      nom: r.nom,
      ouvert: /ouvert|ferme à/.test(r.etat),
      fermeLe: ferme ? isoDu(jour, `${ferme.padStart(2, "0")}:00`) : null,
      distanceM,
      horaires,
      jours,
      note: decimal(note?.replace("★", "") ?? "0"),
      colisRemis: remis ? entierDe(remis) : null,
      particularite,
      supplement: r.supplement,
    };
  });

  const surnom = e.carte.find((x) => /^Chez /.test(x))?.replace(/^Chez /, "") ?? "";
  const reperes: c.RelaisProches["reperes"] = e.carte.map((libelle) => {
    if (/^\d+$/.test(libelle)) {
      const rang = Number(libelle);
      return {
        type: "relais" as const,
        libelle: points.find((p) => p.rang === rang)?.nom ?? libelle,
        rang,
      };
    }
    if (/^Chez /.test(libelle)) return { type: "destinataire" as const, libelle, rang: null };
    if (/^Gare /.test(libelle)) return { type: "gare" as const, libelle, rang: null };
    return { type: "marche" as const, libelle, rang: null };
  });

  installer(sc, OP_RELAIS_PROCHES, ({ q }) => {
    const motif = q ? slug(q) : "";
    return {
      ville,
      reperes,
      destinataire: { surnom },
      relais: motif ? points.filter((p) => slug(p.nom).includes(motif)) : points,
      devenir: {
        titre: e.devenir.titre,
        detail: e.devenir.detail,
        partParColis: entierDe(/(\d[\d ]*)\s*F/.exec(e.devenir.titre)?.[1] ?? "0"),
      },
    };
  });

  installer(sc, OP_CHOISIR_RELAIS, (p) => {
    const point = points.find((x) => x.id === p.relaisId);
    if (!point) throw new ErreurHttp(404, "Point relais introuvable", "relais_introuvable");
    return {
      colisId: p.colisId,
      relais: { id: point.id, nom: point.nom },
      supplement: point.supplement,
      destinatairePrevenu: true,
    };
  });
}

/* ------------------------------------------------------------------ Livraison (16) */

interface DonneesLivraison {
  carte: string[];
  statut: string;
  arrivee: { _colisId: string; libelle: string; heure: string; colis: string; detail: string };
  livreur: { initiales: string; nom: string; reputation: string; moto: string };
  remise: { etat: string; texte: string };
  devenir: { titre: string; detail: string };
  pied: { libelle: string; assurance: string };
}

export function installerLivraison(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesLivraison>(d);
  const jour = jourDe(d.horloge);
  const colis = colisDeLaPlanche(d, e.arrivee._colisId);
  const livreurId =
    [...colis.historique].reverse().find((h) => h.par !== undefined)?.par ?? "livreur-inconnu";
  let adresse = e.carte[2] ?? "";

  const [depart = "", retire = ""] = (e.carte[0] ?? "").split("·").map((s) => s.trim());
  const heureRetrait = heureDans(retire) ?? "00:00";
  const minutes = Number(/(\d+)\s*min/.exec(e.carte[1] ?? "")?.[1] ?? 0);
  const reputation = e.livreur.reputation;
  const gilet = /gilet[^\d]*(\d+)/.exec(e.livreur.moto);
  const montants = [...e.pied.libelle.matchAll(/(\d[\d ]*)\s*F/g)].map((m) =>
    entierDe(m[1] ?? "0"),
  );

  const arriveeEstimee = isoDu(jour, e.arrivee.heure);

  const vue = (): c.LivraisonColis => ({
    colisId: colis.id,
    numero: colis.numero,
    statut: "en_livraison",
    carte: {
      depart: { libelle: depart, retireLe: isoDu(jour, heureRetrait) },
      livreurMinutes: minutes,
      arrivee: adresse,
    },
    arrivee: {
      libelle: e.arrivee.libelle,
      estimee: arriveeEstimee,
      poidsKg: colis.poidsKg,
      assure: colis.assure,
    },
    livreur: {
      id: livreurId,
      initiales: e.livreur.initiales,
      nom: e.livreur.nom.split("·")[0]?.trim() ?? e.livreur.nom,
      verifie: /^vérifié/.test(reputation),
      note: decimal(/([\d,]+)\s*★/.exec(reputation)?.[1] ?? "0"),
      livraisons: entierDe(/(\d[\d ]*)\s*livraisons/.exec(reputation)?.[1] ?? "0"),
      moto: e.livreur.moto.split("·")[0]?.trim() ?? e.livreur.moto,
      gilet: Number(gilet?.[1] ?? 0),
    },
    remise: {
      destinataireALeCode: /a le code/.test(e.remise.etat),
      code: chiffres(/code ((?:\d\s?){6})/.exec(e.remise.texte)?.[1] ?? ""),
      attenteAbsenceMinutes: Number(/attend (\d+) min/.exec(e.remise.texte)?.[1] ?? 10),
      relaisDeRepli: /dépose chez ([^.]+)\./.exec(e.remise.texte)?.[1]?.trim() ?? "",
    },
    prix: {
      livraison: montants[0] ?? repartitionLivraison(TARIFS.livraison.minimum).livreur,
      payee: /payée/.test(e.pied.libelle),
      partLivreur: montants[1] ?? 0,
    },
    devenir: e.devenir,
  });

  const verifier = (colisId: string): void => {
    if (colisId !== colis.id) throw new ErreurHttp(404, "Colis introuvable", "colis_introuvable");
  };

  installer(sc, OP_LIVRAISON_COLIS, ({ colisId }) => {
    verifier(colisId);
    return vue();
  });

  installer(sc, OP_PARTAGER_SUIVI_LIVRAISON, (p) => {
    verifier(p.colisId);
    return {
      colisId: p.colisId,
      lien: `/suivi/${colis.numero.toLowerCase()}`,
      envoyeA: masquerTelephone(p.destinataire),
    };
  });

  installer(sc, OP_CHANGER_ADRESSE_LIVRAISON, (p) => {
    verifier(p.colisId);
    adresse = p.adresse;
    return { colisId: p.colisId, adresse: p.adresse, livreurPrevenu: true };
  });

  sc.flux.push(
    simulerFlux(CANAL_POSITION_LIVREUR, (p, ctx) => {
      verifier(p.colisId);
      let restant = minutes;
      const emettre = (): void => {
        ctx.emettre({ colisId: p.colisId, minutesRestantes: restant, arriveeEstimee });
        if (restant > 0) {
          restant -= 1;
          ctx.planifier(60_000, emettre);
        }
      };
      emettre();
    }),
  );
}
