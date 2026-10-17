import {
  IDS_EXPORT,
  type Cellule,
  type DonneesMois,
  type FormatExport,
  type IdExport,
  type LignePdf,
  type Onglet,
  type TableauFixe,
  type VenteComptable,
} from "./modele";
import {
  FRAIS_AGENCE_BILLET,
  FRAIS_AGENCE_COLIS,
  accorder,
  ecritures,
  encaisse,
  estAnnulee,
  facturesHebdo,
  modeDeLaVente,
  nombre,
} from "./regles";
import {
  enMs,
  heureDouala,
  jourDouala,
  jourMois,
  joursDuMois,
  libelleMois,
  nomDuMois,
} from "./temps";

/**
 * Les cinq exports à colonnes fixes. Les colonnes ne dépendent ni du mois ni des données : `COLONNES` est la
 * seule définition, et un test les épingle (« mêmes colonnes chaque mois »). Chaque constructeur rend un
 * `TableauFixe`, indépendant du format du fichier ; `fichiers.ts` l'écrit en CSV, XLSX ou PDF.
 */

export const COLONNES = {
  ventes: [
    "date",
    "heure",
    "ligne",
    "depart",
    "siege",
    "classe",
    "prix",
    "mode",
    "ref",
    "guichet",
    "pin",
  ],
  parJour: ["date", "billets", "colis", "cash", "momo", "carte", "total"],
  parGuichet: ["guichet", "billets", "colis", "cash", "momo", "carte", "total"],
  totaux: ["indicateur", "valeur"],
  sessions: [
    "date",
    "session",
    "guichet",
    "agent",
    "ouverture",
    "cloture",
    "fond",
    "cash",
    "momo",
    "carte",
    "attendu",
    "compte",
    "ecart",
    "valide_par",
    "validation",
  ],
  annulations: [
    "date",
    "heure",
    "ref",
    "genre",
    "montant",
    "decision",
    "motif",
    "demande_par",
    "valide_par",
    "validation",
  ],
  ecritures: ["journal", "date", "piece", "compte", "libelle", "debit", "credit"],
  factures: [
    "semaine_du",
    "semaine_au",
    "billets",
    "colis",
    "montant_billets",
    "montant_colis",
    "total",
    "payee_le",
  ],
} as const satisfies Record<string, readonly string[]>;

/** Les colonnes de chaque export (le premier onglet), pour le nombre de colonnes annoncé. */
export const COLONNES_PAR_EXPORT: Readonly<Record<IdExport, readonly string[]>> = {
  journal_ventes: COLONNES.ventes,
  journal_caisse: COLONNES.sessions,
  annulations: COLONNES.annulations,
  ecritures_syscohada: COLONNES.ecritures,
  factures_afrimove: COLONNES.factures,
};

export const NOM_EXPORT: Readonly<Record<IdExport, string>> = {
  journal_ventes: "Journal des ventes",
  journal_caisse: "Journal de caisse",
  annulations: "Annulations et remboursements",
  ecritures_syscohada: "Écritures SYSCOHADA",
  factures_afrimove: "Factures AfriMove",
};

export const FORMAT_EXPORT: Readonly<Record<IdExport, FormatExport>> = {
  journal_ventes: "XLSX",
  journal_caisse: "XLSX",
  annulations: "CSV",
  ecritures_syscohada: "CSV",
  factures_afrimove: "PDF",
};

const RACINE_FICHIER: Readonly<Record<IdExport, string>> = {
  journal_ventes: "journal-ventes",
  journal_caisse: "journal-caisse",
  annulations: "annulations-remboursements",
  ecritures_syscohada: "ecritures-syscohada",
  factures_afrimove: "factures-afrimove",
};

export const EXTENSION: Readonly<Record<FormatExport, string>> = {
  XLSX: "xlsx",
  CSV: "csv",
  PDF: "pdf",
};

export const TYPE_MIME: Readonly<Record<FormatExport, string>> = {
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv; charset=utf-8",
  PDF: "application/pdf",
};

/** « Journal des ventes · décembre » */
export function nomAvecMois(id: IdExport, mois: string): string {
  return `${NOM_EXPORT[id]} · ${nomDuMois(mois)}`;
}

