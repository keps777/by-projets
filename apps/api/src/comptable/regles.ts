import type {
  AnnulationComptable,
  DonneesMois,
  EncaisseMois,
  MoyenEncaissement,
  ResultatRapprochement,
  VenteComptable,
} from "./modele";
import { ajouterJours, debutDuJour, enMs, jourDouala, jourIso, joursDuMois } from "./temps";

/**
 * Règles comptables du module, toutes pures : ce qui est « encaissé », les factures hebdomadaires d'AfriMove,
 * les écritures SYSCOHADA. Les nombres de FCFA sont des entiers : aucune division, aucun arrondi, donc aucun
 * écart au franc près entre les exports.
 */

/** Facturé à l'agence par AfriMove : 75 F par billet vendu, 150 F par colis (`TARIFS` de `@afrimove/domain`, comparé par `parite.test.ts`). */
export const FRAIS_AGENCE_BILLET = 75;
export const FRAIS_AGENCE_COLIS = 150;

/**
 * Comptes SYSCOHADA des écritures (liste du ticket AM-114). À faire valider par le cabinet :
 *  - 706 : prestations de services vendues (billets et colis) ;
 *  - 571 : caisse (ventes encaissées en espèces) ;
 *  - 462 : opérateurs de paiement, mobile money et cartes, à rapprocher des relevés ;
 *  - 622 : frais facturés par AfriMove (75 F par billet, 150 F par colis).
 */
export const COMPTES = {
  ventes: "706",
  caisse: "571",
  operateurs: "462",
  fraisAfriMove: "622",
} as const;

