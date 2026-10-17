import { randomInt } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ErreurColis } from "../colis/erreurs";
import { dateDe, dateOuNul, estUuid, iso, isoOuNul, porteCode } from "../relais/postgres";
import { HachageService } from "../socle/auth/hachage.service";
import { validerRoles } from "../socle/auth/roles";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { ComptesService, verifierPin } from "../socle/comptes/comptes.service";
import { TelephoneDejaUtilise } from "../socle/comptes/personnes.repository";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { SmsGateway } from "../socle/sms/sms.gateway";
import type {
  Agrement,
  ClasseDepart,
  CreditCommission,
  DebitCommission,
  EtatVente,
  OperateurMobile,
  Vendeur,
  Vente,
} from "./modele";
import {
  AgrementsRepository,
  CommissionsVendeurs,
  ComptesVendeurs,
  NumerosVendeurs,
  VendeursRepository,
  VentesRepository,
  type ResultatAjoutVente,
  type ResultatReservation,
} from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) des vendeurs ambulants. Tables : `vendeur`, `agrement_vendeur`,
 * `vente_vendeur`, `credit_commission_vendeur`, `debit_commission_vendeur` (migration
 * `20261017000804_vendeurs`) et `compteur_dossier` (préfixe « vendeur ») pour les numéros. Nom,
 * téléphones et identité du voisin ne sont jamais écrits en clair.
 *
 * Les garanties tiennent dans la base :
 * - **concurrence optimiste** : `remplacer` est un `UPDATE … WHERE id = $1 AND version = $2` ;
 * - **une seule vente en attente par vendeur** et **un voisin n'a pas deux billets sur un départ** : index
 *   uniques partiels `vente_vendeur_une_en_attente` et `vente_vendeur_voisin_depart` ;
 * - **une vente ne se termine qu'une fois** : `transitionner` est un `UPDATE … WHERE id AND etat IN (…)` ;
 * - **une commission n'est comptée qu'une fois** : clé primaire `cle` de `credit_commission_vendeur` ;
 * - **deux versements simultanés ne dépensent pas deux fois le solde** : `reserver` prend un verrou
 *   consultatif par vendeur avant de relire le solde.
 */

/** Espace de noms des verrous consultatifs des commissions des vendeurs. */
const VERROU_COMMISSIONS = 7_017_149;

export const CONTEXTE_NOM_VENDEUR = "vendeur.nom";
export const CONTEXTE_TELEPHONE_VENDEUR = "vendeur.telephone";
export const CONTEXTE_MOMO_VENDEUR = "vendeur.momo.telephone";
export const CONTEXTE_VOISIN_NOM = "vendeur.voisin.nom";
export const CONTEXTE_VOISIN_TELEPHONE = "vendeur.voisin.telephone";
export const CONTEXTE_DEBIT_COMMISSION = "vendeur.commission.telephone";

/** Le compteur des numéros de vendeur dans `compteur_dossier` : « V-0412 » est la valeur 412. */
export const PREFIXE_NUMERO_VENDEUR = "vendeur";

/* ------------------------------------------------------------------ vendeurs */