/** « journal-ventes-2026-12.xlsx » */
export function nomDeFichier(id: IdExport, mois: string): string {
  return `${RACINE_FICHIER[id]}-${mois}.${EXTENSION[FORMAT_EXPORT[id]]}`;
}

const somme = (valeurs: readonly number[]): number => valeurs.reduce((s, v) => s + v, 0);

/* ------------------------------------------------------------------ journal des ventes */

function trierVentes(ventes: readonly VenteComptable[]): VenteComptable[] {
  return [...ventes].sort((a, b) => enMs(a.at) - enMs(b.at) || a.numero.localeCompare(b.numero));
}

function repartition(ventes: readonly VenteComptable[]) {
  const vivantes = ventes.filter((v) => !estAnnulee(v));
  const e = encaisse(vivantes);
  return {
    billets: vivantes.filter((v) => v.genre === "billet").length,
    colis: vivantes.filter((v) => v.genre === "colis").length,
    ...e,
  };
}

function journalDesVentes(d: DonneesMois): TableauFixe {
  const triees = trierVentes(d.ventes);
  const total = encaisse(d.ventes).total;
  const lignes: Cellule[][] = triees.map((v) => [
    jourDouala(v.at),
    heureDouala(v.at),
    v.ligne,
    v.depart,
    v.siege,
    v.classe,
    v.prix,
    modeDeLaVente(v),
    v.referenceOperateur ?? v.numero,
    v.guichet,
    v.agent,
  ]);

  const parJour = joursDuMois(d.mois).map((jour) => {
    const r = repartition(d.ventes.filter((v) => jourDouala(v.at) === jour));
    return [jour, r.billets, r.colis, r.cash, r.momo, r.carte, r.total];
  });

  const codes = [...new Set(d.ventes.map((v) => v.guichet))].sort();
  const parGuichet = codes.map((code) => {
    const r = repartition(d.ventes.filter((v) => v.guichet === code));
    return [code, r.billets, r.colis, r.cash, r.momo, r.carte, r.total];
  });

  const globale = repartition(d.ventes);
  const totaux: Cellule[][] = [
    ["lignes", d.ventes.length],
    ["billets", globale.billets],
    ["colis", globale.colis],
    ["annulees", d.ventes.filter(estAnnulee).length],
    ["cash", globale.cash],
    ["momo", globale.momo],
    ["carte", globale.carte],
    ["total_encaisse", globale.total],
  ];

  const onglets: Onglet[] = [
    {
      id: "ventes",
      libelle: `Ventes · ${nombre(triees.length)}`,
      colonnes: [...COLONNES.ventes],
      lignes,
      totalMontant: total,
    },
    {
      id: "par_jour",
      libelle: "Par jour",
      colonnes: [...COLONNES.parJour],
      lignes: parJour,
      totalMontant: total,
    },
    {
      id: "par_guichet",
      libelle: "Par guichet",
      colonnes: [...COLONNES.parGuichet],
      lignes: parGuichet,
      totalMontant: total,
    },
    {
      id: "totaux",
      libelle: "Totaux",
      colonnes: [...COLONNES.totaux],
      lignes: totaux,
      totalMontant: total,
    },
  ];
  return { id: "journal_ventes", lignes: triees.length, onglets, texte: [] };
}

/* ------------------------------------------------------------------ journal de caisse */

