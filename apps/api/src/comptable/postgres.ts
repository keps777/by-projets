import { Injectable } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import type {
  AnnulationComptable,
  Cloture,
  ColisSansDepot,
  DecisionAnnulation,
  DecisionRapprochement,
  EnvoiCabinet,
  ExportFige,
  FichierFige,
  FichierGenere,
  FormatExport,
  IdExport,
  LigneReleve,
  MoyenEncaissement,
  OperateurMomo,
  PaiementExpire,
  ParametresComptables,
  SessionComptable,
  VenteComptable,
  VenteProche,
} from "./modele";
import { IDS_EXPORT } from "./modele";
import {
  ActionRefusee,
  ActionsRapprochement,
  AnnulationsComptables,
  Clotures,
  DecisionsRapprochement,
  EnvoisCabinet,
  FacturesPayees,
  FaitsRapprochement,
  FichiersApercus,
  ParametresRepository,
  RelevesOperateur,
  SessionsComptables,
  VentesComptables,
  type ResultatAction,
  type ResultatDecision,
} from "./ports";
import { versIsoDouala } from "./temps";
import { erreurApi } from "./validation";

/**
 * Adaptateurs PostgreSQL (Prisma) des ports du module comptable (AM-114). Tables écrites par le module :
 * `parametres_comptables`, `cloture_mois`, `export_fichier`, `apercu_fichier`, `decision_rapprochement`,
 * `envoi_cabinet`, `releve_operateur_ligne` (alimentée par l'import des relevés), `facture_payee`
 * (alimentée par la facturation) et `action_rapprochement_faite`. Tables lues chez les autres modules :
 * `billet`, `colis`, `commande`, `ligne`, `gare`, `depart`, `guichet`, `personne`, `session_caisse` et
 * `demande_annulation`.
 *
 * Ce que la base garantit, sans compter sur le code (migration « lot_c_garanties ») :
 * - **de deux clôtures simultanées, une seule gagne** : clé primaire `(compagnieId, mois)` ; la clôture et ses
 *   cinq fichiers s'écrivent dans la même transaction (tout ou rien) ;
 * - **un mois clos ne se rouvre pas** : `cloture_mois` et `export_fichier` refusent toute modification (sauf
 *   l'accusé de réception du cabinet) et toute suppression ;
 * - **aucune décision dans un mois qui se clôture** : la clôture prend un verrou consultatif exclusif sur
 *   (agence, mois), la décision un verrou partagé puis relit `cloture_mois` ; l'ordre est tenu par la base
 *   (déclencheurs), pas seulement par l'adaptateur ;
 * - **une décision est définitive** : clé primaire = référence de l'opérateur, seule l'exécution change.
 *
 * Les numéros de téléphone ne sont jamais conservés en clair : chiffrés dans les relevés, masqués dans
 * les décisions, retrouvés dans les ventes par leur index aveugle.
 */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTEXTE_CABINET = "comptable.cabinet";
const CONTEXTE_RELEVE = "comptable.releve";
const CONTEXTE_INDEX_BILLET = "telephone";
const CONTEXTE_INDEX_COLIS = "colis.telephone";

const iso = (d: Date): string => versIsoDouala(d);
const isoOuNul = (d: Date | null): string | null => (d ? versIsoDouala(d) : null);
const octets = (b: Uint8Array): Buffer => Buffer.from(b.buffer, b.byteOffset, b.byteLength);
const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

/** Initiales d'un nom (« Joseph M. » devient « JM »). */
export function initiales(nom: string | null): string | null {
  if (!nom) return null;
  const mots = nom.split(/\s+/).filter(Boolean);
  if (mots.length === 0) return null;
  const lettres = mots.slice(0, 2).map((m) => m.charAt(0).toUpperCase());
  return lettres.join("");
}

/* ------------------------------------------------------------------ réglages */

@Injectable()
export class ParametresPrisma extends ParametresRepository {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: Prisma.ParametresComptablesGetPayload<object>): ParametresComptables {
    return {
      compagnieId: l.compagnieId,
      nomAgence: l.nomAgence,
      emailCabinet:
        l.emailCabinetChiffre === null
          ? null
          : this.chiffrement.dechiffrer(l.emailCabinetChiffre, CONTEXTE_CABINET),
      envoiAutomatique: l.envoiAutomatique,
      jourDEnvoi: l.jourEnvoi,
      jourDeCloture: l.jourCloture,
    };
  }

  async lire(compagnieId: string): Promise<ParametresComptables | null> {
    if (!UUID.test(compagnieId)) return null;
    const l = await this.prisma.parametresComptables.findUnique({ where: { compagnieId } });
    return l ? this.vers(l) : null;
  }

  async toutes(): Promise<ParametresComptables[]> {
    return (await this.prisma.parametresComptables.findMany()).map((l) => this.vers(l));
  }

  /** Les écrans de réglages ne sont pas encore écrits : ce point d'entrée sert aux essais et à l'amorçage. */
  async definir(p: ParametresComptables): Promise<void> {
    const donnees = {
      nomAgence: p.nomAgence,
      emailCabinetChiffre:
        p.emailCabinet === null
          ? null
          : this.chiffrement.chiffrer(p.emailCabinet, CONTEXTE_CABINET),
      envoiAutomatique: p.envoiAutomatique,
      jourEnvoi: p.jourDEnvoi,
      jourCloture: p.jourDeCloture,
    };
    await this.prisma.parametresComptables.upsert({
      where: { compagnieId: p.compagnieId },
      create: { compagnieId: p.compagnieId, ...donnees },
      update: donnees,
    });
  }
}

/* ------------------------------------------------------------------ clôtures */

type LigneCloture = Prisma.ClotureMoisGetPayload<{ include: { fichiers: true } }>;