@Injectable()
export class VendeursPrisma extends VendeursRepository {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: Prisma.VendeurGetPayload<object>): Vendeur {
    return {
      id: l.id,
      version: l.version,
      numero: l.numero,
      nom: this.chiffrement.dechiffrer(l.nomChiffre, CONTEXTE_NOM_VENDEUR),
      telephone: this.chiffrement.dechiffrer(l.telephoneChiffre, CONTEXTE_TELEPHONE_VENDEUR),
      quartier: l.quartier,
      ville: l.ville,
      momo: {
        telephone: this.chiffrement.dechiffrer(l.momoTelephoneChiffre, CONTEXTE_MOMO_VENDEUR),
        operateur: l.momoOperateur as OperateurMobile,
      },
      actif: l.actif,
      creeA: iso(l.creeA),
    };
  }

  private donnees(v: Vendeur) {
    return {
      nomChiffre: this.chiffrement.chiffrer(v.nom, CONTEXTE_NOM_VENDEUR),
      telephoneChiffre: this.chiffrement.chiffrer(v.telephone, CONTEXTE_TELEPHONE_VENDEUR),
      quartier: v.quartier,
      ville: v.ville,
      momoTelephoneChiffre: this.chiffrement.chiffrer(v.momo.telephone, CONTEXTE_MOMO_VENDEUR),
      momoOperateur: v.momo.operateur,
      actif: v.actif,
    };
  }

  async ajouter(vendeur: Vendeur): Promise<boolean> {
    // INSERT … ON CONFLICT DO NOTHING : identifiant ou numéro déjà pris.
    const { count } = await this.prisma.vendeur.createMany({
      data: [
        {
          id: vendeur.id,
          version: 1,
          numero: vendeur.numero,
          creeA: dateDe(vendeur.creeA),
          ...this.donnees(vendeur),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async trouver(id: string): Promise<Vendeur | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.vendeur.findUnique({ where: { id } });
    return l ? this.vers(l) : null;
  }

  async lister(filtre: { ids?: readonly string[] } = {}): Promise<Vendeur[]> {
    const ids = filtre.ids?.filter(estUuid);
    if (filtre.ids !== undefined && ids?.length === 0) return [];
    const l = await this.prisma.vendeur.findMany({
      where: ids === undefined ? {} : { id: { in: ids } },
      orderBy: { numero: "asc" },
    });
    return l.map((x) => this.vers(x));
  }

  async remplacer(vendeur: Vendeur, versionAttendue: number): Promise<boolean> {
    if (!estUuid(vendeur.id)) return false;
    // Ni le numéro, ni la date de création ne changent.
    const { count } = await this.prisma.vendeur.updateMany({
      where: { id: vendeur.id, version: versionAttendue },
      data: { ...this.donnees(vendeur), version: versionAttendue + 1 },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ agréments et numéros */

@Injectable()
export class AgrementsPrisma extends AgrementsRepository {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(l: Prisma.AgrementVendeurGetPayload<object>): Agrement {
    return {
      vendeurId: l.vendeurId,
      compagnieId: l.compagnieId,
      compagnieNom: l.compagnieNom,
      etat: l.etat as Agrement["etat"],
      commissionClassique: l.commissionClassique,
      commissionVip: l.commissionVip,
      accordeLe: iso(l.accordeLe),
      accordePar: l.accordePar,
      retireLe: isoOuNul(l.retireLe),
    };
  }

  async enregistrer(agrement: Agrement): Promise<void> {
    const donnees = {
      compagnieNom: agrement.compagnieNom,
      etat: agrement.etat,
      commissionClassique: agrement.commissionClassique,
      commissionVip: agrement.commissionVip,
      accordeLe: dateDe(agrement.accordeLe),
      accordePar: agrement.accordePar,
      retireLe: dateOuNul(agrement.retireLe),
    };
    await this.prisma.agrementVendeur.upsert({
      where: {
        vendeurId_compagnieId: {
          vendeurId: agrement.vendeurId,
          compagnieId: agrement.compagnieId,
        },
      },
      create: { vendeurId: agrement.vendeurId, compagnieId: agrement.compagnieId, ...donnees },
      update: donnees,
    });
  }

  async trouver(vendeurId: string, compagnieId: string): Promise<Agrement | null> {
    if (!estUuid(vendeurId) || !estUuid(compagnieId)) return null;
    const l = await this.prisma.agrementVendeur.findUnique({
      where: { vendeurId_compagnieId: { vendeurId, compagnieId } },
    });
    return l ? this.vers(l) : null;
  }

  async deVendeur(vendeurId: string): Promise<Agrement[]> {
    if (!estUuid(vendeurId)) return [];
    const l = await this.prisma.agrementVendeur.findMany({ where: { vendeurId } });
    // L'ordre alphabétique français (accents ignorés) est celui de la mémoire : on le refait ici.
    return l
      .map((x) => this.vers(x))
      .sort((a, b) => a.compagnieNom.localeCompare(b.compagnieNom, "fr"));
  }

  async deCompagnie(compagnieId: string): Promise<Agrement[]> {
    if (!estUuid(compagnieId)) return [];
    const l = await this.prisma.agrementVendeur.findMany({
      where: { compagnieId },
      orderBy: { vendeurId: "asc" },
    });
    return l.map((x) => this.vers(x));
  }
}

@Injectable()
export class NumerosVendeursPrisma extends NumerosVendeurs {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Atomique : de deux appels simultanés, chacun reçoit son numéro. */
  async prochain(): Promise<number> {
    const lignes = await this.prisma.$queryRaw<{ valeur: number }[]>`
      INSERT INTO "compteur_dossier" ("prefixe", "valeur") VALUES (${PREFIXE_NUMERO_VENDEUR}, 1)
      ON CONFLICT ("prefixe") DO UPDATE SET "valeur" = "compteur_dossier"."valeur" + 1
      RETURNING "valeur"`;
    return Number(lignes[0]!.valeur);
  }
}

/* ------------------------------------------------------------------ ventes */

const ETATS_UNICITE: readonly EtatVente[] = ["en_attente", "reglee", "terminee"];

@Injectable()
export class VentesPrisma extends VentesRepository {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: Prisma.VenteVendeurGetPayload<object>): Vente {
    return {
      id: l.id,
      version: l.version,
      vendeurId: l.vendeurId,
      compagnieId: l.compagnieId,
      departId: l.departId,
      billetId: l.billetId,
      billetNumero: l.billetNumero,
      siege: l.siege,
      voisin: {
        nom: this.chiffrement.dechiffrer(l.voisinNomChiffre, CONTEXTE_VOISIN_NOM),
        telephone: this.chiffrement.dechiffrer(l.voisinTelephoneChiffre, CONTEXTE_VOISIN_TELEPHONE),
      },
      voisinIndex: l.voisinIndex,
      empreinte: l.empreinte,
      origine: { code: l.origineCode, ville: l.origineVille },
      destination: { code: l.destinationCode, ville: l.destinationVille },
      classe: l.classe as ClasseDepart,
      departA: iso(l.departA),
      prix: l.prix,
      commission: l.commission,
      moyen: l.moyen as Vente["moyen"],
      etat: l.etat as EtatVente,
      creeA: iso(l.creeA),
      expireA: iso(l.expireA),
      reference: l.reference,
      regleeA: isoOuNul(l.regleeA),
      cause: l.cause,
      termineeA: isoOuNul(l.termineeA),
      majA: iso(l.majA),
    };
  }

  /** Les colonnes d'un changement : seules les clés présentes sont écrites. */
  private colonnes(c: Partial<Omit<Vente, "id" | "version" | "vendeurId">>) {
    const d: Prisma.VenteVendeurUncheckedUpdateManyInput = {};
    if (c.compagnieId !== undefined) d.compagnieId = c.compagnieId;
    if (c.departId !== undefined) d.departId = c.departId;
    if (c.billetId !== undefined) d.billetId = c.billetId;
    if (c.billetNumero !== undefined) d.billetNumero = c.billetNumero;
    if (c.siege !== undefined) d.siege = c.siege;
    if (c.voisin !== undefined) {
      d.voisinNomChiffre = this.chiffrement.chiffrer(c.voisin.nom, CONTEXTE_VOISIN_NOM);
      d.voisinTelephoneChiffre = this.chiffrement.chiffrer(
        c.voisin.telephone,
        CONTEXTE_VOISIN_TELEPHONE,
      );
    }
    if (c.voisinIndex !== undefined) d.voisinIndex = c.voisinIndex;
    if (c.empreinte !== undefined) d.empreinte = c.empreinte;
    if (c.origine !== undefined) {
      d.origineCode = c.origine.code;
      d.origineVille = c.origine.ville;
    }
    if (c.destination !== undefined) {
      d.destinationCode = c.destination.code;
      d.destinationVille = c.destination.ville;
    }
    if (c.classe !== undefined) d.classe = c.classe;
    if (c.departA !== undefined) d.departA = dateDe(c.departA);
    if (c.prix !== undefined) d.prix = c.prix;
    if (c.commission !== undefined) d.commission = c.commission;
    if (c.moyen !== undefined) d.moyen = c.moyen;
    if (c.etat !== undefined) d.etat = c.etat;
    if (c.creeA !== undefined) d.creeA = dateDe(c.creeA);
    if (c.expireA !== undefined) d.expireA = dateDe(c.expireA);
    if (c.reference !== undefined) d.reference = c.reference;
    if (c.regleeA !== undefined) d.regleeA = dateOuNul(c.regleeA);
    if (c.cause !== undefined) d.cause = c.cause;
    if (c.termineeA !== undefined) d.termineeA = dateOuNul(c.termineeA);
    if (c.majA !== undefined) d.majA = dateDe(c.majA);
    return d;
  }

  async ajouter(vente: Vente): Promise<ResultatAjoutVente> {
    try {
      await this.prisma.venteVendeur.create({
        data: {
          id: vente.id,
          version: 1,
          vendeurId: vente.vendeurId,
          compagnieId: vente.compagnieId,
          departId: vente.departId,
          billetId: vente.billetId,
          billetNumero: vente.billetNumero,
          siege: vente.siege,
          voisinNomChiffre: this.chiffrement.chiffrer(vente.voisin.nom, CONTEXTE_VOISIN_NOM),
          voisinTelephoneChiffre: this.chiffrement.chiffrer(
            vente.voisin.telephone,
            CONTEXTE_VOISIN_TELEPHONE,
          ),
          voisinIndex: vente.voisinIndex,
          empreinte: vente.empreinte,
          origineCode: vente.origine.code,
          origineVille: vente.origine.ville,
          destinationCode: vente.destination.code,
          destinationVille: vente.destination.ville,
          classe: vente.classe,
          departA: dateDe(vente.departA),
          prix: vente.prix,
          commission: vente.commission,
          moyen: vente.moyen,
          etat: vente.etat,
          creeA: dateDe(vente.creeA),
          expireA: dateDe(vente.expireA),
          reference: vente.reference,
          regleeA: dateOuNul(vente.regleeA),
          cause: vente.cause,
          termineeA: dateOuNul(vente.termineeA),
          majA: dateDe(vente.majA),
        },
      });
      return { resultat: "ajoutee" };
    } catch (e) {
      if (!porteCode(e, "P2002") && !porteCode(e, "23505")) throw e;
      // Quelle règle a refusé ? Dans l'ordre de la mémoire : billet, voisin déjà servi, vente en cours.
      const billet = await this.prisma.venteVendeur.findFirst({
        where: { OR: [{ id: vente.id }, { billetId: vente.billetId }] },
        select: { id: true },
      });
      if (billet) return { resultat: "billet_pris" };
      const doublon = await this.prisma.venteVendeur.findFirst({
        where: {
          vendeurId: vente.vendeurId,
          departId: vente.departId,
          empreinte: vente.empreinte,
          etat: { in: [...ETATS_UNICITE] },
        },
      });
      if (doublon) return { resultat: "doublon", existante: this.vers(doublon) };
      const enCours = await this.prisma.venteVendeur.findFirst({
        where: { vendeurId: vente.vendeurId, etat: "en_attente" },
      });
      if (enCours) return { resultat: "vente_en_cours", existante: this.vers(enCours) };
      throw e;
    }
  }

  async trouver(id: string): Promise<Vente | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.venteVendeur.findUnique({ where: { id } });
    return l ? this.vers(l) : null;
  }

  async transitionner(
    id: string,
    de: readonly EtatVente[],
    changement: Partial<Omit<Vente, "id" | "version" | "vendeurId">>,
  ): Promise<Vente | null> {
    if (!estUuid(id)) return null;
    // Comparer et remplacer : la ligne n'est modifiée que si elle est encore dans l'un des états `de`.
    // La relecture se fait dans la même transaction, donc sur ce que nous venons d'écrire.
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.venteVendeur.updateMany({
        where: { id, etat: { in: [...de] } },
        data: { ...this.colonnes(changement), version: { increment: 1 } },
      });
      if (count !== 1) return null;
      const l = await tx.venteVendeur.findUniqueOrThrow({ where: { id } });
      return this.vers(l);
    });
  }

  async duVendeur(
    vendeurId: string,
    filtre: { etats?: readonly EtatVente[]; depuis?: string; avant?: string } = {},
  ): Promise<Vente[]> {
    if (!estUuid(vendeurId)) return [];
    const creeA: Prisma.DateTimeFilter = {};
    if (filtre.depuis !== undefined) creeA.gte = dateDe(filtre.depuis);
    if (filtre.avant !== undefined) creeA.lt = dateDe(filtre.avant);
    const l = await this.prisma.venteVendeur.findMany({
      where: {
        vendeurId,
        ...(filtre.etats === undefined ? {} : { etat: { in: [...filtre.etats] } }),
        ...(Object.keys(creeA).length === 0 ? {} : { creeA }),
      },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async parEtats(etats: readonly EtatVente[]): Promise<Vente[]> {
    const l = await this.prisma.venteVendeur.findMany({
      where: { etat: { in: [...etats] } },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }
}

/* ------------------------------------------------------------------ commissions */

@Injectable()
export class CommissionsPrisma extends CommissionsVendeurs {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  async crediter(credit: CreditCommission): Promise<boolean> {
    const { count } = await this.prisma.creditCommissionVendeur.createMany({
      data: [
        {
          cle: credit.cle,
          vendeurId: credit.vendeurId,
          compagnieId: credit.compagnieId,
          venteId: credit.venteId,
          montant: credit.montant,
          at: dateDe(credit.at),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  private async soldeTx(tx: Prisma.TransactionClient, vendeurId: string): Promise<number> {
    const [credits, debits] = await Promise.all([
      tx.creditCommissionVendeur.aggregate({ _sum: { montant: true }, where: { vendeurId } }),
      tx.debitCommissionVendeur.aggregate({ _sum: { montant: true }, where: { vendeurId } }),
    ]);
    return (credits._sum.montant ?? 0) - (debits._sum.montant ?? 0);
  }

  async solde(vendeurId: string): Promise<number> {
    if (!estUuid(vendeurId)) return 0;
    return this.prisma.$transaction((tx) => this.soldeTx(tx, vendeurId));
  }

  async reserver(demande: {
    cle: string;
    vendeurId: string;
    montant: number;
    at: string;
    operateur: OperateurMobile;
    telephone: string;
    libelle: string;
  }): Promise<ResultatReservation> {
    if (!estUuid(demande.vendeurId)) return "solde_insuffisant";
    return this.prisma.$transaction(async (tx): Promise<ResultatReservation> => {
      // Un verrou par vendeur : deux versements simultanés passent l'un après l'autre et le second
      // relit le solde déjà amputé du premier.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_COMMISSIONS}::int, hashtext(${demande.vendeurId}))`;
      const existe = await tx.debitCommissionVendeur.findUnique({
        where: { cle: demande.cle },
        select: { cle: true },
      });
      if (existe) return "existe";
      if (demande.montant <= 0 || (await this.soldeTx(tx, demande.vendeurId)) < demande.montant) {
        return "solde_insuffisant";
      }
      await tx.debitCommissionVendeur.create({
        data: {
          cle: demande.cle,
          vendeurId: demande.vendeurId,
          montant: demande.montant,
          at: dateDe(demande.at),
          etat: "en_attente",
          operateur: demande.operateur,
          telephoneChiffre: this.chiffrement.chiffrer(demande.telephone, CONTEXTE_DEBIT_COMMISSION),
          libelle: demande.libelle,
        },
      });
      return "reserve";
    });
  }

  async confirmer(cle: string, reference: string): Promise<void> {
    await this.prisma.debitCommissionVendeur.updateMany({
      where: { cle, etat: "en_attente" },
      data: { etat: "verse", reference },
    });
  }

  async annuler(cle: string): Promise<void> {
    // Seul un débit « en attente » disparaît : l'argent versé ne revient pas dans le solde.
    await this.prisma.debitCommissionVendeur.deleteMany({ where: { cle, etat: "en_attente" } });
  }

  async debitsEnAttente(): Promise<DebitCommission[]> {
    const l = await this.prisma.debitCommissionVendeur.findMany({
      where: { etat: "en_attente" },
      orderBy: [{ at: "asc" }, { cle: "asc" }],
    });
    return l.map((d) => ({
      cle: d.cle,
      vendeurId: d.vendeurId,
      montant: d.montant,
      at: iso(d.at),
      etat: d.etat as DebitCommission["etat"],
      operateur: d.operateur as OperateurMobile,
      telephone: this.chiffrement.dechiffrer(d.telephoneChiffre, CONTEXTE_DEBIT_COMMISSION),
      libelle: d.libelle,
      reference: d.reference,
    }));
  }

  async credits(vendeurId: string, depuis: string, avant?: string): Promise<CreditCommission[]> {
    if (!estUuid(vendeurId)) return [];
    const l = await this.prisma.creditCommissionVendeur.findMany({
      where: {
        vendeurId,
        at: { gte: dateDe(depuis), ...(avant === undefined ? {} : { lt: dateDe(avant) }) },
      },
      orderBy: [{ at: "asc" }, { cle: "asc" }],
    });
    return l.map((c) => ({
      cle: c.cle,
      vendeurId: c.vendeurId,
      compagnieId: c.compagnieId,
      montant: c.montant,
      venteId: c.venteId,
      at: iso(c.at),
    }));
  }

  async soldesPositifs(): Promise<{ vendeurId: string; solde: number }[]> {
    const l = await this.prisma.$queryRaw<{ vendeurId: string; solde: number }[]>`
      SELECT c."vendeurId", (c."total" - COALESCE(d."total", 0))::int AS "solde"
      FROM (SELECT "vendeurId", SUM("montant") AS "total" FROM "credit_commission_vendeur"
            GROUP BY "vendeurId") c
      LEFT JOIN (SELECT "vendeurId", SUM("montant") AS "total" FROM "debit_commission_vendeur"
                 GROUP BY "vendeurId") d USING ("vendeurId")
      WHERE c."total" - COALESCE(d."total", 0) > 0
      ORDER BY c."vendeurId"`;
    return l.map((x) => ({ vendeurId: x.vendeurId, solde: Number(x.solde) }));
  }
}

/* ------------------------------------------------------------------ comptes */

/** Un PIN à 6 chiffres que le socle accepte (ni répétés, ni en suite). */
export function genererPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      verifierPin(pin);
      return pin;
    } catch {
      // trop simple : on retire
    }
  }
}

/**
 * Le compte d'un vendeur : retrouvé par son téléphone ou créé, puis le rôle `vendeur` lui est ajouté (une
 * seule fois, sans retirer les autres). Un compte qui n'a pas de PIN (un voyageur, qui se connecte par code
 * SMS) en reçoit un provisoire, envoyé par SMS : le rôle `vendeur` se connecte par PIN.
 */
@Injectable()
export class ComptesVendeursPrisma extends ComptesVendeurs {
  readonly durable = true;
  private readonly logger = new Logger("ComptesVendeurs");

  constructor(
    private readonly prisma: PrismaService,
    private readonly comptes: ComptesService,
    private readonly hachage: HachageService,
    private readonly sms: SmsGateway,
  ) {
    super();
  }

  private async envoyerPin(telephone: string, pin: string): Promise<void> {
    try {
      await this.sms.envoyer(
        telephone,
        `AfriMove : votre compte vendeur est prêt. Votre PIN provisoire est ${pin}. ` +
          "Ne le communiquez à personne.",
      );
    } catch (e) {
      this.logger.warn(`SMS du PIN non envoyé (${(e as Error).name})`);
    }
  }

  async ouvrir(a: {
    nom: string;
    telephone: string;
  }): Promise<{ personneId: string; nom: string; nouveau: boolean }> {
    const existant = await this.comptes.trouverParTelephone(a.telephone);
    if (!existant) {
      const pin = genererPin();
      try {
        const cree = await this.comptes.creer({
          nom: a.nom,
          telephone: a.telephone,
          roles: ["vendeur"],
          pin,
        });
        await this.envoyerPin(a.telephone, pin);
        return { personneId: cree.id, nom: cree.nom, nouveau: true };
      } catch (e) {
        // Deux agences qui agréent le même numéro en même temps : l'une crée, l'autre retrouve.
        if (!(e instanceof TelephoneDejaUtilise)) throw e;
        return this.ouvrir(a);
      }
    }
    if (!existant.actif) {
      throw new ErreurColis(409, "compte_inactif", "Ce compte est désactivé");
    }
    // Les règles des rôles (AfriMove ne vend jamais) valent aussi pour un compte qui existe déjà.
    validerRoles([...existant.roles, "vendeur"]);
    await this.prisma.$executeRaw`
      UPDATE "personne" SET "roles" = array_append("roles", 'vendeur'::"role")
      WHERE "id" = ${existant.id}::uuid AND NOT ('vendeur'::"role" = ANY("roles"))`;
    if (existant.pinHache === null) {
      const pin = genererPin();
      const { count } = await this.prisma.personne.updateMany({
        where: { id: existant.id, pinHache: null },
        data: { pinHache: await this.hachage.hacher(pin) },
      });
      if (count === 1) await this.envoyerPin(a.telephone, pin);
    }
    return { personneId: existant.id, nom: existant.nom, nouveau: false };
  }
}