function journalDeCaisse(d: DonneesMois): TableauFixe {
  const sessions = [...d.sessions].sort(
    (a, b) => enMs(a.ouverteA) - enMs(b.ouverteA) || a.numero.localeCompare(b.numero),
  );
  const lignes: Cellule[][] = sessions.map((s) => {
    const r = repartition(d.ventes.filter((v) => v.sessionId === s.id));
    return [
      jourDouala(s.ouverteA),
      s.numero,
      s.guichet,
      s.agent,
      heureDouala(s.ouverteA),
      s.clotureeA ? heureDouala(s.clotureeA) : null,
      s.fond,
      r.cash,
      r.momo,
      r.carte,
      s.cashAttendu,
      s.cashCompte,
      s.ecart,
      s.validePar,
      s.validation === null ? null : s.validation.toUpperCase(),
    ];
  });
  const encaisseSessions = somme(
    lignes.map((l) => (l[7] as number) + (l[8] as number) + (l[9] as number)),
  );

  const global = encaisse(d.ventes).total;
  const guichets = encaisse(d.ventes.filter((v) => v.sessionId !== null)).total;
  const totaux: Cellule[][] = [
    ["sessions", sessions.length],
    ["ecarts", somme(sessions.map((s) => s.ecart ?? 0))],
    ["encaisse_guichets", guichets],
    ["encaisse_en_ligne", global - guichets],
    ["total_encaisse", global],
  ];
  return {
    id: "journal_caisse",
    lignes: sessions.length,
    onglets: [
      {
        id: "sessions",
        libelle: `Sessions · ${nombre(sessions.length)}`,
        colonnes: [...COLONNES.sessions],
        lignes,
        totalMontant: encaisseSessions,
      },
      {
        id: "totaux",
        libelle: "Totaux",
        colonnes: [...COLONNES.totaux],
        lignes: totaux,
        totalMontant: global,
      },
    ],
    texte: [],
  };
}

/* ------------------------------------------------------------------ annulations et remboursements */

function ligneValidation(v: "pin" | "empreinte" | null): string | null {
  return v === null ? null : v.toUpperCase();
}

function annulationsEtRemboursements(d: DonneesMois): TableauFixe {
  const entrees: { at: string; ref: string; ligne: Cellule[]; rembourse: number }[] = [];
  for (const a of d.annulations) {
    entrees.push({
      at: a.at,
      ref: a.numero,
      rembourse: a.decision === "rembourser" ? a.montant : 0,
      ligne: [
        jourDouala(a.at),
        heureDouala(a.at),
        a.numero,
        a.genre,
        a.montant,
        a.decision,
        a.motif,
        a.demandePar,
        a.validePar,
        ligneValidation(a.validation),
      ],
    });
  }
  // Les décisions du rapprochement MoMo : le cabinet les reçoit avec leurs références.
  for (const x of d.decisions) {
    entrees.push({
      at: x.decideA,
      ref: x.reference,
      rembourse: x.action === "rembourser" ? x.montant : 0,
      ligne: [
        jourDouala(x.decideA),
        heureDouala(x.decideA),
        x.reference,
        "momo_sans_correspondance",
        x.montant,
        x.action,
        x.explication,
        null,
        x.parNom,
        ligneValidation(x.methode),
      ],
    });
  }
  entrees.sort((a, b) => enMs(a.at) - enMs(b.at) || a.ref.localeCompare(b.ref));
  return {
    id: "annulations",
    lignes: entrees.length,
    onglets: [
      {
        id: "annulations",
        libelle: `Annulations · ${nombre(entrees.length)}`,
        colonnes: [...COLONNES.annulations],
        lignes: entrees.map((e) => e.ligne),
        totalMontant: somme(entrees.map((e) => e.rembourse)),
      },
    ],
    texte: [],
  };
}

/* ------------------------------------------------------------------ écritures SYSCOHADA */

function ecrituresSyscohada(d: DonneesMois): TableauFixe {
  const ecrits = ecritures(d);
  return {
    id: "ecritures_syscohada",
    lignes: ecrits.length,
    onglets: [
      {
        id: "ecritures",
        libelle: `Écritures · ${nombre(ecrits.length)}`,
        colonnes: [...COLONNES.ecritures],
        lignes: ecrits.map((e) => [
          e.journal,
          e.date,
          e.piece,
          e.compte,
          e.libelle,
          e.debit,
          e.credit,
        ]),
        totalMontant: somme(ecrits.map((e) => e.debit)),
      },
    ],
    texte: [],
  };
}

/* ------------------------------------------------------------------ factures AfriMove */

const francs = (n: number): string => `${nombre(n)} F`;