function versFichierFige(f: LigneCloture["fichiers"][number]): FichierFige {
  return {
    id: f.exportId as IdExport,
    format: f.format as FormatExport,
    nom: f.nom,
    nomFichier: f.nomFichier,
    typeMime: f.typeMime,
    contenu: octets(f.contenu),
    empreinte: f.empreinte,
    genereA: iso(f.genereA),
    colonnes: f.colonnes,
    lignes: f.lignes,
    pages: f.pages,
    tableauGz: octets(f.tableauGz),
  };
}

@Injectable()
export class CloturesPrisma extends Clotures {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: LigneCloture): Cloture {
    const fichiers = l.fichiers
      .map(versFichierFige)
      .sort((a, b) => IDS_EXPORT.indexOf(a.id) - IDS_EXPORT.indexOf(b.id));
    return {
      compagnieId: l.compagnieId,
      mois: l.mois,
      clotureA: iso(l.clotureA),
      parId: l.parId,
      parNom: l.parNom,
      journalId: l.journalId,
      encaisse: l.encaisse as unknown as Cloture["encaisse"],
      rapprochement: l.rapprochement as unknown as Cloture["rapprochement"],
      lignes: l.lignes as unknown as Cloture["lignes"],
      exports: l.exports as unknown as ExportFige[],
      apercuJournal: l.apercuJournal,
      destinataire:
        l.destinataireChiffre === null
          ? null
          : this.chiffrement.dechiffrer(l.destinataireChiffre, CONTEXTE_CABINET),
      envoiDemande: l.envoiDemande,
      envoiRecuA: isoOuNul(l.envoiRecuA),
      fichiers,
    };
  }

  async trouver(compagnieId: string, mois: string): Promise<Cloture | null> {
    if (!UUID.test(compagnieId)) return null;
    const l = await this.prisma.clotureMois.findUnique({
      where: { compagnieId_mois: { compagnieId, mois } },
      include: { fichiers: true },
    });
    return l ? this.vers(l) : null;
  }

  async existe(compagnieId: string, mois: string): Promise<boolean> {
    if (!UUID.test(compagnieId)) return false;
    return (await this.prisma.clotureMois.count({ where: { compagnieId, mois } })) > 0;
  }

  async mois(compagnieId: string): Promise<string[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.clotureMois.findMany({
      where: { compagnieId },
      select: { mois: true },
      orderBy: { mois: "desc" },
    });
    return lignes.map((l) => l.mois);
  }

  async verrouiller(c: Cloture): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // La clôture et ses fichiers : tout ou rien. Le déclencheur d'insertion prend le verrou exclusif
      // (agence, mois) : aucune décision ne peut entrer entre ici et la validation.
      const { count } = await tx.clotureMois.createMany({
        data: [
          {
            compagnieId: c.compagnieId,
            mois: c.mois,
            clotureA: new Date(c.clotureA),
            parId: c.parId,
            parNom: c.parNom,
            journalId: c.journalId,
            encaisse: json(c.encaisse),
            rapprochement: json(c.rapprochement),
            lignes: json(c.lignes),
            exports: json(c.exports),
            apercuJournal: c.apercuJournal,
            destinataireChiffre:
              c.destinataire === null
                ? null
                : this.chiffrement.chiffrer(c.destinataire, CONTEXTE_CABINET),
            envoiDemande: c.envoiDemande,
            envoiRecuA: c.envoiRecuA === null ? null : new Date(c.envoiRecuA),
          },
        ],
        skipDuplicates: true,
      });
      if (count === 0) return false;

      // Les décisions que la clôture a figées sont exactement celles de la table : une décision arrivée
      // entre le calcul du rapprochement et ce verrou n'aurait pas été comptée.
      const figees = c.lignes.filter((l) => l.decision !== null).length;
      const enBase = await tx.decisionRapprochement.count({
        where: { compagnieId: c.compagnieId, mois: c.mois },
      });
      if (figees !== enBase) {
        throw erreurApi(
          409,
          "RAPPROCHEMENT_CHANGE",
          "Le rapprochement a changé pendant la clôture : relancez la clôture",
        );
      }

      await tx.exportFichier.createMany({
        data: c.fichiers.map((f) => ({
          compagnieId: c.compagnieId,
          mois: c.mois,
          exportId: f.id,
          format: f.format,
          nom: f.nom,
          nomFichier: f.nomFichier,
          typeMime: f.typeMime,
          contenu: new Uint8Array(f.contenu),
          tableauGz: new Uint8Array(f.tableauGz),
          empreinte: f.empreinte,
          genereA: new Date(f.genereA),
          colonnes: f.colonnes,
          lignes: f.lignes,
          pages: f.pages,
        })),
      });
      return true;
    });
  }

  async marquerRecu(compagnieId: string, mois: string, recuA: string): Promise<void> {
    if (!UUID.test(compagnieId)) return;
    // Seul changement permis sur une clôture (déclencheur) ; déjà reçu : aucune ligne touchée.
    await this.prisma.clotureMois.updateMany({
      where: { compagnieId, mois, envoiRecuA: null },
      data: { envoiRecuA: new Date(recuA) },
    });
  }

  async envoisEnAttente(limite: number): Promise<Cloture[]> {
    const lignes = await this.prisma.clotureMois.findMany({
      where: { envoiDemande: true, envoiRecuA: null },
      orderBy: [{ clotureA: "asc" }, { mois: "asc" }],
      take: limite,
      include: { fichiers: true },
    });
    return lignes.map((l) => this.vers(l));
  }
}

/* ------------------------------------------------------------------ décisions du rapprochement */

type LigneDecision = Prisma.DecisionRapprochementGetPayload<object>;

