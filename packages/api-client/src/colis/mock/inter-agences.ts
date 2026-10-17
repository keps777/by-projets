import type { colis as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/erreurs";
import {
  OP_CONTESTER_REGLEMENT,
  OP_CONVENTION_INTER_AGENCES,
  OP_INTER_AGENCES,
  OP_INVITER_COMPAGNIE,
  OP_REGLEMENT_INTER_AGENCES,
  OP_SCANNER_TRANSFERT_COLIS,
} from "../operations";
import {
  colisDeLaPlanche,
  entierDe,
  heureDans,
  installer,
  installerPartenaire,
  isoDu,
  jourDe,
  lire,
  MOIS_ABREGES,
  sansPuce,
  versColisPartenaire,
} from "./outils";
import type { DonneesScenario, ScenarioEnConstruction } from "./outils";

const CONVENTION_ALPHA_OMEGA = "convention-alpha-omega";

/** Jour AAAA-MM-JJ à `n` jours de `jour`. */
function plusJours(jour: string, n: number): string {
  return new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Prochain lundi strictement après `jour`. */
function prochainLundi(jour: string): string {
  const semaine = new Date(`${jour}T12:00:00Z`).getUTCDay(); // 0 dimanche
  return plusJours(jour, (8 - semaine) % 7 || 7);
}

/* ------------------------------------------------------------------ InterAgences (37) */

interface DonneesInterAgences {
  titre: string;
  sousTitre: string;
  colis: {
    _colisId: string;
    titre: string;
    troncons: { libelle: string; trajet: string; horaire: string; part: string }[];
    regle: string;
  };
  reglement: {
    titre: string;
    jour: string;
    lignes: { libelle: string; montant: number }[];
  };
  voyageurs: { titre: string; texte: string };
  actions: string[];
}

export function installerInterAgences(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesInterAgences>(d);
  const jour = jourDe(d.horloge);
  const colis = colisDeLaPlanche(d, e.colis._colisId);
  const lundi = prochainLundi(jour);
  const heureReglement = heureDans(e.reglement.lignes.at(-1)?.libelle ?? "") ?? "08:00";
  const reglementLe = isoDu(lundi, heureReglement);
  const contestationJusqua = isoDu(plusJours(lundi, -1), "20:00");

  const troncons: c.Troncon[] = e.colis.troncons.map((t, i) => {
    const heures = t.horaire.match(/\d{2}:\d{2}/g) ?? [];
    const [rang, compagnie] = [
      Number(/Tronçon (\d+)/.exec(t.libelle)?.[1] ?? i + 1),
      t.libelle.split("·").pop()?.trim() ?? "",
    ];
    return {
      rang,
      compagnie,
      trajet: t.trajet,
      depart: isoDu(jour, heures[0] ?? "00:00"),
      bus: t.horaire.split("·")[1]?.trim() ?? "",
      arrivee: isoDu(jour, heures[1] ?? heures[0] ?? "00:00"),
      part: entierDe(t.part.split("·")[0] ?? "0"),
    };
  });

  const creances: c.ReglementHebdo["creances"] = e.reglement.lignes
    .filter((l) => /doi[ts]/.test(l.libelle))
    .map((l) => {
      const nousDoivent = /te doit/.test(l.libelle);
      const compagnie = nousDoivent
        ? (/^(.+?) te doit/.exec(l.libelle)?.[1] ?? "")
        : (/à (.+?) ·/.exec(l.libelle)?.[1] ?? "");
      return {
        compagnie,
        sens: nousDoivent ? ("nous_doivent" as const) : ("nous_devons" as const),
        colis: Number(/(\d+) colis/.exec(l.libelle)?.[1] ?? 0),
        montant: Math.abs(l.montant),
      };
    });
  const solde = e.reglement.lignes.at(-1);

  const reglement: c.ReglementHebdo = {
    titre: e.reglement.titre,
    jour: e.reglement.jour,
    creances,
    soldeNet: solde?.montant ?? 0,
    moyen: /par (\w+)/.exec(solde?.libelle ?? "")?.[1] ?? "MoMo",
    reglementLe,
    contestationJusqua,
  };

  const nomConvention = e.actions[0]?.split("·")[0]?.trim() ?? "Convention";
  const partenaire = nomConvention.replace(/^Convention\s+/, "");

  installer(sc, OP_INTER_AGENCES, () => ({
    titre: e.titre,
    sousTitre: e.sousTitre,
    colis: [
      {
        colis: versColisPartenaire(colis),
        trajet: e.colis.titre.split("·")[0]?.trim() ?? "",
        troncons,
        regle: e.colis.regle,
      },
    ],
    conventions: [{ id: CONVENTION_ALPHA_OMEGA, partenaire, libelle: nomConvention }],
    voyageurs: {
      titre: e.voyageurs.titre,
      texte: e.voyageurs.texte,
      correspondanceMinutes: Number(/(\d+) min garantie/.exec(e.voyageurs.texte)?.[1] ?? 0),
      attenteSecondBusMinutes: Number(/attend (\d+) min/.exec(e.voyageurs.texte)?.[1] ?? 0),
    },
  }));

  installer(sc, OP_REGLEMENT_INTER_AGENCES, () => reglement);

  installer(sc, OP_CONTESTER_REGLEMENT, (_p, ctx) => {
    const deposeeLe = ctx.horloge.iso();
    return {
      reference: `CTX-${lundi.replace(/-/g, "")}-1`,
      deposeeLe,
      recevable: Date.parse(deposeeLe) <= Date.parse(contestationJusqua),
    };
  });

  installer(sc, OP_INVITER_COMPAGNIE, (_p, ctx) => ({
    reference: `INV-${jour.replace(/-/g, "")}-1`,
    envoyeeLe: ctx.horloge.iso(),
  }));

  installerPartenaire(sc, OP_SCANNER_TRANSFERT_COLIS, (p, ctx) => {
    if (p.colisId !== colis.id) throw new ErreurHttp(404, "Colis introuvable", "colis_introuvable");
    return {
      colis: versColisPartenaire(colis),
      sens: p.sens,
      compagnie: p.compagnie,
      scanneLe: ctx.horloge.iso(),
      responsable: p.sens === "recu" ? ("preneur" as const) : ("cedant" as const),
    };
  });
}

/* ------------------------------------------------------------------ InterAgencesConvention (37b) */

interface DonneesConvention {
  titre: string;
  detail: string;
  badge: string;
  parts: {
    titre: string;
    aide: string;
    entetes: string[];
    lignes: { troncon: string; alpha: number | string; omega: number | string }[];
    total: { libelle: string; alpha: number; omega: number };
  };
  regles: { titre: string; liste: { titre: string; texte: string }[] };
  signatures: { libelle: string; detail: string }[];
  trimestre: { libelle: string; valeur: number | string; detail: string }[];
  pied: string;
}

/** « 12 oct. 09:40 » (année donnée) → ISO. */
function dateSignature(texte: string, annee: string): string {
  const m = /(\d{1,2}) ([^\s\d]+\.?) (\d{2}:\d{2})/.exec(texte);
  if (!m) throw new Error(`Date de signature illisible : « ${texte} »`);
  const mois = MOIS_ABREGES[m[2] ?? ""];
  if (!mois) throw new Error(`Mois inconnu : « ${m[2]} »`);
  const jour = `${annee}-${String(mois).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  return isoDu(jour, m[3] ?? "00:00");
}

/** La convention de la planche InterAgencesConvention, au contrat unique `colis.SchemaConvention`. */
export function construireConvention(d: DonneesScenario): c.Convention {
  const e = lire<DonneesConvention>(d);
  const annee = /(\d{4})/.exec(e.detail)?.[1] ?? jourDe(d.horloge).slice(0, 4);
  const [, nomAlpha = "Alpha", nomOmega = "Oméga"] = e.parts.entetes;
  const valeur = (v: number | string): number | null => (typeof v === "number" ? v : null);

  const signatures = e.signatures.map((s) => {
    const [signataire = "", , quand = ""] = s.detail.split("·").map((x) => x.trim());
    return {
      compagnie: s.libelle.replace(/^Signé pour\s+/, ""),
      signataire,
      moi: signataire === "Toi",
      signeLe: dateSignature(quand, annee),
      parPin: true as const,
    };
  });
  const derniere =
    signatures
      .map((s) => s.signeLe)
      .sort()
      .at(-1) ?? isoDu(jourDe(d.horloge), "00:00");
  const [echanges, litiges, net] = e.trimestre;

  const convention: c.Convention = {
    id: CONVENTION_ALPHA_OMEGA,
    titre: e.titre,
    signeLe: derniere,
    renouvellement: sansPuce(e.detail.split("·").pop() ?? ""),
    statut: e.badge === "ACTIVE" ? "active" : "suspendue",
    parts: {
      titre: e.parts.titre,
      aide: e.parts.aide,
      entetes: e.parts.entetes,
      lignes: e.parts.lignes.map((l) => ({
        troncon: l.troncon,
        parts: { [nomAlpha]: valeur(l.alpha), [nomOmega]: valeur(l.omega) },
      })),
      total: {
        libelle: e.parts.total.libelle,
        prixClient: entierDe(/paie ([\d ]+)/.exec(e.parts.total.libelle)?.[1] ?? "0"),
        fraisAfrimove: entierDe(/AfriMove ([\d ]+)/.exec(e.parts.total.libelle)?.[1] ?? "0"),
        parts: { [nomAlpha]: e.parts.total.alpha, [nomOmega]: e.parts.total.omega },
      },
    },
    regles: {
      titre: e.regles.titre,
      liste: e.regles.liste.map((r, i) => ({
        rang: Number(/^(\d+)/.exec(r.titre)?.[1] ?? i + 1),
        titre: r.titre.replace(/^\d+\s*·\s*/, ""),
        texte: r.texte,
      })),
    },
    signatures,
    trimestre: {
      colisEchanges: entierDe(echanges?.valeur ?? 0),
      litiges: entierDe(litiges?.valeur ?? 0),
      delaiLitigeJours: Number(/(\d+) jours?/.exec(litiges?.detail ?? "")?.[1] ?? NaN) || null,
      netRecu: entierDe(
        typeof net?.valeur === "string" ? net.valeur.replace(/^\+\s*/, "") : (net?.valeur ?? 0),
      ),
      lundis: Number(/(\d+) lundis/.exec(net?.detail ?? "")?.[1] ?? 0),
    },
    pied: e.pied,
  };
  return convention;
}

export function installerConvention(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const convention = construireConvention(d);
  installer(sc, OP_CONVENTION_INTER_AGENCES, ({ conventionId }) => {
    if (conventionId !== CONVENTION_ALPHA_OMEGA) {
      throw new ErreurHttp(404, "Convention introuvable", "convention_introuvable");
    }
    return convention;
  });
}