function facturesAfriMove(d: DonneesMois): TableauFixe {
  const factures = facturesHebdo(d);
  const total = somme(factures.map((f) => f.total));
  const texte: LignePdf[] = [
    { texte: `Factures AfriMove · ${libelleMois(d.mois)}`, gras: true, taille: 16 },
    { texte: d.parametres.nomAgence, gras: true, taille: 11 },
    {
      texte: `Une facture par semaine, du lundi au dimanche : ${FRAIS_AGENCE_BILLET} F par billet vendu, ${FRAIS_AGENCE_COLIS} F par colis.`,
    },
    { texte: "" },
  ];
  for (const f of factures) {
    texte.push({ texte: `Semaine du ${jourMois(f.du)} au ${jourMois(f.au)}`, gras: true });
    texte.push({
      texte:
        `${accorder(f.billets, "billet")} × ${FRAIS_AGENCE_BILLET} F = ${francs(f.montantBillets)} · ` +
        `${accorder(f.colis, "colis", "colis")} × ${FRAIS_AGENCE_COLIS} F = ${francs(f.montantColis)}`,
    });
    texte.push({
      texte: `Total ${francs(f.total)} · ${f.payeeLe ? `payée le ${f.payeeLe.slice(8, 10)}/${f.payeeLe.slice(5, 7)}` : "à payer"}`,
    });
    texte.push({ texte: "" });
  }
  texte.push({
    texte: `Total du mois : ${accorder(factures.length, "facture")} · ${francs(total)}`,
    gras: true,
  });
  return {
    id: "factures_afrimove",
    lignes: null,
    onglets: [
      {
        id: "factures",
        libelle: `Factures · ${nombre(factures.length)}`,
        colonnes: [...COLONNES.factures],
        lignes: factures.map((f) => [
          f.du,
          f.au,
          f.billets,
          f.colis,
          f.montantBillets,
          f.montantColis,
          f.total,
          f.payeeLe,
        ]),
        totalMontant: total,
      },
    ],
    texte,
  };
}

/* ------------------------------------------------------------------ point d'entrée */

export function construireTableau(id: IdExport, d: DonneesMois): TableauFixe {
  switch (id) {
    case "journal_ventes":
      return journalDesVentes(d);
    case "journal_caisse":
      return journalDeCaisse(d);
    case "annulations":
      return annulationsEtRemboursements(d);
    case "ecritures_syscohada":
      return ecrituresSyscohada(d);
    case "factures_afrimove":
      return facturesAfriMove(d);
  }
}

export function construireTousLesTableaux(d: DonneesMois): TableauFixe[] {
  return IDS_EXPORT.map((id) => construireTableau(id, d));
}

/** La description d'un export dans la liste du comptable, avec ses nombres de lignes. */
export function descriptionExport(
  id: IdExport,
  d: DonneesMois,
): { description: string; statut: "disponible" | "a_jour"; lignes: number | null } {
  switch (id) {
    case "journal_ventes":
      return {
        description: `une ligne par billet et par colis · ${accorder(d.ventes.length, "ligne")}`,
        statut: "disponible",
        lignes: d.ventes.length,
      };
    case "journal_caisse":
      return {
        description: "une ligne par session · écarts · validations PIN",
        statut: "disponible",
        lignes: d.sessions.length,
      };
    case "annulations": {
      const n = d.annulations.length + d.decisions.length;
      return {
        description: `motif · qui a validé · ${accorder(n, "ligne")}`,
        statut: "disponible",
        lignes: n,
      };
    }
    case "ecritures_syscohada":
      return {
        description: "706 · 571 · 462 · 622 · prêt pour le cabinet",
        statut: "disponible",
        lignes: ecritures(d).length,
      };
    case "factures_afrimove": {
      const factures = facturesHebdo(d);
      const dues = factures.filter((f) => f.payeeLe === null).length;
      const base = `${accorder(factures.length, "facture")} hebdo · ${FRAIS_AGENCE_BILLET} F / billet · ${FRAIS_AGENCE_COLIS} F / colis`;
      return {
        description:
          factures.length === 0
            ? base
            : dues === 0
              ? `${base} · payées`
              : `${base} · ${dues} à payer`,
        statut: dues === 0 ? "a_jour" : "disponible",
        lignes: null,
      };
    }
  }
}