function versDecision(l: LigneDecision): DecisionRapprochement {
  return {
    compagnieId: l.compagnieId,
    mois: l.mois,
    reference: l.reference,
    action: l.action as DecisionRapprochement["action"],
    cible: l.cible,
    montant: l.montant,
    operateur: l.operateur as OperateurMomo,
    telephoneMasque: l.telephoneMasque,
    cause: l.cause as DecisionRapprochement["cause"],
    explication: l.explication,
    decideA: iso(l.decideA),
    parId: l.parId,
    parNom: l.parNom,
    journalId: l.journalId,
    methode: l.methode as DecisionRapprochement["methode"],
    execution: l.execution as DecisionRapprochement["execution"],
    referenceExecution: l.referenceExecution,
  };
}

@Injectable()
export class DecisionsPrisma extends DecisionsRapprochement {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lister(compagnieId: string, mois: string): Promise<DecisionRapprochement[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.decisionRapprochement.findMany({
      where: { compagnieId, mois },
      orderBy: [{ decideA: "asc" }, { reference: "asc" }],
    });
    return lignes.map(versDecision);
  }

  async trouver(
    compagnieId: string,
    mois: string,
    reference: string,
  ): Promise<DecisionRapprochement | null> {
    if (!UUID.test(compagnieId)) return null;
    const l = await this.prisma.decisionRapprochement.findUnique({
      where: { compagnieId_mois_reference: { compagnieId, mois, reference } },
    });
    return l ? versDecision(l) : null;
  }

  async enregistrer(d: DecisionRapprochement): Promise<ResultatDecision> {
    return this.prisma.$transaction(async (tx) => {
      // Le verrou partagé (agence, mois) attend une clôture en cours, puis la lecture suivante la voit.
      await tx.$executeRaw`SELECT verrou_mois_comptable(${d.compagnieId}::uuid, ${d.mois}, false)`;
      const [clos] = await tx.$queryRaw<{ n: number }[]>`
        SELECT 1 AS n FROM "cloture_mois"
        WHERE "compagnieId" = ${d.compagnieId}::uuid AND "mois" = ${d.mois} FOR SHARE`;
      if (clos) return { resultat: "mois_verrouille" } as const;
      const { count } = await tx.decisionRapprochement.createMany({
        data: [
          {
            compagnieId: d.compagnieId,
            mois: d.mois,
            reference: d.reference,
            action: d.action,
            cible: d.cible,
            montant: d.montant,
            operateur: d.operateur,
            telephoneMasque: d.telephoneMasque,
            cause: d.cause,
            explication: d.explication,
            decideA: new Date(d.decideA),
            parId: d.parId,
            parNom: d.parNom,
            journalId: d.journalId,
            methode: d.methode,
            execution: d.execution,
            referenceExecution: d.referenceExecution,
          },
        ],
        skipDuplicates: true,
      });
      if (count === 1) return { resultat: "ok" } as const;
      const existante = await tx.decisionRapprochement.findUniqueOrThrow({
        where: {
          compagnieId_mois_reference: {
            compagnieId: d.compagnieId,
            mois: d.mois,
            reference: d.reference,
          },
        },
      });
      return { resultat: "existe", existante: versDecision(existante) } as const;
    });
  }

  async confirmer(
    compagnieId: string,
    mois: string,
    reference: string,
    referenceExecution: string,
  ): Promise<void> {
    if (!UUID.test(compagnieId)) return;
    // Seule transition permise (déclencheur) : en_attente vers faite ; déjà faite, rien n'est touché.
    await this.prisma.decisionRapprochement.updateMany({
      where: { compagnieId, mois, reference, execution: "en_attente" },
      data: { execution: "faite", referenceExecution },
    });
  }

  async retirer(compagnieId: string, mois: string, reference: string): Promise<void> {
    if (!UUID.test(compagnieId)) return;
    await this.prisma.decisionRapprochement.deleteMany({
      where: { compagnieId, mois, reference, execution: "en_attente" },
    });
  }

  async enAttente(limite: number): Promise<DecisionRapprochement[]> {
    const lignes = await this.prisma.decisionRapprochement.findMany({
      where: { execution: "en_attente" },
      orderBy: [{ decideA: "asc" }, { reference: "asc" }],
      take: limite,
    });
    return lignes.map(versDecision);
  }
}

/* ------------------------------------------------------------------ aperçus et envois */

/** Un aperçu mémorisé plus de 24 heures n'a plus d'usage : le téléchargement qui le suit a lieu dans les 10 minutes. */
const PEREMPTION_APERCU_MS = 24 * 3_600_000;

@Injectable()
export class FichiersApercusPrisma extends FichiersApercus {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async memoriser(compagnieId: string, mois: string, f: FichierGenere): Promise<void> {
    const donnees = {
      format: f.format,
      nom: f.nom,
      nomFichier: f.nomFichier,
      typeMime: f.typeMime,
      contenu: new Uint8Array(f.contenu),
      empreinte: f.empreinte,
      genereA: new Date(f.genereA),
      colonnes: f.colonnes,
      lignes: f.lignes,
      pages: f.pages,
    };
    await this.prisma.apercuFichier.upsert({
      where: { compagnieId_mois_exportId: { compagnieId, mois, exportId: f.id } },
      create: { compagnieId, mois, exportId: f.id, ...donnees },
      update: donnees,
    });
    // Ménage au passage : pas de tâche de plus à planifier.
    await this.prisma.apercuFichier.deleteMany({
      where: { genereA: { lt: new Date(Date.now() - PEREMPTION_APERCU_MS) } },
    });
  }

  async dernier(compagnieId: string, mois: string, id: IdExport): Promise<FichierGenere | null> {
    if (!UUID.test(compagnieId)) return null;
    const l = await this.prisma.apercuFichier.findUnique({
      where: { compagnieId_mois_exportId: { compagnieId, mois, exportId: id } },
    });
    if (!l) return null;
    return {
      id,
      format: l.format as FormatExport,
      nom: l.nom,
      nomFichier: l.nomFichier,
      typeMime: l.typeMime,
      contenu: octets(l.contenu),
      empreinte: l.empreinte,
      genereA: iso(l.genereA),
      colonnes: l.colonnes,
      lignes: l.lignes,
      pages: l.pages,
    };
  }
}