/** « 31 404 » : espace simple entre les milliers, comme les maquettes. */
export function nombre(n: number): string {
  const signe = n < 0 ? "-" : "";
  return signe + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Pluriel simple : « 1 colis », « 2 colis ». */
export function accorder(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${nombre(n)} ${n > 1 ? pluriel : singulier}`;
}

export const estAnnulee = (v: Pick<VenteComptable, "annuleeA">): boolean => v.annuleeA !== null;

/** Valeur de la colonne `mode` du journal des ventes. */
export function modeDeLaVente(v: VenteComptable): string {
  if (estAnnulee(v)) return "ANNULÉ";
  switch (v.moyen) {
    case "cash":
      return "CASH";
    case "mtn":
      return "MOMO";
    case "orange":
      return "ORANGE";
    case "carte":
      return "CARTE";
  }
}

/** Le compte du bilan où l'argent est entré : la caisse pour les espèces, les opérateurs pour le reste. */
export function compteDeEncaissement(moyen: MoyenEncaissement): string {
  return moyen === "cash" ? COMPTES.caisse : COMPTES.operateurs;
}

export interface Encaisse {
  total: number;
  cash: number;
  momo: number;
  carte: number;
}

/**
 * Le total encaissé : la somme des prix des ventes qui tiennent à la fin du mois (une vente annulée dans le
 * mois ne compte pas). C'est le chiffre que **tous** les exports doivent retrouver au franc près.
 */
export function encaisse(ventes: readonly VenteComptable[]): Encaisse {
  const somme = { total: 0, cash: 0, momo: 0, carte: 0 };
  for (const v of ventes) {
    if (estAnnulee(v)) continue;
    somme.total += v.prix;
    if (v.moyen === "cash") somme.cash += v.prix;
    else if (v.moyen === "carte") somme.carte += v.prix;
    else somme.momo += v.prix;
  }
  return somme;
}

/**
 * Écart de rapprochement MoMo : l'argent reçu sur le compte marchand moins les ventes mobiles enregistrées,
 * une fois déduit ce que les décisions ont déjà traité (les transactions sans correspondance remboursées,
 * rattachées ou réclamées). Zéro quand tout est expliqué ; négatif quand on a enregistré plus qu'on n'a reçu.
 */
export function ecartMobile(rapprochement: ResultatRapprochement, montantTraite: number): number {
  return rapprochement.recuMarchand - rapprochement.montantMobileBrut - montantTraite;
}

export function encaisseDuMois(
  ventes: readonly VenteComptable[],
  rapprochement: ResultatRapprochement,
  montantTraite: number,
): EncaisseMois {
  return { ...encaisse(ventes), ecart: ecartMobile(rapprochement, montantTraite) };
}

/* ------------------------------------------------------------------ factures hebdomadaires */

export interface FactureHebdo {
  /** Lundi de la semaine facturée (`AAAA-MM-JJ`). */
  du: string;
  /** Dimanche, jour de la facture : elle appartient au mois de ce dimanche. */
  au: string;
  billets: number;
  colis: number;
  montantBillets: number;
  montantColis: number;
  total: number;
  /** Jour du paiement, nul tant que la facture est due. */
  payeeLe: string | null;
}

/** Les dimanches du mois : une facture hebdomadaire par dimanche, de lundi à dimanche. */
export function dimanchesDuMois(mois: string): string[] {
  return joursDuMois(mois).filter((j) => jourIso(j) === 7);
}

/** Le lundi qui ouvre la première semaine facturée du mois (peut tomber dans le mois précédent). */
export function lundiDeLaPremiereFacture(mois: string): string | null {
  const premier = dimanchesDuMois(mois)[0];
  return premier ? ajouterJours(premier, -6) : null;
}

/**
 * Les factures hebdomadaires des semaines **terminées** qui finissent dans le mois : 75 F par billet vendu et
 * non annulé, 150 F par colis. Une annulation postérieure à la fin de la semaine ne défait pas la facture.
 */
export function facturesHebdo(d: DonneesMois): FactureHebdo[] {
  const toutes = [...d.ventesAvant, ...d.ventes];
  const factures: FactureHebdo[] = [];
  for (const dimanche of dimanchesDuMois(d.mois)) {
    const lundi = ajouterJours(dimanche, -6);
    const debut = enMs(debutDuJour(lundi));
    const fin = enMs(debutDuJour(ajouterJours(dimanche, 1)));
    if (fin > enMs(d.maintenant)) continue; // la semaine n'est pas finie
    let billets = 0;
    let colis = 0;
    for (const v of toutes) {
      const t = enMs(v.at);
      if (t < debut || t >= fin) continue;
      if (v.annuleeA !== null && enMs(v.annuleeA) < fin) continue;
      if (v.genre === "billet") billets++;
      else colis++;
    }
    const montantBillets = billets * FRAIS_AGENCE_BILLET;
    const montantColis = colis * FRAIS_AGENCE_COLIS;
    factures.push({
      du: lundi,
      au: dimanche,
      billets,
      colis,
      montantBillets,
      montantColis,
      total: montantBillets + montantColis,
      payeeLe: d.facturesPayees.get(dimanche) ?? null,
    });
  }
  return factures;
}

/* ------------------------------------------------------------------ écritures SYSCOHADA */

export type JournalEcriture = "VE" | "AN" | "FA";

export interface Ecriture {
  journal: JournalEcriture;
  /** `AAAA-MM-JJ` */
  date: string;
  /** Numéro de pièce : `VE-261201`, `AN-<billet>`, `FA-261206`. */
  piece: string;
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
}

const aammjj = (jour: string): string => jour.slice(2, 4) + jour.slice(5, 7) + jour.slice(8, 10);

const ORDRE_JOURNAL: Readonly<Record<JournalEcriture, number>> = { VE: 0, AN: 1, FA: 2 };

/** Un remboursement d'une vente d'un mois antérieur s'écrit dans le mois du remboursement. */
export function estRemboursementDeMoisAnterieur(
  a: AnnulationComptable,
  debutDuMois: string,
): boolean {
  return a.decision === "rembourser" && enMs(a.venteAt) < enMs(debutDuMois) && a.montant > 0;
}

/**
 * Les écritures du mois, équilibrées pièce par pièce :
 *  - journal `VE`, une pièce par jour : débit 571 (espèces) et 462 (mobile money, cartes), crédit 706 ;
 *  - journal `AN`, une pièce par remboursement d'une vente d'un mois **déjà clos** : débit 706, crédit 571 ou 462
 *    (une annulation faite dans le mois de la vente n'a pas d'écriture : la vente n'est pas comptée) ;
 *  - journal `FA`, une pièce par facture hebdomadaire de frais AfriMove : débit 622, crédit 462.
 * Les décisions du rapprochement MoMo n'ont pas d'écriture : l'argent sans vente n'a jamais été compté.
 */
export function ecritures(d: DonneesMois): Ecriture[] {
  const lignes: Ecriture[] = [];

  const parJour = new Map<string, { cash: number; autre: number }>();
  for (const v of d.ventes) {
    if (estAnnulee(v)) continue;
    const jour = jourDouala(v.at);
    const cumul = parJour.get(jour) ?? { cash: 0, autre: 0 };
    if (v.moyen === "cash") cumul.cash += v.prix;
    else cumul.autre += v.prix;
    parJour.set(jour, cumul);
  }
  for (const jour of [...parJour.keys()].sort()) {
    const { cash, autre } = parJour.get(jour)!;
    const piece = `VE-${aammjj(jour)}`;
    const libelle = `Ventes du ${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
    if (cash > 0) {
      lignes.push({
        journal: "VE",
        date: jour,
        piece,
        compte: COMPTES.caisse,
        libelle: `${libelle} · espèces`,
        debit: cash,
        credit: 0,
      });
    }
    if (autre > 0) {
      lignes.push({
        journal: "VE",
        date: jour,
        piece,
        compte: COMPTES.operateurs,
        libelle: `${libelle} · mobile money et cartes`,
        debit: autre,
        credit: 0,
      });
    }
    lignes.push({
      journal: "VE",
      date: jour,
      piece,
      compte: COMPTES.ventes,
      libelle,
      debit: 0,
      credit: cash + autre,
    });
  }

  for (const a of d.annulations) {
    if (!estRemboursementDeMoisAnterieur(a, d.du)) continue;
    const jour = jourDouala(a.at);
    const piece = `AN-${a.numero}`;
    const libelle = `Remboursement ${a.numero}`;
    lignes.push({
      journal: "AN",
      date: jour,
      piece,
      compte: COMPTES.ventes,
      libelle,
      debit: a.montant,
      credit: 0,
    });
    lignes.push({
      journal: "AN",
      date: jour,
      piece,
      compte: compteDeEncaissement(a.moyen),
      libelle,
      debit: 0,
      credit: a.montant,
    });
  }

  for (const f of facturesHebdo(d)) {
    if (f.total === 0) continue;
    const piece = `FA-${aammjj(f.au)}`;
    const libelle = `Frais AfriMove semaine du ${f.du.slice(8, 10)}/${f.du.slice(5, 7)} au ${f.au.slice(8, 10)}/${f.au.slice(5, 7)}`;
    lignes.push({
      journal: "FA",
      date: f.au,
      piece,
      compte: COMPTES.fraisAfriMove,
      libelle,
      debit: f.total,
      credit: 0,
    });
    lignes.push({
      journal: "FA",
      date: f.au,
      piece,
      compte: COMPTES.operateurs,
      libelle,
      debit: 0,
      credit: f.total,
    });
  }

  // Tri stable : par date, puis par journal ; l'ordre d'écriture d'une pièce est conservé.
  return lignes
    .map((l, i) => ({ l, i }))
    .sort(
      (a, b) =>
        a.l.date.localeCompare(b.l.date) ||
        ORDRE_JOURNAL[a.l.journal] - ORDRE_JOURNAL[b.l.journal] ||
        a.i - b.i,
    )
    .map(({ l }) => l);
}