@Injectable()
export class EnvoisPrisma extends EnvoisCabinet {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: Prisma.EnvoiCabinetGetPayload<object>): EnvoiCabinet {
    return {
      cle: l.cle,
      compagnieId: l.compagnieId,
      mois: l.mois,
      nature: l.nature as EnvoiCabinet["nature"],
      definitif: l.definitif,
      destinataire: this.chiffrement.dechiffrer(l.destinataireChiffre, CONTEXTE_CABINET),
      envoyeA: iso(l.envoyeA),
      recuA: isoOuNul(l.recuA),
    };
  }

  async enregistrer(e: EnvoiCabinet): Promise<boolean> {
    const { count } = await this.prisma.envoiCabinet.createMany({
      data: [
        {
          cle: e.cle,
          compagnieId: e.compagnieId,
          mois: e.mois,
          nature: e.nature,
          definitif: e.definitif,
          destinataireChiffre: this.chiffrement.chiffrer(e.destinataire, CONTEXTE_CABINET),
          envoyeA: new Date(e.envoyeA),
          recuA: e.recuA === null ? null : new Date(e.recuA),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async trouver(cle: string): Promise<EnvoiCabinet | null> {
    const l = await this.prisma.envoiCabinet.findUnique({ where: { cle } });
    return l ? this.vers(l) : null;
  }

  async derniers(compagnieId: string, limite: number): Promise<EnvoiCabinet[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.envoiCabinet.findMany({
      where: { compagnieId },
      orderBy: [{ envoyeA: "desc" }, { cle: "asc" }],
      take: limite,
    });
    return lignes.map((l) => this.vers(l));
  }

  async marquerRecu(cle: string, recuA: string): Promise<void> {
    await this.prisma.envoiCabinet.updateMany({
      where: { cle, recuA: null },
      data: { recuA: new Date(recuA) },
    });
  }
}

/* ------------------------------------------------------------------ relevés des opérateurs */

@Injectable()
export class RelevesPrisma extends RelevesOperateur {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  async lignes(compagnieId: string, du: string, avant: string): Promise<LigneReleve[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.releveOperateurLigne.findMany({
      where: { compagnieId, recueA: { gte: new Date(du), lt: new Date(avant) } },
      orderBy: [{ recueA: "asc" }, { reference: "asc" }],
    });
    return lignes.map((l) => ({
      reference: l.reference,
      recueA: iso(l.recueA),
      telephone: this.chiffrement.dechiffrer(l.telephoneChiffre, CONTEXTE_RELEVE),
      operateur: l.operateur as OperateurMomo,
      montant: l.montant,
    }));
  }

  /**
   * L'import des relevés (aucun ticket ne le décrit encore) : idempotent par référence, le numéro du payeur
   * est chiffré à l'entrée. Rend le nombre de lignes nouvelles.
   */
  async importer(compagnieId: string, lignes: readonly LigneReleve[]): Promise<number> {
    const { count } = await this.prisma.releveOperateurLigne.createMany({
      data: lignes.map((l) => ({
        compagnieId,
        reference: l.reference,
        recueA: new Date(l.recueA),
        telephoneChiffre: this.chiffrement.chiffrer(l.telephone, CONTEXTE_RELEVE),
        operateur: l.operateur,
        montant: l.montant,
      })),
      skipDuplicates: true,
    });
    return count;
  }
}

/* ------------------------------------------------------------------ factures AfriMove */

@Injectable()
export class FacturesPayeesPrisma extends FacturesPayees {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async payees(compagnieId: string, dimanches: readonly string[]): Promise<Map<string, string>> {
    if (!UUID.test(compagnieId) || dimanches.length === 0) return new Map();
    const lignes = await this.prisma.facturePayee.findMany({
      where: { compagnieId, dimanche: { in: [...dimanches] } },
    });
    return new Map(lignes.map((l) => [l.dimanche, l.payeeLe]));
  }

  /** Le futur module de facturation appelle ceci quand le paiement d'une facture arrive. */
  async enregistrer(compagnieId: string, dimanche: string, payeeLe: string): Promise<void> {
    await this.prisma.facturePayee.createMany({
      data: [{ compagnieId, dimanche, payeeLe }],
      skipDuplicates: true,
    });
  }
}

/* ------------------------------------------------------------------ lectures des ventes */

/** Les moyens de paiement des billets guichet (`paiement.mode`), des commandes et des colis, ramenés à quatre. */
export function moyenDe(
  mode: string | null | undefined,
  repli: MoyenEncaissement = "mtn",
): MoyenEncaissement {
  switch (mode) {
    case "cash":
      return "cash";
    case "momo":
    case "mtn_momo":
    case "mtn":
      return "mtn";
    case "orange_money":
    case "orange":
      return "orange";
    case "carte":
      return "carte";
    default:
      return repli;
  }
}

/** « 3 kg », « 2,5 kg ». */
function classeColis(poidsKg: number): string {
  return `${String(poidsKg).replace(".", ",")} kg`;
}

interface LigneBillet {
  id: string;
  numero: string;
  at: Date;
  origine: string;
  destination: string;
  heure: string;
  siege: number | null;
  classe: string;
  montant: number;
  canal: string;
  rang: number | null;
  modePaiement: string | null;
  moyenCommande: string | null;
  agentNom: string | null;
  sessionId: string | null;
  reference: string | null;
  annuleeA: Date | null;
}

interface LigneColisVente {
  id: string;
  numero: string;
  at: Date;
  poidsKg: number;
  montant: number;
  canal: string;
  moyen: string | null;
  agentNom: string | null;
  reference: string | null;
}

/** Une référence de paiement posée par le guichet (« GUICHET-… ») n'est pas celle d'un opérateur. */
const referenceOperateur = (r: string | null): string | null =>
  r === null || r.startsWith("GUICHET-") ? null : r;

@Injectable()
export class VentesPrisma extends VentesComptables {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ventes(compagnieId: string, du: string, avant: string): Promise<VenteComptable[]> {
    if (!UUID.test(compagnieId)) return [];
    const debut = new Date(du);
    const fin = new Date(avant);
    const billets = await this.prisma.$queryRaw<LigneBillet[]>`
      SELECT b."id"::text AS id, b."numero", b."creeA" AS at,
             go."code" AS origine, gd."code" AS destination,
             to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'HH24:MI') AS heure,
             b."siege", b."classe"::text AS classe, (b."prix" + b."bagage")::int AS montant,
             b."canal"::text AS canal, g."rang" AS rang,
             b."paiement" ->> 'mode' AS "modePaiement", c."moyenPaiement" AS "moyenCommande",
             p."nom" AS "agentNom", b."sessionId"::text AS "sessionId",
             b."paiement" ->> 'reference' AS reference,
             CASE WHEN b."etat" IN ('annule', 'reporte') THEN
               (SELECT min((h ->> 'at')::timestamptz)
                  FROM jsonb_array_elements(b."historique") h
                 WHERE h ->> 'vers' IN ('annule', 'reporte'))
             END AS "annuleeA"
      FROM "billet" b
      JOIN "depart" d ON d."id" = b."departId"
      JOIN "ligne" l ON l."id" = d."ligneId"
      JOIN "gare" go ON go."id" = l."origineGareId"
      JOIN "gare" gd ON gd."id" = l."destinationGareId"
      LEFT JOIN "guichet" g ON g."id" = b."guichetId"
      LEFT JOIN "commande" c ON c."id" = b."commandeId"
      LEFT JOIN "personne" p ON p."id" = b."auteurId" AND b."canal" <> 'en_ligne'
      WHERE b."compagnieId" = ${compagnieId}::uuid
        AND b."creeA" >= ${debut} AND b."creeA" < ${fin}
      ORDER BY b."creeA", b."numero"`;
    const colis = await this.prisma.$queryRaw<LigneColisVente[]>`
      SELECT c."id"::text AS id, c."numero", c."creeA" AS at, c."poidsKg",
             COALESCE(c."paiementMontant", c."prixTotal")::int AS montant,
             c."canal"::text AS canal, c."paiementMoyen" AS moyen,
             p."nom" AS "agentNom", c."paiementReference" AS reference
      FROM "colis" c
      JOIN "gare" go ON go."id" = c."gareOrigineId"
      LEFT JOIN "personne" p ON p."id"::text = c."deposePar"
      WHERE COALESCE(c."compagnieId", go."compagnieId") = ${compagnieId}::uuid
        AND c."paiementEtat" = 'paye'
        AND c."creeA" >= ${debut} AND c."creeA" < ${fin}
      ORDER BY c."creeA", c."numero"`;

    const ventes: VenteComptable[] = [];
    for (const b of billets) {
      ventes.push({
        id: b.id,
        genre: "billet",
        numero: b.numero,
        at: iso(b.at),
        ligne: `${b.origine}-${b.destination}`,
        depart: b.heure,
        siege: b.siege === null ? null : String(b.siege),
        classe: b.classe === "vip" ? "VIP" : "CLASSIQUE",
        prix: b.montant,
        // Billet de guichet : le mode choisi à la caisse. En ligne : le moyen qui a soldé la commande.
        moyen: moyenDe(b.modePaiement ?? b.moyenCommande),
        guichet:
          b.canal === "guichet"
            ? b.rang === null
              ? "GUICHET"
              : `GU${b.rang}`
            : b.canal === "convoyeur"
              ? "ROUTE"
              : b.canal === "vendeur"
                ? "VENDEUR"
                : "APP",
        agent: initiales(b.agentNom),
        sessionId: b.sessionId,
        referenceOperateur: referenceOperateur(b.reference),
        annuleeA: isoOuNul(b.annuleeA),
      });
    }
    for (const c of colis) {
      ventes.push({
        id: c.id,
        genre: "colis",
        numero: c.numero,
        at: iso(c.at),
        ligne: "COLIS",
        depart: null,
        siege: null,
        classe: classeColis(c.poidsKg),
        prix: c.montant,
        moyen: moyenDe(c.moyen),
        guichet: c.canal === "agence" ? "AGENCE" : "APP",
        agent: initiales(c.agentNom),
        sessionId: null,
        referenceOperateur: referenceOperateur(c.reference),
        annuleeA: null,
      });
    }
    return ventes.sort((a, b) => a.at.localeCompare(b.at) || a.numero.localeCompare(b.numero));
  }

  async referencesConnues(
    compagnieId: string,
    references: readonly string[],
  ): Promise<Set<string>> {
    if (!UUID.test(compagnieId) || references.length === 0) return new Set();
    const liste = [...references];
    const lignes = await this.prisma.$queryRaw<{ reference: string }[]>`
      SELECT b."paiement" ->> 'reference' AS reference
      FROM "billet" b
      WHERE b."compagnieId" = ${compagnieId}::uuid
        AND b."paiement" IS NOT NULL
        AND b."paiement" ->> 'reference' = ANY(${liste}::text[])
      UNION
      SELECT c."paiementReference"
      FROM "colis" c
      JOIN "gare" go ON go."id" = c."gareOrigineId"
      WHERE COALESCE(c."compagnieId", go."compagnieId") = ${compagnieId}::uuid
        AND c."paiementReference" = ANY(${liste}::text[])`;
    return new Set(lignes.map((l) => l.reference));
  }

  async moisAvecActivite(compagnieId: string): Promise<string[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.$queryRaw<{ mois: string }[]>`
      SELECT DISTINCT to_char(("creeA" AT TIME ZONE 'UTC') + interval '1 hour', 'YYYY-MM') AS mois
      FROM "billet" WHERE "compagnieId" = ${compagnieId}::uuid
      UNION
      SELECT DISTINCT to_char((c."creeA" AT TIME ZONE 'UTC') + interval '1 hour', 'YYYY-MM')
      FROM "colis" c JOIN "gare" go ON go."id" = c."gareOrigineId"
      WHERE COALESCE(c."compagnieId", go."compagnieId") = ${compagnieId}::uuid
      ORDER BY mois DESC`;
    return lignes.map((l) => l.mois);
  }
}

/* ------------------------------------------------------------------ caisse et annulations */

@Injectable()
export class SessionsPrisma extends SessionsComptables {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async sessions(compagnieId: string, du: string, avant: string): Promise<SessionComptable[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.$queryRaw<
      {
        id: string;
        numero: string;
        rang: number;
        agent: string;
        ouverteA: Date;
        clotureeA: Date | null;
        fond: number;
        cashAttendu: number | null;
        cashCompte: number | null;
        ecart: number | null;
        validePar: string | null;
      }[]
    >`
      SELECT s."id"::text AS id, s."numero", s."guichetRang" AS rang, a."nom" AS agent,
             s."ouverteA", s."clotureeA", s."fondDeCaisse" AS fond,
             s."cashAttendu", s."cashCompte", s."ecart", v."nom" AS "validePar"
      FROM "session_caisse" s
      JOIN "personne" a ON a."id" = s."agentId"
      LEFT JOIN "personne" v ON v."id" = s."valideeParId"
      WHERE s."compagnieId" = ${compagnieId}::uuid
        AND s."ouverteA" >= ${new Date(du)} AND s."ouverteA" < ${new Date(avant)}
      ORDER BY s."ouverteA", s."numero"`;
    return lignes.map((s) => ({
      id: s.id,
      numero: s.numero,
      guichet: `GU${s.rang}`,
      agent: s.agent,
      ouverteA: iso(s.ouverteA),
      clotureeA: isoOuNul(s.clotureeA),
      fond: s.fond,
      cashAttendu: s.cashAttendu,
      cashCompte: s.cashCompte,
      ecart: s.ecart,
      validePar: s.validePar,
      // La seule preuve de validation que l'API sait vérifier est le PIN du superviseur.
      validation: s.validePar === null ? null : ("pin" as const),
    }));
  }
}

@Injectable()
export class AnnulationsPrisma extends AnnulationsComptables {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async decidees(compagnieId: string, du: string, avant: string): Promise<AnnulationComptable[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.$queryRaw<
      {
        id: string;
        at: Date;
        numero: string;
        montant: number;
        decision: string;
        motif: string;
        demandePar: string;
        validePar: string;
        venteAt: Date;
        modePaiement: string | null;
        moyenCommande: string | null;
      }[]
    >`
      SELECT da."demandeId"::text AS id, da."decideeA" AS at, b."numero",
             COALESCE(da."montant", b."prix" + b."bagage")::int AS montant,
             da."decision", da."motif", dm."nom" AS "demandePar", dc."nom" AS "validePar",
             b."creeA" AS "venteAt", b."paiement" ->> 'mode' AS "modePaiement",
             c."moyenPaiement" AS "moyenCommande"
      FROM "demande_annulation" da
      JOIN "billet" b ON b."id" = da."billetId"
      JOIN "personne" dm ON dm."id" = da."demandeurId"
      JOIN "personne" dc ON dc."id" = da."decideeParId"
      LEFT JOIN "commande" c ON c."id" = b."commandeId"
      WHERE da."compagnieId" = ${compagnieId}::uuid
        AND da."statut" = 'decidee'
        AND da."decideeA" >= ${new Date(du)} AND da."decideeA" < ${new Date(avant)}
      ORDER BY da."decideeA", da."demandeId"`;
    return lignes.map((a) => ({
      id: a.id,
      at: iso(a.at),
      numero: a.numero,
      genre: "billet" as const,
      montant: a.montant,
      decision: a.decision as DecisionAnnulation,
      motif: a.motif,
      demandePar: a.demandePar,
      validePar: a.validePar,
      validation: "pin" as const,
      venteAt: iso(a.venteAt),
      moyen: moyenDe(a.modePaiement ?? a.moyenCommande),
    }));
  }
}

/* ------------------------------------------------------------------ faits du rapprochement */

/**
 * Les faits dont le rapprochement a besoin pour deviner la cause d'une transaction. Les numéros de
 * téléphone sont chiffrés en base : on cherche par leur index aveugle (HMAC), jamais en déchiffrant.
 *
 * Le billet ne garde pas le numéro de celui qui a payé, seulement celui du passager (et le colis celui de
 * l'expéditeur et du destinataire, plus le numéro de paiement) : on rapproche donc par ces numéros. Le
 * paiement en ligne expiré se retrouve par la commande du voyageur (son compte porte le numéro).
 */
@Injectable()
export class FaitsPrisma extends FaitsRapprochement {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private indexBillet(telephone: string): string {
    return this.chiffrement.indexAveugle(telephone, CONTEXTE_INDEX_BILLET);
  }

  private indexColis(telephone: string): string {
    return this.chiffrement.indexAveugle(telephone, CONTEXTE_INDEX_COLIS);
  }

  async ventesAutour(
    compagnieId: string,
    telephone: string,
    autour: string,
    fenetreMinutes: number,
  ): Promise<VenteProche[]> {
    if (!UUID.test(compagnieId)) return [];
    const centre = new Date(autour).getTime();
    const debut = new Date(centre - fenetreMinutes * 60_000);
    const fin = new Date(centre + fenetreMinutes * 60_000);
    const idxB = this.indexBillet(telephone);
    const idxC = this.indexColis(telephone);
    const billets = await this.prisma.$queryRaw<
      {
        numero: string;
        at: Date;
        montant: number;
        origine: string;
        destination: string;
        heure: string;
        reference: string | null;
        canal: string;
      }[]
    >`
      SELECT b."numero", b."creeA" AS at, (b."prix" + b."bagage")::int AS montant,
             go."code" AS origine, gd."code" AS destination,
             to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'HH24:MI') AS heure,
             b."paiement" ->> 'reference' AS reference, b."canal"::text AS canal
      FROM "billet" b
      JOIN "depart" d ON d."id" = b."departId"
      JOIN "ligne" l ON l."id" = d."ligneId"
      JOIN "gare" go ON go."id" = l."origineGareId"
      JOIN "gare" gd ON gd."id" = l."destinationGareId"
      WHERE b."compagnieId" = ${compagnieId}::uuid
        AND b."passagerTelephoneIndex" = ${idxB}
        AND b."creeA" >= ${debut} AND b."creeA" <= ${fin}
      ORDER BY b."creeA"`;
    const colis = await this.prisma.$queryRaw<
      { numero: string; at: Date; montant: number; reference: string | null; canal: string }[]
    >`
      SELECT c."numero", c."creeA" AS at, COALESCE(c."paiementMontant", c."prixTotal")::int AS montant,
             c."paiementReference" AS reference, c."canal"::text AS canal
      FROM "colis" c
      JOIN "gare" go ON go."id" = c."gareOrigineId"
      WHERE COALESCE(c."compagnieId", go."compagnieId") = ${compagnieId}::uuid
        AND (c."expediteurTelephoneIndex" = ${idxC} OR c."destinataireTelephoneIndex" = ${idxC})
        AND c."creeA" >= ${debut} AND c."creeA" <= ${fin}
      ORDER BY c."creeA"`;
    return [
      ...billets.map(
        (b): VenteProche => ({
          numero: b.numero,
          genre: "billet",
          at: iso(b.at),
          montant: b.montant,
          ligne: `${b.origine}-${b.destination}`,
          depart: b.heure,
          referenceOperateur: referenceOperateur(b.reference),
          canal: b.canal === "en_ligne" ? "en_ligne" : "guichet",
        }),
      ),
      ...colis.map(
        (c): VenteProche => ({
          numero: c.numero,
          genre: "colis",
          at: iso(c.at),
          montant: c.montant,
          ligne: "COLIS",
          depart: null,
          referenceOperateur: referenceOperateur(c.reference),
          canal: c.canal === "agence" ? "guichet" : "en_ligne",
        }),
      ),
    ].sort((a, b) => a.at.localeCompare(b.at));
  }

  async paiementsExpires(
    compagnieId: string,
    telephone: string,
    avant: string,
    depuisMinutes: number,
  ): Promise<PaiementExpire[]> {
    if (!UUID.test(compagnieId)) return [];
    const fin = new Date(avant);
    const debut = new Date(fin.getTime() - depuisMinutes * 60_000);
    const idx = this.indexBillet(telephone);
    const lignes = await this.prisma.$queryRaw<
      {
        expireA: Date;
        montant: number;
        origine: string;
        destination: string;
        heure: string;
      }[]
    >`
      SELECT c."expireA", c."total"::int AS montant, go."code" AS origine, gd."code" AS destination,
             to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'HH24:MI') AS heure
      FROM "commande" c
      JOIN "personne" v ON v."id" = c."voyageurId"
      JOIN "depart" d ON d."id" = c."departId"
      JOIN "ligne" l ON l."id" = d."ligneId"
      JOIN "gare" go ON go."id" = l."origineGareId"
      JOIN "gare" gd ON gd."id" = l."destinationGareId"
      WHERE l."compagnieId" = ${compagnieId}::uuid
        AND c."statut" = 'expiree'
        AND v."telephoneIndex" = ${idx}
        AND c."expireA" >= ${debut} AND c."expireA" <= ${fin}
      ORDER BY c."expireA"`;
    return lignes.map((l) => ({
      expireA: iso(l.expireA),
      montant: l.montant,
      ligne: `${l.origine}-${l.destination}`,
      depart: l.heure,
    }));
  }

  async colisSansDepot(
    compagnieId: string,
    telephone: string,
    montant: number,
  ): Promise<ColisSansDepot[]> {
    if (!UUID.test(compagnieId)) return [];
    const idx = this.indexColis(telephone);
    const lignes = await this.prisma.$queryRaw<{ numero: string; montant: number }[]>`
      SELECT c."numero", COALESCE(c."paiementMontant", c."prixTotal")::int AS montant
      FROM "colis" c
      JOIN "gare" go ON go."id" = c."gareOrigineId"
      WHERE COALESCE(c."compagnieId", go."compagnieId") = ${compagnieId}::uuid
        AND c."deposeA" IS NULL
        AND c."etat" NOT IN ('retourne', 'perdu')
        AND COALESCE(c."paiementMontant", c."prixTotal") = ${montant}
        AND (c."destinataireTelephoneIndex" = ${idx} OR c."expediteurTelephoneIndex" = ${idx})
      ORDER BY c."creeA" DESC`;
    // La table des colis ne garde que l'identifiant du relais, pas son nom (module relais en mémoire).
    return lignes.map((l) => ({ numero: l.numero, montant: l.montant, relais: null }));
  }

  async numeroConnu(compagnieId: string, telephone: string): Promise<boolean> {
    if (!UUID.test(compagnieId)) return false;
    const idxB = this.indexBillet(telephone);
    const idxC = this.indexColis(telephone);
    const [r] = await this.prisma.$queryRaw<{ connu: boolean }[]>`
      SELECT (
        EXISTS (SELECT 1 FROM "billet" b
                 WHERE b."compagnieId" = ${compagnieId}::uuid AND b."passagerTelephoneIndex" = ${idxB})
        OR EXISTS (SELECT 1 FROM "colis" c JOIN "gare" go ON go."id" = c."gareOrigineId"
                    WHERE COALESCE(c."compagnieId", go."compagnieId") = ${compagnieId}::uuid
                      AND (c."expediteurTelephoneIndex" = ${idxC} OR c."destinataireTelephoneIndex" = ${idxC}))
        OR EXISTS (SELECT 1 FROM "commande" c
                     JOIN "personne" v ON v."id" = c."voyageurId"
                     JOIN "depart" d ON d."id" = c."departId"
                     JOIN "ligne" l ON l."id" = d."ligneId"
                    WHERE l."compagnieId" = ${compagnieId}::uuid AND v."telephoneIndex" = ${idxB})
      ) AS connu`;
    return r?.connu === true;
  }
}

/* ------------------------------------------------------------------ effets du rapprochement */

/** Les effets que l'adaptateur ne sait pas encore jouer pour de bon (remboursement, réclamation). */
export interface EffetsExternes {
  readonly durable: boolean;
  rembourser: ActionsRapprochement["rembourser"];
  reclamer: ActionsRapprochement["reclamer"];
}

/**
 * Les trois actions du rapprochement. **Rattacher** est réel : la référence de l'opérateur est écrite sur
 * le colis ou le billet (une seule fois, idempotent par clé). **Rembourser** et **réclamer** demandent un
 * agrégateur de paiement et une relation avec l'opérateur qui n'existent pas encore dans l'API : ils sont
 * confiés à `effets` (simulés par défaut, `durable = false` : le garde-fou de production reste levé).
 */
@Injectable()
export class ActionsRapprochementPrisma extends ActionsRapprochement {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effets: EffetsExternes,
  ) {
    super();
  }

  get durable(): boolean {
    return this.effets.durable;
  }

  rembourser(demande: Parameters<ActionsRapprochement["rembourser"]>[0]): Promise<ResultatAction> {
    return this.effets.rembourser(demande);
  }

  reclamer(demande: Parameters<ActionsRapprochement["reclamer"]>[0]): Promise<ResultatAction> {
    return this.effets.reclamer(demande);
  }

  async rattacher(demande: {
    cle: string;
    reference: string;
    cible: string;
  }): Promise<ResultatAction> {
    return this.prisma.$transaction(async (tx) => {
      // Même clé, même résultat : un rejeu ne réécrit rien.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7017115, hashtext(${demande.cle}))`;
      const deja = await tx.actionRapprochementFaite.findUnique({ where: { cle: demande.cle } });
      if (deja) return { reference: deja.resultat };

      const [releve] = await tx.$queryRaw<{ operateur: string; compagnieId: string }[]>`
        SELECT "operateur", "compagnieId"::text AS "compagnieId" FROM "releve_operateur_ligne"
        WHERE "reference" = ${demande.reference} LIMIT 1`;
      if (!releve) throw new ActionRefusee("Référence inconnue des relevés de l'opérateur");

      const mode = releve.operateur === "orange" ? "orange_money" : "momo";
      const moyenColis = releve.operateur === "orange" ? "orange_money" : "mtn_momo";
      const [colis] = await tx.$queryRaw<
        {
          id: string;
          reference: string | null;
          compagnieId: string | null;
          gareCompagnie: string;
        }[]
      >`
        SELECT c."id"::text AS id, c."paiementReference" AS reference,
               c."compagnieId"::text AS "compagnieId", go."compagnieId"::text AS "gareCompagnie"
        FROM "colis" c JOIN "gare" go ON go."id" = c."gareOrigineId"
        WHERE c."numero" = ${demande.cible} FOR UPDATE OF c`;
      let resultat: string;
      if (colis) {
        if ((colis.compagnieId ?? colis.gareCompagnie) !== releve.compagnieId) {
          throw new ActionRefusee("Ce colis n'appartient pas à l'agence du relevé");
        }
        if (
          colis.reference !== null &&
          !colis.reference.startsWith("GUICHET-") &&
          colis.reference !== demande.reference
        ) {
          throw new ActionRefusee("Ce colis porte déjà une autre référence d'opérateur");
        }
        await tx.$executeRaw`
          UPDATE "colis" SET "paiementReference" = ${demande.reference},
                 "paiementMoyen" = ${moyenColis}, "paiementEtat" = 'paye', "version" = "version" + 1
          WHERE "id" = ${colis.id}::uuid`;
        resultat = `RATTACHE-${demande.cible}`;
      } else {
        const [billet] = await tx.$queryRaw<
          { id: string; compagnieId: string; mode: string | null; reference: string | null }[]
        >`
          SELECT "id"::text AS id, "compagnieId"::text AS "compagnieId",
                 "paiement" ->> 'mode' AS mode, "paiement" ->> 'reference' AS reference
          FROM "billet" WHERE "numero" = ${demande.cible} FOR UPDATE`;
        if (!billet) throw new ActionRefusee("Aucun colis ni billet ne porte ce numéro");
        if (billet.compagnieId !== releve.compagnieId) {
          throw new ActionRefusee("Ce billet n'appartient pas à l'agence du relevé");
        }
        if (billet.mode === "cash") {
          throw new ActionRefusee("Ce billet a été payé en espèces : rien à rattacher");
        }
        if (billet.reference !== null && billet.reference !== demande.reference) {
          throw new ActionRefusee("Ce billet porte déjà une autre référence d'opérateur");
        }
        const paiement = JSON.stringify({
          mode: billet.mode ?? mode,
          reference: demande.reference,
        });
        await tx.$executeRaw`
          UPDATE "billet"
          SET "paiement" = COALESCE("paiement", '{}'::jsonb) || ${paiement}::jsonb
          WHERE "id" = ${billet.id}::uuid`;
        resultat = `RATTACHE-${demande.cible}`;
      }
      await tx.actionRapprochementFaite.create({
        data: { cle: demande.cle, type: "rattacher", reference: demande.reference, resultat },
      });
      return { reference: resultat };
    });
  }
}
